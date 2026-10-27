import type { ReactElement, ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  View,
} from "react-native";
import { AppButton, AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { RestaurantCard } from "./components/RestaurantCard";
import type { RestaurantSummary } from "./types";

/// Describe the list data, search text, and available actions.
type RestaurantListProps = {
  restaurants: RestaurantSummary[];
  header?: ReactElement;
  searchQuery?: string;
  status?: "ready" | "loading" | "error";
  onRetry?: () => void;
    // Optional control for each card, added by the screen that shows the list.
  renderAction?: (restaurant: RestaurantSummary) => ReactNode;
};

export function RestaurantList({
  restaurants,
  header,
  searchQuery = "",
  status = "ready",
  onRetry,
  renderAction,
}: RestaurantListProps) {
      // Match restaurant names or cuisine names.
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const visibleRestaurants = restaurants.filter((restaurant) =>
    [restaurant.name_ar, ...restaurant.cuisines].some((text) =>
      text.toLowerCase().includes(normalizedQuery)
    )
  );
    // Show the message that matches the current state.
function renderEmptyState() {
  if (status === "loading") {
    return (
      <View style={styles.statePanel}>
        <ActivityIndicator
          color={theme.colors.primary}
          accessible={false}
        />

        <AppText style={styles.stateText}>
          جارٍ تحميل المطاعم…
        </AppText>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={styles.statePanel}>
        <AppText
          accessibilityRole="alert"
          style={styles.stateText}
        >
          تعذّر تحميل المطاعم. حاولي مرة أخرى.
        </AppText>

        {/* Show the button when a retry action is available. */}
        {onRetry && (
          <AppButton
            title="إعادة المحاولة"
            onPress={onRetry}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.statePanel}>
      <AppText style={styles.stateText}>
        لا توجد مطاعم للعرض حاليًا.
      </AppText>
    </View>
  );
}
  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={status === "ready" ? visibleRestaurants : []}
      keyExtractor={(restaurant) => String(restaurant.id)}
      renderItem={({ item }) => (
        <RestaurantCard
          name={item.name_ar}
          cuisines={item.cuisines}
          district={item.district}
          rating={item.rating}
          action={renderAction?.(item)}
        />
      )}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={styles.header}
      ItemSeparatorComponent={RestaurantSeparator}
      ListEmptyComponent={renderEmptyState()}
    />
  );
}

// Add space between cards.
function RestaurantSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },

  content: {
    padding: theme.spacing.pagePadding,
  },

  header: {
    marginBottom: theme.spacing.fieldGap,
  },

  separator: {
    height: theme.spacing.fieldGap,
  },
    statePanel: {
    // Keep list messages inside a styled panel.
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: theme.borders.control,
    borderRadius: theme.radii.card,
    padding: theme.spacing.cardPadding,
    gap: theme.spacing.actionGap,
  },

  stateText: {
    // Center the Arabic message.
    writingDirection: "rtl",
    textAlign: "center",
  },
});