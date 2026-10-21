// Display images with Expo.
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";


// Describe the data this card needs.
type RestaurantCardProps = {
  name: string;
  cuisines: string[];
  district: string;
  rating: number | null;
};

export function RestaurantCard({
  name,
  cuisines,
  district,
  rating,
}: RestaurantCardProps) {
  // Join cuisine names into one readable line.
  const cuisineText =
    cuisines.length > 0 ? cuisines.join("، ") : "غير محدد";

  // Missing ratings are not zero ratings.
  const ratingText =
    rating === null ? "التقييم غير متوفر" : `التقييم: ${rating}`;

  return (
    <View style={styles.card}>
            {/* Show a general food image above the restaurant name. */}
      <Image
        source={require(
          "../../../../assets/images/food-illustration.png"
        )}
        style={styles.image}
        contentFit="cover"
        accessible={false}
      />
    {/* Keep the text inside its own container. */}
    <View style={styles.content}>


      <AppText variant="label" style={styles.arabicText}>
        صورة توضيحية
      </AppText>
      {/* Mark the restaurant name as a heading. */}
      <AppText
        variant="title"
        accessibilityRole="header"
        style={[styles.arabicText, styles.name]}
      >
        {name}
      </AppText>

      <AppText style={styles.arabicText}>
        المطبخ: {cuisineText}
      </AppText>

      <AppText style={styles.arabicText}>
        الحي: {district || "غير محدد"}
      </AppText>
        <AppText style={styles.arabicText}>{ratingText}</AppText>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
      image: {
    // Fill the card width.
    width: "100%",
    height: 174,
  },
  card: {
    // Use the shared colors and spacing.
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: theme.borders.control,
    borderRadius: theme.radii.card,
        // Clip the image to the card corners.
    overflow: "hidden",
  },

    content: {
    // Add space around the text only.
    padding: theme.spacing.cardPadding,

    // Separate the text lines.
    gap: theme.spacing.labelGap,
  },

  arabicText: {
    // Follow the Arabic text direction.
    writingDirection: "rtl",
    textAlign: "auto",
  },

  name: {
    fontSize: theme.typography.sectionTitleSize,
  },
});