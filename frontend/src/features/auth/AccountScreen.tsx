import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppButton, AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { getMyProfile, type AccountProfile } from "./api";
import { SignOutButton } from "./SignOutButton";
import { clearSession, isSessionEnded, loadSession } from "./session";

type LoadStatus = "loading" | "ready" | "error" | "signed-out";

export function AccountScreen() {
  // Profile of the signed-in account, read from the server
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");

  // Changing this value starts another request
  const [attempt, setAttempt] = useState(0);

  // Reload every time the tab opens, because the user may log in, log out or switch accounts
  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadProfile() {
        try {
          const session = await loadSession();
          if (!active) return;
          if (!session) {
            setStatus("signed-out");
            return;
          }

          const me = await getMyProfile(session.token);
          if (!active) return;
          setProfile(me);
          setStatus("ready");
        } catch (error) {
          if (!active) return;
          if (isSessionEnded(error)) {
            // The server rejected the token, so this device is signed out too
            await clearSession();
            if (active) setStatus("signed-out");
            return;
          }
          setStatus("error");
        }
      }

      void loadProfile();

      // Leaving the tab forgets the profile, so the next account never sees it
      return () => {
        active = false;
        setProfile(null);
        setStatus("loading");
      };
    }, [attempt]),
  );

  function retry() {
    setAttempt((previous) => previous + 1);
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="title">حسابي</AppText>

        {status === "loading" && (
          <AppText style={styles.message}>جارٍ تحميل بيانات حسابك…</AppText>
        )}

        {status === "signed-out" && (
          <>
            <AppText style={styles.message}>
              سجّل دخولك عشان تحفظ تفضيلاتك وتنظّم جلساتك.
            </AppText>
            <AppButton title="تسجيل الدخول" onPress={() => router.push("/sign-up")} />
          </>
        )}

        {/* Never fall back to the name saved on the device when the request failed */}
        {status === "error" && (
          <>
            <AppText style={styles.message}>
              تعذّر تحميل بيانات حسابك. تحقق من اتصالك وحاول مرة أخرى.
            </AppText>
            <AppButton title="إعادة المحاولة" onPress={retry} />
          </>
        )}

        {status === "ready" && profile && (
          <>
            <View style={styles.card}>
              <AppText style={styles.name}>{profile.name}</AppText>
              {/* Phone digits always read left to right */}
              <AppText style={styles.phone}>{profile.phone}</AppText>
            </View>

            <AppButton title="تفضيلاتي" onPress={() => router.push("/preferences")} />
            <AppButton title="المطاعم المحفوظة" onPress={() => router.navigate("/saved")} />
            <SignOutButton />
          </>
        )}
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

  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: theme.borders.control,
    borderRadius: theme.radii.card,
    padding: theme.spacing.cardPadding,
    gap: theme.spacing.labelGap,
    alignItems: "center",
  },

  name: {
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: theme.typography.sectionTitleSize,
    textAlign: "center",
    writingDirection: "rtl",
  },

  phone: {
    color: theme.colors.placeholder,
    textAlign: "center",
    writingDirection: "ltr",
  },
});
