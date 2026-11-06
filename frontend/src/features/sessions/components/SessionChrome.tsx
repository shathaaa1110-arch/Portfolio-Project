import type { ReactNode } from "react";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/shared/components";
import { layoutDirection } from "@/shared/layout";
import { theme } from "@/shared/theme";

const names = {
  back: { ios: "chevron.right", android: "chevron_right", web: "chevron_right" },
  next: { ios: "chevron.left", android: "chevron_left", web: "chevron_left" },
  edit: { ios: "pencil", android: "edit", web: "edit" },
  calendar: { ios: "calendar", android: "calendar_month", web: "calendar_month" },
  time: { ios: "clock", android: "schedule", web: "schedule" },
  location: { ios: "mappin.and.ellipse", android: "location_on", web: "location_on" },
  people: { ios: "person.2", android: "group", web: "group" },
  arrow: { ios: "arrow.left", android: "arrow_back", web: "arrow_back" },
  check: { ios: "checkmark.circle.fill", android: "check_circle", web: "check_circle" },
} as const;
export function SessionIcon({ name, size = 24, color = theme.colors.primary }: {
  name: keyof typeof names; size?: number; color?: string;
}) {
  return <SymbolView name={names[name]} size={size} tintColor={color} accessible={false} />;
}

export function SessionHeader({ title }: { title: string }) {
  return <View style={styles.header}>
    <AppText style={styles.brand}>ذوق</AppText>
    <AppText style={styles.heading}>{title}</AppText>
    <Pressable accessibilityRole="button" accessibilityLabel="رجوع" style={styles.back}
      onPress={() => router.canGoBack() ? router.back() : router.replace("/")}>
      <SessionIcon name="back" size={25} />
    </Pressable>
  </View>;
}

export function SessionSheet({ visible, title, onClose, children }: {
  visible: boolean; title: string; onClose: () => void; children: ReactNode;
}) {
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={styles.sheet} accessibilityViewIsModal onAccessibilityEscape={onClose}>
      <View style={styles.sheetHeading}>
        <AppText variant="title" style={styles.sheetTitle}>{title}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={`إغلاق ${title}`} onPress={onClose} style={styles.back}>
          <AppText>إغلاق</AppText>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {children}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({
  header: { ...layoutDirection("ltr"), flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, height: 64 },
  brand: { fontFamily: theme.typography.fontFamilyBold, fontSize: 28, lineHeight: 45, color: theme.colors.primary, width: 62 },
  heading: { fontFamily: theme.typography.fontFamilyBold, fontSize: 19, textAlign: "center", flex: 1 },
  back: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  sheet: { flex: 1, backgroundColor: theme.colors.background },
  sheetHeading: { ...layoutDirection("ltr"), flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 24, paddingVertical: 8 },
  sheetTitle: { flex: 1, textAlign: "right", fontSize: 24 },
  sheetContent: { padding: 24, gap: 18, width: "100%", maxWidth: 520, alignSelf: "center" },
});
