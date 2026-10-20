import { StyleSheet, Text, type TextProps } from "react-native";
import { theme } from "@/shared/theme";

type AppTextProps = TextProps & {
  variant?: "body" | "title" | "label" | "button";
};

export function AppText({ variant = "body", style, ...props }: AppTextProps) {
  return <Text {...props} style={[styles.body, styles[variant], style]} />;
}

const styles = StyleSheet.create({
  body: {
  fontFamily: theme.typography.fontFamily,
  fontSize: theme.typography.bodySize,
  color: theme.colors.text,
},

  title: {
    fontFamily: theme.typography.fontFamilyBold,
    textAlign: "center",
    fontSize: theme.typography.titleSize,
  },

  label: {
    fontFamily: theme.typography.fontFamilyBold,
    textAlign: "left",
    fontSize: theme.typography.labelSize,
  },

  button: {
  fontFamily: theme.typography.fontFamilyBold,
  fontSize: theme.typography.buttonSize,
  color: theme.colors.onPrimary,
  textAlign: "center",
},
});
