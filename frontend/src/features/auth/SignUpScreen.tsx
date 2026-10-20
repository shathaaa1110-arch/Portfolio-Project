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

export function SignUpScreen() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    // Check the fields only after the button is pressed, as the screen spec asks
    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const nameOk = cleanName.length > 0;
    const phoneOk = PHONE_PATTERN.test(cleanPhone);
    setNameError(nameOk ? "" : "اكتب اسمك.");
    setPhoneError(phoneOk ? "" : "اكتب رقم جوال صحيح يبدأ بـ 05.");
    if (!nameOk || !phoneOk) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await requestCode(cleanPhone);
      goToVerify({ phone: cleanPhone, codeLength: response.code_length, name: cleanName });
    } catch (e) {
      if (e instanceof ApiError && e.code === "RATE_LIMITED") {
        // A code was sent less than a minute ago and still works: continue to the code screen
        goToVerify({ phone: cleanPhone, codeLength: 6, waitSeconds: e.retryAfterSeconds, name: cleanName });
      } else {
        // The typed values stay in the fields so the user can press the button again
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

      <AppText variant="title" style={styles.title}>خلّنا نتعرّف عليك.</AppText>
      <AppText style={styles.subtitle}>حسابك لتنظيم الجلسات. أصحابك يقدرون ينضمون بالدعوة.</AppText>

      <AppText variant="label" style={styles.label}>الاسم</AppText>
      <AppInput style={styles.input} placeholder="كيف نناديك؟" value={name} onChangeText={setName} />
      {nameError !== "" && <AppText style={styles.fieldError}>{nameError}</AppText>}

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
        title={loading ? "جاري الإرسال..." : "إرسال رمز التحقق"}
        style={styles.button}
        disabled={loading}
        onPress={handleSubmit}
      />

      <Pressable style={styles.link} onPress={() => router.replace("/login")}>
        <AppText>عندك حساب؟ تسجيل الدخول</AppText>
      </Pressable>

      <AppText style={styles.note}>تقدر تتصفح المطاعم وتنضم كضيف بدون حساب.</AppText>
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
  note: { textAlign: "center", marginTop: theme.spacing.titleGap },
});