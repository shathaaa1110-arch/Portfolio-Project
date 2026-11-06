import { useCallback, useRef, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fromAccountPreferences, PreferencesForm, toPreferencesPayload, type PreferencesDraft } from "@/features/preferences";
import { RestaurantCard } from "@/features/restaurants";
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
import { SessionHeader, SessionIcon } from "./components/SessionChrome";
import { HailaTip, SessionMasthead, SessionPaper, SessionSteps } from "./components/SessionVisuals";

export function SessionScreen() {
  const params = useLocalSearchParams<{ id: string; code?: string; inviteUrl?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const code = typeof params.code === "string" ? params.code : "";
  const [state, setState] = useState<OutingState | null>(null);
  const [preferences, setPreferences] = useState<OutingPreferences | null>(null);
  const [plan, setPlan] = useState<OutingPlan | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [emptyPlan, setEmptyPlan] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [editor, setEditor] = useState<{ value: PreferencesDraft; token: string } | null>(null);
  const [saveError, setSaveError] = useState("");
  const busyRef = useRef(false);
  const active = useRef(false);
  const serial = useRef(0);
  const loadedToken = useRef("");
  const currentOuting = useRef(id);
  currentOuting.current = id;

  const refresh = useCallback(async () => {
    if (id !== currentOuting.current) return;
    const requestId = ++serial.current;
    let token = "";
    try {
      token = await outingToken(id, code);
      const current = await getOuting(id, token);
      const [own, result] = await Promise.all([
        current.status === "preferences" ? getOutingPreferences(id, token) : Promise.resolve(null),
        ["voting", "tiebreak", "result"].includes(current.status) ? getPlan(id, token) : Promise.resolve(null),
      ]);
      if (!active.current || id !== currentOuting.current || requestId !== serial.current) return;
      loadedToken.current = token;
      setState(current); setPreferences(own); setPlan(result); setStale(false); setError("");
    } catch (e) {
      if (!active.current || requestId !== serial.current) return;
      setError(sessionError(e)); setStale(true);
      if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
        if (e.status === 401 && code && (await loadGuestPass(code))?.guest_token === token) await removeGuestPass(code);
        if (!active.current || requestId !== serial.current) return;
        setState(null); setPreferences(null); setPlan(null); setEditor(null);
      }
    }
  }, [id, code]);

  // Poll only while this route is focused; role, actions and readiness always come from the server.
  useFocusEffect(useCallback(() => {
    active.current = true;
    setState(null); setPreferences(null); setPlan(null); setEditor(null); setStale(true);
    loadedToken.current = "";
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      if (!busyRef.current) await refresh();
      if (!stopped) timer = setTimeout(tick, 5000);
    }
    void tick();
    return () => { stopped = true; active.current = false; serial.current++; clearTimeout(timer); };
  }, [refresh]));

  async function act(task: (token: string) => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; serial.current++; setBusy(true); setError("");
    try {
      const token = await outingToken(id, code);
      if (token !== loadedToken.current) throw new ApiError(401, "INVALID_TOKEN", "Account changed");
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
      await saveOutingPreferences(id, token, toPreferencesPayload(value));
      await markOutingReady(id, token);
      if (active.current) { setEditor(null); setEmptyPlan(false); }
      await refresh();
    } catch (e) {
      if (active.current) setSaveError(sessionError(e));
    } finally { busyRef.current = false; if (active.current) setBusy(false); }
  }

  function editPreferences() {
    if (!preferences) return;
    setSaveError(""); setEditor({ value: fromAccountPreferences(preferences), token: loadedToken.current });
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
  const me = state?.participants.find(p => p.participant_id === state.me.participant_id);
  const disabled = busy || stale;
  return <SafeAreaView style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <SessionHeader title={state?.status === "invite" ? "دعوة الجلسة" : state?.status === "preferences" ? "ذوقنا وجاهزيتنا" : "الجلسة"} />
      {USE_MOCK && <AppText style={styles.mock}>جلسة تجريبية — لا تُرسل طلبات إلى الخادم.</AppText>}
      {!state ? <View style={styles.section}>
        {!error && <ActivityIndicator color={theme.colors.primary} />}
        <AppText style={styles.text}>{error || "نحمّل الجلسة..."}</AppText>
        {!!error && <><AppButton title="إعادة المحاولة" onPress={refresh} />
          <AppButton title="العودة إلى الدعوة" onPress={() => router.replace({ pathname: "/join", params: { code } })} /></>}
      </View> : <>
        <SessionSteps step={state.status === "invite" ? 0 : state.status === "preferences" ? 1 : 2} />
        <SessionMasthead title={state.status === "invite" ? "جمعتكم صار لها موعد." : state.status === "preferences" ? "كل واحد يضيف ذوقه." : "اقتراحات تجمع أذواقكم."}
          subtitle={state.status === "invite" ? "أرسل الدعوة، وخلّ الباقي على جمعتكم." : state.status === "preferences" ? "وش مشتهي اليوم؟ نبدأ باختيارات كل واحد." : "من اختياراتكم، لقائمة تشوفونها سوا."} />
        <SessionPaper compact={!!plan}>
          <AppText style={styles.eyebrow}>{state.status === "invite" ? "دعوتكم إلى" : "جلستكم"}</AppText>
          <AppText accessibilityRole="header" style={[styles.title, !!plan && styles.compactTitle]}>{state.name}</AppText>
          {!plan && <View style={styles.when}><SessionIcon name="calendar" size={20} />
            <AppText style={styles.caption}>{new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: RIYADH }).format(new Date(state.starts_at))} · الرياض</AppText>
          </View>}
          {state.status === "invite" && <>
            <View style={styles.rule} />
            <AppText style={styles.caption}>رمز الدعوة · حتى ٨ أشخاص</AppText>
            <AppText selectable style={styles.code}>{state.invite_code}</AppText>
            <AppButton title={Platform.OS === "web" ? "نسخ الدعوة" : "مشاركة الدعوة"} onPress={share} />
            {!!shareNotice && <AppText accessibilityLiveRegion="polite" style={styles.caption}>{shareNotice}</AppText>}
            <AppText style={styles.caption}>ينضمون من رابط الدعوة أو بالرمز، وباسمهم فقط بدون حساب.</AppText>
          </>}
          {state.status === "preferences" && <View style={styles.readySummary}>
            <AppText style={styles.readyCount}>{state.readiness.ready_count.toLocaleString("ar-SA")} من {state.readiness.total_count.toLocaleString("ar-SA")}</AppText>
            <AppText style={styles.caption}>أكدوا ذوقهم وجاهزين</AppText>
          </View>}
          {plan && <AppText style={styles.caption}>{plan.plan_items.length.toLocaleString("ar-SA")} اقتراحات · القرار لكم</AppText>}
        </SessionPaper>
        {["invite", "preferences"].includes(state.status) && <HailaTip>{state.status === "invite"
          ? "كل واحد يجي باسمه وذوقه. أرسلوا الدعوة، ونكمّلها سوا."
          : "مو لازم تتفقون على كل شيء. كل واحد يختار ذوقه ويأكد جاهزيته."}</HailaTip>}
        {!!error && <View style={styles.section}><AppText accessibilityRole="alert" style={styles.error}>{error}</AppText><AppButton title="تحديث حالة الجلسة" onPress={refresh} disabled={busy} /></View>}

        {["invite", "preferences"].includes(state.status) && <View style={styles.section}>
          <AppText style={styles.sectionTitle}>أهل الجلسة · {state.participants.length.toLocaleString("ar-SA")} من ٨</AppText>
          {state.participants.map(p => <View key={p.participant_id} style={styles.person}>
            <View style={[styles.avatar, p.preferences_done && styles.avatarReady]}><SessionIcon name={p.preferences_done ? "check" : "people"} size={23} /></View>
            <AppText style={styles.personName}>{p.name || "مشارك"}{p.participant_id === state.me.participant_id ? " (أنت)" : ""}{p.is_organizer ? " · المنظّم" : ""}</AppText>
            <AppText style={styles.personStatus}>{p.attendance === "declined" ? "اعتذر" : state.status === "invite" ? "انضم" : p.preferences_done ? "جاهز" : "يختار ذوقه"}</AppText>
          </View>)}
          <AppText style={styles.caption}>تفضيلات كل شخص خاصة؛ يظهر للآخرين اسمه وجاهزيته فقط.</AppText>
        </View>}

        {state.status === "invite" && (state.me.is_organizer ? <View style={styles.section}>
          <AppText style={styles.text}>إذا اجتمعتم، افتح التفضيلات. يبقى الانضمام متاحًا حتى تبدأ الاقتراحات.</AppText>
          <AppButton title="نبدأ اختيار التفضيلات" disabled={disabled || !state.actions.includes("start_preferences")} onPress={() => act(token => startPreferences(id, token))} />
        </View> : <AppText style={styles.center}>ننتظر المنظّم يفتح التفضيلات.</AppText>)}

        {state.status === "preferences" && <>
          <View style={styles.invite}>
            <AppText style={styles.sectionTitle}>ذوقي لهالجلسة</AppText>
            <AppText style={styles.text}>{preferences?.is_saved ? "نبدأ بالتفضيلات الموجودة في نسختك لهذه الجلسة. تقدر تعتمدها أو تغيّر وش مشتهي اليوم." : "اختر ذوقك وميزانيتك والمسافة المناسبة لك."}</AppText>
            <AppText style={styles.caption}>تعديلاتك هنا لا تغيّر تفضيلات حسابك.</AppText>
            <AppButton title="تعديل ذوقي وتفضيلاتي" disabled={disabled || !preferences} onPress={editPreferences} />
            {preferences?.is_saved && !me?.preferences_done && <AppButton title="اعتماد تفضيلاتي · أنا جاهز" disabled={disabled} onPress={() => act(token => markOutingReady(id, token))} />}
            {me?.preferences_done && <AppText accessibilityLiveRegion="polite" style={styles.center}>تم تأكيد جاهزيتك. تعديل تفضيلاتك يحتاج تأكيدًا جديدًا.</AppText>}
          </View>
          {!!emptyPlan && <View style={styles.section}><AppText accessibilityRole="alert" style={styles.text}>ما لقينا مطعمًا يطابق شروط الجميع. راجعوا التفضيلات، ثم أكدوا جاهزيتكم وحاولوا مرة أخرى. لن نغيّر حدودكم تلقائيًا.</AppText></View>}
          {state.me.is_organizer ? <View style={styles.section}>
            <AppButton title={busy ? "لحظات..." : "اعرض اقتراحاتنا"} disabled={disabled || !state.actions.includes("start_voting")}
              onPress={() => act(async token => { const result = await generatePlan(id, token); setEmptyPlan(result.plan_items.length === 0); })} />
            <AppText style={styles.caption}>بعد جاهزية الجميع، تبدأ الاقتراحات ويُغلق الانضمام وتعديل التفضيلات.</AppText>
          </View> : <AppText style={styles.caption}>بعد جاهزية الجميع، يطلب المنظّم اقتراحاتكم.</AppText>}
        </>}

        {plan && <View style={styles.section}>
          <AppText style={styles.text}>هذه قائمة اقتراحات الجلسة، ولم يتم اختيار مطعم نهائي.</AppText>
          {!!plan.allergy_warning.length && <AppText style={styles.warning}>في الجلسة حساسيات غذائية مسجلة. أبلغوا المطعم بها قبل الطلب؛ الاقتراح لا يضمن ملاءمة الطعام للحساسية.</AppText>}
          {plan.plan_items.map(item => <View key={item.plan_item_id} style={styles.planCard}>
            <AppText style={styles.rank}>اقتراح {item.rank.toLocaleString("ar-SA")} · توافق {item.match_score.toLocaleString("ar-SA")}٪</AppText>
            <RestaurantCard name={item.restaurant.name_ar || item.restaurant.name_en || "مطعم"} cuisines={item.restaurant.cuisines}
              district={item.restaurant.district ?? ""} rating={item.restaurant.rating} mapsUrl={item.restaurant.maps_url}
              distanceKm={item.restaurant.distance_km} spendLow={item.restaurant.spend_low} spendHigh={item.restaurant.spend_high} reason={item.reason} variant="featured" />
          </View>)}
        </View>}
      </>}
    </ScrollView>
    <Modal visible={editor !== null} animationType="slide" onRequestClose={() => { if (!busy) setEditor(null); }}>
      {editor && <View style={{ flex: 1 }} pointerEvents={busy ? "none" : "auto"}>
        <PreferencesForm initialValue={editor.value} context="outing" onSubmit={save} onExit={() => { if (!busy) setEditor(null); }}
          isSaving={busy} error={saveError} submitLabel="حفظ وأنا جاهز" notice="اختياراتك لهذه الجلسة فقط. تفضيلات حسابك تبقى محفوظة." />
      </View>}
    </Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: 12, width: "100%", maxWidth: 460, alignSelf: "center", paddingBottom: 40 },
  title: { fontFamily: theme.typography.fontFamilyBold, fontSize: 30, lineHeight: 44, textAlign: "center", writingDirection: "rtl" },
  compactTitle: { fontSize: 23, lineHeight: 34 },
  text: { fontSize: 15, lineHeight: 27, textAlign: "right", writingDirection: "rtl" },
  caption: { fontSize: 13, lineHeight: 24, textAlign: "center", color: theme.colors.placeholder, writingDirection: "rtl" },
  center: { textAlign: "center", fontSize: 17, lineHeight: 29, writingDirection: "rtl" },
  section: { gap: 16, paddingHorizontal: 12, marginTop: 24 }, sectionTitle: { textAlign: "right", fontSize: 20, fontFamily: theme.typography.fontFamilyBold },
  invite: { backgroundColor: "#EFEFDF", borderRadius: 24, padding: 22, gap: 14, marginTop: 24 },
  code: { fontSize: 42, letterSpacing: 6, textAlign: "center", writingDirection: "ltr", fontFamily: theme.typography.fontFamilyBold },
  person: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#EDEBDD" },
  avatarReady: { backgroundColor: "#DBE6D9" },
  personName: { flex: 1, textAlign: "right", writingDirection: "rtl", fontSize: 15 }, personStatus: { fontSize: 12, color: theme.colors.placeholder },
  error: { color: theme.colors.error, textAlign: "right", lineHeight: 26 },
  warning: { backgroundColor: "#F4E8CB", padding: 16, borderRadius: 16, textAlign: "right", lineHeight: 26 },
  planCard: { gap: 10, paddingBottom: 24 }, rank: { textAlign: "right", fontFamily: theme.typography.fontFamilyBold, fontSize: 15 },
  mock: { textAlign: "center", fontSize: 12, color: theme.colors.placeholder },
  eyebrow: { textAlign: "center", fontSize: 13, color: "#63745B" },
  when: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" },
  rule: { height: 1, backgroundColor: "#B5B586", marginVertical: 5 },
  readySummary: { alignItems: "center", gap: 3, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#C7C5A9" },
  readyCount: { fontSize: 32, lineHeight: 52, fontFamily: theme.typography.fontFamilyBold, writingDirection: "rtl" },
});
