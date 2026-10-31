import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@/shared/api/errors";
import { AppButton, AppInput, AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { requestCode } from "./api";
import { AuthHero } from "./AuthHero";
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
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Pressable style={styles.back} onPress={goBack}>
          <AppText>رجوع</AppText>
        </Pressable>

        <AuthHero />

        <AppText style={styles.eyebrow}>جمعة حلوة، تبدأ هنا</AppText>
        <AppText variant="title" style={styles.title}>حيّاك من جديد.</AppText>
        <AppText style={styles.subtitle}>ادخل بجوالك، ونرجعك لإنشاء الجلسة.</AppText>

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
        {/* One line under the phone field: the error when there is one, otherwise the hint */}
        <AppText style={phoneError !== "" ? styles.fieldError : styles.hint}>
          {phoneError !== "" ? phoneError : "نرسل رمزًا للتحقق من الرقم."}
        </AppText>

        {error !== "" && <AppText style={styles.error}>{error}</AppText>}

        <AppButton
          title={loading ? "جاري الإرسال..." : "إرسال رمز التحقق"}
          style={styles.button}
          disabled={loading}
          onPress={handleSubmit}
        />

        <Pressable style={styles.link} onPress={() => router.replace("/sign-up")}>
          <AppText style={styles.linkText}>أول مرة؟ أنشئ حسابًا</AppText>
        </Pressable>

        <AppText style={styles.note}>تقدر تتصفح المطاعم وتنضم كضيف بدون حساب.</AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  // The design flows from the top; scrolling keeps the form reachable on small phones
  content: {
    padding: theme.spacing.pagePadding,
  },

  // Stays until the shared header from the design is ready
  back: {
    alignSelf: "flex-start",
    minHeight: theme.sizes.touchTargetMin,
    justifyContent: "center",
    marginBottom: theme.spacing.labelGap,
  },

  // Small green line above the title, as in the design
  eyebrow: {
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: theme.typography.chipSize,
    color: theme.colors.primary,
    marginBottom: theme.spacing.labelGap,
  },
  // The shared title is centered; this screen follows the design and starts at the right
  title: { textAlign: "auto", marginBottom: theme.spacing.labelGap },
  subtitle: { marginBottom: theme.spacing.titleGap },
  label: { marginBottom: theme.spacing.labelGap },
  input: { marginBottom: theme.spacing.labelGap },
  fieldError: { color: theme.colors.error, marginBottom: theme.spacing.fieldGap },
  // Same space as the error, so the form does not jump when the error appears
  hint: {
    color: theme.colors.placeholder,
    fontSize: theme.typography.chipSize,
    marginBottom: theme.spacing.fieldGap,
  },
  error: { color: theme.colors.error, textAlign: "center", marginTop: theme.spacing.fieldGap },
  button: { marginTop: theme.spacing.actionGap },
  // Tall enough to tap easily, like the design's text button
  link: {
    marginTop: theme.spacing.fieldGap,
    minHeight: theme.sizes.touchTargetMin,
    alignItems: "center",
    justifyContent: "center",
  },
  // Underlined green text, as in the design, so it reads as a link
  linkText: {
    color: theme.colors.primary,
    fontSize: theme.typography.labelSize,
    textDecorationLine: "underline",
  },
  note: { textAlign: "center", marginTop: theme.spacing.titleGap },
});
