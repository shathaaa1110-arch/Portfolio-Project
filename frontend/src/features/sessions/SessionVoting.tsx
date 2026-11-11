import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RestaurantCard } from "@/features/restaurants";
import { endVoting, getVotingResult, loadMyVotes, useVoting, type VotingResult } from "@/features/voting";
import { AppButton, AppText } from "@/shared/components";
import { USE_MOCK } from "@/shared/api/config";
import { theme } from "@/shared/theme";
import { sessionError } from "./model";
import type { OutingPlan, OutingState, PlanItem } from "./api/outing";
import { SessionHeader, SessionIcon, SessionSheet } from "./components/SessionChrome";
import { HailaTip, SessionSteps } from "./components/SessionVisuals";
import { QuietButton, room, SessionFooter, SessionSummary } from "./components/SessionLayout";

type Props = {
  state: OutingState; plan: OutingPlan; getToken: () => Promise<string>;
  refresh: () => Promise<void>; stale: boolean; error: string;
  retry?: ReactNode;
};
const arabic = (n: number) => n.toLocaleString("ar-SA");
const itemName = (item: PlanItem) => item.restaurant.name_ar || item.restaurant.name_en || "مطعم";
function Suggestion({ item }: { item: PlanItem }) {
  const r = item.restaurant;
  return <RestaurantCard name={itemName(item)} cuisines={r.cuisines} district={r.district ?? ""}
    rating={r.rating} mapsUrl={r.maps_url} distanceKm={r.distance_km} spendLow={r.spend_low}
    spendHigh={r.spend_high} reason={item.reason} variant="featured" />;
}

export function SessionVoting({ state, plan, getToken, refresh, stale, error, retry }: Props) {
  const voting = useVoting(state.outing_id, plan.plan_items.map(i => i.plan_item_id), getToken, state.round_id);
  const [review, setReview] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [result, setResult] = useState<VotingResult | null>(null);
  const [resultAttempt, setResultAttempt] = useState(0);
  const [failure, setFailure] = useState("");
  const [completed, setCompleted] = useState(0);
  const [shareNotice, setShareNotice] = useState("");
  const endLock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const closed = state.status === "result" || voting.outingStatus === "result" || result !== null;
  const canVote = !closed && !stale && !ending && voting.stage === "open";
  const canEnd = canVote && state.me.is_organizer && state.actions.includes("end_voting") && voting.unsaved === 0;
  const current = plan.plan_items.find(i => i.plan_item_id === voting.next);
  const answered = plan.plan_items.filter(i => voting.answers[i.plan_item_id] !== undefined).length;
  const members = voting.progress?.members_count ?? state.readiness.total_count;
  const complete = Math.max(completed, voting.progress?.completed_count ?? 0);

  // Counts are public; each participant's individual answers stay private.
  useFocusEffect(useCallback(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const mine = await loadMyVotes(state.outing_id, await getToken(), state.round_id);
        if (alive) { setCompleted(mine.completed_count); if (mine.status === "result") await refresh(); }
      } catch { /* The parent state refresh reports connection failures. */ }
      if (alive && state.status === "voting") timer = setTimeout(poll, 5000);
    }
    if (state.status === "voting") void poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [state.outing_id, state.round_id, state.status, getToken, refresh]));

  useEffect(() => {
    if (voting.outingStatus === "result" && state.status !== "result") void refresh();
  }, [voting.outingStatus, state.status, refresh]);

  useEffect(() => {
    if (!closed) return;
    let alive = true;
    setReview(false); setConfirmEnd(false);
    (async () => {
      try {
        const next = await getVotingResult(state.outing_id, await getToken(), state.round_id);
        if (alive) { setResult(next); setFailure(""); }
      } catch (e) { if (alive) setFailure(sessionError(e)); }
    })();
    return () => { alive = false; };
  }, [closed, state.outing_id, state.round_id, getToken, resultAttempt]);

  async function finish() {
    if (!canEnd || endLock.current) return;
    endLock.current = true; setEnding(true); setFailure("");
    try {
      const next = await endVoting(state.outing_id, await getToken(), state.round_id);
      if (mounted.current) { setResult(next); setConfirmEnd(false); }
      await refresh();
    } catch (e) { if (mounted.current) setFailure(sessionError(e)); }
    finally { endLock.current = false; if (mounted.current) setEnding(false); }
  }
  const winner = result?.winner ? plan.plan_items.find(i => i.plan_item_id === result.winner!.plan_item_id) : null;
  const tied = result?.winner && result.items.filter(item => item.likes === result.winner!.likes).length > 1;
  async function shareResult() {
    if (!result?.winner) return;
    const chosen = result.winner;
    const maps = chosen.maps_url && /^https:\/\//i.test(chosen.maps_url) ? chosen.maps_url : "";
    const message = [state.name, `اختيار طلعتنا: ${chosen.name_ar || chosen.name_en || "مطعم"}`,
      chosen.district, `تأييد ${arabic(chosen.support_percentage)}٪ من ${arabic(result.members_count)} مشاركين`, maps].filter(Boolean).join("\n");
    try {
      if (Platform.OS === "web") {
        await globalThis.navigator.clipboard.writeText(message);
        setShareNotice("تم نسخ نتيجة الطلعة.");
      } else await Share.share({ message });
    } catch { setShareNotice("تعذّرت المشاركة. حاول مرة ثانية."); }
  }
  return <SafeAreaView style={room.screen}>
    <View style={room.header}><SessionHeader title={closed ? "طلعتنا" : "تصويت الجلسة"} /><SessionSteps step={closed ? 3 : 2} /></View>
    <ScrollView style={room.scroll} contentContainerStyle={room.content} key={closed ? "result" : current?.plan_item_id ?? "waiting"}>
      <SessionSummary name={state.name} detail={result ? `${arabic(result.completed_count)} من ${arabic(result.members_count)} أكملوا التصويت` : closed ? "اكتملت الجولة" : `${arabic(complete)} من ${arabic(members)} أكملوا التصويت`} />
      {closed ? <>
        {!result ? <View style={room.card}>
          {!failure && <ActivityIndicator color={theme.colors.primary} />}
          <AppText style={room.center}>{failure || "نجهّز نتيجة جمعتكم..."}</AppText>
          {!!failure && <AppButton title="إعادة تحميل النتيجة" onPress={() => setResultAttempt(n => n + 1)} />}
        </View> : <>
          <View><AppText accessibilityRole="header" style={room.title}>{result.winner ? "على ذوق جمعتكم." : "ما اخترنا مطعمًا هالمرة."}</AppText>
            <AppText style={room.text}>{result.winner ? `اختاره ${arabic(result.winner.likes)} من ${arabic(result.members_count)} مشاركين · تأييد ${arabic(result.winner.support_percentage)}٪`
              : result.no_winner_reason === "no_votes" ? "انتهى التصويت قبل وصول أي إجابة." : "ما حصل أي مطعم على إعجاب من المشاركين الذين صوّتوا."}</AppText></View>
          {winner && <View style={room.card}><View style={room.row}><SessionIcon name="check" /><AppText style={room.label}>اختيار الطلعة</AppText></View><Suggestion item={winner} /></View>}
          {result.winner && <QuietButton title={Platform.OS === "web" ? "نسخ نتيجة الطلعة" : "مشاركة نتيجة الطلعة"} onPress={shareResult} />}
          {!!shareNotice && <AppText accessibilityLiveRegion="polite" style={room.center}>{shareNotice}</AppText>}
          {!result.winner && <HailaTip>لكل واحد ذوقه؛ ما حصلنا على اختيار مشترك هالمرة.</HailaTip>}
          {!!plan.allergy_warning.length && <AppText style={room.warning}>أبلغوا المطعم بالحساسيات المسجلة قبل الطلب؛ ظهور المطعم لا يضمن ملاءمة الطعام للحساسية.</AppText>}
          <View style={room.card}><AppText style={room.label}>كيف كانت أصواتنا؟</AppText>
            {result.items.map(item => <View key={item.plan_item_id} style={room.row}>
              <AppText style={[room.text, { flex: 1 }]}>{item.name_ar || plan.plan_items.find(i => i.plan_item_id === item.plan_item_id)?.restaurant.name_en || "مطعم"}</AppText>
              <AppText style={room.small}>{arabic(item.likes)} إعجاب · {arabic(item.support_percentage)}٪</AppText>
            </View>)}
            <AppText style={room.small}>التأييد من كل المشاركين، ويشمل من لم يكمل التصويت.</AppText>
            {tied && <AppText style={room.small}>تعادلت الإعجابات؛ اختير الأعلى ترتيبًا في الاقتراحات.</AppText>}
          </View>
        </>}
      </> : <>
        <View><AppText accessibilityRole="header" style={room.title}>{voting.finished ? "وصل ذوقك للجمعة." : "هذا على ذوقك؟"}</AppText>
          <AppText style={room.text}>{voting.finished ? "ننتظر باقي الأصوات. تقدر تراجع اختياراتك قبل إقفال التصويت." : "مطعم واحد كل مرة. اختَر يعجبني أو نتخطّاه."}</AppText></View>
        {voting.stage === "loading" ? <ActivityIndicator color={theme.colors.primary} /> : voting.stage === "error" ? <View style={room.card}>
          <AppText accessibilityRole="alert" style={room.error}>{sessionError(voting.error)}</AppText><AppButton title="إعادة تحميل أصواتي" onPress={voting.reload} />
        </View> : current ? <View style={room.card}>
          <View style={room.row}><AppText style={[styles.pill, { flex: 1 }]}>مطعم {arabic(plan.plan_items.indexOf(current) + 1)} من {arabic(plan.plan_items.length)}</AppText>
            <AppText style={room.small}>توافق {arabic(current.match_score)}٪</AppText></View>
          <Suggestion item={current} />
          {!!plan.allergy_warning.length && <AppText style={room.warning}>أبلغوا المطعم بالحساسيات المسجلة قبل الطلب.</AppText>}
        </View> : <View style={[room.card, styles.waiting]}>
          <Image source={require("../../../assets/images/sessions/haila-gathering.webp")} style={styles.haila} contentFit="contain" accessible={false} />
          <AppText style={room.label}>{voting.unsaved ? "نحفظ اختياراتك..." : "تم حفظ اختياراتك"}</AppText>
          <AppText style={room.center}>{arabic(complete)} من {arabic(members)} أكملوا التصويت</AppText>
          <QuietButton title="مراجعة اختياراتي" onPress={() => setReview(true)} disabled={!canVote} />
        </View>}
        {!!voting.unsaved && <AppText accessibilityLiveRegion="polite" style={voting.offline ? room.warning : room.center}>
          {voting.offline ? "الاتصال انقطع. اختياراتك لم تُحفظ كلها؛ نحاول من جديد. ابقَ في الشاشة." : "جارٍ حفظ اختياراتك..."}
        </AppText>}
        {voting.error && !voting.offline && voting.stage !== "error" && <AppText accessibilityRole="alert" style={room.error}>{sessionError(voting.error)}</AppText>}
        {answered > 0 && current && <QuietButton title={`مراجعة اختياراتي (${arabic(answered)})`} onPress={() => setReview(true)} disabled={!canVote} />}
        <AppText style={room.small}>كل إجابة تُحفظ فورًا. النتيجة تظهر تلقائيًا عند اكتمال تصويت الجميع.</AppText>
        {state.me.is_organizer && <QuietButton title="إنهاء التصويت مبكرًا" disabled={!canEnd} onPress={() => setConfirmEnd(true)} />}
      </>}
      {!!error && <View><AppText accessibilityRole="alert" style={room.error}>{error}</AppText><QuietButton title="تحديث الجلسة" onPress={refresh} /></View>}
      {!!failure && !closed && <AppText accessibilityRole="alert" style={room.error}>{failure}</AppText>}
      {USE_MOCK && <AppText style={room.mock}>معاينة تجريبية</AppText>}
    </ScrollView>
    <SessionFooter>
      {closed ? <>{retry}<AppButton title="العودة للرئيسية" onPress={() => router.replace("/")} /></> : current ? <>
        <View style={room.row}>
          <AppButton title="يعجبني" accessibilityLabel={`يعجبني ${itemName(current)}`} disabled={!canVote}
            style={{ flex: 1 }} onPress={() => voting.answer(current.plan_item_id, true)} />
          <Pressable accessibilityRole="button" accessibilityLabel={`نتخطّى ${itemName(current)}`} accessibilityState={{ disabled: !canVote }}
            disabled={!canVote} onPress={() => voting.answer(current.plan_item_id, false)} style={[styles.pass, !canVote && { opacity: 0.43 }]}><AppText style={styles.passText}>نتخطّاه</AppText></Pressable>
        </View><AppText style={room.center}>اختياراتك خاصة بك</AppText>
      </> : <AppText accessibilityLiveRegion="polite" style={room.center}>{voting.unsaved ? "انتظر اكتمال الحفظ قبل مغادرة الشاشة." : "النتيجة بتظهر هنا عند إقفال التصويت."}</AppText>}
    </SessionFooter>
    <SessionSheet visible={review && !closed} title="اختياراتي" onClose={() => setReview(false)}>
      <AppText style={room.text}>تعديلاتك تُحفظ مباشرة. الإقفال التلقائي يكون بعد إجابة الجميع على كل المطاعم.</AppText>
      {plan.plan_items.filter(i => voting.answers[i.plan_item_id] !== undefined).map(item => <View key={item.plan_item_id} style={room.card}>
        <AppText style={room.label}>{itemName(item)}</AppText><View style={room.row}>
          {[true, false].map(liked => <Pressable key={String(liked)} accessibilityRole="radio" accessibilityLabel={`${itemName(item)}: ${liked ? "يعجبني" : "نتخطّاه"}`}
            accessibilityState={{ checked: voting.answers[item.plan_item_id] === liked, disabled: !canVote }} disabled={!canVote}
            onPress={() => voting.answer(item.plan_item_id, liked)} style={[styles.option, voting.answers[item.plan_item_id] === liked && styles.optionSelected]}>
            <AppText style={[styles.passText, voting.answers[item.plan_item_id] === liked && { color: theme.colors.onPrimary }]}>{liked ? "يعجبني" : "نتخطّاه"}</AppText>
          </Pressable>)}
        </View>
      </View>)}
      {voting.offline && <AppText style={room.warning}>اختياراتك لم تُحفظ كلها. نحاول إعادة الاتصال.</AppText>}
      <AppButton title="العودة للتصويت" onPress={() => setReview(false)} />
    </SessionSheet>
    <SessionSheet visible={confirmEnd && !closed} title="ننهي التصويت؟" onClose={() => { if (!ending) setConfirmEnd(false); }}>
      <AppText style={room.text}>{arabic(complete)} من {arabic(members)} أكملوا التصويت. إذا أنهيته الآن، نحسب الإجابات المحفوظة فقط ويُقفل تعديل الأصوات.</AppText>
      <AppText style={room.small}>اللي ما صوّت ما تُحسب إجابته «نتخطّاه».</AppText>
      {!!failure && <AppText accessibilityRole="alert" style={room.error}>{failure}</AppText>}
      <AppButton title={ending ? "جارٍ إظهار النتيجة..." : "إنهاء وإظهار النتيجة"} disabled={!canEnd} onPress={finish} />
      <QuietButton title="ننتظر الباقين" disabled={ending} onPress={() => setConfirmEnd(false)} />
    </SessionSheet>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  pill: { color: "#72603B", fontSize: 12, lineHeight: 22, textAlign: "right" },
  pass: { flex: 1, minHeight: 54, padding: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 28 },
  passText: { textAlign: "center", fontFamily: theme.typography.fontFamilyBold, fontSize: 15, lineHeight: 25 },
  option: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16 },
  optionSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  waiting: { alignItems: "center" }, haila: { width: 110, height: 115 },
});
