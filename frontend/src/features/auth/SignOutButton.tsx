import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { signOut } from "./session";

// A working logout action that any screen can show, without needing the full My account screen.
// It is a quiet red link, not a main button: logging out is rare and should not be tapped by mistake.
export function SignOutButton() {
  const [loading, setLoading] = useState(false);

  async function handlePress() {
    setLoading(true);
    await signOut();
    // The contract says: after logout, open the sign-up screen
    router.replace("/sign-up");
  }

  return (
    <Pressable style={styles.link} disabled={loading} onPress={handlePress} accessibilityRole="button">
      <AppText style={styles.text}>{loading ? "جاري الخروج..." : "تسجيل الخروج"}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Tall enough to tap easily
  link: {
    minHeight: theme.sizes.touchTargetMin,
    alignItems: "center",
    justifyContent: "center",
  },

  text: {
    color: theme.colors.error,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: theme.typography.labelSize,
  },
});
