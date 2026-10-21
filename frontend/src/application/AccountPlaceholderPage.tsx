import { router } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppButton, AppText } from "@/shared/components";
import { theme } from "@/shared/theme";

export function AccountPlaceholderPage() {
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={styles.screen}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="title">حسابي</AppText>

        {/* Explain what is available on this page. */}
        <AppText style={styles.message}>
          خيارات الحساب ستتوفر لاحقًا. يمكنك العودة للرئيسية الآن.
        </AppText>

        <AppButton
          title="العودة للرئيسية"
          onPress={() => router.navigate("/")}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  content: {
    // Center short content and allow longer content to scroll.
    flexGrow: 1,
    justifyContent: "center",
    padding: theme.spacing.pagePadding,
    gap: theme.spacing.fieldGap,
  },

  message: {
    textAlign: "center",
    writingDirection: "rtl",
  },
});