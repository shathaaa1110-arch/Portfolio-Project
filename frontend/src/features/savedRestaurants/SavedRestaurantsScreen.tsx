import { router } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { RestaurantCard } from "@/features/restaurants";
import { AppButton, AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { SaveRestaurantButton } from "./SaveRestaurantButton";
import { useSavedRestaurants } from "./useSavedRestaurants";

export function SavedRestaurantsScreen() {
  // Load the saved list every time this tab opens.
  const { restaurants, status, retry, setSaved } = useSavedRestaurants();
  
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="title">المحفوظة</AppText>

        {status === "loading" && (
          <AppText style={styles.message}>جارٍ تحميل المطاعم المحفوظة…</AppText>
        )}

        {/* Saved restaurants belong to an account. */}
        {status === "signed-out" && (
          <>
            <AppText style={styles.message}>سجّل الدخول لعرض مطاعمك المحفوظة.</AppText>
            <AppButton title="تسجيل الدخول" onPress={() => router.navigate("/login")} />
          </>
        )}

        {/* Never show an empty list when the request failed. */}
        {status === "error" && (
          <>
            <AppText style={styles.message}>تعذّر تحميل المحفوظة. تحقق من اتصالك وحاول مرة أخرى.</AppText>
            <AppButton title="إعادة المحاولة" onPress={retry} />
          </>
        )}

        {status === "ready" && restaurants.length === 0 && (
          <>
            <AppText style={styles.message}>لم تحفظ أي مطعم بعد.</AppText>
            <AppButton title="تصفح المطاعم" onPress={() => router.navigate("/")} />
          </>
        )}

        {/* Each saved card gets a remove button that reloads the list. */}
        {status === "ready" &&
          restaurants.map((restaurant) => (
            <RestaurantCard
              key={restaurant.id}
              name={restaurant.name_ar}
              cuisines={restaurant.cuisines}
              district={restaurant.district}
              rating={restaurant.rating}
              action={
                <SaveRestaurantButton
                  restaurantId={restaurant.id}
                  saved={true}
                  onChange={(isNowSaved) => setSaved(restaurant, isNowSaved)}
                />
              }
            />
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  content: {
    // Center short content and allow longer content to scroll.
    flexGrow: 1,
    justifyContent: "center",
    padding: theme.spacing.pagePadding,
    gap: theme.spacing.fieldGap,
  },

  message: {
    textAlign: "center",
    writingDirection: "rtl",
  },
});