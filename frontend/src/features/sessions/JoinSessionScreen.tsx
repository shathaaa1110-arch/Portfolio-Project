import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { clearSession, isSessionEnded, loadSession, type AuthSession } from "@/features/auth";
import { ApiError } from "@/shared/api/errors";
import { AppButton, AppInput, AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { joinOuting, joinOutingAsGuest, lookupInvite, type InvitePreview } from "./api/join";
import { loadGuestPass, saveGuestPass } from "./guestPass";
import { SessionHeader } from "./components/SessionChrome";
import { HailaTip, SessionMasthead, SessionPaper } from "./components/SessionVisuals";

// Invite codes are 4 characters, as agreed with Asem for BE-08.
const CODE_LENGTH = 4;
// Shown on the card only; the server enforces the limit.
const MAX_PARTICIPANTS = 8;
// Same limit as the server for a guest name (BE-09).
const MAX_NAME_LENGTH = 40;

// Messages from the design for sessions that cannot take new people.
const FULL_MESSAGE = "اكتملت الجلسة: ٨ من ٨. لا يوجد مكان متاح الآن.";
const CLOSED_MESSAGE = "بدأ توليد الاقتراحات وأُغلق الانضمام لهذه الجولة.";

// Join by code: look up the invite first, then show the session it belongs to.
export function JoinSessionScreen() {
  // A link like /join?code=7K3M fills the code for the user.
  const { code: linkCode } = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(typeof linkCode === "string" ? cleanCode(linkCode) : "");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [account, setAccount] = useState<AuthSession | null>(null);
  const [guestName, setGuestName] = useState("");
  const [nameError, setNameError] = useState("");
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Look the code up right away when it came from a link.
  useEffect(() => {
    if (code.length === CODE_LENGTH) {
      handleLookup();
    }
  }, []);

  async function handleLookup() {
    if (code.length !== CODE_LENGTH) {
      setError("اكتب رمز الدعوة كاملًا.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const found = await lookupInvite(code);
      const signedIn = await loadSession();
      // A guest who joined this same outing before comes back instead of joining twice.
      const savedPass = signedIn === null ? await loadGuestPass(code) : null;
      const returning = savedPass !== null && savedPass.outing_id === found.outing_id;
      // The server decides who can join; members and returning guests may already be inside.
      if (signedIn === null && !returning && !found.can_join) {
        setError(found.join_blocked_reason === "OUTING_FULL" ? FULL_MESSAGE : CLOSED_MESSAGE);
      } else {
        setAccount(signedIn);
        setPreview(found);
        setJoined(returning);
      }
    } catch (e) {
      setError(lookupErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    const name = guestName.trim();
    if (account === null && name === "") {
      setNameError("اكتب اسمك قبل الانضمام.");
      return;
    }

    setNameError("");
    setLoading(true);
    setError("");
    try {
      if (account !== null) {
        await joinOuting(code, account.token);
      } else {
        const pass = await joinOutingAsGuest(code, name);
        await saveGuestPass(code, pass);
      }
      setJoined(true);
    } catch (e) {
      if (isSessionEnded(e)) {
        // The account sign-in ended, so continue as a guest instead.
        await clearSession();
        setAccount(null);
        setError("انتهى دخولك. اكتب اسمك وانضم كضيف.");
      } else if (e instanceof ApiError && (e.code === "OUTING_FULL" || e.code === "JOINING_CLOSED")) {
        // The session filled up or closed after the lookup, so go back to the code.
        setPreview(null);
        setError(e.code === "OUTING_FULL" ? FULL_MESSAGE : CLOSED_MESSAGE);
      } else {
        setError("تعذّر الاتصال. بياناتك باقية، حاول مرة ثانية.");
      }
    } finally {
      setLoading(false);
    }
  }

  // Go back to the code field and keep the code for editing.
  function changeCode() {
    setPreview(null);
    setError("");
    setNameError("");
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <SessionHeader title="دعوة إلى جلسة" />
        <SessionMasthead title={joined ? "حلوة الجمْعة بوجودك." : "مكانك بيننا."} subtitle="انضم باسمك فقط، بدون حساب أو تحميل التطبيق." />
        <SessionPaper>
        {preview === null ? (
          <>
            <AppText variant="title" style={styles.title}>معك رمز الجلسة؟</AppText>
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
        ) : joined ? (
          <>
            <AppText style={styles.success}>تم انضمامك إلى «{preview.name}».</AppText>
            <AppButton title="افتح الجلسة" style={styles.button} onPress={() => router.replace({
              pathname: "/sessions/[id]", params: { id: preview.outing_id, code },
            })} />
          </>
        ) : (
          <>
            <View style={styles.card}>
              <AppText style={styles.eyebrow}>دعوة من {preview.organizer_name ?? "المنظّم"}</AppText>
              <AppText style={styles.cardTitle}>{preview.name}</AppText>
              <AppText>
                {`${arabicNumber(preview.participants_count)} من ${arabicNumber(MAX_PARTICIPANTS)} مشاركين`}
              </AppText>
            </View>

            {account !== null ? (
              <AppText>تنضم باسم حسابك: {account.userName}</AppText>
            ) : (
              <>
                <AppText variant="label" style={styles.label}>اسمك في الجلسة</AppText>
                <AppInput
                  placeholder="اكتب الاسم اللي يعرفونك فيه"
                  maxLength={MAX_NAME_LENGTH}
                  value={guestName}
                  onChangeText={setGuestName}
                />
                {nameError !== "" && <AppText style={styles.error}>{nameError}</AppText>}
              </>
            )}

            {error !== "" && <AppText style={styles.error}>{error}</AppText>}
            <AppButton
              title={loading ? "جارٍ الانضمام" : "انضم للجلسة"}
              style={styles.button}
              disabled={loading}
              onPress={handleJoin}
            />
            <Pressable style={styles.link} disabled={loading} onPress={changeCode}>
              <AppText style={styles.linkText}>تغيير الرمز</AppText>
            </Pressable>
            <AppText style={styles.note}>يرى الآخرون اسمك وجاهزيتك، وتبقى تفضيلاتك خاصة.</AppText>
          </>
        )}
        </SessionPaper>
        <HailaTip>{joined ? "باقي تختار وش مشتهي اليوم، وتلقى أصحابك داخل الجلسة." : "معك دعوة؟ اكتب رمزها، ومكانك محفوظ بين أصحابك بعد الانضمام."}</HailaTip>
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
    // A 404 without the server's error code means the join route is not live yet (before BE-09).
    if (error.code === "UNKNOWN_ERROR") {
      return "الانضمام برمز غير متاح حاليًا، وسيتوفر قريبًا.";
    }
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
    paddingHorizontal: 12, paddingBottom: 32, width: "100%", maxWidth: 460, alignSelf: "center",
  },
  // Small green line above the title, as in the design.
  eyebrow: {
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: theme.typography.chipSize,
    color: theme.colors.primary,
    marginBottom: theme.spacing.labelGap,
  },
  title: { textAlign: "center", fontSize: 27, lineHeight: 42, marginBottom: theme.spacing.labelGap },
  subtitle: { marginBottom: theme.spacing.titleGap },
  label: { textAlign: "right", marginBottom: theme.spacing.labelGap },
  // Codes are Latin letters and digits, so they read left to right.
  codeInput: { textAlign: "center", writingDirection: "ltr", fontSize: 29, letterSpacing: 8, minHeight: 65, backgroundColor: "#F9F7EC" },
  error: { color: theme.colors.error, marginTop: theme.spacing.labelGap },
  button: { marginTop: theme.spacing.fieldGap },
  card: {
    gap: theme.spacing.labelGap,
    padding: theme.spacing.cardPadding,
    backgroundColor: "transparent",
    borderBottomWidth: theme.borders.control,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.card,
    marginBottom: theme.spacing.fieldGap,
  },
  cardTitle: {
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: theme.typography.sessionTitleSize,
    textAlign: "right",
  },
  success: {
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: theme.typography.sectionTitleSize,
    color: theme.colors.primary,
    textAlign: "center", lineHeight: 38,
  },
  // Tall enough to tap easily, like the text link on the login screen.
  link: {
    marginTop: theme.spacing.actionGap,
    minHeight: theme.sizes.touchTargetMin,
    alignItems: "center",
    justifyContent: "center",
  },
  linkText: {
    color: theme.colors.primary,
    fontSize: theme.typography.labelSize,
    textDecorationLine: "underline",
  },
  note: {
    textAlign: "center",
    color: theme.colors.placeholder,
    fontSize: theme.typography.chipSize,
    marginTop: theme.spacing.labelGap,
  },
});
