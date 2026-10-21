import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { loadSession, SignOutButton, type AuthSession } from "@/features/auth";
import { AppButton, AppText } from "@/shared/components";
import { theme } from "@/shared/theme";

export function AccountPlaceholderPage() {
  // undefined while checking, null when signed out
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);

  // Read the saved session every time this tab opens, because it changes after login or logout
  useFocusEffect(
    useCallback(() => {
      loadSession()
        .then(setSession)
        .catch(() => setSession(null));
    }, []),
  );

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={styles.screen}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="title">حسابي</AppText>

        {/* Signed in: greet the user and offer logout. Signed out: open sign-up. */}
        {session && (
          <>
            <AppText style={styles.message}>أهلًا {session.userName}</AppText>
            <SignOutButton />
          </>
        )}

        {session === null && (
          <>
            <AppText style={styles.message}>
              سجّل دخولك عشان تحفظ تفضيلاتك وتنظّم جلساتك.
            </AppText>
            <AppButton
              title="تسجيل الدخول"
              onPress={() => router.push("/sign-up")}
            />
          </>
        )}

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