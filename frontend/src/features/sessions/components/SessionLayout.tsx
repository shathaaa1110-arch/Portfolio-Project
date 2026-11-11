import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/shared/components";
import { layoutDirection } from "@/shared/layout";
import { theme } from "@/shared/theme";
import { SessionIcon } from "./SessionChrome";

export function SessionFooter({ children }: { children: ReactNode }) {
  return <View style={room.footer}><View style={room.footerInner}>{children}</View></View>;
}
export function QuietButton({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [room.quiet, (pressed || disabled) && { opacity: 0.5 }]}>
    <AppText style={room.quietLabel}>{title}</AppText>
  </Pressable>;
}
export function SessionSummary({ name, detail, onPress }: { name: string; detail: string; onPress?: () => void }) {
  return <Pressable accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={onPress ? `تفاصيل ${name}` : undefined}
    disabled={!onPress} onPress={onPress} style={room.summary}>
    <View style={room.summaryIcon}><SessionIcon name="people" size={22} /></View>
    <View style={{ flex: 1 }}><AppText numberOfLines={1} style={room.summaryName}>{name}</AppText><AppText style={room.small}>{detail}</AppText></View>
    {onPress && <SessionIcon name="next" size={18} />}
  </Pressable>;
}
export const room = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: { width: "100%", maxWidth: 460, alignSelf: "center", paddingHorizontal: 12 },
  scroll: { flex: 1 },
  content: { width: "100%", maxWidth: 460, alignSelf: "center", paddingHorizontal: 22, paddingBottom: 16, gap: 16 },
  title: { fontFamily: theme.typography.fontFamilyBold, fontSize: 28, lineHeight: 42, textAlign: "right", writingDirection: "rtl" },
  text: { fontSize: 14, lineHeight: 25, textAlign: "right", writingDirection: "rtl", color: "#536653" },
  small: { fontSize: 12, lineHeight: 21, textAlign: "right", writingDirection: "rtl", color: "#536653" },
  center: { fontSize: 13, lineHeight: 23, textAlign: "center", writingDirection: "rtl", color: "#536653" },
  label: { fontFamily: theme.typography.fontFamilyBold, textAlign: "right", fontSize: 17, lineHeight: 28, writingDirection: "rtl" },
  card: { padding: 18, gap: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: "#E3E4D7", borderRadius: 22 },
  row: { ...layoutDirection("ltr"), flexDirection: "row-reverse", gap: 10, alignItems: "center" },
  summary: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: 10 },
  summaryIcon: { backgroundColor: "#E8ECDC", borderRadius: 15, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  summaryName: { textAlign: "right", fontFamily: theme.typography.fontFamilyBold, fontSize: 16, lineHeight: 25 },
  footer: { borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.background },
  footerInner: { width: "100%", maxWidth: 460, alignSelf: "center", paddingHorizontal: 22, paddingTop: 10, paddingBottom: 8, gap: 6 },
  quiet: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, borderRadius: 14 },
  quietLabel: { fontSize: 14, lineHeight: 24, textAlign: "center", textDecorationLine: "underline", fontFamily: theme.typography.fontFamilyBold },
  error: { fontSize: 13, lineHeight: 24, textAlign: "right", writingDirection: "rtl", color: theme.colors.error },
  warning: { backgroundColor: "#F4E8CB", padding: 12, borderRadius: 14, fontSize: 12, lineHeight: 23, textAlign: "right", writingDirection: "rtl" },
  mock: { fontSize: 10, textAlign: "center", color: "#536653", lineHeight: 16 },
});
