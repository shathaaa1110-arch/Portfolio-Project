import { layoutDirection } from "@/shared/layout";
import { useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import { RestaurantList, RestaurantPagination, useRestaurants, type RestaurantSummary } from "@/features/restaurants";
import { usePersonalRecommendations, type RecommendationLocation } from "@/features/personalSuggestions";
import { SaveRestaurantButton, useSavedRestaurants } from "@/features/savedRestaurants";
import { AppText } from "@/shared/components";
import { RESTAURANT_SEARCH_ENABLED } from "@/shared/api/config";
import { theme } from "@/shared/theme";
import { HomeIntro } from "./HomeIntro";
import { HomeLocationBar } from "./HomeLocationBar";
import { HomeTodayPick } from "./HomeTodayPick";
import { useHomePreferences } from "./useHomePreferences";

export function HomePage() {
  const [selectedAction, setSelectedAction] = useState<"restaurants" | "outing">("restaurants");
  const [browseRequest, setBrowseRequest] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pickerRequest, setPickerRequest] = useState(0);
  const [location, setLocation] = useState<RecommendationLocation>({ kind: "none" });
  const {
    restaurants, status, retry, pageNumber, pageCount, isLoading,
    isRefreshing, error, canGoNext, canGoPrevious, nextPage, previousPage, refresh,
  } = useRestaurants();
  const savedList = useSavedRestaurants();
  const preferences = useHomePreferences(refreshKey);
  const recommendations = usePersonalRecommendations(preferences.state.status === "ready" ? preferences.state.token : null, location);
  const otherRecommendations = pageNumber === 1 && recommendations.status === "ready"
    ? recommendations.restaurants.slice(1) : [];

  function renderSave(restaurant: RestaurantSummary) {
    return <SaveRestaurantButton iconOnly onImage restaurantId={restaurant.id}
      saved={savedList.isSaved(restaurant.id)}
      onChange={saved => savedList.setSaved(restaurant, saved)} />;
  }

  const header = <View style={styles.header}>
    <HomeIntro selected={selectedAction}
      onFindRestaurant={() => { setSelectedAction("restaurants"); setBrowseRequest(value => value + 1); }}
      onCreateSession={() => { setSelectedAction("outing"); router.push("/sessions/new"); }} />

    {RESTAURANT_SEARCH_ENABLED && <Pressable accessibilityRole="button"
      accessibilityLabel="افتح البحث مع هيلة" onPress={() => router.push("/search")}
      style={({ pressed }) => [styles.searchEntry, pressed && { opacity: 0.75 }]}>
      <SymbolView name={{ ios: "magnifyingglass", android: "search", web: "search" }}
        size={22} tintColor={theme.colors.primary} accessible={false} />
      <AppText style={styles.searchLabel}>ابحث مع هيلة عن مطعم</AppText>
      <SymbolView name={{ ios: "chevron.left", android: "chevron_left", web: "chevron_left" }}
        size={16} tintColor={theme.colors.primary} accessible={false} />
    </Pressable>}

    <HomeTodayPick preferences={preferences} recommendations={recommendations} renderAction={renderSave}
      onChooseLocation={() => setPickerRequest(value => value + 1)} />
  </View>;

  const listHeading = (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <AppText variant="title" accessibilityRole="header" style={styles.sectionTitle}>اكتشف المطاعم</AppText>
        <Pressable accessibilityRole="button" onPress={() => router.push("/preferences")} style={styles.preferences}>
          <AppText style={styles.preferencesText}>تفضيلاتي</AppText>
          <SymbolView name={{ ios: "slider.horizontal.3", android: "tune", web: "tune" }}
            size={18} tintColor={theme.colors.primary} accessible={false} />
        </Pressable>
      </View>
      <AppText style={styles.caption}>تصفّح المطاعم، واكتشف مكانك القادم.</AppText>
    </View>
  );

   return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={styles.screen}
    >
      <HomeLocationBar onLocationChange={setLocation} pickerRequest={pickerRequest} />

{status === "ready" && error && (
  <View style={styles.listError}>
    <AppText accessibilityRole="alert" style={styles.listErrorText}>
      {error}
    </AppText>

    <Pressable
      accessibilityRole="button"
      accessibilityLabel="إعادة محاولة تحميل المطاعم"
      accessibilityState={{ disabled: isLoading }}
      disabled={isLoading}
      onPress={retry}
      style={({ pressed }) => [
        styles.listRetry,
        pressed && { opacity: 0.7 },
      ]}
    >
      <AppText style={styles.listRetryText}>
        إعادة المحاولة
      </AppText>
    </Pressable>
  </View>
)}
      <RestaurantList
        header={header}
        recommendedRestaurants={otherRecommendations}
        resultsHeader={listHeading}
        restaurants={restaurants}
        status={status}
        errorMessage={error}
        onRetry={retry}
        pageKey={pageNumber}
        scrollToResultsRequest={browseRequest}
        refreshing={isRefreshing}
        onRefresh={() => { refresh(); setRefreshKey(value => value + 1); savedList.retry(); }}
        renderAction={renderSave}
        footer={
          status === "ready" && pageCount > 0 ? (
            <RestaurantPagination
              pageNumber={pageNumber}
              pageCount={pageCount}
              isLoading={isLoading}
              error={null}
              canGoNext={canGoNext}
              canGoPrevious={canGoPrevious}
              onNext={nextPage}
              onPrevious={previousPage}
              onRetry={retry}
            />
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({

  listError: {
  ...layoutDirection("ltr"),
  flexDirection: "row-reverse",
  alignItems: "center",
  gap: 12,
  paddingHorizontal: 20,
  paddingVertical: 8,
  backgroundColor: theme.colors.surface,
  borderBottomWidth: 1,
  borderBottomColor: theme.colors.border,
},
listErrorText: {
  flex: 1,
  color: theme.colors.error,
  textAlign: "right",
  writingDirection: "rtl",
},
listRetry: {
  minHeight: theme.sizes.touchTargetMin,
  justifyContent: "center",
  paddingHorizontal: 8,
},
listRetryText: {
  color: theme.colors.primary,
  fontFamily: theme.typography.fontFamilyBold,
  textDecorationLine: "underline",
},

  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: { ...layoutDirection("ltr"), gap: 20 },
  searchEntry: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", gap: 10,
    minHeight: 52, paddingHorizontal: 16, borderRadius: 26, backgroundColor: theme.colors.searchBackground },
  searchLabel: { flex: 1, fontSize: 15, color: theme.colors.searchText, textAlign: "right", writingDirection: "rtl" },
  section: { gap: 2 },
  sectionHeading: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  sectionTitle: { fontSize: 23, lineHeight: 34, textAlign: "right", writingDirection: "rtl" },
  preferences: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", gap: 6, minHeight: 44 },
  preferencesText: { fontSize: 14, textDecorationLine: "underline", writingDirection: "rtl" },
  caption: { fontSize: 14, lineHeight: 24, color: "#626D5E", textAlign: "right", writingDirection: "rtl" },
});
