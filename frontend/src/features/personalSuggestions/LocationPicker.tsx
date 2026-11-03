import { layoutDirection } from "@/shared/layout";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton, AppInput, AppText } from "@/shared/components";
import { ApiError } from "@/shared/api/errors";
import { theme } from "@/shared/theme";
import { filterDistricts, getDistricts, type District } from "./districts";

type Props = {
  visible: boolean;
  onClose: () => void;
  onUseCurrentLocation: () => void;
  onDistrict: (district: District) => void;
  onClear: () => void;
};

export function LocationPicker({ visible, onClose, onUseCurrentLocation, onDistrict, onClear }: Props) {
  const [districts, setDistricts] = useState<District[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    setError("");
    setQuery("");
    void getDistricts().then(items => { if (active) setDistricts(items); })
      .catch(error => {
        if (!active) return;
        setDistricts([]);
        setError(error instanceof ApiError && [404, 501].includes(error.status)
          ? "اختيار الحي غير متاح حاليًا. تقدر تستخدم موقع الجهاز أو تكمّل التصفح."
          : "تعذّر تحميل الأحياء. حاول مرة أخرى.");
      }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [visible, attempt]);

  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet"
    allowSwipeDismissal onRequestClose={onClose}>
    <SafeAreaView style={styles.screen} accessibilityViewIsModal onAccessibilityEscape={onClose}>
      <View style={styles.heading}>
        <AppText variant="title" style={styles.text}>وين ندوّر لك؟</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="إغلاق اختيار الموقع" onPress={onClose} style={styles.link}>
          <AppText>إغلاق</AppText>
        </Pressable>
      </View>
      <AppText style={styles.text}>نستخدم موقعك لهذا البحث فقط، وما نحفظه في حسابك.</AppText>
      <AppButton title="استخدم موقعي الحالي" onPress={onUseCurrentLocation} />
      <AppText variant="label" style={styles.text}>أو اختر حيّك</AppText>
      <AppInput value={query} onChangeText={setQuery} placeholder="ابحث عن حي"
        accessibilityLabel="البحث في الأحياء" style={styles.text} autoCorrect={false} />
      {loading ? <ActivityIndicator color={theme.colors.primary} /> : error ?
        <View style={styles.error}>
          <AppText accessibilityRole="alert" style={styles.text}>{error}</AppText>
          <AppButton title="إعادة المحاولة" onPress={() => setAttempt(value => value + 1)} />
        </View> : <FlatList data={filterDistricts(districts, query)} keyExtractor={item => item.id}
          keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "web" ? "none" : "on-drag"}
          renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => onDistrict(item)} style={styles.district}>
            <AppText style={styles.text}>{item.name_ar}</AppText>
          </Pressable>}
          ListEmptyComponent={<AppText style={styles.text}>{query.trim() ? "ما لقينا حي بهذا الاسم." : "لا توجد أحياء متاحة حاليًا."}</AppText>} />}
      <Pressable accessibilityRole="button" onPress={onClear} style={styles.link}>
        <AppText style={styles.linkText}>التصفح بدون موقع</AppText>
      </Pressable>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background, padding: 20, gap: 16 },
  heading: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  text: { textAlign: "right", writingDirection: "rtl" },
  link: { minHeight: 44, paddingHorizontal: 12, justifyContent: "center", alignItems: "center" },
  linkText: { textDecorationLine: "underline" },
  error: { gap: 12, flex: 1 },
  district: { minHeight: 52, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: theme.colors.border },
});
