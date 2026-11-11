import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { getDistricts, filterDistricts, type District } from "@/features/personalSuggestions";
import { AppButton, AppInput, AppText } from "@/shared/components";
import { layoutDirection } from "@/shared/layout";
import { theme } from "@/shared/theme";
import { latinDigits, riyadhDate, shiftDate, RIYADH } from "../model";
import { SessionIcon, SessionSheet } from "./SessionChrome";

export type SessionField = "name" | "date" | "time" | "district" | null;
export function SessionEditors({ field, name, date, time, onClose, onName, onDate, onTime, onDistrict }: {
  field: SessionField; name: string; date: string; time: string;
  onClose: () => void; onName: (name: string) => void; onDate: (date: string) => void;
  onTime: (time: string) => void; onDistrict: (district: District) => void;
}) {
  const [draftName, setDraftName] = useState(name);
  const [hour, setHour] = useState(String(Number(time.slice(0, 2)) % 12 || 12));
  const [minute, setMinute] = useState(time.slice(3));
  const [pm, setPm] = useState(Number(time.slice(0, 2)) >= 12);
  const [month, setMonth] = useState(date.slice(0, 7));
  const [districts, setDistricts] = useState<District[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setDraftName(name); setHour(String(Number(time.slice(0, 2)) % 12 || 12));
    setMinute(time.slice(3)); setPm(Number(time.slice(0, 2)) >= 12); setMonth(date.slice(0, 7)); setError("");
  }, [field, name, date, time]);
  useEffect(() => {
    if (field !== "district") return;
    let active = true;
    setLoading(true); setError(""); setQuery("");
    void getDistricts().then(items => { if (active) setDistricts(items); })
      .catch(() => { if (active) setError("تعذّر تحميل الأحياء. حاول مرة أخرى."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [field, attempt]);
  const titles = { name: "اسم الجلسة", date: "متى نلتقي؟", time: "وقت اللقاء", district: "منطقة اللقاء" };
  const today = riyadhDate();
  const lastDay = shiftDate(today, 60);
  const monthStart = new Date(`${month}-01T12:00:00Z`);
  const start = monthStart.getUTCDay();
  const days = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
  function moveMonth(by: number) {
    const next = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + by, 1, 12));
    setMonth(next.toISOString().slice(0, 7));
  }
  function saveTime() {
    const h = Number(latinDigits(hour)), m = Number(latinDigits(minute));
    if (!hour.trim() || !minute.trim() || !Number.isInteger(h) || h < 1 || h > 12 || !Number.isInteger(m) || m < 0 || m > 59) {
      setError("اكتب ساعة من ١ إلى ١٢، ودقائق من ٠ إلى ٥٩."); return;
    }
    onTime(`${String(h % 12 + (pm ? 12 : 0)).padStart(2, "0")}:${String(m).padStart(2, "0")}`); onClose();
  }
  return <SessionSheet visible={field !== null} title={field ? titles[field] : ""} onClose={onClose}>
    {field === "name" && <>
      <AppText style={styles.rtl}>اسم يعرفون فيه جمعتكم.</AppText>
      <AppInput accessibilityLabel="اسم الجلسة" value={draftName} onChangeText={setDraftName} maxLength={120} autoFocus style={styles.rtl} />
      <AppText style={styles.muted}>حتى ٦٠ حرفًا.</AppText>
      <AppButton title="اعتماد الاسم" disabled={!draftName.trim() || [...draftName.trim()].length > 60} onPress={() => { onName(draftName.trim()); onClose(); }} />
    </>}
    {field === "date" && <>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel="الشهر السابق" disabled={month <= today.slice(0, 7)} onPress={() => moveMonth(-1)} style={styles.nav}><SessionIcon name="back" /></Pressable>
        <AppText style={styles.month}>{new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { month: "long", year: "numeric", timeZone: RIYADH }).format(monthStart)}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="الشهر التالي" disabled={month >= lastDay.slice(0, 7)} onPress={() => moveMonth(1)} style={styles.nav}><SessionIcon name="next" /></Pressable>
      </View>
      <View style={styles.calendar}>
        {["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"].map(day => <AppText key={day} style={styles.weekday}>{day}</AppText>)}
        {Array.from({ length: start }, (_, i) => <View key={`blank-${i}`} style={styles.day} />)}
        {Array.from({ length: days }, (_, i) => {
          const value = `${month}-${String(i + 1).padStart(2, "0")}`;
          const disabled = value < today || value > lastDay;
          return <Pressable key={value} accessibilityRole="button" accessibilityLabel={value}
            accessibilityState={{ selected: value === date, disabled }} disabled={disabled}
            onPress={() => { onDate(value); onClose(); }}
            style={[styles.day, value === date && styles.selected, disabled && styles.disabled]}>
            <AppText style={value === date && styles.selectedText}>{(i + 1).toLocaleString("ar-SA")}</AppText>
          </Pressable>;
        })}
      </View>
      <AppText style={styles.muted}>اختر موعدًا خلال الستين يومًا القادمة.</AppText>
    </>}
    {field === "time" && <>
      <AppText style={styles.rtl}>بتوقيت الرياض</AppText>
      <View style={styles.row}>
        <View style={styles.grow}><AppText style={styles.rtl}>الساعة</AppText><AppInput accessibilityLabel="الساعة" value={hour} onChangeText={setHour} maxLength={2} keyboardType="number-pad" /></View>
        <View style={styles.grow}><AppText style={styles.rtl}>الدقائق</AppText><AppInput accessibilityLabel="الدقائق" value={minute} onChangeText={setMinute} maxLength={2} keyboardType="number-pad" /></View>
      </View>
      <View style={styles.row}>{[false, true].map(value => <Pressable key={String(value)} accessibilityRole="button" accessibilityState={{ selected: pm === value }}
        onPress={() => setPm(value)} style={[styles.period, pm === value && styles.selected]}><AppText style={pm === value && styles.selectedText}>{value ? "مساءً" : "صباحًا"}</AppText></Pressable>)}</View>
      {!!error && <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText>}
      <AppButton title="اعتماد الوقت" onPress={saveTime} />
    </>}
    {field === "district" && <>
      <AppText style={styles.rtl}>نبحث حول مركز الحي، ونراعي حدود المسافة التي يحددها كل مشارك.</AppText>
      <AppInput accessibilityLabel="ابحث عن حي" placeholder="ابحث عن حي" value={query} onChangeText={setQuery} style={styles.rtl} />
      {loading ? <ActivityIndicator color={theme.colors.primary} /> : error ? <>
        <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText><AppButton title="إعادة المحاولة" onPress={() => setAttempt(v => v + 1)} />
      </> : <>
        {filterDistricts(districts, query).map(item => <Pressable key={item.id} accessibilityRole="button" style={styles.district} onPress={() => { onDistrict(item); onClose(); }}>
          <AppText style={styles.rtl}>{item.name_ar}</AppText>
        </Pressable>)}
        {!filterDistricts(districts, query).length && <AppText style={styles.rtl}>لا توجد أحياء مطابقة.</AppText>}
      </>}
    </>}
  </SessionSheet>;
}
const styles = StyleSheet.create({
  rtl: { textAlign: "right", writingDirection: "rtl", lineHeight: 26 },
  muted: { textAlign: "center", color: theme.colors.placeholder },
  row: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  grow: { flex: 1, gap: 8 }, nav: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  month: { flex: 1, textAlign: "center", fontFamily: theme.typography.fontFamilyBold, fontSize: 20 },
  calendar: { ...layoutDirection("ltr"), flexDirection: "row-reverse", flexWrap: "wrap" },
  weekday: { width: "14.2857%", textAlign: "center", fontSize: 11, paddingVertical: 12 },
  day: { width: "14.2857%", minHeight: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  selected: { backgroundColor: theme.colors.primary }, selectedText: { color: theme.colors.onPrimary },
  disabled: { opacity: 0.3 },
  period: { flex: 1, minHeight: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.border },
  district: { minHeight: 52, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  error: { color: theme.colors.error, textAlign: "right" },
});
