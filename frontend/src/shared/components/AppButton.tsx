import { Pressable, StyleSheet, type PressableProps } from "react-native";
import { theme } from "@/shared/theme";
import { AppText } from "./AppText";

// Use a text title as the button content.
type AppButtonProps = Omit<PressableProps, "children"> & {
  title: string;
};

export function AppButton({
  title,
  disabled,
  style,
  ...props
}: AppButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      disabled={disabled}
      style={(state) => [
        styles.button,
        disabled && styles.disabled,

        // Apply custom styles last.
        typeof style === "function" ? style(state) : style,
      ]}
    >
      {/* Use the shared button text style. */}
      <AppText variant="button">{title}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    // Use the main brand color.
    backgroundColor: theme.colors.primary,

    // Set rounded corners and a matching border.
    borderRadius: theme.radii.button,
    borderWidth: theme.borders.control,
    borderColor: theme.colors.primary,

    // Allow the button to grow with its content.
    minHeight: theme.sizes.controlMinHeight,

    // Add space inside the button.
    paddingVertical: theme.spacing.buttonPaddingVertical,
    paddingHorizontal: theme.spacing.buttonPaddingHorizontal,

    // Center the text vertically and horizontally.
    justifyContent: "center",
    alignItems: "center",
  },

  disabled: {
    // Fade the button when it is unavailable.
    opacity: theme.opacity.disabled,
  },
});