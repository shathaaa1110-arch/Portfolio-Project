import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ApiError } from "@/shared/api/errors";
import { AppButton, AppInput, AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { requestCode } from "./api";
import { errorMessage } from "./authErrors";
import { goBack, goToVerify } from "./navigation";

// Arabic digits are allowed here; the server converts them to 0-9
const PHONE_PATTERN = /^[0٠][5٥][0-9٠-٩]{8}$/;

// Login uses the same phone field as sign-up, without asking for the name again
export function LoginScreen() {
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const cleanPhone = phone.trim();
    if (!PHONE_PATTERN.test(cleanPhone)) {
      setPhoneError("اكتب رقم جوال صحيح يبدأ بـ 05.");
      return;
    }
    setPhoneError("");

    setLoading(true);
    setError("");
    try {
      const response = await requestCode(cleanPhone);
      goToVerify({ phone: cleanPhone, codeLength: response.code_length });
    } catch (e) {
      if (e instanceof ApiError && e.code === "RATE_LIMITED") {
        // A code was sent less than a minute ago and still works: continue to the code screen
        goToVerify({ phone: cleanPhone, codeLength: 6, waitSeconds: e.retryAfterSeconds });
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.back} onPress={goBack}>
        <AppText>رجوع</AppText>
      </Pressable>

      <AppText variant="title" style={styles.title}>أهلًا من جديد.</AppText>
      <AppText style={styles.subtitle}>اكتب رقم جوالك ونرسل لك رمز الدخول.</AppText>

      <AppText variant="label" style={styles.label}>رقم الجوال</AppText>
      <AppInput
        style={styles.input}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        placeholder="05xxxxxxxx"
        maxLength={10}
        value={phone}
        onChangeText={setPhone}
      />
      {phoneError !== "" && <AppText style={styles.fieldError}>{phoneError}</AppText>}

      {error !== "" && <AppText style={styles.error}>{error}</AppText>}

      <AppButton
        title={loading ? "جاري الإرسال..." : "إرسال رمز الدخول"}
        style={styles.button}
        disabled={loading}
        onPress={handleSubmit}
      />

      <Pressable style={styles.link} onPress={() => router.replace("/sign-up")}>
        <AppText>ما عندك حساب؟ سجّل الآن</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.pagePadding,
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
  back: { position: "absolute", top: theme.spacing.titleGap * 2, start: theme.spacing.pagePadding },
  title: { marginBottom: theme.spacing.labelGap },
  subtitle: { textAlign: "center", marginBottom: theme.spacing.titleGap },
  label: { marginBottom: theme.spacing.labelGap },
  input: { marginBottom: theme.spacing.labelGap },
  fieldError: { color: theme.colors.error, marginBottom: theme.spacing.fieldGap },
  error: { color: theme.colors.error, textAlign: "center", marginTop: theme.spacing.fieldGap },
  button: { marginTop: theme.spacing.actionGap },
  link: { marginTop: theme.spacing.fieldGap, alignItems: "center" },
});