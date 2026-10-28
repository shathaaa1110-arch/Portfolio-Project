import { Keyboard, Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";

import { AppInput, AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { allergyOptions, type AllergyId } from "../allergyOptions";
import { AllergyCard } from "./AllergyCard";

// Keep related answers together.
export type AllergyChoicesValue = {
  selected: AllergyId[];
  otherText: string;
  noAllergies: boolean;
};

type AllergyChoicesProps = {
  value: AllergyChoicesValue;
  onChange: (nextValue: AllergyChoicesValue) => void;
};

export function AllergyChoices({ value, onChange }: AllergyChoicesProps) {
  function toggleAllergy(id: AllergyId) {
    const nextSelected = value.selected.includes(id)
      ? value.selected.filter((choice) => choice !== id)
      : [...value.selected, id];

    // Close the keyboard if the text field is removed.
    if (id === "other" && !nextSelected.includes("other")) {
      Keyboard.dismiss();
    }

    onChange({
      selected: nextSelected,
      // Keep this text only while Other is selected.
      otherText: nextSelected.includes("other") ? value.otherText : "",
      noAllergies: false,
    });
  }

  function toggleNoAllergies() {
    Keyboard.dismiss();

    // No allergies cannot coexist with selected allergies.
    onChange({
      selected: [],
      otherText: "",
      noAllergies: !value.noAllergies,
    });
  }

  return (
    <View style={styles.section}>
      {/* Create a card for each choice. */}
      <View style={styles.grid}>
        {allergyOptions.map((option) => (
          <AllergyCard
            key={option.id}
            label={option.label}
            image={option.image}
            selected={value.selected.includes(option.id)}
            onPress={() => toggleAllergy(option.id)}
          />
        ))}
      </View>

      {/* Ask for details only when Other is selected. */}
      {value.selected.includes("other") && (
        <View style={styles.field}>
          <AppText variant="label" style={styles.arabicText}>
            حساسية أخرى
          </AppText>

          <AppInput
            accessibilityLabel="نوع الحساسية الأخرى"
            value={value.otherText}
            onChangeText={(text) =>
              onChange({ ...value, otherText: text })
            }
            placeholder="اكتب كل نوع حساسية في سطر"
            multiline
            submitBehavior="newline"
            style={styles.arabicText}
          />
        </View>
      )}

      <Pressable
        accessible
        accessibilityRole="checkbox"
        accessibilityLabel="ما عندي حساسية"
        accessibilityState={{ checked: value.noAllergies }}
        onPress={toggleNoAllergies}
        style={({ pressed }) => [
          styles.noneOption,
          value.noAllergies && styles.selected,
          pressed && { opacity: 0.8 },
        ]}
      >
        <SymbolView
          name={{
            ios: value.noAllergies
              ? "checkmark.square.fill"
              : "square",
            android: value.noAllergies
              ? "check_box"
              : "check_box_outline_blank",
            web: value.noAllergies
              ? "check_box"
              : "check_box_outline_blank",
          }}
          size={26}
          tintColor={theme.colors.primary}
          accessible={false}
        />

        <AppText style={[styles.arabicText, styles.noneLabel]}>
          ما عندي حساسية
        </AppText>
      </Pressable>

      <AppText style={[styles.arabicText, styles.note]}>
        أبلغ المطعم بحساسيتك قبل الطلب.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing.fieldGap,
  },

  grid: {
    // Start each row from the right.
    direction: "ltr",
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },

  field: {
    gap: theme.spacing.labelGap,
  },

  arabicText: {
    textAlign: "right",
    writingDirection: "rtl",
  },

  noneOption: {
    direction: "ltr",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: theme.spacing.labelGap,
    minHeight: 64,
    padding: 16,
    borderWidth: theme.borders.control,
    borderColor: theme.colors.border,
    borderRadius: 16,
    backgroundColor: theme.colors.background,
  },

  noneLabel: {
    flex: 1,
    fontSize: theme.typography.inputSize,
  },

  selected: {
    backgroundColor: "#EAF0DC",
  },

  note: {
    color: theme.colors.chipText,
    textAlign: "center",
    lineHeight: 24,
  },
});