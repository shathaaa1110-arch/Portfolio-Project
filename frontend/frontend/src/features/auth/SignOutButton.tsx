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
    <Pressable style={({ pressed }) => [styles.link, (pressed || loading) && styles.pressed]} disabled={loading} onPress={handlePress} accessibilityRole="button">
      <AppText style={styles.text}>{loading ? "جاري الخروج..." : "تسجيل الخروج"}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Tall enough to tap easily
  link: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: "#F6E7E3",
  },

  pressed: { opacity: 0.7 },

  text: {
    color: theme.colors.error,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 15,
  },
});
