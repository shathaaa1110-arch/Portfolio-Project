import { Pressable, Share, StyleSheet, View } from "react-native";
import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";

type Props = {
  code: string;
  // Joining has closed, so there is nothing left to share.
  closed: boolean;
};

// The invite code in large letters, with a button that opens the phone's share sheet.
export function InviteCard({ code, closed }: Props) {
  async function share() {
    try {
      await Share.share({ message: `انضم لجلستنا في ذوق برمز الدعوة: ${code}` });
    } catch {
      // Some browsers have no share sheet; the code stays on screen to copy by hand.
    }
  }

  return (
    <View style={styles.card}>
      <AppText style={styles.label}>{closed ? "رمز الجلسة · الانضمام مغلق" : "رمز الدعوة"}</AppText>
      <AppText style={styles.code}>{code}</AppText>
      {!closed && (
        <Pressable style={styles.share} onPress={share} accessibilityRole="button">
          <AppText style={styles.shareText}>مشاركة الدعوة</AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    gap: theme.spacing.labelGap,
    padding: theme.spacing.cardPadding,
    borderRadius: theme.radii.card,
    backgroundColor: theme.colors.primary,
  },
  label: { fontSize: theme.typography.labelSize, color: theme.colors.onPrimary },
  // Codes are Latin letters and digits, so they read left to right with space between.
  code: {
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: theme.typography.titleSize,
    letterSpacing: 6,
    color: theme.colors.onPrimary,
    writingDirection: "ltr",
  },
  share: { minHeight: theme.sizes.touchTargetMin, justifyContent: "center" },
  shareText: { color: theme.colors.onPrimary, textDecorationLine: "underline" },
});