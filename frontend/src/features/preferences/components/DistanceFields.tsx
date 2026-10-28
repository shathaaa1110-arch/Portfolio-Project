import { Keyboard, Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";

import { AppInput, AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { getDistanceError } from "../validation";

// The screen keeps these values between steps.
type DistanceFieldsProps = {
  value: string;
  unlimited: boolean;
  onChange: (value: string) => void;
  onUnlimitedChange: (value: boolean) => void;
};

const distances = [3, 5, 10, 20];

export function DistanceFields({
  value,
  unlimited,
  onChange,
  onUnlimitedChange,
}: DistanceFieldsProps) {
  const error = unlimited ? "" : getDistanceError(value);

  // Match a quick choice even when Arabic digits are typed.
  const normalized = value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/٫/g, ".")
    .trim();

  function chooseDistance(distance: number) {
    Keyboard.dismiss();
    onUnlimitedChange(false);
    onChange(String(distance));
  }

  function toggleUnlimited() {
    const nextValue = !unlimited;
    onUnlimitedChange(nextValue);

    // Remove the old limit when no limit is selected.
    if (nextValue) {
      Keyboard.dismiss();
      onChange("");
    }
  }

  return (
    <View style={styles.section}>
      {/* Use the illustration from the approved design. */}
      <Image
        source={require(
          "../../../../assets/images/preferences/distance-route.png"
        )}
        style={styles.illustration}
        contentFit="contain"
        accessible={false}
      />

      <AppText variant="label" style={styles.arabicText}>
        أقصى مسافة
      </AppText>

      {/* Keep the unit visible beside the amount. */}
      <View style={styles.inputWrapper}>
        <AppInput
          accessibilityLabel="أقصى مسافة بالكيلومتر"
          accessibilityState={{ disabled: unlimited }}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          editable={!unlimited}
          placeholder={unlimited ? "—" : "10"}
          style={[
            styles.input,
            error !== "" && { borderColor: theme.colors.error },
          ]}
        />

        <View pointerEvents="none" style={styles.unit}>
          <AppText style={styles.mutedText}>كم</AppText>
        </View>
      </View>

      {error !== "" && (
        <AppText
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.arabicText, { color: theme.colors.error }]}
        >
          {error}
        </AppText>
      )}

      {/* These are shortcuts; a different distance can be typed. */}
      <View style={styles.choices}>
        {distances.map((distance) => {
          const selected =
            !unlimited &&
            error === "" &&
            Number(normalized) === distance;

          return (
            <Pressable
              key={distance}
              accessibilityRole="button"
              accessibilityLabel={`${distance} كيلومتر`}
              accessibilityState={{ selected }}
              onPress={() => chooseDistance(distance)}
              style={({ pressed }) => [
                styles.choice,
                selected && styles.selected,
                pressed && { opacity: 0.7 },
              ]}
            >
              <AppText>{distance.toLocaleString("ar-SA")} كم</AppText>

              {selected && (
                <SymbolView
                  name={{
                    ios: "checkmark.circle.fill",
                    android: "check_circle",
                    web: "check_circle",
                  }}
                  size={20}
                  tintColor={theme.colors.primary}
                  style={styles.choiceMark}
                  accessible={false}
                />
              )}
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel="بدون حد للمسافة"
        accessibilityState={{ checked: unlimited }}
        onPress={toggleUnlimited}
        style={styles.noLimit}
      >
        <SymbolView
          name={{
            ios: unlimited ? "checkmark.square.fill" : "square",
            android: unlimited ? "check_box" : "check_box_outline_blank",
            web: unlimited ? "check_box" : "check_box_outline_blank",
          }}
          size={24}
          tintColor={theme.colors.primary}
          accessible={false}
        />

        <AppText>بدون حد للمسافة</AppText>
      </Pressable>

      <AppText style={[styles.arabicText, styles.mutedText]}>
        تُحسب المسافة من موقع البحث الذي تحدده.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing.actionGap,
  },

  illustration: {
    width: "100%",
    aspectRatio: 1.5,
  },

  arabicText: {
    textAlign: "right",
    writingDirection: "rtl",
  },

  mutedText: {
    color: theme.colors.placeholder,
    lineHeight: 24,
  },

  inputWrapper: {
    position: "relative",
    direction: "ltr",
  },

  input: {
    // Leave room for the kilometre label.
    paddingLeft: 68,
    textAlign: "right",
    writingDirection: "ltr",
  },

  unit: {
    position: "absolute",
    left: 0,
    top: 12,
    bottom: 12,
    width: 54,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  choices: {
    // Arrange the shortcuts from right to left.
    direction: "ltr",
    flexDirection: "row-reverse",
    gap: theme.spacing.labelGap,
    marginVertical: theme.spacing.labelGap,
  },

  choice: {
    flex: 1,
    minHeight: theme.sizes.controlMinHeight,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.field,
  },

  selected: {
    backgroundColor: "#EAF0DC",
    borderColor: theme.colors.primary,
  },

  choiceMark: {
    position: "absolute",
    top: -8,
    left: 4,
  },

  noLimit: {
    direction: "ltr",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: theme.spacing.labelGap,
    minHeight: theme.sizes.touchTargetMin,
  },
});