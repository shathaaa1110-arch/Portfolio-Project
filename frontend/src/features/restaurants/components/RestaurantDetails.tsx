import { layoutDirection } from "@/shared/layout";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { restaurantCategoryImage } from "../categoryImage";
import { restaurantCuisineLabels, restaurantDistance, restaurantRating, restaurantSpendRange } from "../presentation";
import { RestaurantMapLink } from "./RestaurantMapLink";

type Props = {
  visible: boolean;
  name: string;
  cuisines: string[];
  district: string;
  rating: number | null;
  mapsUrl?: string | null;
  distanceKm?: number | null;
  spendLow?: number | null;
  spendHigh?: number | null;
  reason?: string | null;
  onClose: () => void;
};

// A separate sheet preserves the list position and never changes its card layout.
export function RestaurantDetails({
  visible, name, cuisines, district, rating, mapsUrl, distanceKm, spendLow, spendHigh, reason, onClose,
}: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "ios" ? 0 : insets.top;
  const heroHeight = Math.max(250, Math.min(width * 0.89, 410) - (Platform.OS === "ios" ? insets.top : 0));
  const price = restaurantSpendRange(spendLow, spendHigh);
  const ratingText = restaurantRating(rating);
  const distance = restaurantDistance(distanceKm);
  // Supplied by the personal recommendation flow after saved preferences load.
  const recommendationReason = reason?.trim();
  const facts = [
    ...(price ? [["السعر التقريبي للشخص", price]] : []),
    ["التقييم", ratingText ? `${ratingText} من ٥` : "غير متوفر"],
    ...(distance ? [["المسافة", distance]] : []),
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet"
      allowSwipeDismissal onRequestClose={onClose}>
      <SafeAreaView edges={["bottom", "left", "right"]} style={styles.screen}
        accessibilityViewIsModal onAccessibilityEscape={onClose}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Image source={restaurantCategoryImage(cuisines)} contentFit="cover"
            style={[styles.photo, { height: heroHeight }]} accessible={false} />

          <View style={styles.surface}>
            <AppText variant="label" style={styles.eyebrow}>
              {restaurantCuisineLabels(cuisines).join(" · ") || "مطعم"}
            </AppText>
            <AppText variant="title" accessibilityRole="header" style={styles.name}>{name}</AppText>
            <View style={styles.location}>
              <SymbolView name={{ ios: "mappin.and.ellipse", android: "location_on", web: "location_on" }}
                size={17} tintColor="#65735E" accessible={false} />
              <AppText style={styles.locationText}>{district.trim() || "الحي غير متوفر"}</AppText>
            </View>

            <View style={styles.facts}>
              {facts.map(([label, value]) => (
                <View key={label} style={styles.fact}>
                  <AppText style={styles.label}>{label}</AppText>
                  <AppText variant="label" style={styles.value}>{value}</AppText>
                </View>
              ))}
            </View>

            {!!recommendationReason && (
              <View style={styles.reason}>
                <AppText variant="label" style={styles.reasonTitle}>ليش اخترناه لك؟</AppText>
                <AppText style={styles.reasonText}>{recommendationReason}</AppText>
              </View>
            )}

            <View style={styles.actions}>
              <RestaurantMapLink mapsUrl={mapsUrl} restaurantName={name} variant="button" />
            </View>
            <AppText style={styles.caption}>الصورة تعبيرية عن التصنيف، وليست صورة المطعم.</AppText>
          </View>
        </ScrollView>

        <View pointerEvents="box-none" style={[styles.photoHeader, { top: topInset + 14 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="رجوع للقائمة"
            onPress={onClose} style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
            <SymbolView name={{ ios: "chevron.right", android: "chevron_right", web: "chevron_right" }}
              size={19} tintColor="#FFFDF1" accessible={false} />
            <AppText style={styles.pillText}>رجوع</AppText>
          </Pressable>
          <View style={styles.pill}><AppText style={styles.pillText}>تفاصيل المطعم</AppText></View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { flexGrow: 1 },
  photo: { width: "100%" },
  surface: {
    flexGrow: 1, marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 22, paddingHorizontal: 24, paddingBottom: 20, backgroundColor: theme.colors.background,
  },
  eyebrow: { fontSize: 12, lineHeight: 20, color: theme.colors.primary, textAlign: "right", writingDirection: "rtl" },
  name: { marginTop: 9, fontSize: 38, lineHeight: 52, textAlign: "right", writingDirection: "rtl" },
  location: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 9 },
  locationText: { flexShrink: 1, fontSize: 13, lineHeight: 22, color: "#65735E", textAlign: "right", writingDirection: "rtl" },
  facts: { marginTop: 26, marginBottom: 22 },
  fact: {
    ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", gap: 12,
    paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: "#DCE1D5",
  },
  label: { flex: 1, fontSize: 12, lineHeight: 20, color: "#65735E", textAlign: "right", writingDirection: "rtl" },
  value: { flex: 1, fontSize: 12, lineHeight: 20, textAlign: "left", writingDirection: "rtl" },
  reason: {
    marginBottom: 22, padding: 16, gap: 6, borderRadius: 16,
    backgroundColor: "#EDF0E1", borderWidth: 1, borderColor: "#D9DFC9",
  },
  reasonTitle: { fontSize: 15, lineHeight: 24, textAlign: "right", writingDirection: "rtl" },
  reasonText: { fontSize: 14, lineHeight: 25, color: "#4E5E4B", textAlign: "right", writingDirection: "rtl" },
  actions: { gap: 14 },
  caption: { marginTop: 12, fontSize: 10, lineHeight: 18, color: "#707968", textAlign: "center", writingDirection: "rtl" },
  photoHeader: {
    position: "absolute", left: 24, right: 24, ...layoutDirection("ltr"), flexDirection: "row-reverse",
    alignItems: "center", justifyContent: "space-between", gap: 12,
  },
  pill: {
    ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    minHeight: 44, paddingHorizontal: 16, paddingVertical: 8, gap: 4,
    borderRadius: 25, borderWidth: 1, borderColor: "#FFFFFF33", backgroundColor: "#34422ED9",
  },
  pillText: { fontSize: 13, lineHeight: 22, color: "#FFFDF1", writingDirection: "rtl" },
  pressed: { opacity: 0.7 },
});
