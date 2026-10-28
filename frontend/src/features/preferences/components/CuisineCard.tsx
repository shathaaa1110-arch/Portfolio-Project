import { Pressable, StyleSheet, View } from "react-native";
import { Image, type ImageSource } from "expo-image";
import { SymbolView } from "expo-symbols";

import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";

// The screen provides the content and selection state.
type CuisineCardProps = {
  label: string;
  image: ImageSource | number;
  selected: boolean;
  onPress: () => void;
};

export function CuisineCard({
  label,
  image,
  selected,
  onPress,
}: CuisineCardProps) {
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
      {/* Keep the food illustration on the left. */}
      <Image
        source={image}
        style={styles.image}
        contentFit="contain"
        accessible={false}
      />

      <AppText style={styles.label}>{label}</AppText>

      {/* Show a check mark for the selected card. */}
      {selected && (
        <View style={styles.checkmark} pointerEvents="none">
          <SymbolView
            name={{
              ios: "checkmark",
              android: "check",
              web: "check",
            }}
            size={16}
            tintColor={theme.colors.onPrimary}
            accessible={false}
          />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    // Leave space for two cards in each row.
    width: "48%",
    minHeight: 112,
    position: "relative",
    direction: "ltr",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: theme.borders.control,
    borderColor: theme.colors.border,
    borderRadius: 16,
    backgroundColor: theme.colors.background,
  },

  selected: {
    // Match the light green selection in the design.
    backgroundColor: "#EAF0DC",
  },

  image: {
    position: "absolute",
    left: -12,
    top: 0,
    width: "62%",
    height: "100%",
  },

  label: {
    // Keep the label beside the image.
    width: "45%",
    alignSelf: "flex-end",
    paddingRight: 10,
    paddingTop: 24,
    paddingBottom: 12,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "right",
    writingDirection: "rtl",
    color: theme.colors.text,
  },

  checkmark: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  pressed: {
    opacity: 0.8,
  },
});