import { Pressable, StyleSheet, View } from "react-native";
import { Image, type ImageSource } from "expo-image";
import { SymbolView } from "expo-symbols";

import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";

// The screen owns the selected choices.
type FoodTypeCardProps = {
  label: string;
  image: ImageSource | number;
  selected: boolean;
  onPress: () => void;
};

export function FoodTypeCard({
  label,
  image,
  selected,
  onPress,
}: FoodTypeCardProps) {
  return (
    <Pressable
      accessible
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      {/* Keep the original choice image. */}
      <Image
        source={image}
        style={styles.image}
        contentFit="contain"
        accessible={false}
      />

      <AppText variant="label" style={styles.label}>
        {label}
      </AppText>

      {/* Show selection in the same corner on every card. */}
      <View
        pointerEvents="none"
        style={[styles.checkmark, selected && styles.checked]}
      >
        {selected && (
          <SymbolView
            name={{
              ios: "checkmark",
              android: "check",
              web: "check",
            }}
            size={13}
            tintColor={theme.colors.onPrimary}
            accessible={false}
          />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    // Leave room for three cards in each row.
    width: "31%",
    minHeight: 126,
    paddingHorizontal: 6,
    paddingVertical: 10,
    gap: 6,
    alignItems: "center",
    position: "relative",
    direction: "ltr",
    borderWidth: theme.borders.control,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.field,
    backgroundColor: theme.colors.surface,
  },

  selected: {
    // Match the selected cuisine cards.
    backgroundColor: "#EAF0DC",
    borderColor: theme.colors.primary,
  },

  image: {
    width: 82,
    height: 68,
    maxWidth: "100%",
    marginTop: 16,
  },

  label: {
    width: "100%",
    textAlign: "center",
    writingDirection: "rtl",
    lineHeight: 20,
  },

  checkmark: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: theme.borders.control,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  checked: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },

  pressed: {
    opacity: 0.8,
  },
});