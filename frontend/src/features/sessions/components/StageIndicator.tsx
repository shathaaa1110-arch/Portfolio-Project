import { StyleSheet, View } from "react-native";
import { AppText } from "@/shared/components";
import { layoutDirection } from "@/shared/layout";
import { theme } from "@/shared/theme";
import type { OutingStatus } from "../api/join";

// The four steps everyone goes through, in order; a tiebreak is still part of voting.
const STEPS: { label: string; statuses: OutingStatus[] }[] = [
  { label: "دعوة", statuses: ["invite"] },
  { label: "تفضيلات", statuses: ["preferences"] },
  { label: "تصويت", statuses: ["voting", "tiebreak"] },
  { label: "النتيجة", statuses: ["result"] },
];

// Shows where the outing is now: the steps before it and the current one are filled.
export function StageIndicator({ status }: { status: OutingStatus }) {
  const current = STEPS.findIndex((step) => step.statuses.includes(status));
  return (
    <View style={styles.row}>
      {STEPS.map((step, index) => (
        <View key={step.label} style={styles.step}>
          <View style={[styles.bar, index <= current && styles.barDone]} />
          <AppText style={[styles.label, index === current && styles.labelCurrent]}>{step.label}</AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Arabic order: the first step sits on the right.
  row: { flexDirection: "row", ...layoutDirection("rtl"), gap: theme.spacing.labelGap },
  step: { flex: 1, gap: theme.spacing.labelGap },
  bar: { height: 4, borderRadius: 2, backgroundColor: theme.colors.border },
  barDone: { backgroundColor: theme.colors.primary },
  label: { fontSize: theme.typography.chipSize, color: theme.colors.placeholder, textAlign: "center" },
  labelCurrent: { fontFamily: theme.typography.fontFamilyBold, color: theme.colors.text },
});