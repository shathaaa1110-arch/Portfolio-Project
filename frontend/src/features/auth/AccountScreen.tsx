import { router, useFocusEffect } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useState } from "react";
import { I18nManager, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppButton, AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { accountActions, type LoadStatus } from "./accountActions";
import { getMyProfile, type AccountProfile } from "./api";
import { SignOutButton } from "./SignOutButton";
import { clearSession, isSessionEnded, loadSession } from "./session";

const AVATAR_SIZE = 56; // Circle with the first letter of the name
const CHEVRON_SIZE = 16;

// In Arabic layout a row already starts on the right; elsewhere reverse it, so the
// avatar and the row titles always sit on the right like the design
const ROW_DIRECTION = I18nManager.isRTL ? "row" : "row-reverse";

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

  const actions = accountActions(status);

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="title" style={styles.title}>حسابي</AppText>

        {status === "loading" && (
          <AppText>جارٍ تحميل بيانات حسابك…</AppText>
        )}

        {status === "signed-out" && (
          <AppText>سجّل دخولك عشان تحفظ تفضيلاتك وتنظّم جلساتك.</AppText>
        )}
        {actions.canSignIn && (
          <AppButton title="تسجيل الدخول" onPress={() => router.push("/sign-up")} />
        )}

        {/* Never fall back to the name saved on the device when the request failed */}
        {status === "error" && (
          <AppText>تعذّر تحميل بيانات حسابك. تحقق من اتصالك وحاول مرة أخرى.</AppText>
        )}
        {actions.canRetry && <AppButton title="إعادة المحاولة" onPress={retry} />}

        {status === "ready" && profile && (
          <>
            <View style={styles.profileCard}>
              <View style={styles.avatar} aria-hidden>
                <AppText style={styles.avatarLetter}>{profile.name.trim().charAt(0)}</AppText>
              </View>
              <View style={styles.profileText}>
                <AppText style={styles.name}>{profile.name}</AppText>
                <AppText style={styles.phone}>{profile.phone}</AppText>
              </View>
            </View>

            <View style={styles.menu}>
              <MenuRow title="تفضيلاتي" onPress={() => router.push("/preferences")} />
              <View style={styles.divider} />
              <MenuRow title="المطاعم المحفوظة" onPress={() => router.navigate("/saved")} />
            </View>
          </>
        )}

        {/* Also shown when loading failed, so the user can still sign out without a connection */}
        {actions.canSignOut && <SignOutButton />}
      </ScrollView>
    </SafeAreaView>
  );
}

// One line in the account menu; the arrow shows it opens another page
function MenuRow({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <AppText style={styles.rowTitle}>{title}</AppText>
      <SymbolView
        name={{ ios: "chevron.left", android: "chevron_left", web: "chevron_left" }}
        size={CHEVRON_SIZE}
        tintColor={theme.colors.placeholder}
        accessible={false}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  // The page flows from the top, like the other screens
  content: {
    padding: theme.spacing.pagePadding,
    gap: theme.spacing.fieldGap,
  },

  // The shared title is centered; this page starts at the right like the design
  title: {
    textAlign: "auto",
  },

  profileCard: {
    flexDirection: ROW_DIRECTION,
    alignItems: "center",
    gap: theme.spacing.actionGap,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: theme.borders.control,
    borderRadius: theme.radii.card,
    padding: theme.spacing.cardPadding,
  },

  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  avatarLetter: {
    color: theme.colors.onPrimary,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: theme.typography.sectionTitleSize,
  },

  // Takes the rest of the card, so long names wrap instead of pushing the avatar out.
  // The name and phone sit on the right, next to the avatar
  profileText: {
    flex: 1,
    gap: theme.spacing.labelGap,
    alignItems: I18nManager.isRTL ? "flex-start" : "flex-end",
  },

  name: {
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: theme.typography.sectionTitleSize,
    textAlign: "auto",
  },

  phone: {
    color: theme.colors.placeholder,
  },

  menu: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: theme.borders.control,
    borderRadius: theme.radii.card,
    overflow: "hidden",
  },

  row: {
    flexDirection: ROW_DIRECTION,
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: theme.sizes.controlMinHeight,
    paddingHorizontal: theme.spacing.cardPadding,
  },

  // Shows the finger touched the row
  rowPressed: {
    backgroundColor: theme.colors.searchBackground,
  },

  rowTitle: {
    fontFamily: theme.typography.fontFamilyBold,
  },

  divider: {
    height: theme.borders.control,
    backgroundColor: theme.colors.border,
  },
});
