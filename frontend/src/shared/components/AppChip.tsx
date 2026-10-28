import { Pressable, StyleSheet, Text } from "react-native";
import { theme } from "@/shared/theme";
import { AppText } from "./AppText";

// The parent controls the selected value.
type AppChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
};

export function AppChip({
  label,
  selected,
  onPress,
  disabled = false,
}: AppChipProps) {
  return (
    <Pressable
      accessible
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.chip,
        selected && styles.selected,
        disabled && styles.disabled,
      ]}
    >
      {/* Show a check mark when selected. */}
      {selected && (
        <Text accessible={false} style={styles.checkmark}>
          ✓
        </Text>
      )}

      <AppText
        style={[
          styles.label,
          selected && styles.selectedLabel,
        ]}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    // Keep the chip close to its content size.
    alignSelf: "flex-start",
    maxWidth: "100%",

    // Place the check mark beside the text.
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.chipIconGap,

    // Keep the touch area large enough.
    minHeight: theme.sizes.touchTargetMin,
    minWidth: theme.sizes.touchTargetMin,

    paddingVertical: theme.spacing.chipPaddingVertical,
    paddingHorizontal: theme.spacing.chipPaddingHorizontal,

    // Default appearance before selection.
    borderRadius: theme.radii.chip,
    borderWidth: theme.borders.control,
    borderColor: theme.colors.chipBorder,
    backgroundColor: "transparent",
  },

  selected: {
    // Highlight the selected option.
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },

  label: {
    fontSize: theme.typography.chipSize,
    color: theme.colors.chipText,

    // Allow long labels to wrap.
    flexShrink: 1,
  },

  selectedLabel: {
    color: theme.colors.onSelected,
  },

  checkmark: {
    fontSize: theme.sizes.chipIcon,
    color: theme.colors.onSelected,
  },

  disabled: {
    // Fade the chip when interaction is disabled.
    opacity: theme.opacity.disabled,
  },
});