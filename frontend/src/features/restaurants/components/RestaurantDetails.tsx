import { layoutDirection } from "@/shared/layout";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton, AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { useRestaurantImage } from "../useRestaurantImage";
import { restaurantCuisineLabels, restaurantDistance, restaurantHours, restaurantRating, restaurantSpendRange } from "../presentation";
import { useRestaurantDetails } from "../useRestaurantDetails";
import { RestaurantMapLink } from "./RestaurantMapLink";

type Props = {
  restaurantId: number;
  visible: boolean;
  name: string;
  cuisines: string[];
  district: string;
  rating: number | null;
  imageUrl?: string | null;
  mapsUrl?: string | null;
  distanceKm?: number | null;
  spendLow?: number | null;
  spendHigh?: number | null;
  reason?: string | null;
  onClose: () => void;
};

// Full-screen details keep the originating list and its filters mounted behind them.
export function RestaurantDetails(props: Props) {
  const { visible, onClose, reason, distanceKm } = props;
  const details = useRestaurantDetails(props.restaurantId, visible);
  const data = details.data;
  const name = data ? data.name_ar || data.name_en || "مطعم" : props.name;
  const cuisines = data?.cuisines ?? props.cuisines;
  const photo = useRestaurantImage(data ? data.image_url : props.imageUrl, cuisines);
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.25;
  const rating = restaurantRating(data?.rating ?? null);
  const price = restaurantSpendRange(data?.spend_low, data?.spend_high);
  const distance = restaurantDistance(distanceKm);
  const count = data?.rating_count;
  const reviews = typeof count === "number" && Number.isSafeInteger(count) && count > 0
    ? `${count.toLocaleString("ar-SA-u-nu-arab")} مراجعة` : null;
  const recommendationReason = reason?.trim();

  return <Modal visible={visible} animationType="fade" presentationStyle="fullScreen"
    allowSwipeDismissal={false} onRequestClose={onClose}>
    <SafeAreaView style={styles.screen} accessibilityViewIsModal onAccessibilityEscape={onClose}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع للقائمة" onPress={onClose}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <SymbolView name={{ ios: "chevron.right", android: "chevron_right", web: "chevron_right" }}
            size={23} tintColor={theme.colors.primary} accessible={false} />
        </Pressable>
        <AppText accessibilityRole="header" style={styles.headerTitle}>تفاصيل المطعم</AppText>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView key={props.restaurantId} contentContainerStyle={styles.scrollContent}>
        <View style={styles.photoFrame}>
          <Image source={photo.source} onError={photo.onError} contentFit="cover" style={styles.photo} accessible={false} />
          {photo.illustrative && <View style={styles.imageLabel}><AppText style={styles.imageLabelText}>صورة توضيحية</AppText></View>}
        </View>
        <View style={styles.identity}>
          <AppText style={styles.cuisine}>{restaurantCuisineLabels(cuisines).join(" · ") || "مطعم"}</AppText>
          <AppText accessibilityRole="header" style={styles.name}>{name}</AppText>
        </View>
        {details.status !== "ready" ? <View style={styles.status} accessibilityLiveRegion="polite">
          {details.status === "loading" && <ActivityIndicator color={theme.colors.primary} />}
          <AppText accessibilityRole={details.status === "loading" ? undefined : "alert"} style={styles.body}>
            {details.status === "loading" ? "نحمّل تفاصيل المطعم…"
              : details.status === "missing" ? "هذا المطعم غير موجود أو لم يعد متاحًا. ارجع للقائمة واختر مطعمًا آخر."
              : "تعذّر تحميل التفاصيل. تحقّق من الاتصال وحاول مرة أخرى."}
          </AppText>
          {details.status === "error" && <AppButton title="إعادة تحميل التفاصيل" onPress={details.retry} />}
          {details.status === "missing" && <AppButton title="العودة للمطاعم" onPress={onClose} />}
        </View> : <>
          <View style={[styles.stats, stacked && styles.stacked]}>
            <View style={styles.stat}>
              <View style={styles.statHeading}>
                <SymbolView name={{ ios: "star.fill", android: "star", web: "star" }} size={17} tintColor="#B88225" accessible={false} />
                <AppText style={styles.statLabel}>التقييم</AppText>
              </View>
              <AppText style={styles.statValue}>{rating ? `${rating} من ٥` : "غير متوفر"}</AppText>
              {rating && <AppText style={styles.hint}>{reviews || "عدد المراجعات غير متوفر"}</AppText>}
            </View>
            <View style={styles.stat}>
              <AppText style={styles.statLabel}>تقريبًا للشخص</AppText>
              <AppText style={styles.statValue}>{price || "السعر غير متوفر"}</AppText>
              {price && <AppText style={styles.hint}>قد تختلف التكلفة حسب الطلب</AppText>}
            </View>
          </View>
          <View style={styles.section}>
            <AppText accessibilityRole="header" style={styles.sectionTitle}>عن المطعم</AppText>
            <AppText style={styles.body}>{data?.summary?.trim() || "وصف المطعم غير متوفر حاليًا."}</AppText>
          </View>
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <SymbolView name={{ ios: "clock", android: "schedule", web: "schedule" }} size={21} tintColor={theme.colors.primary} accessible={false} />
              <AppText accessibilityRole="header" style={styles.sectionTitle}>ساعات العمل</AppText>
            </View>
            <AppText style={styles.body}>{restaurantHours(data?.opening_hours ?? null)}</AppText>
          </View>
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <SymbolView name={{ ios: "mappin.and.ellipse", android: "location_on", web: "location_on" }} size={21} tintColor={theme.colors.primary} accessible={false} />
              <AppText accessibilityRole="header" style={styles.sectionTitle}>الموقع</AppText>
            </View>
            <AppText style={styles.body}>{data?.district.trim() || "الحي غير متوفر"}</AppText>
            {distance && <AppText style={styles.hint}>المسافة المباشرة: {distance}</AppText>}
          </View>
          {!!recommendationReason && <View style={styles.reason}>
            <AppText accessibilityRole="header" style={styles.sectionTitle}>ليش اخترناه لك؟</AppText>
            <AppText style={styles.body}>{recommendationReason}</AppText>
          </View>}
        </>}
        {photo.illustrative && <AppText style={styles.caption}>الصورة تعبيرية عن التصنيف، وليست صورة المطعم.</AppText>}
      </ScrollView>
      {details.status === "ready" && <View style={styles.footer}>
        <RestaurantMapLink mapsUrl={data?.maps_url} restaurantName={name} variant="button" />
      </View>}
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 16, paddingVertical: 6 },
  back: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
  headerTitle: { flex: 1, textAlign: "center", fontFamily: theme.typography.fontFamilyBold, fontSize: 19, lineHeight: 30 },
  headerSpacer: { width: 44 },
  scrollContent: { ...layoutDirection("ltr"), flexGrow: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24,
    width: "100%", maxWidth: 640, alignSelf: "center", gap: 18 },
  photoFrame: { borderRadius: 20, overflow: "hidden" },
  photo: { width: "100%", aspectRatio: 1.9 },
  imageLabel: { position: "absolute", right: 10, bottom: 10, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "#FFFDF8E8" },
  imageLabelText: { fontSize: 10, lineHeight: 18, color: "#536653" },
  identity: { gap: 5 },
  cuisine: { fontSize: 13, lineHeight: 23, color: "#63715B" },
  name: { fontFamily: theme.typography.fontFamilyBold, fontSize: 28, lineHeight: 42 },
  stats: { ...layoutDirection("ltr"), flexDirection: "row-reverse", gap: 10 },
  stacked: { flexDirection: "column" },
  stat: { flex: 1, padding: 14, gap: 5, borderRadius: 16, backgroundColor: "#EEEFE2", minWidth: 0 },
  statHeading: { ...layoutDirection("ltr"), flexDirection: "row-reverse", gap: 6, alignItems: "center" },
  statLabel: { fontSize: 12, lineHeight: 22, color: "#63715B" },
  statValue: { fontSize: 17, lineHeight: 29, fontFamily: theme.typography.fontFamilyBold },
  section: { gap: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#DCE1D5" },
  sectionHeading: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  sectionTitle: { fontFamily: theme.typography.fontFamilyBold, fontSize: 17, lineHeight: 28 },
  body: { fontSize: 14, lineHeight: 26, color: "#4E5E4B" },
  hint: { fontSize: 11, lineHeight: 20, color: "#63715B" },
  reason: { padding: 16, gap: 8, borderRadius: 16, backgroundColor: "#EDF0E1", borderWidth: 1, borderColor: "#D9DFC9" },
  status: { padding: 18, gap: 16, borderRadius: 16, backgroundColor: theme.colors.surface },
  caption: { fontSize: 10, lineHeight: 18, color: "#707968", textAlign: "center" },
  footer: { paddingHorizontal: 20, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background, width: "100%", maxWidth: 640, alignSelf: "center" },
  pressed: { opacity: 0.7 },
});
