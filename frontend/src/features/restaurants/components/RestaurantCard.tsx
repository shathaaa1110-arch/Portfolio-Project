import { layoutDirection } from "@/shared/layout";
import { useState, type ReactNode } from "react";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { restaurantCategoryImage } from "../categoryImage";
import { restaurantDistance, restaurantRating, restaurantSubtitle } from "../presentation";
import { RestaurantMapLink } from "./RestaurantMapLink";
import { RestaurantDetails } from "./RestaurantDetails";

type Props = {
  name: string; cuisines: string[]; district: string; rating: number | null;
  mapsUrl?: string | null; distanceKm?: number | null; reason?: string | null;
  spendLow?: number | null; spendHigh?: number | null;
  action?: ReactNode; variant?: "list" | "tile" | "featured";
  expanded?: boolean; onExpandedChange?: (expanded: boolean) => void;
};

export function RestaurantCard(props: Props) {
  const { name, cuisines, district, rating, mapsUrl, distanceKm, reason, action, variant = "list" } = props;
  const [localExpanded, setLocalExpanded] = useState(false);
  const detailsOpen = props.expanded ?? localExpanded;
  function setDetailsOpen(next: boolean) {
    setLocalExpanded(next);
    props.onExpandedChange?.(next);
  }
  const compact = variant !== "list";
  const ratingText = restaurantRating(rating);
  const hasRating = ratingText !== null;
  const distance = restaurantDistance(distanceKm);
  const cuisine = restaurantSubtitle(cuisines, "");

  return (
    <View style={styles.card}>
      {/* The save button is a sibling, not a nested press inside the details link. */}
      <View style={styles.main}>
        <Pressable accessibilityRole="button" accessibilityLabel={`عرض تفاصيل ${name}`}
          accessibilityState={{expanded: detailsOpen}}
          onPress={() => setDetailsOpen(true)} style={({ pressed }) => pressed && styles.pressed}>
          <Image source={restaurantCategoryImage(cuisines)} contentFit="cover" accessible={false}
            style={[styles.image, variant === "featured" && styles.featuredImage]} />
          <AppText variant="title" numberOfLines={compact ? 1 : 2} style={styles.name}>{name}</AppText>
          <AppText numberOfLines={1} style={styles.subtitle}>
            {[cuisine, distance].filter(Boolean).join(" · ")}
          </AppText>
        </Pressable>
        {compact && action && <View style={styles.save}>{action}</View>}
      </View>

      <View style={styles.meta}>
        <View style={styles.location}>
          <RestaurantMapLink compact label={district.trim() || "الموقع"} mapsUrl={mapsUrl} restaurantName={name} />
        </View>
        <Pressable accessible accessibilityRole="button"
          accessibilityLabel={hasRating ? `التقييم ${ratingText} من ٥، تفاصيل ${name}` : `التقييم غير متوفر، تفاصيل ${name}`}
          onPress={() => setDetailsOpen(true)} style={styles.rating}>
          <SymbolView name={{ ios: hasRating ? "star.fill" : "star", android: "star", web: "star" }}
            size={14} tintColor={hasRating ? "#B88225" : theme.colors.placeholder} accessible={false} />
          <AppText style={styles.ratingText}>{ratingText ?? "—"}</AppText>
        </Pressable>
      </View>
      {variant === "featured" && !!reason?.trim() && (
        <Pressable accessibilityRole="button"
          accessibilityLabel={`ليش اخترنا ${name} لك؟ ${reason.trim()}`}
          accessibilityHint="يفتح نافذة تفاصيل المطعم"
          accessibilityState={{expanded: detailsOpen}}
          onPress={() => setDetailsOpen(true)} style={styles.reason}>
          <AppText variant="label" style={styles.reasonTitle}>ليش اخترناه لك؟</AppText>
          <AppText numberOfLines={2} style={styles.reasonText}>
            {reason.trim()}
          </AppText>
        </Pressable>
      )}
      {!compact && action}
      <RestaurantDetails visible={detailsOpen}
        name={name} cuisines={cuisines} district={district} rating={rating}
        distanceKm={distanceKm} mapsUrl={mapsUrl}
        spendLow={props.spendLow} spendHigh={props.spendHigh}
        reason={reason}
        onClose={() => setDetailsOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...layoutDirection("ltr") },
  main: { position: "relative" },
  image: { width: "100%", aspectRatio: 1.7, borderRadius: 12 },
  featuredImage: { aspectRatio: 2.4 },
  name: { marginTop: 8, fontSize: 17, lineHeight: 26, textAlign: "right", writingDirection: "rtl" },
  subtitle: { marginTop: 2, fontSize: 12, lineHeight: 20, textAlign: "right", writingDirection: "rtl", color: "#626D5E" },
  save: { position: "absolute", left: 6, top: 6 },
  meta: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  location: { flex: 1, minWidth: 0 },
  rating: { ...layoutDirection("ltr"), flexDirection: "row", gap: 3, minHeight: 44, alignItems: "center", justifyContent: "flex-end" },
  ratingText: { fontSize: 12, writingDirection: "ltr", textAlign: "left" },
  reason: { ...layoutDirection("ltr"), alignItems: "stretch", gap: 4, paddingTop: 10, paddingBottom: 4, borderTopWidth: 1, borderTopColor: theme.colors.border },
  reasonTitle: { width: "100%", fontSize: 13, lineHeight: 22, textAlign: "right", writingDirection: "rtl" },
  reasonText: { width: "100%", fontSize: 13, lineHeight: 22, textAlign: "right", writingDirection: "rtl" },
  pressed: { opacity: 0.8 },
});
