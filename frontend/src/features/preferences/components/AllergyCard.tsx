import { Pressable, StyleSheet, View } from "react-native";
import { Image, type ImageSource } from "expo-image";
import { SymbolView } from "expo-symbols";

import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";

// The parent provides the content and selection state.
type AllergyCardProps = {
  label: string;
  image: ImageSource | number | null;
  selected: boolean;
  onPress: () => void;
};

export function AllergyCard({
  label,
  image,
  selected,
  onPress,
}: AllergyCardProps) {
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
      {/* Keep the illustration beside the label. */}
      <View style={styles.visual} pointerEvents="none">
        {image !== null ? (
          <Image
            source={image}
            style={styles.image}
            contentFit="contain"
            accessible={false}
          />
        ) : (
          <SymbolView
            name={{
              ios: "square.and.pencil",
              android: "edit_note",
              web: "edit_note",
            }}
            size={40}
            tintColor={theme.colors.placeholder}
            accessible={false}
          />
        )}
      </View>

      <AppText style={styles.label}>{label}</AppText>

      {/* Show a check mark when selected. */}
      {selected && (
        <View style={styles.checkmark} pointerEvents="none">
          <SymbolView
            name={{
              ios: "checkmark",
              android: "check",
              web: "check",
            }}
            size={14}
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
    // Leave room for two cards per row.
    width: "48%",
    minHeight: 120,
    position: "relative",
    direction: "ltr",
    justifyContent: "center",
    borderWidth: theme.borders.control,
    borderColor: theme.colors.border,
    borderRadius: 16,
    backgroundColor: theme.colors.background,
  },

  selected: {
    backgroundColor: "#EAF0DC",
  },

  pressed: {
    opacity: 0.8,
  },

  visual: {
    position: "absolute",
    left: 6,
    top: 16,
    bottom: 12,
    width: "45%",
    alignItems: "center",
    justifyContent: "center",
  },

  image: {
    width: "100%",
    height: "100%",
  },

  label: {
    // Let long names wrap without covering the image.
    width: "49%",
    alignSelf: "flex-end",
    paddingRight: 10,
    paddingLeft: 4,
    paddingTop: 32,
    paddingBottom: 16,
    fontSize: theme.typography.inputSize,
    lineHeight: 24,
    textAlign: "right",
    writingDirection: "rtl",
  },

  checkmark: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});