import { useEffect, useRef, useState } from "react";
import { SymbolView } from "expo-symbols";
import { ActivityIndicator, Keyboard, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton, AppText, HailaMessage, ReplyMessage, ConversationChoice } from "@/shared/components";
import { layoutDirection } from "@/shared/layout";
import { theme } from "@/shared/theme";
import { cuisineFilters, matchingDistricts, type SearchDistrict } from "../filterOptions";
import type { RestaurantFilters } from "../types";

type Props = {
  onSubmit: (query: string, filters: RestaurantFilters) => void;
  onReset: () => void;
  loadDistricts: () => Promise<SearchDistrict[]>;
  total: number; loading: boolean; error: string | null;
};

// Guided questions use existing search parameters, with no text interpretation.
export function RestaurantSearch({ onSubmit, onReset, loadDistricts, total, loading, error }: Props) {
  const [step, setStep] = useState<"craving" | "district" | "results">("craving");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<RestaurantFilters>({});
  const [picker, setPicker] = useState<"cuisine" | "district" | null>(null);
  const lastPicker = useRef<"cuisine" | "district">("cuisine");
  const shownPicker = picker ?? lastPicker.current;
  const [districtQuery, setDistrictQuery] = useState("");
  const [districts, setDistricts] = useState<SearchDistrict[] | null>(null);
  const [districtError, setDistrictError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (picker !== "district" || districts !== null) return;
    let active = true;
    setDistrictError(false);
    loadDistricts().then(items => { if (active) setDistricts(items); })
      .catch(() => { if (active) setDistrictError(true); });
    return () => { active = false; };
  }, [picker, districts, attempt, loadDistricts]);

  const cuisineLabel = cuisineFilters.find(([id]) => id === filters.cuisine)?.[1];
  const districtLabel = districts?.find(item => item.id === filters.districtId)?.name_ar;
  const requestLabel = [query, cuisineLabel].filter(Boolean).join("، ") || "خلّيني أكتشف";
  const reply = loading ? "لحظة، أبحث لك عن المطاعم…"
    : error ? "ما قدرت أحمّل النتائج. إعادة المحاولة متاحة بالأسفل."
    : total === 0 ? "ما لقيت مطعمًا بهذه الخيارات. نغيّر الطلب أو الحي؟"
    : `لقيت ${total.toLocaleString("ar-SA-u-nu-arab")} مطعم. هذي الخيارات، وتفاصيل كل مطعم في بطاقته.`;

  function chooseCraving(text: string, cuisine = "") {
    Keyboard.dismiss(); onReset();
    setQuery(text); setFilters(current => ({ ...current, cuisine })); setStep("district");
  }
  function showResults(districtId: string) {
    const selected = { ...filters, districtId };
    setFilters(selected); setStep("results"); onSubmit(query, selected);
  }
  function edit(which: "craving" | "district") {
    onReset(); setStep(which);
    if (which === "craving") setDraft(query);
  }
  function open(which: "cuisine" | "district") {
    Keyboard.dismiss(); lastPicker.current = which; setDistrictQuery(""); setPicker(which);
  }
  function select(value: string) {
    if (picker === null) return;
    if (picker === "cuisine") chooseCraving(draft.trim(), value);
    else showResults(value);
    setPicker(null);
  }

  return <View style={styles.search}>
    <HailaMessage>هلا! وش على بالك اليوم؟ نبحث بنوع الأكل أو باسم مطعم.</HailaMessage>
    {step !== "craving" && <>
      <ReplyMessage onEdit={() => edit("craving")} editLabel="تعديل طلب المطعم">{requestLabel}</ReplyMessage>
      <HailaMessage>في أي حي نبحث؟ نقدر نحدد حيًا أو نعرض كل الأحياء.</HailaMessage>
    </>}
    {step === "results" && <>
      <ReplyMessage onEdit={() => edit("district")} editLabel="تعديل حي البحث">{districtLabel || "كل الأحياء"}</ReplyMessage>
      <HailaMessage>{reply}</HailaMessage>
      <ConversationChoice title="نبدأ بحثًا جديدًا" onPress={() => { onReset(); setDraft(""); setQuery(""); setFilters({}); setStep("craving"); }} />
    </>}
    {step === "craving" && <>
      <View style={styles.filters}>
        {[["grill", "مشويات"], ["italian", "إيطالي"], ["saudi_gulf", "سعودي وخليجي"], ["coffee_tea", "قهوة وشاي"]].map(([id, label]) =>
          <ConversationChoice key={id} title={label} onPress={() => chooseCraving(draft.trim(), id)} />)}
        <ConversationChoice title="مطابخ أخرى" onPress={() => open("cuisine")} />
        <ConversationChoice title="خلّيني أكتشف" onPress={() => chooseCraving("")} />
      </View>
      <View style={styles.composer}>
        <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={() => { if (draft.trim()) chooseCraving(draft.trim()); }}
          accessibilityLabel="رسالتك لهيلة" placeholder="مثلًا: بيتزا أو اسم مطعم"
          placeholderTextColor={theme.colors.searchText} returnKeyType="send" maxLength={50}
          autoCorrect={false} autoCapitalize="none" style={styles.input} />
        <Pressable accessibilityRole="button" accessibilityLabel="إرسال لهيلة" disabled={!draft.trim()}
          accessibilityState={{ disabled: !draft.trim() }} onPress={() => chooseCraving(draft.trim())}
          style={({ pressed }) => [styles.send, (pressed || !draft.trim()) && styles.pressed]}>
          <SymbolView name={{ ios: "arrow.up", android: "arrow_upward", web: "arrow_upward" }} size={21} tintColor={theme.colors.onPrimary} accessible={false} />
        </Pressable>
      </View>
    </>}
    {step === "district" && <View style={styles.filters}>
      <ConversationChoice title="أختار الحي" onPress={() => open("district")} />
      <ConversationChoice title="كل الأحياء" onPress={() => showResults("")} />
    </View>}
    <Modal visible={picker !== null} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setPicker(null)}>
      <SafeAreaView style={styles.sheet} accessibilityViewIsModal onAccessibilityEscape={() => setPicker(null)}>
        <View style={styles.sheetHeading}>
          <AppText accessibilityRole="header" style={styles.sheetTitle}>{shownPicker === "district" ? "في أي حي؟" : "أي مطبخ تشتهي؟"}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="إغلاق الفلاتر" onPress={() => setPicker(null)} style={styles.clear}><AppText style={styles.clearText}>إغلاق</AppText></Pressable>
        </View>
        {shownPicker === "district" && <TextInput value={districtQuery} onChangeText={setDistrictQuery}
          accessibilityLabel="ابحث عن حي" placeholder="اسم الحي" placeholderTextColor={theme.colors.placeholder} style={styles.districtSearch} />}
        <ScrollView contentContainerStyle={styles.choices} keyboardShouldPersistTaps="handled">
          <Choice label={shownPicker === "district" ? "كل الأحياء" : "كل المطابخ"} selected={!(shownPicker === "district" ? filters.districtId : filters.cuisine)} onPress={() => select("")} />
          {shownPicker === "cuisine" && cuisineFilters.map(([id, label]) => <Choice key={id} label={label} selected={filters.cuisine === id} onPress={() => select(id)} />)}
          {shownPicker === "district" && <>
            {districtError ? <View style={styles.problem}><AppText style={styles.copy}>تعذّر تحميل الأحياء.</AppText><AppButton title="إعادة تحميل الأحياء" onPress={() => setAttempt(n => n + 1)} /></View>
              : districts === null ? <View style={styles.problem}><ActivityIndicator color={theme.colors.primary} /><AppText style={styles.copy}>نحمّل الأحياء…</AppText></View>
              : matchingDistricts(districts, districtQuery).length === 0 ? <AppText style={styles.copy}>لا توجد أحياء مطابقة.</AppText>
              : matchingDistricts(districts, districtQuery).map(item => <Choice key={item.id} label={item.name_ar} selected={filters.districtId === item.id} onPress={() => select(item.id)} />)}
          </>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </View>;
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label} onPress={onPress} style={[styles.choice, selected && styles.selectedChoice]}>
    <AppText style={styles.choiceLabel}>{label}</AppText><AppText style={styles.check}>{selected ? "✓" : ""}</AppText>
  </Pressable>;
}
const styles = StyleSheet.create({
  search: { ...layoutDirection("ltr"), gap: 14 },
  copy: { fontSize: 14, lineHeight: 24, textAlign: "right", writingDirection: "rtl", color: "#536653" },
  composer: { flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 7, paddingRight: 16, borderRadius: 28, borderWidth: 1, borderColor: "#C7CEBA", backgroundColor: theme.colors.surface },
  input: { flex: 1, minHeight: 44, padding: 0, fontFamily: theme.typography.fontFamily, fontSize: 15, textAlign: "right", writingDirection: "rtl", color: theme.colors.text },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  filters: { flexDirection: "row-reverse", alignItems: "center", gap: 8, flexWrap: "wrap" },
  clear: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }, clearText: { fontSize: 13, color: theme.colors.primary, textAlign: "right", writingDirection: "rtl", textDecorationLine: "underline" },
  sheet: { ...layoutDirection("ltr"), flex: 1, backgroundColor: theme.colors.background },
  sheetHeading: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 22, paddingVertical: 12 },
  sheetTitle: { flex: 1, fontSize: 25, lineHeight: 38, textAlign: "right", writingDirection: "rtl", fontFamily: theme.typography.fontFamilyBold },
  districtSearch: { marginHorizontal: 22, marginBottom: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, fontFamily: theme.typography.fontFamily, fontSize: 16, textAlign: "right", writingDirection: "rtl", color: theme.colors.text },
  choices: { paddingHorizontal: 22, paddingBottom: 28, gap: 6 },
  choice: { flexDirection: "row-reverse", alignItems: "center", minHeight: 52, padding: 12, borderRadius: 14 },
  selectedChoice: { backgroundColor: "#E7EBD9" },
  choiceLabel: { flex: 1, fontSize: 16, textAlign: "right", writingDirection: "rtl" }, check: { color: theme.colors.primary, width: 24, textAlign: "center" },
  problem: { padding: 16, gap: 12 }, pressed: { opacity: 0.75 },
});
