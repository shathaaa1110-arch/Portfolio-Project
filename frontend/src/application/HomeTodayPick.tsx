import { layoutDirection } from "@/shared/layout";
import { type ReactNode } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { RestaurantCard, type RestaurantSummary } from "@/features/restaurants";
import { type usePersonalRecommendations } from "@/features/personalSuggestions";
import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { type useHomePreferences } from "./useHomePreferences";

type Props = {
  preferences: ReturnType<typeof useHomePreferences>;
  recommendations: ReturnType<typeof usePersonalRecommendations>;
  renderAction: (restaurant: RestaurantSummary) => ReactNode;
  onChooseLocation: () => void;
};

export function HomeTodayPick({ preferences, recommendations, renderAction, onChooseLocation }: Props) {
  const { state, reload } = preferences;
  const restaurant = recommendations.restaurants[0];
  const loading = state.status === "checking" || recommendations.status === "loading";
  const expired = recommendations.error?.status === 401;
  const unavailable = (state.status === "error" && [404, 501].includes(state.error.status)) || recommendations.error?.status === 404 || recommendations.error?.status === 501;
  let message = "";
  let actionLabel = "";
  let action: (() => void) | undefined;
  if (state.status === "signed-out" || expired) {
    message = "سجّل دخولك وحدّد ذوقك، عشان يكون الاقتراح مناسب لك.";
    actionLabel = "تسجيل الدخول";
    action = () => router.push("/login");
  } else if (state.status === "needs-preferences") {
    message = "وش تحب؟ حدّد تفضيلاتك ونبدأ منها.";
    actionLabel = "نبدأ بذوقك";
    action = () => router.push("/preferences");
  } else if (recommendations.error?.code === "LOCATION_REQUIRED" || recommendations.error?.code === "DISTRICT_NOT_FOUND") {
    message = recommendations.error.code === "LOCATION_REQUIRED"
      ? "عشان نراعي أقصى مسافة اخترتها، حدّد موقعك أو اختر حيّك."
      : "الحي المختار غير متاح. اختر حيًا آخر أو استخدم موقعك.";
    actionLabel = "تحديد الموقع";
    action = onChooseLocation;
  } else if (state.status === "error" || recommendations.status === "error") {
    message = unavailable ? "الاقتراحات الشخصية غير متاحة حاليًا. تقدر تتصفّح المطاعم تحت." : "تعذّر تحميل اقتراحك الآن. جرّب مرة ثانية.";
    actionLabel = "إعادة المحاولة";
    action = state.status === "error" ? reload : recommendations.retry;
  } else if (!loading && recommendations.status === "ready" && !restaurant) {
    message = "ما لقينا اقتراح يطابق تفضيلاتك الآن. تقدر تراجعها أو تتصفّح كل المطاعم.";
    actionLabel = "تفضيلاتي";
    action = () => router.push("/preferences");
  }

  return <View style={styles.frame}>
    <AppText variant="title" accessibilityRole="header" style={styles.title}>اليوم؟ جرّب هذا!</AppText>
    {loading ? <View style={styles.loading}>
      <ActivityIndicator color={theme.colors.primary} />
      <AppText style={styles.copy}>نجهّز اقتراحك…</AppText>
    </View> : state.status === "ready" && recommendations.status === "ready" && restaurant ? <>
      <RestaurantCard key={restaurant.id} variant="featured" name={restaurant.name_ar}
        cuisines={restaurant.cuisines} district={restaurant.district} rating={restaurant.rating}
        mapsUrl={restaurant.maps_url} distanceKm={restaurant.distance_km} reason={restaurant.reason}
        spendLow={restaurant.spend_low} spendHigh={restaurant.spend_high}
        action={renderAction(restaurant)} />
    </> : <View>
        <AppText style={styles.copy}>{message}</AppText>
        {action && <Pressable accessibilityRole="button" onPress={action} style={styles.action}>
          <AppText variant="label" style={styles.actionText}>{actionLabel}</AppText>
        </Pressable>}
      </View>}
  </View>;
}

const styles = StyleSheet.create({
  frame: { ...layoutDirection("ltr"), borderWidth: 1, borderColor: "#D9DFC9", borderRadius: 18, padding: 16, gap: 12 },
  title: { fontSize: 20, lineHeight: 30, textAlign: "right", writingDirection: "rtl" },
  copy: { fontSize: 13, lineHeight: 23, color: "#626D5E", textAlign: "right", writingDirection: "rtl" },
  loading: { ...layoutDirection("ltr"), flexDirection: "row-reverse", gap: 8, alignItems: "center" },
  action: { alignSelf: "flex-end", minHeight: 44, justifyContent: "center" },
  actionText: { textAlign: "right", textDecorationLine: "underline" },
});
