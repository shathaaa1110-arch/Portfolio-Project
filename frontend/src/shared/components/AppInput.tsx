import { StyleSheet, TextInput, type TextInputProps } from "react-native";
import { theme } from "@/shared/theme";

export function AppInput({ style, ...props }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={theme.colors.placeholder}
      {...props}
      style={[styles.input, style]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.inputSize,
    color: theme.colors.text,
    textAlign: "right",

    backgroundColor: theme.colors.surface,
    borderWidth: theme.borders.control,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.field,

    minHeight: theme.sizes.controlMinHeight,
    paddingVertical: theme.spacing.inputPaddingVertical,
    paddingHorizontal: theme.spacing.inputPaddingHorizontal,
  },
});
