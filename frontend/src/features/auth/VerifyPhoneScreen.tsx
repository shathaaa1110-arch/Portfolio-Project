import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { I18nManager, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@/shared/api/errors";
import { AppButton, AppInput, AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { resendCode, verifyCode } from "./api";
import { errorMessage } from "./authErrors";
import { goToApp } from "./navigation";
import { saveSession, sessionFromVerify } from "./session";

const RESEND_WAIT_SECONDS = 60; // Same wait as the backend
const CODE_FIELD_HEIGHT = 68; // From the UX-01 design
const CODE_FONT_SIZE = 23; // From the UX-01 design
const CODE_SLOT_WIDTH = 24; // Wide enough for one digit or one dash
const NOT_A_DIGIT = /[^0-9٠-٩۰-۹]/g; // Keeps 0-9 and Arabic or Persian digits
const LOCK_CIRCLE_SIZE = 68; // From the UX-01 design
const LOCK_ICON_SIZE = 30; // From the UX-01 design

export function VerifyPhoneScreen() {
  const params = useLocalSearchParams<{ phone: string; name?: string; codeLength?: string; wait?: string }>();
  const phone = params.phone ?? "";
  const codeLength = Number(params.codeLength) || 6;

  const [code, setCode] = useState("");
  const [name, setName] = useState(params.name ?? "");
  const [needsName, setNeedsName] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(Number(params.wait) || RESEND_WAIT_SECONDS);

  // Count down once per second until resending is allowed
  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }
    const timer = setTimeout(() => setSecondsLeft(secondsLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  async function handleVerify() {
    setLoading(true);
    setError("");
    try {
      const response = await verifyCode(phone, code, name.trim() || undefined);
      await saveSession(sessionFromVerify(response));
      goToApp(response.user.has_saved_preferences);
    } catch (e) {
      if (e instanceof ApiError && e.code === "NAME_REQUIRED") {
        // A new phone came from the login screen: ask for the name, the same code still works
        setNeedsName(true);
        setError("رقمك جديد، اكتب اسمك عشان ننشئ حسابك.");
      } else {
        if (e instanceof ApiError && e.retryAfterSeconds) {
          // TOO_MANY_ATTEMPTS: the server says how long to wait before a new code
          setSecondsLeft(e.retryAfterSeconds);
        }
        setError(errorMessage(e));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError("");
    try {
      await resendCode(phone);
      setCode("");
      setSecondsLeft(RESEND_WAIT_SECONDS);
    } catch (e) {
      if (e instanceof ApiError && e.retryAfterSeconds) {
        setSecondsLeft(e.retryAfterSeconds);
      }
      setError(errorMessage(e));
    }
  }

  // \u2066 and \u2069 keep the masked number in left-to-right order inside the Arabic sentence
  const maskedPhone = `\u2066${phone.slice(0, 2)}••••••${phone.slice(-2)}\u2069`;
  const canVerify = code.length === codeLength && !loading && (!needsName || name.trim().length > 0);

  // One slot per digit: a dash until that digit is typed. The server decides how many digits
  const slots = Array.from({ length: codeLength }, (_, index) => code[index] ?? "—");

  // Rows run right to left in Arabic, so reverse them to keep the code reading left to right
  const visibleSlots = I18nManager.isRTL ? [...slots].reverse() : slots;

  // Pasted text like "123 456" keeps only the digits, cut to the code length
  function handleCodeChange(text: string) {
    setCode(text.replace(NOT_A_DIGIT, "").slice(0, codeLength));
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.lockCircle} aria-hidden>
          <SymbolView
            name={{ ios: "lock", android: "lock", web: "lock" }}
            size={LOCK_ICON_SIZE}
            tintColor={theme.colors.text}
            accessible={false}
          />
        </View>

        <AppText style={styles.eyebrow}>خطوة بسيطة وبنبدأ</AppText>
        <AppText variant="title" style={styles.title}>تأكد من جوالك.</AppText>
        <AppText style={styles.subtitle}>أرسلنا الرمز إلى {maskedPhone}</AppText>

        <AppText variant="label" style={styles.label}>رمز التحقق</AppText>
        {/* The real field stays underneath with invisible text, so typing, pasting and SMS autofill still work */}
        <View>
          <AppInput
            style={[styles.input, styles.codeInput]}
            accessibilityLabel="رمز التحقق"
            caretHidden
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            value={code}
            onChangeText={handleCodeChange}
          />

          {/* Drawn on top; touches pass through to the field */}
          <View style={styles.codeSlots} aria-hidden>
            {visibleSlots.map((slot, index) => (
              <AppText key={index} style={[styles.codeSlot, slot === "—" && styles.codeSlotEmpty]}>
                {slot}
              </AppText>
            ))}
          </View>
        </View>

        {needsName && (
          <>
            <AppText variant="label" style={styles.label}>اسمك</AppText>
            <AppInput style={styles.input} placeholder="كيف نناديك؟" value={name} onChangeText={setName} />
          </>
        )}

        {error !== "" && <AppText style={styles.error}>{error}</AppText>}

        <AppButton
          title={loading ? "جاري التأكد..." : "تأكيد ومتابعة"}
          style={styles.button}
          disabled={!canVerify}
          onPress={handleVerify}
        />

        {/* Gray without a line while counting down, so it does not look tappable */}
        <Pressable style={styles.link} disabled={secondsLeft > 0} onPress={handleResend}>
          <AppText style={secondsLeft > 0 ? styles.linkTextWaiting : styles.linkText}>
            {secondsLeft > 0 ? `إعادة الإرسال بعد ${secondsLeft} ثانية` : "إعادة إرسال الرمز"}
          </AppText>
        </Pressable>

        <Pressable style={styles.link} onPress={() => router.back()}>
          <AppText style={styles.linkText}>تعديل رقم الجوال</AppText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  // The design flows from the top; scrolling keeps the button above the keyboard
  content: {
    padding: theme.spacing.pagePadding,
  },

  // Soft circle with a lock, as in the design
  lockCircle: {
    width: LOCK_CIRCLE_SIZE,
    height: LOCK_CIRCLE_SIZE,
    borderRadius: LOCK_CIRCLE_SIZE / 2,
    // Closest shared color to the design's circle
    backgroundColor: theme.colors.searchBackground,
    alignItems: "center",
    justifyContent: "center",
    // The design keeps it on the right; "flex-start" means the right side only in Arabic layout
    alignSelf: I18nManager.isRTL ? "flex-start" : "flex-end",
    marginBottom: theme.spacing.fieldGap,
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
  input: { marginBottom: theme.spacing.fieldGap },
  // The typed text is invisible here; the slots on top show it
  codeInput: {
    height: CODE_FIELD_HEIGHT,
    color: "transparent",
  },

  codeSlots: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: CODE_FIELD_HEIGHT,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing.labelGap,
    pointerEvents: "none",
  },

  codeSlot: {
    width: CODE_SLOT_WIDTH,
    textAlign: "center",
    fontSize: CODE_FONT_SIZE,
  },

  codeSlotEmpty: {
    color: theme.colors.placeholder,
  },
  error: { color: theme.colors.error, textAlign: "center", marginBottom: theme.spacing.fieldGap },
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
  linkTextWaiting: {
    color: theme.colors.placeholder,
    fontSize: theme.typography.labelSize,
  },
});
