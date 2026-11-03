import { layoutDirection } from "@/shared/layout";
import { useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import { RestaurantList, RestaurantPagination, useRestaurants, type RestaurantSummary } from "@/features/restaurants";
import { type RecommendationLocation } from "@/features/personalSuggestions";
import { SaveRestaurantButton, useSavedRestaurants } from "@/features/savedRestaurants";
import { AppText } from "@/shared/components";
import { RESTAURANT_SEARCH_ENABLED } from "@/shared/api/config";
import { theme } from "@/shared/theme";
import { HomeIntro } from "./HomeIntro";
import { HomeLocationBar } from "./HomeLocationBar";
import { HomeTodayPick } from "./HomeTodayPick";

export function HomePage() {
  const [browseRequest, setBrowseRequest] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [pickerRequest, setPickerRequest] = useState(0);
  const [location, setLocation] = useState<RecommendationLocation>({ kind: "none" });
  const {
    restaurants, status, retry, pageNumber, pageCount, isLoading,
    isRefreshing, error, canGoNext, canGoPrevious, nextPage, previousPage, refresh,
  } = useRestaurants(searchQuery);
  const savedList = useSavedRestaurants();

  function renderSave(restaurant: RestaurantSummary) {
    return <SaveRestaurantButton iconOnly onImage restaurantId={restaurant.id}
      saved={savedList.isSaved(restaurant.id)}
      onChange={saved => savedList.setSaved(restaurant, saved)} />;
  }

  const header = <View style={styles.header}>
    <HomeIntro onFindRestaurant={() => setBrowseRequest(value => value + 1)} />

    {RESTAURANT_SEARCH_ENABLED && <View style={styles.searchGroup}>
      <View style={styles.searchField}>
        <SymbolView name={{ ios: "magnifyingglass", android: "search", web: "search" }}
          size={23} tintColor={theme.colors.primary} accessible={false} />
        <TextInput value={searchQuery} onChangeText={setSearchQuery}
          placeholder="مطعم أو مطبخ على بالك؟" placeholderTextColor={theme.colors.searchText}
          accessibilityLabel="ابحث في كل المطاعم" returnKeyType="search"
          autoCorrect={false} autoCapitalize="none"
          style={styles.searchInput} />
        {!!searchQuery && <Pressable accessibilityRole="button" accessibilityLabel="مسح البحث"
          onPress={() => setSearchQuery("")} style={styles.clearSearch}>
          <AppText>مسح</AppText>
        </Pressable>}
      </View>
    </View>}

    <HomeTodayPick location={location} renderAction={renderSave} refreshKey={refreshKey}
      onChooseLocation={() => setPickerRequest(value => value + 1)} />

    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <AppText variant="title" accessibilityRole="header" style={styles.sectionTitle}>{searchQuery.trim() ? "نتائج البحث" : "اكتشف المطاعم"}</AppText>
        <Pressable accessibilityRole="button" onPress={() => router.push("/preferences")} style={styles.preferences}>
          <AppText style={styles.preferencesText}>تفضيلاتي</AppText>
          <SymbolView name={{ ios: "slider.horizontal.3", android: "tune", web: "tune" }}
            size={18} tintColor={theme.colors.primary} accessible={false} />
        </Pressable>
      </View>
      <AppText style={styles.caption}>تصفّح المطاعم، واكتشف مكانك القادم.</AppText>
    </View>
  </View>;

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
        restaurants={restaurants}
        searchQuery={searchQuery}
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
  searchGroup: { gap: 4 },
  searchField: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: theme.colors.searchBackground, borderRadius: 22, minHeight: 54, paddingHorizontal: 16, paddingVertical: 8 },
  searchInput: { flex: 1, minHeight: 38, fontFamily: theme.typography.fontFamily, fontSize: 16, color: theme.colors.text, writingDirection: "rtl", textAlign: "right", padding: 0 },
  clearSearch: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
  section: { gap: 2 },
  sectionHeading: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  sectionTitle: { fontSize: 23, lineHeight: 34, textAlign: "right", writingDirection: "rtl" },
  preferences: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", gap: 6, minHeight: 44 },
  preferencesText: { fontSize: 14, textDecorationLine: "underline", writingDirection: "rtl" },
  caption: { fontSize: 14, lineHeight: 24, color: "#626D5E", textAlign: "right", writingDirection: "rtl" },
});
