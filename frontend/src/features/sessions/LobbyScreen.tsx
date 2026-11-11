import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton, AppText } from "@/shared/components";
import { layoutDirection } from "@/shared/layout";
import { theme } from "@/shared/theme";
import { startPreferences } from "./api/state";
import { InviteCard } from "./components/InviteCard";
import { ParticipantRow } from "./components/ParticipantRow";
import { StageIndicator } from "./components/StageIndicator";
import { outingToken } from "./identity";
import { useSessionState } from "./useSessionState";

// Shown on screen only; the server enforces the limit.
const MAX_PARTICIPANTS = 8;
// After these the lobby cannot show this outing, so the person joins again.
const NO_ACCESS = ["NO_ACCESS", "INVALID_TOKEN", "TOKEN_EXPIRED", "NOT_A_PARTICIPANT"];

// The waiting room: who joined, the invite code, and what happens next.
export function LobbyScreen() {
  // A link like /lobby?id=… opens one outing.
  const { id, code } = useLocalSearchParams<{ id?: string; code?: string }>();
  // Web pages are built ahead without the link's id, so show the room only once the page runs.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {!ready ? null : typeof id === "string" && id !== "" ? (
          <Lobby outingId={id} code={code ?? ""} />
        ) : (
          <Problem text="ما وصلنا رقم الجلسة." action="الانضمام برمز" onPress={() => router.replace("/join")} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Lobby({ outingId, code }: { outingId: string; code: string }) {
  const { state, error, refresh } = useSessionState(outingId, code);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  const me = state?.participants.find((person) => person.participant_id === state.me.participant_id);
  const needsPreferences = state?.status === "preferences" && me !== undefined && !me.preferences_done;

  // When preferences start, take each person to their form. Coming back keeps them here,
  // because this runs again only when needsPreferences itself changes.
  useEffect(() => {
    if (needsPreferences) {
      openPreferences(outingId, code);
    }
  }, [needsPreferences, outingId, code]);

  async function handleStart() {
    setStarting(true);
    setStartError("");
    try {
      const token = await outingToken(outingId, code);
      await startPreferences(outingId, token);
      refresh();
    } catch {
      setStartError("تعذّر بدء التفضيلات. حاول مرة ثانية.");
    } finally {
      setStarting(false);
    }
  }

  if (error && NO_ACCESS.includes(error.code)) {
    return (
      <Problem text="ما عندك وصول لهذه الجلسة. انضم برمز الدعوة." action="الانضمام برمز" onPress={() => router.replace("/join")} />
    );
  }
  if (error?.code === "OUTING_NOT_FOUND") {
    return <Problem text="الجلسة غير موجودة أو انتهت." action="الرجوع للرئيسية" onPress={() => router.replace("/")} />;
  }
  if (state === null) {
    return error ? (
      <Problem text="تعذّر تحميل الجلسة." action="حاول مرة ثانية" onPress={refresh} />
    ) : (
      <AppText style={styles.muted}>جارٍ تحميل الجلسة…</AppText>
    );
  }

  const open = state.status === "invite" || state.status === "preferences";
  const when = formatWhen(state.starts_at);
  return (
    <>
      <AppText style={styles.eyebrow}>كلنا على نفس الطاولة</AppText>
      <AppText variant="title" style={styles.title}>{state.name}</AppText>
      {when !== "" && <AppText style={styles.subtitle}>{when}</AppText>}

      <StageIndicator status={state.status} />
      <InviteCard code={state.invite_code} closed={!open} />

      <View style={styles.listHeading}>
        <AppText style={styles.sectionTitle}>
          {`المشاركون ${arabicNumber(state.participants.length)} / ${arabicNumber(MAX_PARTICIPANTS)}`}
        </AppText>
        {state.status !== "invite" && (
          <AppText style={styles.muted}>{`${arabicNumber(state.readiness.ready_count)} جاهزون`}</AppText>
        )}
      </View>
      {state.participants.map((person) => (
        <ParticipantRow
          key={person.participant_id}
          person={person}
          isMe={person.participant_id === state.me.participant_id}
          showReadiness={state.status !== "invite"}
        />
      ))}

      {error && <AppText style={styles.muted}>تعذّر التحديث، ونحاول مرة ثانية.</AppText>}
      {state.actions.includes("start_preferences") && (
        <AppButton
          title={starting ? "جارٍ البدء" : "ابدأ التفضيلات"}
          style={styles.button}
          disabled={starting}
          onPress={handleStart}
        />
      )}
      {startError !== "" && <AppText style={styles.error}>{startError}</AppText>}
      {state.status === "invite" && !state.me.is_organizer && (
        <AppText style={styles.note}>ننتظر المنظّم يبدأ مرحلة التفضيلات.</AppText>
      )}
      {state.status === "preferences" && (
        <AppButton title="تفضيلاتي لهذه الجلسة" style={styles.button} onPress={() => openPreferences(outingId, code)} />
      )}
    </>
  );
}

// A message with one way forward, for when the lobby cannot show the outing.
function Problem({ text, action, onPress }: { text: string; action: string; onPress: () => void }) {
  return (
    <>
      <AppText style={styles.problem}>{text}</AppText>
      <AppButton title={action} style={styles.button} onPress={onPress} />
    </>
  );
}

// The outing screen holds each person's preferences for this outing; the code finds a guest's pass.
function openPreferences(outingId: string, code: string) {
  router.push({ pathname: "/sessions/[id]", params: { id: outingId, code } });
}

// The meeting day and time in Arabic; empty when the date cannot be read.
function formatWhen(startsAt: string): string {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("ar-SA-u-nu-arab", { weekday: "long", hour: "numeric", minute: "2-digit" });
}

// Show numbers with Arabic digits, like the rest of the app.
function arabicNumber(value: number): string {
  return value.toLocaleString("ar-SA-u-nu-arab");
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.pagePadding, gap: theme.spacing.fieldGap },
  eyebrow: {
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: theme.typography.chipSize,
    color: theme.colors.primary,
    marginBottom: -theme.spacing.actionGap,
  },
  title: { textAlign: "auto" },
  subtitle: { color: theme.colors.placeholder, marginTop: -theme.spacing.actionGap },
  // Arabic order: the title sits on the right and the ready count on the left.
  listHeading: { flexDirection: "row", ...layoutDirection("rtl"), alignItems: "baseline", justifyContent: "space-between" },
  sectionTitle: { fontFamily: theme.typography.fontFamilyBold, fontSize: theme.typography.sectionTitleSize },
  muted: { color: theme.colors.placeholder },
  note: { color: theme.colors.placeholder, textAlign: "center" },
  error: { color: theme.colors.error },
  problem: { fontSize: theme.typography.sectionTitleSize },
  button: { marginTop: theme.spacing.labelGap },
});