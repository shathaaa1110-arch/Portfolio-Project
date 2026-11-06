import { StyleSheet, View } from "react-native";
import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import type { Participant } from "../api/state";

type Props = {
  person: Participant;
  // The row of whoever is looking at the screen.
  isMe: boolean;
  // Readiness only means something once the preferences stage has started.
  showReadiness: boolean;
};

// One person in the waiting room: initial, name, organizer badge and readiness.
export function ParticipantRow({ person, isMe, showReadiness }: Props) {
  const realName = person.name ?? "مشارك";
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <AppText style={styles.initial}>{realName.slice(0, 1)}</AppText>
      </View>
      <View style={styles.names}>
        <AppText style={styles.name}>{isMe ? "أنت" : realName}</AppText>
        {person.is_organizer && <AppText style={styles.badge}>المنظّم</AppText>}
      </View>
      {showReadiness && (
        <AppText style={[styles.status, person.preferences_done && styles.ready]}>
          {person.preferences_done ? "✓ جاهز" : "يجهّز تفضيلاته"}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Arabic order: the initial sits on the right and readiness on the left.
  row: {
    flexDirection: "row",
    direction: "rtl",
    alignItems: "center",
    gap: theme.spacing.actionGap,
    paddingVertical: theme.spacing.actionGap,
    borderBottomWidth: theme.borders.control,
    borderBottomColor: theme.colors.border,
  },
  avatar: {
    width: theme.sizes.touchTargetMin,
    height: theme.sizes.touchTargetMin,
    borderRadius: theme.sizes.touchTargetMin / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.sessionAccent,
  },
  initial: { fontFamily: theme.typography.fontFamilyBold, color: theme.colors.primary },
  names: { flex: 1 },
  name: { fontFamily: theme.typography.fontFamilyBold },
  badge: { fontSize: theme.typography.chipSize, color: theme.colors.placeholder },
  status: { fontSize: theme.typography.chipSize, color: theme.colors.placeholder },
  ready: { color: theme.colors.primary },
});