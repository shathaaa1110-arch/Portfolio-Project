import type { ReactNode } from "react";
import { Image } from "expo-image";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import { layoutDirection } from "@/shared/layout";
import { theme } from "@/shared/theme";

export function HailaMessage({ children }: { children: ReactNode }) {
  return <View style={styles.assistant}>
    <Image source={require("../../../assets/images/sessions/haila-gathering.webp")}
      style={styles.haila} contentFit="contain" accessible={false} />
    <View style={styles.bubble}>
      <AppText style={styles.name}>هيلة</AppText>
      <AppText style={styles.message}>{children}</AppText>
    </View>
  </View>;
}

export function ReplyMessage({ children, onEdit, editLabel }: { children: ReactNode; onEdit?: () => void; editLabel?: string }) {
  const content = <><AppText style={styles.replyText}>{children}</AppText>
    {onEdit && <AppText style={styles.edit}>تعديل</AppText>}</>;
  return onEdit ? <Pressable accessibilityRole="button" accessibilityLabel={editLabel} onPress={onEdit} style={styles.reply}>{content}</Pressable>
    : <View style={styles.reply}>{content}</View>;
}

export function ConversationChoice({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.choice, (pressed || disabled) && styles.dim]}>
    <AppText style={styles.choiceText}>{title}</AppText>
  </Pressable>;
}

const styles = StyleSheet.create({
  assistant: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "flex-start", gap: 8 },
  haila: { width: 40, height: 61, marginTop: 5 },
  bubble: { flex: 1, borderRadius: 20, borderTopRightRadius: 5, padding: 14, gap: 4, backgroundColor: "#EDEEDF" },
  name: { fontSize: 12, color: "#85652F", fontFamily: theme.typography.fontFamilyBold },
  message: { fontSize: 16, lineHeight: 28, color: theme.colors.primary },
  reply: { ...layoutDirection("ltr"), alignSelf: "flex-end", maxWidth: "88%", borderRadius: 20, borderBottomRightRadius: 5,
    backgroundColor: theme.colors.primary, paddingHorizontal: 16, paddingVertical: 10, gap: 3 },
  replyText: { fontSize: 15, lineHeight: 25, color: theme.colors.onPrimary },
  edit: { fontSize: 11, color: "#D8E4CD", textDecorationLine: "underline" },
  choice: { borderWidth: 1, borderColor: "#BBC9AE", borderRadius: 24, backgroundColor: theme.colors.surface,
    minHeight: 46, paddingHorizontal: 16, paddingVertical: 10, justifyContent: "center" },
  choiceText: { fontSize: 14, lineHeight: 24, color: theme.colors.primary, textAlign: "center" },
  dim: { opacity: 0.6 },
});
