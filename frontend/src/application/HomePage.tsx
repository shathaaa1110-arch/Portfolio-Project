import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";
import {
  RestaurantList,
  useRestaurants,
} from "@/features/restaurants";
import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { SymbolView } from "expo-symbols";

import { SaveRestaurantButton, useSavedRestaurants } from "@/features/savedRestaurants";

export function HomePage() {
  // Keep the current search text.
  const [searchQuery, setSearchQuery] = useState("");

  // Load restaurants and track the request.
  const { restaurants, status, retry } = useRestaurants();

  // Saved restaurants of the signed-in account, for the save buttons.
  const savedList = useSavedRestaurants();

  // Place the page introduction above the restaurant cards.
  const header = (
    <View style={styles.header}>
      <View style={styles.section}>
        <AppText variant="label" style={styles.arabicText}>
          كل جمعة، لها ذوق
        </AppText>

        <AppText
          variant="title"
          accessibilityRole="header"
          style={styles.arabicText}
        >
          وش تشتهون اليوم؟
        </AppText>

        <AppText style={styles.arabicText}>
          اكتشف المطاعم، واجمع أصحابك على اختيار واحد.
        </AppText>
      </View>

                     {/* Search the restaurant data available on this page. */}
      <View style={styles.searchField}>
        <SymbolView
          name={{
            ios: "magnifyingglass",
            android: "search",
            web: "search",
          }}
          size={22}
          tintColor={theme.colors.searchText}
          accessible={false}
        />

        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="ابحث عن مطعم أو مطبخ"
          placeholderTextColor={theme.colors.searchText}
          accessibilityLabel="ابحث عن مطعم أو مطبخ"
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          style={styles.searchInput}
        />
      </View>

             {/* Session preview; creation will be added later. */}
      <View style={styles.sessionCard}>
        <View style={styles.sessionContent}>
          <AppText
            variant="label"
            style={[styles.arabicText, styles.sessionCaption]}
          >
            الجمعة أحلى مع بعض
          </AppText>

          <AppText
            variant="title"
            accessibilityRole="header"
            style={[styles.arabicText, styles.sessionTitle]}
          >
            نختار وين نتعشّى؟
          </AppText>

          <View style={styles.sessionActions}>
            {/* Keep this action unavailable during the preview. */}
            <Pressable
              disabled
              accessibilityRole="button"
              accessibilityLabel="ابدأ جلسة، قريبًا"
              accessibilityState={{ disabled: true }}
              style={styles.sessionButton}
            >
              <AppText
                variant="button"
                style={styles.sessionButtonText}
              >
                ابدأ جلسة
              </AppText>

              <SymbolView
                name={{ ios: "plus", android: "add", web: "add" }}
                size={18}
                tintColor={theme.colors.primary}
                accessible={false}
              />
            </Pressable>

            <AppText variant="label" style={styles.sessionCaption}>
              قريبًا
            </AppText>
          </View>
        </View>

        <SymbolView
          name={{
            ios: "fork.knife",
            android: "restaurant",
            web: "restaurant",
          }}
          size={44}
          tintColor={theme.colors.sessionAccent}
          accessible={false}
        />
      </View>

      <View style={styles.section}>
        <AppText
          variant="title"
          accessibilityRole="header"
          style={[styles.arabicText, styles.sectionTitle]}
        >
          على ذوق المدينة
        </AppText>

        <AppText style={styles.arabicText}>
          تصفّح عام للمطاعم، غير مخصّص حسب تفضيلاتك.
        </AppText>

                {/* Explain the current search scope. */}
        <AppText style={styles.arabicText}>
          البحث ضمن المطاعم المعروضة.
        </AppText>
      </View>
    </View>
  );

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={styles.screen}
    >
      {/* Scroll the introduction and cards together. */}
      <RestaurantList
        header={header}
        restaurants={restaurants}
        searchQuery={searchQuery}
        status={status}
        onRetry={retry}
        renderAction={(restaurant) => (
          <SaveRestaurantButton
            restaurantId={restaurant.id}
            saved={savedList.isSaved(restaurant.id)}
            onChange={(isNowSaved) => savedList.setSaved(restaurant, isNowSaved)}
          />
        )}
      />


    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  header: {
    // Separate the introduction from the list heading.
    gap: theme.spacing.titleGap,
  },

  section: {
    // Keep related text close together.
    gap: theme.spacing.labelGap,
  },

  arabicText: {
    writingDirection: "rtl",
    textAlign: "auto",
  },

    searchField: {
    // Arrange the icon and text from right to left.
    flexDirection: "row",
    direction: "rtl",
    alignItems: "center",
    gap: theme.spacing.labelGap,

    // Use a soft background and rounded corners.
    backgroundColor: theme.colors.searchBackground,
    borderRadius: theme.radii.field,
    minHeight: theme.sizes.controlMinHeight,
    paddingHorizontal: theme.spacing.inputPaddingHorizontal,
    paddingVertical: theme.spacing.inputPaddingVertical,
  },

   searchInput: {
    // Use the brand font for editable text.
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.inputSize,
    color: theme.colors.text,
    writingDirection: "rtl",
    textAlign: "auto",
    padding: 0,
  },

    sessionCard: {
    // Place the content on the right and the icon on the left.
    flexDirection: "row",
    direction: "rtl",
    alignItems: "center",
    gap: theme.spacing.actionGap,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.card,
    padding: theme.spacing.cardPadding,
  },

  sessionContent: {
    // Use the space beside the food icon.
    flex: 1,
    gap: theme.spacing.labelGap,
  },

  sessionTitle: {
    fontSize: theme.typography.sessionTitleSize,
    color: theme.colors.onPrimary,
  },

  sessionCaption: {
    color: theme.colors.sessionAccent,
  },

  sessionActions: {
    // Allow the hint to wrap on narrow screens.
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.actionGap,
  },

  sessionButton: {
    // Keep the button text and plus icon together.
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.labelGap,
    backgroundColor: theme.colors.sessionAccent,
    borderRadius: theme.radii.button,
    minHeight: theme.sizes.controlMinHeight,
    paddingHorizontal: theme.spacing.buttonPaddingHorizontal,
    paddingVertical: theme.spacing.buttonPaddingVertical,
  },

  sessionButtonText: {
    // Keep the text readable on the light background.
    color: theme.colors.primary,
  },
  sectionTitle: {
    fontSize: theme.typography.sectionTitleSize,
  },
});