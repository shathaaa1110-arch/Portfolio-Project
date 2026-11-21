import { StyleSheet, Text, type TextProps } from "react-native";
import { theme } from "@/shared/theme";
import { layoutDirection } from "@/shared/layout";

type AppTextProps = TextProps & {
  variant?: "body" | "title" | "label" | "button";
};

export function AppText({ variant = "body", style, ...props }: AppTextProps) {
  return <Text {...props} style={[styles.body, styles[variant], style]} />;
}

const styles = StyleSheet.create({
  body: {
  // Native RTL layout mirrors physical left/right alignment. Isolate the text
  // layout while retaining Arabic writing direction and explicit center/LTR styles.
  ...layoutDirection("ltr"),
  fontFamily: theme.typography.fontFamily,
  fontSize: theme.typography.bodySize,
  color: theme.colors.text,
  textAlign: "right",
  writingDirection: "rtl",
},

  title: {
    fontFamily: theme.typography.fontFamilyBold,
    textAlign: "center",
    fontSize: theme.typography.titleSize,
  },

  label: {
    fontFamily: theme.typography.fontFamilyBold,
    textAlign: "right",
    fontSize: theme.typography.labelSize,
  },

  button: {
  fontFamily: theme.typography.fontFamilyBold,
  fontSize: theme.typography.buttonSize,
  color: theme.colors.onPrimary,
  textAlign: "center",
},
});
