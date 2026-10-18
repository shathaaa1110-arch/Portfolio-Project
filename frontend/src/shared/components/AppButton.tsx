import { Pressable, StyleSheet, type PressableProps } from "react-native";
import { theme } from "@/shared/theme";
import { AppText } from "./AppText";

type AppButtonProps = Omit<PressableProps, "children"> & { title: string };

export function AppButton({ title, disabled, style, ...props }: AppButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      disabled={disabled}
      style={(state) => [
        styles.button,
        disabled && styles.disabled,
        typeof style === "function" ? style(state) : style,
      ]}
    >
      <AppText variant="button">{title}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.control,
    padding: theme.spacing.buttonPadding,
  },
  disabled: { backgroundColor: theme.colors.disabled },
});
