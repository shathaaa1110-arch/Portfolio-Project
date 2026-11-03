import { layoutDirection } from "@/shared/layout";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { Alert, Pressable, StyleSheet } from "react-native";

import { isSessionEnded, loadSession } from "@/features/auth";
import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { removeSavedRestaurant, saveRestaurant } from "./api";

type SaveRestaurantButtonProps = {
  restaurantId: number;
  saved: boolean;
  iconOnly?: boolean;
  onImage?: boolean;
  // The screen updates its list after the server confirms.
  onChange: (saved: boolean) => void;
};

export function SaveRestaurantButton({
  restaurantId,
  saved,
  onChange,
  iconOnly = false,
  onImage = false,
}: SaveRestaurantButtonProps) {
  // Blocks repeated taps while a request is running.
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);

    try {
      // Saving needs an account.
      const session = await loadSession();
      if (!session) {
        router.navigate("/login");
        return;
      }

      if (saved) {
        await removeSavedRestaurant(session.token, restaurantId);
      } else {
        await saveRestaurant(session.token, restaurantId);
      }

      // Tell the screen only after the server confirms.
      onChange(!saved);
    } catch (error) {
      if (isSessionEnded(error)) {
        router.navigate("/login");
      } else {
        Alert.alert("تعذّر الحفظ", "تحقق من اتصالك وحاول مرة أخرى.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      onPress={toggle}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={saved ? "إزالة من المحفوظة" : "حفظ المطعم"}
      accessibilityState={{ selected: saved, busy }}
      style={({ pressed }) => [
  styles.button,
  iconOnly && styles.iconButton,
  saved && !(iconOnly && onImage) && styles.savedButton,
  iconOnly && onImage && styles.onImage,
  (pressed || busy) && styles.pressed,
]}
    >
      {/* A filled heart means the restaurant is saved. */}
      <SymbolView
        name={
          saved
            ? { ios: "heart.fill", android: "favorite", web: "favorite" }
            : { ios: "heart", android: "favorite_border", web: "favorite_border" }
        }
        size={18}
        tintColor={saved || (iconOnly && onImage) ? theme.colors.onPrimary : theme.colors.primary}
        accessible={false}
      />

{!iconOnly && (
  <AppText
    variant="label"
    style={saved ? styles.savedText : styles.text}
  >
    {saved ? "محفوظ" : "حفظ"}
  </AppText>
)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    // A small pill instead of a full-width button.
    flexDirection: "row",
    ...layoutDirection("rtl"),
    alignItems: "center",
    alignSelf: "flex-start",
    gap: theme.spacing.labelGap,
    minHeight: theme.sizes.controlMinHeight,
    paddingHorizontal: theme.spacing.buttonPaddingHorizontal,
    paddingVertical: theme.spacing.labelGap,
    borderWidth: theme.borders.control,
    borderColor: theme.colors.primary,
    borderRadius: theme.radii.button,
  },

  iconButton: {
  width: theme.sizes.touchTargetMin,
  height: theme.sizes.touchTargetMin,
  minHeight: theme.sizes.touchTargetMin,
  paddingHorizontal: 0,
  paddingVertical: 0,
  justifyContent: "center",
  backgroundColor: theme.colors.surface,
  borderWidth: 0,
  borderRadius: 22,
},
  onImage: { backgroundColor: "transparent" },
  savedButton: {
    backgroundColor: theme.colors.primary,
  },

  pressed: {
    opacity: 0.6,
  },

  text: {
    color: theme.colors.primary,
  },

  savedText: {
    color: theme.colors.onPrimary,
  },
});