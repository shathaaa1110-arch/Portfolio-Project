import { useRef, useState } from "react";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { loadSession } from "@/features/auth";
import type { District } from "@/features/personalSuggestions";
import { AppText } from "@/shared/components";
import { USE_MOCK } from "@/shared/api/config";
import { ApiError } from "@/shared/api/errors";
import { layoutDirection } from "@/shared/layout";
import { theme } from "@/shared/theme";
import { createSession } from "./api/create";
import { RIYADH, riyadhDate, sessionError, sessionInput, shiftDate } from "./model";
import { SessionFooter, room } from "./components/SessionLayout";
import { SessionHeader, SessionIcon } from "./components/SessionChrome";
import { SessionEditors, type SessionField } from "./components/SessionEditors";

// Retain this form through the sign-in screens; never store a token in the draft.
let resumeDraft: { name: string; date: string; time: string; district: District | null } | null = null;

export function CreateSessionScreen() {
  const [date, setDate] = useState(() => resumeDraft?.date ?? shiftDate(riyadhDate(), 1));
  const [time, setTime] = useState(resumeDraft?.time ?? "20:30");
  const [name, setName] = useState(() => resumeDraft?.name ?? "عشاء " + new Intl.DateTimeFormat("ar-SA", { weekday: "long", timeZone: RIYADH }).format(new Date(`${date}T12:00:00+03:00`)));
  const [district, setDistrict] = useState<District | null>(resumeDraft?.district ?? null);
  const [field, setField] = useState<SessionField>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const inFlight = useRef(false);
  const success = useRef(false);
  const when = new Date(`${date}T${time}:00+03:00`);
  const display = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-arab", { timeZone: RIYADH, ...options }).format(when);

  async function submit() {
    if (inFlight.current || success.current) return;
    if (needsLogin) {
      resumeDraft = { name, date, time, district };
      router.push({ pathname: "/login", params: { returnTo: "/sessions/new" } }); return;
    }
    inFlight.current = true; setSaving(true); setError("");
    try {
      const body = sessionInput(name, date, time, district?.id ?? "");
      const account = await loadSession();
      if (!account) { setNeedsLogin(true); setError("سجّل دخولك لإنشاء الجلسة. أصحابك يقدرون ينضمون كضيوف."); return; }
      const created = await createSession(account.token, body);
      success.current = true;
      resumeDraft = null;
      router.replace({ pathname: "/sessions/[id]", params: {
        id: created.outing_id, code: created.invite_code, inviteUrl: created.invite_url ?? "",
      } });
    } catch (e) {
      setError(sessionError(e));
      if (e instanceof ApiError && e.status === 401) setNeedsLogin(true);
    } finally { inFlight.current = false; setSaving(false); }
  }

  return <SafeAreaView style={styles.screen}>
    <View style={room.header}><SessionHeader title="جلسة جديدة" /></View>
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.page}>
        <View style={styles.intro}>
          <AppText accessibilityRole="header" style={styles.title}>خلّها جمعة حلوة.</AppText>
          <Image source={require("../../../assets/images/sessions/underline.png")} contentFit="cover" style={styles.underline} accessible={false} />
          <AppText style={styles.subtitle}>حدّد التفاصيل، وذوق يجمع اختياراتكم.</AppText>
        </View>
        <Image source={require("../../../assets/images/sessions/restaurant-hero.png")} style={styles.hero} contentFit="cover" accessible={false} />
        <View style={styles.paper}>
          <Image source={require("../../../assets/images/sessions/invitation-paper.png")} style={StyleSheet.absoluteFill} contentFit="fill" accessible={false} />
          <View style={styles.paperContent}>
            <AppText style={styles.label}>اسم الجلسة</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel={`تعديل اسم الجلسة: ${name}`} disabled={saving} onPress={() => setField("name")} style={styles.nameRow}>
              <AppText style={styles.name}>{name}</AppText><SessionIcon name="edit" size={24} />
            </Pressable>
            <View style={styles.meetRow}>
              <Image source={require("../../../assets/images/sessions/underline.png")} contentFit="cover" style={styles.meetStroke} accessible={false} />
              <AppText style={styles.meet}>نلتقي</AppText>
              <Image source={require("../../../assets/images/sessions/underline.png")} contentFit="cover" style={styles.meetStroke} accessible={false} />
            </View>
            <View style={styles.dateTime}>
              <Pressable accessibilityRole="button" accessibilityLabel={`تعديل تاريخ الجلسة: ${date}`} onPress={() => setField("date")} disabled={saving} style={styles.dateCell}>
                <View style={styles.dateCopy}>
                  <AppText style={styles.weekday}>{display({ weekday: "long" })}</AppText>
                  <AppText style={styles.day}>{display({ day: "numeric" })}</AppText>
                  <AppText style={styles.month}>{display({ month: "long", year: "numeric" })}</AppText>
                </View><SessionIcon name="calendar" size={27} />
              </Pressable>
              <View style={styles.dateDivider} />
              <Pressable accessibilityRole="button" accessibilityLabel={`تعديل وقت الجلسة: ${time}`} onPress={() => setField("time")} disabled={saving} style={styles.timeCell}>
                <View style={styles.dateCopy}>
                  <AppText style={styles.time}>{display({ hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s*[صم]$/, "")}</AppText>
                  <AppText style={styles.weekday}>{Number(time.slice(0, 2)) >= 12 ? "مساءً" : "صباحًا"}</AppText>
                </View><SessionIcon name="time" size={28} />
              </Pressable>
            </View>
            <AppText style={styles.timezone}>بتوقيت الرياض</AppText>
            <View style={styles.divider} />
            <Pressable accessibilityRole="button" accessibilityLabel="تعديل منطقة اللقاء" onPress={() => setField("district")} disabled={saving} style={styles.area}>
              <SessionIcon name="location" size={29} />
              <View style={styles.areaCopy}><AppText style={styles.label}>منطقة اللقاء</AppText>
                <AppText style={styles.district}>{district ? `${district.name_ar}، الرياض` : "اختر منطقة اللقاء"}</AppText></View>
              <SessionIcon name="next" size={22} />
            </Pressable>
            <AppText style={styles.paperHint}>تقدر تعدّل التفاصيل قبل الإنشاء.</AppText>
          </View>
        </View>
        <View style={styles.people}><SessionIcon name="people" size={27} /><AppText style={styles.peopleText}>حتى ٨ أشخاص، وكل شخص يضيف ذوقه.</AppText></View>
        {USE_MOCK && <AppText style={styles.mock}>معاينة تجريبية</AppText>}
      </View>
    </ScrollView>
    <SessionFooter>
      {!!error && <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText>}
      <Pressable accessibilityRole="button" accessibilityLabel={needsLogin ? "تسجيل الدخول لإنشاء الجلسة" : "إنشاء الجلسة"}
        accessibilityState={{ disabled: saving, busy: saving }} disabled={saving} onPress={submit}
        style={({ pressed }) => [styles.submit, (pressed || saving) && styles.pressed]}>
        <AppText style={styles.submitText}>{saving ? "جارٍ إنشاء الجلسة..." : needsLogin ? "تسجيل الدخول" : "إنشاء الجلسة"}</AppText>
        <SessionIcon name="arrow" color={theme.colors.onPrimary} size={23} />
      </Pressable>
      <AppText style={room.center}>بعدها ترسل الدعوة لأصحابك.</AppText>
    </SessionFooter>
    <SessionEditors field={field} name={name} date={date} time={time} onClose={() => setField(null)}
      onName={setName} onDate={setDate} onTime={setTime} onDistrict={setDistrict} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background }, scroll: { flexGrow: 1 },
  page: { width: "100%", maxWidth: 460, alignSelf: "center", paddingHorizontal: 12, paddingBottom: 20 },
  intro: { paddingHorizontal: 8, marginTop: 10, marginBottom: 6 },
  title: { textAlign: "right", writingDirection: "rtl", fontFamily: theme.typography.fontFamilyBold, fontSize: 32, lineHeight: 51 },
  underline: { width: 80, height: 7, alignSelf: "flex-end", marginRight: 47, marginTop: -5, marginBottom: 5 },
  subtitle: { textAlign: "right", writingDirection: "rtl", fontSize: 16, lineHeight: 28 },
  hero: { width: "100%", aspectRatio: 3, zIndex: 1 },
  paper: { marginTop: -11, minHeight: 410, zIndex: 2 },
  paperContent: { paddingHorizontal: 24, paddingTop: 0, paddingBottom: 57 },
  label: { textAlign: "right", writingDirection: "rtl", fontSize: 14, lineHeight: 24 },
  nameRow: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.primary, minHeight: 57, paddingBottom: 6 },
  name: { flex: 1, textAlign: "right", writingDirection: "rtl", fontFamily: theme.typography.fontFamilyBold, fontSize: 32, lineHeight: 48 },
  meetRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 8, marginBottom: 8 },
  meetStroke: { width: 29, height: 4 },
  meet: { fontFamily: theme.typography.fontFamilyBold, fontSize: 17, lineHeight: 28, textAlign: "center" },
  dateTime: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "stretch" },
  dateCell: { ...layoutDirection("ltr"), flex: 1.12, flexDirection: "row", alignItems: "center", gap: 5 },
  timeCell: { ...layoutDirection("ltr"), flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  dateCopy: { flex: 1, alignItems: "center", justifyContent: "center" },
  weekday: { fontSize: 19, lineHeight: 27, fontFamily: theme.typography.fontFamilyBold },
  day: { fontSize: 46, lineHeight: 48, fontFamily: theme.typography.fontFamilyBold },
  month: { fontSize: 16, lineHeight: 24, fontFamily: theme.typography.fontFamilyBold },
  time: { fontSize: 37, lineHeight: 59, fontFamily: theme.typography.fontFamilyBold, writingDirection: "ltr" },
  dateDivider: { width: 1, backgroundColor: "#B5B586", marginHorizontal: 9, marginVertical: 6 },
  timezone: { textAlign: "center", fontSize: 13, lineHeight: 20, color: "#54705B", marginTop: 5 },
  divider: { height: 1, backgroundColor: "#B5B586", marginTop: 10, marginBottom: 10 },
  area: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", gap: 12, minHeight: 60 },
  areaCopy: { flex: 1 }, district: { fontSize: 22, lineHeight: 34, textAlign: "right", writingDirection: "rtl", fontFamily: theme.typography.fontFamilyBold },
  paperHint: { textAlign: "center", color: "#586348", fontSize: 13, lineHeight: 23, marginTop: 8 },
  people: { ...layoutDirection("ltr"), flexDirection: "row-reverse", gap: 13, alignItems: "center", justifyContent: "center", marginTop: 8, marginBottom: 16 },
  peopleText: { fontSize: 14, lineHeight: 25, flexShrink: 1, textAlign: "right", writingDirection: "rtl" },
  submit: { ...layoutDirection("ltr"), flexDirection: "row-reverse", gap: 15, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primary, borderRadius: 32, minHeight: 56, paddingHorizontal: 18, paddingVertical: 8 },
  submitText: { fontFamily: theme.typography.fontFamilyBold, fontSize: 23, lineHeight: 36, color: theme.colors.onPrimary },
  footer: { fontSize: 14, textAlign: "center", color: "#586348", marginTop: 8, lineHeight: 27 },
  error: { color: theme.colors.error, textAlign: "center", marginBottom: 12, lineHeight: 25 },
  mock: { color: theme.colors.placeholder, fontSize: 11, textAlign: "center", marginTop: 8 }, pressed: { opacity: 0.7 },
});
