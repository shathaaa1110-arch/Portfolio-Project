import { StyleSheet, View } from "react-native";
import { AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { preferenceSteps } from "../steps";

type PreferencesProgressProps = {
  stepIndex: number;
};

export function PreferencesProgress({
  stepIndex,
}: PreferencesProgressProps) {
  // Show step numbers starting from one.
  const currentNumber = (stepIndex + 1).toLocaleString("ar-SA");
  const totalNumber = preferenceSteps.length.toLocaleString("ar-SA");
  const progressText = `${currentNumber} من ${totalNumber}`;

  return (
    <View style={styles.container}>
      {/* Keep the form title visible. */}
      <AppText
        variant="label"
        accessibilityRole="header"
        style={styles.title}
      >
        تفضيلاتك
      </AppText>

      <View
        style={styles.progress}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="التقدم في نموذج التفضيلات"
        accessibilityValue={{
          min: 1,
          max: preferenceSteps.length,
          now: stepIndex + 1,
          text: `الخطوة ${progressText}`,
        }}
      >
        {/* Show one segment for each step. */}
        <View style={styles.track}>
          {preferenceSteps.map((step, index) => (
            <View
              key={step.id}
              style={[
                styles.segment,
                index <= stepIndex && styles.activeSegment,
              ]}
            />
          ))}
        </View>

        {/* Place the step number below the segments. */}
        <AppText style={styles.counter}>
          {progressText}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.pagePadding,
    paddingVertical: theme.spacing.actionGap,
    gap: theme.spacing.actionGap,
  },

  title: {
    fontSize: 18,
    lineHeight: 28,
    textAlign: "center",
    color: theme.colors.text,
  },

  progress: {
    gap: theme.spacing.labelGap,
  },

  track: {
    // Start the first step on the right.
    direction: "ltr",
    flexDirection: "row-reverse",
    gap: theme.spacing.labelGap,
  },

  segment: {
    // Give every step the same width.
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
  },

  activeSegment: {
    backgroundColor: theme.colors.primary,
  },

  counter: {
    textAlign: "center",
    writingDirection: "rtl",
    color: theme.colors.placeholder,
  },
});