import { useCallback, useRef, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fromAccountPreferences, PreferencesForm, toPreferencesPayload, type PreferencesDraft } from "@/features/preferences";
import { SessionGenerating } from "./SessionGenerating";
import { SessionVoting } from "./SessionVoting";
import { SessionRetry } from "./components/SessionRetry";
import { retryRound, ROUND_RETRY_ENABLED } from "./api/round";
import { QuietButton, SessionFooter, room } from "./components/SessionLayout";
import { AppButton, AppText } from "@/shared/components";
import { ApiError } from "@/shared/api/errors";
import { USE_MOCK } from "@/shared/api/config";
import { layoutDirection } from "@/shared/layout";
import { theme } from "@/shared/theme";
import { generatePlan, getOuting, getOutingPreferences, getPlan, markOutingReady, saveOutingPreferences, startPreferences,
  type OutingState, type OutingPreferences, type OutingPlan } from "./api/outing";
import { outingToken } from "./identity";
import { loadGuestPass, removeGuestPass } from "./guestPass";
import { RIYADH, sessionError } from "./model";
import { SessionHeader, SessionIcon, SessionSheet } from "./components/SessionChrome";
import { SessionMasthead, SessionPaper, SessionSteps } from "./components/SessionVisuals";

export function SessionScreen() {
  const params = useLocalSearchParams<{ id: string; code?: string; inviteUrl?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const code = typeof params.code === "string" ? params.code : "";
  const [generating, setGenerating] = useState(false);
  const [details, setDetails] = useState(false);
  const [state, setState] = useState<OutingState | null>(null);
  const [preferences, setPreferences] = useState<OutingPreferences | null>(null);
  const [plan, setPlan] = useState<OutingPlan | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [emptyPlan, setEmptyPlan] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [editor, setEditor] = useState<{ value: PreferencesDraft; token: string; roundId?: string } | null>(null);
  const [retryOpen, setRetryOpen] = useState(false);
  const [retryError, setRetryError] = useState("");
  const [saveError, setSaveError] = useState("");
  const busyRef = useRef(false);
  const active = useRef(false);
  const serial = useRef(0);
  const loadedToken = useRef("");
  const cachedPlan = useRef<{ id: string; roundId?: string; token: string; value: OutingPlan } | null>(null);
  const resultSettled = useRef(false);
  const knownRound = useRef<{ outingId: string; id?: string; number: number }>({ outingId: id, number: 0 });
  const currentOuting = useRef(id);
  currentOuting.current = id;

  const refresh = useCallback(async () => {
    if (id !== currentOuting.current) return;
    const requestId = ++serial.current;
    let token = "";
    try {
      token = await outingToken(id, code);
      const current = await getOuting(id, token);
      if (!active.current || id !== currentOuting.current || requestId !== serial.current) return;
      const previous = knownRound.current;
      const number = current.round_number ?? 0;
      if (previous.outingId === id && (number < previous.number ||
          number === previous.number && previous.id !== current.round_id)) throw new ApiError(409, "STALE_ROUND", "Old state");
      if (previous.outingId !== id || previous.id !== current.round_id) {
        // Invalidate old editors/results as soon as the new round is observed, even if its preferences fail to load.
        knownRound.current = { outingId: id, id: current.round_id, number };
        loadedToken.current = token;
        setState(current); setPlan(null); setPreferences(null); setEditor(null); setEmptyPlan(false);
        setRetryOpen(false); setRetryError(""); setGenerating(false); setStale(true);
      }
      const cache = cachedPlan.current;
      const reusablePlan = cache?.id === id && cache.roundId === current.round_id && cache.token === token ? cache.value : null;
      const [own, result] = await Promise.all([
        current.status === "preferences" ? getOutingPreferences(id, token, current.round_id) : Promise.resolve(null),
        ["voting", "tiebreak", "result"].includes(current.status)
          ? reusablePlan ?? getPlan(id, token, current.round_id) : Promise.resolve(null),
      ]);
      if (!active.current || id !== currentOuting.current || requestId !== serial.current) return;
      loadedToken.current = token;
      cachedPlan.current = result ? { id, roundId: current.round_id, token, value: result } : null;
      resultSettled.current = current.status === "result" && !(ROUND_RETRY_ENABLED && current.round_id);
      setState(current); setPreferences(own); setPlan(result); setStale(false); setError("");
    } catch (e) {
      if (!active.current || requestId !== serial.current) return;
      setError(sessionError(e)); setStale(true);
      if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
        if (e.status === 401 && code && (await loadGuestPass(code))?.guest_token === token) await removeGuestPass(code);
        if (!active.current || requestId !== serial.current) return;
        setState(null); setPreferences(null); setPlan(null); setEditor(null);
        cachedPlan.current = null;
      }
    }
  }, [id, code]);

  // Poll only while this route is focused; role, actions and readiness always come from the server.
  useFocusEffect(useCallback(() => {
    active.current = true;
    setState(null); setPreferences(null); setPlan(null); setEditor(null); setGenerating(false); setStale(true);
    loadedToken.current = "";
    cachedPlan.current = null; resultSettled.current = false;
    if (knownRound.current.outingId !== id) knownRound.current = { outingId: id, number: 0 };
    setRetryOpen(false); setRetryError(""); setEmptyPlan(false);
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      if (!busyRef.current) await refresh();
      // A single-round result is final. Round-enabled guests keep observing the next round.
      if (!stopped && !resultSettled.current) timer = setTimeout(tick, 5000);
    }
    void tick();
    return () => { stopped = true; active.current = false; serial.current++; clearTimeout(timer); };
  }, [refresh]));

  function assertCurrent(roundId?: string) {
    if (!active.current || id !== currentOuting.current || knownRound.current.id !== roundId) {
      throw new ApiError(409, "STALE_ROUND", "Round changed");
    }
  }
  async function act(task: (token: string) => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; serial.current++; setBusy(true); setError("");
    try {
      const token = await outingToken(id, code);
      if (token !== loadedToken.current) throw new ApiError(401, "INVALID_TOKEN", "Account changed");
      assertCurrent(state?.round_id);
      await task(token);
      await refresh();
    } catch (e) {
      if (active.current) { setError(sessionError(e)); setStale(true); }
    } finally { busyRef.current = false; if (active.current) setBusy(false); }
  }

  async function save(value: PreferencesDraft) {
    if (busyRef.current || !editor) return;
    busyRef.current = true; serial.current++; setBusy(true); setSaveError("");
    try {
      const token = await outingToken(id, code);
      if (token !== editor.token) throw new ApiError(401, "INVALID_TOKEN", "Account changed");
      assertCurrent(editor.roundId);
      await saveOutingPreferences(id, token, toPreferencesPayload(value), editor.roundId);
      assertCurrent(editor.roundId);
      await markOutingReady(id, token, editor.roundId);
      if (active.current) { setEditor(null); setEmptyPlan(false); }
      await refresh();
    } catch (e) {
      if (active.current && knownRound.current.id === editor.roundId) setSaveError(sessionError(e));
    } finally { busyRef.current = false; if (active.current) setBusy(false); }
  }

  function editPreferences() {
    if (!preferences) return;
    setSaveError(""); setEditor({ value: fromAccountPreferences(preferences), token: loadedToken.current, roundId: state?.round_id });
  }
  async function share() {
    if (!state) return;
    const supplied = typeof params.inviteUrl === "string" && /^https?:\/\//.test(params.inviteUrl) ? params.inviteUrl : "";
    const webUrl = Platform.OS === "web" && typeof window !== "undefined"
      ? `${window.location.origin}/join?code=${encodeURIComponent(state.invite_code)}` : "";
    const message = `حيّاكم في «${state.name}» على ذوق.\nرمز الجلسة: ${state.invite_code}${supplied || webUrl ? `\n${supplied || webUrl}` : ""}`;
    try {
      if (Platform.OS === "web" && globalThis.navigator?.clipboard) {
        await globalThis.navigator.clipboard.writeText(message); setShareNotice("تم نسخ الدعوة. أرسلها لأصحابك.");
      } else { await Share.share({ message }); }
    } catch { setShareNotice("تعذّرت المشاركة. تقدر تنسخ رمز الجلسة الظاهر وترسله."); }
  }
  async function beginVoting() {
    if (busyRef.current) return;
    setGenerating(true);
    try { await act(async token => { const result = await generatePlan(id, token, state?.round_id); assertCurrent(state?.round_id); setEmptyPlan(result.plan_items.length === 0); }); }
    finally { if (active.current) setGenerating(false); }
  }
  const votingToken = useCallback(async () => {
    const token = await outingToken(id, code);
    if (token !== loadedToken.current) throw new ApiError(401, "INVALID_TOKEN", "Account changed");
    if (!active.current || knownRound.current.outingId !== id || knownRound.current.id !== state?.round_id) throw new ApiError(409, "STALE_ROUND", "Round changed");
    return token;
  }, [id, code, state?.round_id]);
  const canRetry = !!state?.me.is_organizer && ROUND_RETRY_ENABLED && !!state.round_id &&
    !!state.round_number && state.actions.includes("retry_round");
  async function restart() {
    if (!canRetry || !retryOpen || !state?.round_id || !state.round_number || busyRef.current || stale) return;
    busyRef.current = true; serial.current++; setBusy(true); setRetryError("");
    try {
      const token = await outingToken(id, code);
      if (token !== loadedToken.current) throw new ApiError(401, "INVALID_TOKEN", "Account changed");
      assertCurrent(state.round_id);
      const next = await retryRound(id, token, { round_id: state.round_id, round_number: state.round_number });
      if (!active.current || id !== currentOuting.current) return;
      knownRound.current = { outingId: id, id: next.round_id, number: next.round_number };
      setState(null); setPlan(null); setPreferences(null); setEditor(null); setEmptyPlan(false);
      setRetryOpen(false); setStale(true);
      await refresh();
    } catch (e) {
      if (active.current) { setRetryError(sessionError(e)); setStale(true); }
    } finally { busyRef.current = false; if (active.current) setBusy(false); }
  }
  const me = state?.participants.find(p => p.participant_id === state.me.participant_id);
  const disabled = busy || stale;
  const noMatches = emptyPlan || state?.round_outcome === "no_matches";
  const retry = state && ROUND_RETRY_ENABLED && !!state.round_id && <SessionRetry organizer={state.me.is_organizer} available={canRetry} disabled={disabled} busy={busy}
    open={retryOpen} error={retryError} roundNumber={state.round_number ?? 1}
    onOpen={() => { if (canRetry && !disabled) { setRetryError(""); setRetryOpen(true); } }}
    onClose={() => { if (!busyRef.current) setRetryOpen(false); }} onConfirm={restart} onRefresh={refresh} />;
  const dateLabel = state ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: RIYADH }).format(new Date(state.starts_at)) : "";
  if (state && generating) return <SessionGenerating name={state.name} />;
  if (state && plan) return <SessionVoting key={`${id}:${state.round_id ?? "legacy"}`} state={state} plan={plan} getToken={votingToken} refresh={refresh} stale={stale || busy} error={error} retry={retry} />;
  return <SafeAreaView style={room.screen}>
    <View style={room.header}><SessionHeader title={state?.status === "preferences" ? "ذوق الجلسة" : "دعوة الجلسة"} />
      {state && <SessionSteps step={state.status === "invite" ? 0 : 1} />}</View>
    <ScrollView style={room.scroll} contentContainerStyle={room.content} key={state?.status ?? "loading"}>
      {!state ? <View style={room.card}>
        {!error && <ActivityIndicator color={theme.colors.primary} />}
        <AppText style={room.text}>{error || "نحمّل الجلسة..."}</AppText>
        {!!error && <><AppButton title="إعادة المحاولة" onPress={refresh} />
          <QuietButton title="العودة إلى الدعوة" onPress={() => router.replace({ pathname: "/join", params: { code } })} /></>}
      </View> : <>
        <SessionMasthead title={state.status === "invite" ? "جمعتكم صار لها موعد." : me?.preferences_done ? "ذوقك وصل للجمعة." : "كل واحد يضيف ذوقه."}
          subtitle={state.status === "invite" ? "أرسل الدعوة، وخلّ الباقي على جمعتكم." : "وش مشتهي اليوم؟ اختياراتك لهذه الطلعة فقط."} compact />
        <SessionPaper compact>
          <AppText accessibilityRole="header" style={styles.title}>{state.name}</AppText>
          <AppText style={room.center}>{dateLabel} · الرياض</AppText>
          {(state.round_number ?? 1) > 1 && <View accessibilityLiveRegion="polite">
            <AppText style={room.label}>جولة جديدة · {state.round_number!.toLocaleString("ar-SA")}</AppText>
            <AppText style={room.text}>نفس جمعتكم وتفضيلاتكم. راجع ذوقك وأكّد جاهزيتك من جديد.</AppText>
          </View>}
          {state.status === "invite" ? <>
            <View style={styles.rule} />
            <AppText style={room.center}>رمز الدعوة · حتى ٨ أشخاص</AppText>
            <AppText selectable style={styles.code}>{state.invite_code}</AppText>
            <AppButton title={Platform.OS === "web" ? "نسخ الدعوة" : "مشاركة الدعوة"} onPress={share} />
            {!!shareNotice && <AppText accessibilityLiveRegion="polite" style={room.center}>{shareNotice}</AppText>}
            <AppText style={room.center}>ينضمون باسمهم من الرابط، بدون حساب.</AppText>
          </> : <>
            <View style={styles.rule} />
            <View style={room.row}><SessionIcon name={me?.preferences_done ? "check" : "edit"} size={23} />
              <AppText style={[room.label, { flex: 1 }]}>{me?.preferences_done ? "جاهزيتك مؤكدة" : "ذوقي لهالجلسة"}</AppText></View>
            <AppText style={room.text}>{me?.preferences_done ? "اعتمدنا ذوقك. تقدر تعدّله إلى أن يبدأ التصويت." : preferences?.is_saved ? "تفضيلاتك موجودة؛ اعتمدها أو عدّل وش مشتهي اليوم." : "عبّ الصحن وحدّد ميزانيتك وحدودك، ثم أكّد جاهزيتك."}</AppText>
            {preferences?.is_saved ? <QuietButton title="تعديل ذوقي وتفضيلاتي" disabled={disabled} onPress={editPreferences} /> : <AppButton title="تعديل ذوقي وتفضيلاتي" disabled={disabled || !preferences} onPress={editPreferences} />}
            {preferences?.is_saved && !me?.preferences_done && <AppButton title="اعتماد تفضيلاتي · أنا جاهز" disabled={disabled} onPress={() => act(token => markOutingReady(id, token, state.round_id))} />}
            {!!noMatches && <><AppText accessibilityRole="alert" style={room.warning}>ما لقينا مطعمًا يطابق شروط الجميع. تقدرون تراجعون تفضيلاتكم؛ حدودكم تبقى كما هي.</AppText>{retry}</>}
          </>}
          <View style={styles.rule} />
          <Pressable accessibilityRole="button" accessibilityLabel="عرض المشاركين وجاهزيتهم" onPress={() => setDetails(true)} style={styles.people}>
            <SessionIcon name="people" size={23} />
            <AppText style={[room.label, { flex: 1 }]}>{state.status === "invite" ? `أهل الجلسة · ${state.participants.length.toLocaleString("ar-SA")} من ٨` : `جاهزين · ${state.readiness.ready_count.toLocaleString("ar-SA")} من ${state.readiness.total_count.toLocaleString("ar-SA")}`}</AppText>
            <SessionIcon name="next" size={18} />
          </Pressable>
        </SessionPaper>
        {!!error && <View><AppText accessibilityRole="alert" style={room.error}>{error}</AppText><QuietButton title="تحديث حالة الجلسة" onPress={refresh} disabled={busy} /></View>}
        {USE_MOCK && <AppText style={room.mock}>معاينة تجريبية</AppText>}
      </>}
    </ScrollView>
    {state && <SessionFooter>
      {state.status === "invite" ? state.me.is_organizer ? <>
        <AppButton title="نبدأ اختيار التفضيلات" disabled={disabled || !state.actions.includes("start_preferences")} onPress={() => act(token => startPreferences(id, token))} />
        <AppText style={room.center}>يبقى الانضمام مفتوحًا حتى يبدأ التصويت.</AppText>
      </> : <AppText style={room.center}>ننتظر المنظّم يفتح التفضيلات.</AppText> : state.me.is_organizer ? <>
        <AppButton title={busy ? "نجهّز مطاعمكم..." : "نبدأ التصويت"} disabled={disabled || !state.actions.includes("start_voting")}
          onPress={beginVoting} />
        <AppText style={room.center}>{state.actions.includes("start_voting") ? "الكل جاهز. بنقفل الانضمام وتعديل التفضيلات." : "ننتظر تأكيد جاهزية الجميع."}</AppText>
      </> : <AppText style={room.center}>بعد جاهزية الجميع، يبدأ المنظّم التصويت.</AppText>}
    </SessionFooter>}
    <SessionSheet visible={details} title="أهل الجلسة" onClose={() => setDetails(false)}>
      {state && <><AppText style={room.label}>{state.name}</AppText><AppText style={room.text}>{dateLabel} · الرياض</AppText>
        {state.participants.map(p => <View key={p.participant_id} style={styles.person}>
          <SessionIcon name={p.preferences_done ? "check" : "people"} size={22} />
          <AppText style={styles.personName}>{p.name || "مشارك"}{p.participant_id === state.me.participant_id ? " (أنت)" : ""}{p.is_organizer ? " · المنظّم" : ""}</AppText>
          <AppText style={room.small}>{p.attendance === "declined" ? "اعتذر" : state.status === "invite" ? "انضم" : p.preferences_done ? "جاهز" : "يختار ذوقه"}</AppText>
        </View>)}
        <AppText style={room.small}>تفضيلات كل شخص خاصة به.</AppText></>}
    </SessionSheet>
    <Modal visible={editor !== null} animationType="slide" onRequestClose={() => { if (!busy) setEditor(null); }}>
      {editor && <View style={{ flex: 1 }} pointerEvents={busy ? "none" : "auto"}>
        <PreferencesForm initialValue={editor.value} context="outing" onSubmit={save} onExit={() => { if (!busy) setEditor(null); }}
          isSaving={busy} error={saveError} submitLabel="حفظ وأنا جاهز" notice="اختياراتك لهذه الجلسة فقط. تفضيلات حسابك تبقى محفوظة." />
      </View>}
    </Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  title: { fontSize: 26, lineHeight: 40, fontFamily: theme.typography.fontFamilyBold, textAlign: "center", writingDirection: "rtl" },
  rule: { height: 1, backgroundColor: "#C7C5A9", marginVertical: 4 },
  code: { fontSize: 36, lineHeight: 48, letterSpacing: 6, textAlign: "center", writingDirection: "ltr", fontFamily: theme.typography.fontFamilyBold },
  people: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", gap: 8, minHeight: 48 },
  person: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  personName: { flex: 1, textAlign: "right", writingDirection: "rtl", fontSize: 14 },
});
