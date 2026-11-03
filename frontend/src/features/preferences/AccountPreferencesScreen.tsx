import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { loadSession, markPreferencesSaved } from "@/features/auth";
import { USE_MOCK } from "@/shared/api/config";
import { ApiError } from "@/shared/api/errors";
import { AppButton, AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { getAccountPreferences, saveAccountPreferences } from "./api";
import { fromAccountPreferences, toPreferencesPayload, type PreferencesDraft } from "./model";
import { PreferencesForm } from "./PreferencesForm";

import { preferencesErrorMessage } from "./errors";

export function AccountPreferencesScreen() {
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const [initialValue, setInitialValue] = useState<PreferencesDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const loadedToken = useRef<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    setNeedsLogin(false);
    async function load() {
      try {
        const session = await loadSession();
        if (!active) return;
        if (!session) {
          setNeedsLogin(true);
          return;
        }
        const response = await getAccountPreferences(session.token);
        if (!active) return;
        if (onboarding === "1" && response.is_saved) {
          router.replace("/");
          return;
        }
        loadedToken.current = session.token;
        setInitialValue(fromAccountPreferences(response));
      } catch (error) {
        if (!active) return;
        setLoadError(preferencesErrorMessage(error));
        if (error instanceof ApiError && error.status === 401) setNeedsLogin(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [attempt, onboarding]);

  async function save(value: PreferencesDraft) {
    // Block duplicate taps before React updates the screen.
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const session = await loadSession();
      if (!mounted.current) return;
      // Never send one account's form to a different account.
      if (!session || session.token !== loadedToken.current) {
        throw new ApiError(401, "INVALID_TOKEN", "Session changed");
      }
      await saveAccountPreferences(session.token, toPreferencesPayload(value));
      if (!mounted.current) return;
      if (!await markPreferencesSaved(session.token)) {
        throw new ApiError(401, "INVALID_TOKEN", "Session changed");
      }
      if (mounted.current) router.replace("/");
    } catch (error) {
      if (!mounted.current) return;
      setSaveError(preferencesErrorMessage(error));
      if (error instanceof ApiError && error.status === 401) setNeedsLogin(true);
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  if (!initialValue) {
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.panel}>
          <AppText variant="title" style={styles.text}>
            تفضيلاتك
          </AppText>
          {USE_MOCK && <AppText style={styles.text}>وضع تجريبي: البيانات لا تُحفظ في حساب حقيقي.</AppText>}
          {loading && <ActivityIndicator size="large" color={theme.colors.primary} />}
          <AppText style={styles.text}>
            {loading ? "نحمّل تفضيلاتك المحفوظة..."
              : needsLogin ? "سجّل دخولك لقراءة تفضيلات حسابك وحفظها."
              : loadError}
          </AppText>
          {!loading && (needsLogin ? (
            <AppButton title="تسجيل الدخول" onPress={() => router.replace("/login")} />
          ) : (
            <AppButton title="إعادة المحاولة" onPress={() => setAttempt(value => value + 1)} />
          ))}
          <AppButton title="العودة للتصفح" onPress={() => router.replace("/")} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <>
      <PreferencesForm
        initialValue={initialValue}
        onSubmit={save}
        onExit={() => router.navigate("/")}
        isSaving={saving}
        error={saveError}
        notice={USE_MOCK ? "وضع تجريبي: البيانات لا تُحفظ في حساب حقيقي." : ""}
        onSignIn={needsLogin ? () => router.replace("/login") : undefined}
      />
      {/* Keep answers mounted while the real save request runs. */}
      <Modal visible={saving} animationType="fade" onRequestClose={() => {}}>
        <SafeAreaView style={[styles.screen, styles.panel]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <AppText variant="title" style={styles.text}>نحفظ ذوقك</AppText>
          <AppText style={styles.text}>{USE_MOCK ? "نجرّب حفظ اختياراتك محليًا." : "لحظات ونحفظ اختياراتك في حسابك."}</AppText>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  panel: { flexGrow: 1, justifyContent: "center", padding: theme.spacing.pagePadding, gap: theme.spacing.fieldGap },
  text: { textAlign: "center", writingDirection: "rtl" },
});
