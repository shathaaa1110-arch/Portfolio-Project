import { layoutDirection } from "@/shared/layout";
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { AppButton, AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { RestaurantCard } from "./components/RestaurantCard";
import type { RestaurantSummary } from "./types";

import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

/// Describe the list data, search text, and available actions.
type RestaurantListProps = {
  restaurants: RestaurantSummary[];
  header?: ReactElement;
  footer?: ReactElement;
  searchQuery?: string;
  status?: "ready" | "loading" | "error";
  onRetry?: () => void;
  errorMessage?: string | null;
  pageKey?: number;
  scrollToResultsRequest?: number;
refreshing?: boolean;
onRefresh?: () => void;
    // Optional control for each card, added by the screen that shows the list.
  renderAction?: (restaurant: RestaurantSummary) => ReactNode;
};

export function RestaurantList({
  restaurants,
  header,
  footer,
  searchQuery = "",
  status = "ready",
  onRetry,
  errorMessage,
  renderAction,
  pageKey,
  scrollToResultsRequest = 0,
  refreshing = false,
  onRefresh,
}: RestaurantListProps) {
  const { width, fontScale } = useWindowDimensions();

// نستخدم عمودًا واحدًا عند ضيق الشاشة أو تكبير الخط.
const columns = width < 360 || fontScale > 1.25 ? 1 : 2;

  const listRef = useRef<FlatList<RestaurantSummary[]>>(null);
  const headerHeight = useRef(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // The Home discovery button reaches the rows without opening a keyboard.
  useEffect(() => {
    if (scrollToResultsRequest > 0) {
      listRef.current?.scrollToOffset({
        offset: headerHeight.current,
        animated: true,
      });
    }
  }, [scrollToResultsRequest]);

  // نرجع لأعلى القائمة بعد نجاح الانتقال لصفحة مختلفة.
  useEffect(() => {
    if (pageKey !== undefined) {
      listRef.current?.scrollToOffset({
        offset: 0,
        animated: false,
      });
    }
    setExpandedId(null);
  }, [pageKey]);

  useEffect(() => setExpandedId(null), [searchQuery]);
  // Search and pagination are performed together by the API, not on these 20 rows.
  const normalizedQuery = searchQuery.trim();
  const visibleRestaurants = restaurants;
  const rows: RestaurantSummary[][] = [];
  for (let index = 0; index < visibleRestaurants.length; index += columns) {
    rows.push(visibleRestaurants.slice(index, index + columns));
  }

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
          {errorMessage || "تعذّر تحميل المطاعم. حاول مرة أخرى."}
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
      {/* Explain why the list is empty. */}
      <AppText style={styles.stateText}>
        {normalizedQuery
          ? "ما لقينا مطاعم تطابق بحثك. جرّب اسمًا أو مطبخًا آخر."
          : "لا توجد مطاعم للعرض حاليًا."}
      </AppText>
    </View>
  );
}
  return (
<FlatList
key={`restaurants-${columns}`}

  ref={listRef}
  alwaysBounceVertical
  keyboardDismissMode={Platform.OS === "web" ? "none" : "on-drag"}
  keyboardShouldPersistTaps="handled"
  refreshing={refreshing}
  onRefresh={onRefresh}
  style={styles.list}
      contentContainerStyle={styles.content}
      data={status === "ready" ? rows : []}
      keyExtractor={(row) => row.map(restaurant => restaurant.id).join(":" )}
      extraData={expandedId}
      renderItem={({item: row}) => (
        <View style={styles.row}>
          {row.map(item => <View key={item.id} style={{width: columns === 1 ? "100%" : "48%"}}>
            <RestaurantCard variant="tile" name={item.name_ar} cuisines={item.cuisines}
              district={item.district} rating={item.rating} mapsUrl={item.maps_url}
              spendLow={item.spend_low} spendHigh={item.spend_high}
              action={renderAction?.(item)}
              expanded={expandedId === item.id}
              onExpandedChange={open => setExpandedId(open ? item.id : null)} />
          </View>)}
        </View>
      )}
      ListHeaderComponent={header ? (
        <View onLayout={event => { headerHeight.current = event.nativeEvent.layout.height; }}>
          {header}
        </View>
      ) : undefined}
      ListFooterComponent={footer}
      ListFooterComponentStyle={footer ? styles.footer : undefined}
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

  row: {
  ...layoutDirection("ltr"),
  flexDirection: "row-reverse",
  justifyContent: "space-between",
  alignItems: "stretch",
},

  list: {
    flex: 1,
  },

  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: theme.spacing.pagePadding,
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

  footer: { marginTop: theme.spacing.fieldGap },

  stateText: {
    // Center the Arabic message.
    writingDirection: "rtl",
    textAlign: "center",
  },
});
