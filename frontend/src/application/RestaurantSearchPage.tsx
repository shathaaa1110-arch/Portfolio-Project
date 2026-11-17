import { useState } from "react";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RestaurantList, RestaurantPagination, RestaurantSearch, useRestaurants, type RestaurantFilters, type RestaurantSummary } from "@/features/restaurants";
import { getDistricts } from "@/features/personalSuggestions";
import { SaveRestaurantButton, useSavedRestaurants } from "@/features/savedRestaurants";
import { AppText } from "@/shared/components";
import { RESTAURANT_SEARCH_ENABLED } from "@/shared/api/config";
import { layoutDirection } from "@/shared/layout";
import { theme } from "@/shared/theme";

export function RestaurantSearchPage() {
  const [selection, setSelection] = useState<{ query: string; filters: RestaurantFilters } | null>(null);
  const query = selection?.query ?? "";
  const filters = selection?.filters ?? {};
  const searched = RESTAURANT_SEARCH_ENABLED && selection !== null;
  const results = useRestaurants(query, filters, searched);
  const savedList = useSavedRestaurants();

  function renderSave(restaurant: RestaurantSummary) {
    return <SaveRestaurantButton iconOnly onImage restaurantId={restaurant.id}
      saved={savedList.isSaved(restaurant.id)}
      onChange={saved => savedList.setSaved(restaurant, saved)} />;
  }

  return <SafeAreaView style={styles.screen}>
    <View style={styles.heading}>
      <Pressable accessibilityRole="button" accessibilityLabel="رجوع للرئيسية"
        onPress={() => router.canGoBack() ? router.back() : router.replace("/")} style={styles.back}>
        <SymbolView name={{ ios: "chevron.right", android: "chevron_right", web: "chevron_right" }}
          size={24} tintColor={theme.colors.primary} accessible={false} />
      </Pressable>
      <AppText accessibilityRole="header" style={styles.title}>البحث مع هيلة</AppText>
      <View style={styles.spacer} />
    </View>
    <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <RestaurantList restaurants={results.restaurants} showResults={searched}
        header={RESTAURANT_SEARCH_ENABLED ? <RestaurantSearch onSubmit={(query, filters) => setSelection({ query, filters })}
          onReset={() => setSelection(null)} loadDistricts={getDistricts}
          total={results.total} loading={results.isLoading} error={results.error} />
          : <AppText>البحث غير متاح حاليًا. يمكنك تصفّح المطاعم من الرئيسية.</AppText>}
        resultsHeader={<AppText variant="title" style={styles.resultsTitle}>مطاعم تناسب بحثك</AppText>}
        searchQuery={query} filtered={searched}
        status={results.status} errorMessage={results.error} onRetry={results.retry}
        pageKey={results.pageNumber} renderAction={renderSave}
        footer={searched && results.status === "ready" && results.pageCount > 0
          ? <RestaurantPagination pageNumber={results.pageNumber} pageCount={results.pageCount}
            isLoading={results.isLoading} error={results.error}
            canGoNext={results.canGoNext} canGoPrevious={results.canGoPrevious}
            onNext={results.nextPage} onPrevious={results.previousPage} onRetry={results.retry} /> : undefined} />
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  body: { flex: 1 },
  heading: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8 },
  back: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  spacer: { width: 44 },
  title: { flex: 1, fontFamily: theme.typography.fontFamilyBold, fontSize: 21, lineHeight: 32, textAlign: "center" },
  resultsTitle: { fontSize: 21, lineHeight: 32 },
});
