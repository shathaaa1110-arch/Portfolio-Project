import { useRef, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { ApiError } from "@/shared/api/errors";
import { AppButton, AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { leaveOuting, removeParticipant } from "../api/membership";
import type { Participant } from "../api/state";
import { outingToken } from "../identity";
import { SessionSheet } from "./SessionChrome";
import { QuietButton, room } from "./SessionLayout";

// What a sheet says after a refusal. A final one cannot succeed if asked again, so its button goes away.
type Failure = { text: string; final: boolean };

function failureOf(e: unknown, fallback: string): Failure {
  const code = e instanceof ApiError ? e.code : "";
  if (code === "MEMBERSHIP_LOCKED") {
    return { text: "بدأ اختيار المطعم، فما عاد ينفع تغيير المجموعة.", final: true };
  }
  if (code === "PARTICIPANT_NOT_FOUND") {
    return { text: "هذا المشارك ما عاد في الجلسة.", final: true };
  }
  return { text: fallback, final: false };
}

// A participant's way out before generation, only after they confirm it.
// onDone runs after every answer, so the room shows what the server says, never a guess.
export function LeaveButton({ outingId, code, onDone }: { outingId: string; code: string; onDone: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  function ask() {
    setFailure(null);
    setAsking(true);
  }

  async function leave() {
    setBusy(true);
    setFailure(null);
    try {
      await leaveOuting(outingId, await outingToken(outingId, code));
      setAsking(false);
    } catch (e) {
      setFailure(failureOf(e, "تعذّرت المغادرة. حاول مرة ثانية."));
    } finally {
      setBusy(false);
      onDone();
    }
  }

  return (
    <>
      <Pressable accessibilityRole="button" onPress={ask} style={room.quiet}>
        <AppText style={[room.quietLabel, styles.leave]}>مغادرة الجلسة</AppText>
      </Pressable>
      <SessionSheet visible={asking} title="تغادر الجلسة؟" onClose={() => { if (!busy) setAsking(false); }}>
        <AppText style={room.text}>بتخرج من قائمة المشاركين قبل توليد الاقتراحات. ما راح تدخل تفضيلاتك أو أصواتك في الجولة.</AppText>
        {failure && <AppText accessibilityRole="alert" style={room.error}>{failure.text}</AppText>}
        {!failure?.final && <AppButton title={busy ? "جارٍ المغادرة..." : "مغادرة الجلسة"} disabled={busy} onPress={leave} />}
        <QuietButton title="أبقى مع المجموعة" disabled={busy} onPress={() => setAsking(false)} />
      </SessionSheet>
    </>
  );
}

// The organizer confirms one person's removal; closing the sheet changes nothing.
export function RemoveSheet({ outingId, code, person, onClose, onDone }: {
  outingId: string; code: string; person: Participant | null; onClose: () => void; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  // Keeps the name on screen while the sheet slides away.
  const shown = useRef(person);
  if (person !== null) {
    shown.current = person;
  }

  function close() {
    if (!busy) {
      setFailure(null);
      onClose();
    }
  }

  async function remove() {
    if (person === null) {
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await removeParticipant(outingId, person.participant_id, await outingToken(outingId, code));
      onClose();
    } catch (e) {
      setFailure(failureOf(e, "تعذّرت الإزالة. حاول مرة ثانية."));
    } finally {
      setBusy(false);
      onDone();
    }
  }

  return (
    <SessionSheet visible={person !== null} title="إزالة مشارك؟" onClose={close}>
      <AppText style={room.text}>
        تزيل <AppText style={styles.name}>{shown.current?.name ?? "مشارك"}</AppText> من الجلسة؟ لن يتمكن من متابعة الجولة بهذه الدعوة.
      </AppText>
      {failure && <AppText accessibilityRole="alert" style={room.error}>{failure.text}</AppText>}
      {!failure?.final && <AppButton title={busy ? "جارٍ الإزالة..." : "نعم، إزالة المشارك"} disabled={busy} onPress={remove} />}
      <QuietButton title="إلغاء" disabled={busy} onPress={close} />
    </SessionSheet>
  );
}

const styles = StyleSheet.create({
  leave: { color: theme.colors.error },
  name: { fontFamily: theme.typography.fontFamilyBold },
});