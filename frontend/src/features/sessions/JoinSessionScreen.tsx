import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@/shared/api/errors";
import { AppButton, AppInput, AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { lookupInvite, type InvitePreview } from "./api/join";

// The design uses 4 characters; Asem confirms the server format in BE-08.
const CODE_LENGTH = 4;
const MAX_PARTICIPANTS = 8;

// Join by code: look up the invite first, then show the session it belongs to.
export function JoinSessionScreen() {
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLookup() {
    if (code.length !== CODE_LENGTH) {
      setError("اكتب رمز الدعوة كاملًا.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      setPreview(await lookupInvite(code));
    } catch (e) {
      setError(lookupErrorMessage(e));
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
        <AppText style={styles.eyebrow}>مكانك معنا</AppText>
        <AppText variant="title" style={styles.title}>معك رمز الجلسة؟</AppText>
        <AppText style={styles.subtitle}>انضم باسمك فقط، بدون حساب أو تحميل التطبيق.</AppText>

        {preview === null ? (
          <>
            <AppText variant="label" style={styles.label}>رمز الدعوة</AppText>
            <AppInput
              style={styles.codeInput}
              placeholder="7K3M"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={CODE_LENGTH}
              value={code}
              onChangeText={(text) => setCode(cleanCode(text))}
            />
            {error !== "" && <AppText style={styles.error}>{error}</AppText>}
            <AppButton
              title={loading ? "جارٍ التحقق" : "عرض الدعوة"}
              style={styles.button}
              disabled={loading}
              onPress={handleLookup}
            />
          </>
        ) : (
          <View style={styles.card}>
            <AppText style={styles.eyebrow}>دعوة من {preview.organizer_name}</AppText>
            <AppText style={styles.cardTitle}>{preview.name}</AppText>
            <AppText>{preview.district}</AppText>
            <AppText>
              {`${arabicNumber(preview.participants_count)} من ${arabicNumber(MAX_PARTICIPANTS)} مشاركين`}
            </AppText>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Keep Latin capitals and digits only, so the code matches the server.
function cleanCode(text: string): string {
  return text
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// Show numbers with Arabic digits, like the rest of the app.
function arabicNumber(value: number): string {
  return value.toLocaleString("ar-SA-u-nu-arab");
}

// Turn a lookup failure into the design's Arabic message.
function lookupErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return "رمز الدعوة غير صالح. راجعه مع المنظّم.";
  }
  return "تعذّر التحقق من الدعوة. حاول مرة ثانية.";
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.pagePadding,
  },
  // Small green line above the title, as in the design.
  eyebrow: {
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: theme.typography.chipSize,
    color: theme.colors.primary,
    marginBottom: theme.spacing.labelGap,
  },
  title: { textAlign: "auto", marginBottom: theme.spacing.labelGap },
  subtitle: { marginBottom: theme.spacing.titleGap },
  label: { marginBottom: theme.spacing.labelGap },
  // Codes are Latin letters and digits, so they read left to right.
  codeInput: { textAlign: "left", writingDirection: "ltr" },
  error: { color: theme.colors.error, marginTop: theme.spacing.labelGap },
  button: { marginTop: theme.spacing.fieldGap },
  card: {
    gap: theme.spacing.labelGap,
    padding: theme.spacing.cardPadding,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.borders.control,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.card,
  },
  cardTitle: {
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: theme.typography.sessionTitleSize,
  },
});