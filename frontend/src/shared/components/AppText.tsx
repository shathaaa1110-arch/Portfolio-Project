import { StyleSheet, Text, type TextProps } from "react-native";
import { theme } from "@/shared/theme";

type AppTextProps = TextProps & {
  variant?: "body" | "title" | "label" | "button";
};

export function AppText({ variant = "body", style, ...props }: AppTextProps) {
  return <Text {...props} style={[styles.body, styles[variant], style]} />;
}

const styles = StyleSheet.create({
  body: { fontFamily: theme.typography.fontFamily },
  title: {
    textAlign: "center",
    fontSize: theme.typography.titleSize,
    fontWeight: theme.typography.bold,
  },
  label: { textAlign: "left", fontSize: theme.typography.labelSize },
  button: {
    color: theme.colors.onPrimary,
    textAlign: "center",
    fontWeight: theme.typography.bold,
  },
});
