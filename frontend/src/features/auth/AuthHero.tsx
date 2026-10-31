import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";

// Decorative photo from the UX-01 design, already cropped and darkened like the design
const HERO_IMAGE = require("../../../assets/images/auth/sign-up-hero.jpg");
const HERO_HEIGHT = 155; // From the UX-01 design
const HERO_BRAND_SIZE = 58; // From the UX-01 design

// The photo with the app name, shared by the sign-up and login screens
export function AuthHero() {
  return (
    <View style={styles.hero}>
      <Image source={HERO_IMAGE} style={styles.image} contentFit="cover" />
      <AppText style={styles.brand}>ذوق</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: HERO_HEIGHT,
    borderRadius: theme.radii.card,
    overflow: "hidden",
    marginBottom: theme.spacing.fieldGap,
  },

  image: {
    width: "100%",
    height: "100%",
  },

  brand: {
    position: "absolute",
    start: theme.spacing.fieldGap,
    bottom: theme.spacing.actionGap,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: HERO_BRAND_SIZE,
    color: theme.colors.onPrimary,
  },
});
