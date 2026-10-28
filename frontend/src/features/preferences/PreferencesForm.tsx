import { useState } from "react";
import { Keyboard, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getDraftError, type PreferencesDraft } from "./model";
import { FoodPlate } from "./components/FoodPlate";
import { AppButton, AppInput, AppText } from "@/shared/components";
import { theme } from "@/shared/theme";
import { getBudgetError, getDistanceError } from "./validation";
import { DistanceFields } from "./components/DistanceFields";
import { FoodTypeCard } from "./components/FoodTypeCard";
import { foodTypeOptions } from "./foodTypes";
import { PreferencesProgress } from "./components/PreferencesProgress";
import { preferenceSteps } from "./steps";
import { cuisineOptions } from "./cuisineOptions";
import { CuisineCard } from "./components/CuisineCard";
import { SymbolView } from "expo-symbols";
import { SeatingChoices } from "./components/SeatingChoices";
import { Image } from "expo-image";
import {
  AllergyChoices,
  type AllergyChoicesValue,
} from "./components/AllergyChoices";

type PreferencesFormProps = {
  initialValue: PreferencesDraft;
  onSubmit: (value: PreferencesDraft) => void | Promise<void>;
  onExit: () => void;
  isSaving?: boolean;
  error?: string;
  notice?: string;
  onSignIn?: () => void;
  submitLabel?: string;
};

export function PreferencesForm({
  initialValue, onSubmit, onExit, isSaving = false, error = "",
  notice = "", onSignIn, submitLabel = "حفظ تفضيلاتي",
}: PreferencesFormProps) {
  // Start with the first form step.
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = preferenceSteps[stepIndex];

// All six steps are ready to preview.
const lastReadyStepIndex = preferenceSteps.length - 1;

  // Keep choices when moving between steps.
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>(initialValue.selectedCuisines);
  const [selectedFoodTypes, setSelectedFoodTypes] = useState<string[]>(initialValue.selectedFoodTypes);
  const [selectedSeating, setSelectedSeating] = useState<string[]>(initialValue.selectedSeating);
  // Keep allergy answers when moving between steps.
const [allergyChoices, setAllergyChoices] =
  useState<AllergyChoicesValue>(initialValue.allergyChoices);

  // Keep budget values and the no-limit choice.
  const [budgetMin, setBudgetMin] = useState(initialValue.budgetMin);
  const [budgetMax, setBudgetMax] = useState(initialValue.budgetMax);
  const [isBudgetUnlimited, setIsBudgetUnlimited] = useState(initialValue.isBudgetUnlimited);

  // Keep distance values and the no-limit choice.
  const [maxDistance, setMaxDistance] = useState(initialValue.maxDistance);
  const [isDistanceUnlimited, setIsDistanceUnlimited] = useState(initialValue.isDistanceUnlimited);

  const [seatingNotes, setSeatingNotes] = useState(initialValue.seatingNotes);

  const budgetError = isBudgetUnlimited
    ? ""
    : getBudgetError(budgetMin, budgetMax);

  const distanceError = isDistanceUnlimited
    ? ""
    : getDistanceError(maxDistance);

  // Block Next only when the current step has an error.
  const hasStepError =
    (currentStep.id === "budget" && budgetError !== "") ||
    (currentStep.id === "distance" && distanceError !== "");

  const draft: PreferencesDraft = {
    selectedCuisines, selectedFoodTypes, selectedSeating, seatingNotes,
    allergyChoices, budgetMin, budgetMax, isBudgetUnlimited,
    maxDistance, isDistanceUnlimited,
  };
  const isLastStep = stepIndex === lastReadyStepIndex;
  const draftError = getDraftError(draft);
  const canContinue = !isSaving && (isLastStep ? !draftError : !hasStepError);
  const visibleError = error || (isLastStep ? draftError : "");

  function handleContinue() {
    if (!canContinue) return;
    Keyboard.dismiss();
    if (isLastStep) {
      void onSubmit(draft);
    } else {
      setStepIndex(previous => Math.min(previous + 1, lastReadyStepIndex));
    }
  }


  function toggleCuisine(cuisine: string) {
    setSelectedCuisines((previous) => {
      // Remove an existing choice.
      if (previous.includes(cuisine)) {
        return previous.filter((item) => item !== cuisine);
      }

      // Add a new choice.
      return [...previous, cuisine];
    });
  }

  function toggleFoodType(foodTypeId: string) {
  setSelectedFoodTypes((previous) => {
    // Remove the food type if it is already selected.
    if (previous.includes(foodTypeId)) {
      return previous.filter((id) => id !== foodTypeId);
    }

    // Add the new food type to the selection.
    return [...previous, foodTypeId];
  });
}

  return (
       <SafeAreaView style={styles.screen}>
      <PreferencesProgress stepIndex={stepIndex} />

      <ScrollView
  key={currentStep.id}
  style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        {/* Keep the introduction together. */}
             <View style={styles.intro}>
  <AppText variant="label" style={styles.arabicText}>
    نبدأ بذوقك
  </AppText>

  {/* Show the current step title. */}
  <AppText
    variant="title"
    accessibilityRole="header"
    style={styles.arabicText}
  >
    {currentStep.title}
  </AppText>

  {/* Show the current step description. */}
  <AppText style={[styles.arabicText, styles.description]}>
    {currentStep.description}
  </AppText>
</View>

        {/* Show cuisine cards in the first step. */}
{currentStep.id === "cuisines" && (
  <View style={styles.section}>
    <View style={styles.cuisineGrid}>
      {/* Show the first eight cuisines. */}
      {cuisineOptions.slice(0, 8).map((cuisine) => (
        <CuisineCard
          key={cuisine.id}
          label={cuisine.label}
          image={cuisine.image}
          selected={selectedCuisines.includes(cuisine.id)}
          onPress={() => toggleCuisine(cuisine.id)}
        />
      ))}

      {/* Clear cuisine choices without changing food types. */}
      <CuisineCard
        label="بدون تفضيل"
        image={require(
          "../../../assets/images/preferences/cuisines/no-preference.png"
        )}
        selected={selectedCuisines.length === 0}
        onPress={() => setSelectedCuisines([])}
      />

      {/* Keep the global cuisine beside no preference. */}
      {cuisineOptions.slice(8).map((cuisine) => (
        <CuisineCard
          key={cuisine.id}
          label={cuisine.label}
          image={cuisine.image}
          selected={selectedCuisines.includes(cuisine.id)}
          onPress={() => toggleCuisine(cuisine.id)}
        />
      ))}
    </View>

    <AppText style={[styles.description, { textAlign: "center" }]}>
      تقدر تغيّر اختياراتك لاحقًا.
    </AppText>
  </View>
)}

{/* Show the plate for food choices. */}
<View
  style={[
    styles.section,
    { display: currentStep.id === "food" ? "flex" : "none" },
  ]}
>

  <FoodPlate selectedFoodTypes={selectedFoodTypes} />

{/* Show food choices as selectable cards. */}
<View style={styles.options}>
  {foodTypeOptions.map((food) => (
    <FoodTypeCard
      key={food.id}
      label={food.label}
      image={food.image}
      selected={selectedFoodTypes.includes(food.id)}
      onPress={() => toggleFoodType(food.id)}
    />
  ))}
</View>

</View>

{/* Show seating choices only in the seating step. */}
{currentStep.id === "seating" && (
  <View style={styles.section}>
    <SeatingChoices selected={selectedSeating} onChange={setSelectedSeating} />
    {initialValue.seatingNotes !== "" && (
      <AppInput
        accessibilityLabel="احتياجات جلسة محفوظة أخرى"
        value={seatingNotes}
        onChangeText={setSeatingNotes}
        style={styles.arabicText}
      />
    )}
  </View>
)}

{/* Set the budget range per person. */}
      <View
  style={[
    styles.section,
    { display: currentStep.id === "budget" ? "flex" : "none" },
  ]}
>
  {/* Show the table illustration from the design. */}
<Image
  source={require(
    "../../../assets/images/preferences/budget-table.png"
  )}
  style={{
    width: "100%",
    aspectRatio: 1.5,
  }}
  contentFit="contain"
  accessible={false}
/>
          <AppText variant="label" style={styles.arabicText}>
            ميزانية الشخص · ر.س
          </AppText>

          <View style={styles.budgetRow}>
            <View style={styles.budgetField}>
              <AppText variant="label" style={styles.arabicText}>
                من
              </AppText>

              <AppInput
                accessibilityLabel="الحد الأدنى لميزانية الشخص بالريال"
                value={budgetMin}
                onChangeText={setBudgetMin}
                keyboardType="number-pad"
editable={!isBudgetUnlimited}
accessibilityState={{ disabled: isBudgetUnlimited }}
placeholder={isBudgetUnlimited ? "—" : "60"}
                style={styles.numberInput}
              />
            </View>

            <View style={styles.budgetField}>
              <AppText variant="label" style={styles.arabicText}>
                إلى
              </AppText>

              <AppInput
                accessibilityLabel="الحد الأعلى لميزانية الشخص بالريال"
                value={budgetMax}
                onChangeText={setBudgetMax}
                keyboardType="number-pad"
                editable={!isBudgetUnlimited}
accessibilityState={{ disabled: isBudgetUnlimited }}
placeholder={isBudgetUnlimited ? "—" : "120"}

                style={styles.numberInput}
              />
                       </View>
          </View>

          {/* Explain invalid budget values below the fields. */}
          {budgetError !== "" && (
            <AppText
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[
                styles.arabicText,
                { color: theme.colors.error },
              ]}
            >
              {budgetError}
            </AppText>
          )}

          {/* Clear both amounts when no limit is selected. */}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="بدون حد للميزانية"
            accessibilityState={{ checked: isBudgetUnlimited }}
            onPress={() => {
              const nextValue = !isBudgetUnlimited;
              setIsBudgetUnlimited(nextValue);

              if (nextValue) {
                setBudgetMin("");
                setBudgetMax("");
              }
            }}
            style={styles.budgetOption}
          >
            <View
              style={[
                styles.budgetCheckbox,
                isBudgetUnlimited && {
                  backgroundColor: theme.colors.primary,
                },
              ]}
            >
              {isBudgetUnlimited && (
                <AppText
                  accessible={false}
                  style={{ color: theme.colors.onPrimary }}
                >
                  ✓
                </AppText>
              )}
            </View>

            <AppText>بدون حد للميزانية</AppText>
          </Pressable>
        </View>

        {/* Show distance fields in the fifth step. */}
        {currentStep.id === "distance" && (
          <DistanceFields
            value={maxDistance}
            unlimited={isDistanceUnlimited}
            onChange={setMaxDistance}
            onUnlimitedChange={setIsDistanceUnlimited}
          />
        )}

{/* Show allergy choices in the sixth step. */}
{currentStep.id === "allergies" && (
  <AllergyChoices
    value={allergyChoices}
    onChange={setAllergyChoices}
  />
)}

        </ScrollView>

      {/* Keep the navigation below the scrollable content. */}
      <View style={styles.footer}>
        {notice !== "" && <AppText style={styles.arabicText}>{notice}</AppText>}
        {visibleError !== "" && (
          <AppText accessibilityRole="alert" style={[styles.arabicText, { color: theme.colors.error }]}>
            {visibleError}
          </AppText>
        )}
        {onSignIn && <AppButton title="تسجيل الدخول مجددًا" onPress={onSignIn} />}
        <View style={styles.nextAction}>
          <AppButton
            title={isSaving ? "جارٍ الحفظ..." : isLastStep ? submitLabel : "التالي"}
            disabled={!canContinue}
            accessibilityState={{ disabled: !canContinue, busy: isSaving }}
            onPress={handleContinue}
          />

          {/* Show the arrow only before the final step. */}
          {!isLastStep && <View
            pointerEvents="none"
            style={[
              styles.nextArrow,
              !canContinue && { opacity: theme.opacity.disabled },
            ]}
          >
            <SymbolView
              name={{
                ios: "chevron.left",
                android: "chevron_left",
                web: "chevron_left",
              }}
              size={22}
              tintColor={theme.colors.onPrimary}
              accessible={false}
            />
          </View>}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={isSaving}
          onPress={() => {
            // Leave the form from the first step.
            if (stepIndex === 0) {
              onExit();
              return;
            }

            // Otherwise, return to the previous step.
            setStepIndex((previous) => Math.max(previous - 1, 0));
          }}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.pressed,
          ]}
        >
          <AppText style={styles.backText}>
            {stepIndex === 0 ? "العودة للتصفح" : "السابق"}
          </AppText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
    budgetOption: {
    // Keep the checkbox on the right.
    direction: "ltr",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: theme.spacing.labelGap,
    minHeight: theme.sizes.touchTargetMin,
  },

  budgetCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
    footer: {
    // Separate the navigation from the form content.
    backgroundColor: theme.colors.background,
    borderTopWidth: theme.borders.control,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing.pagePadding,
    paddingTop: theme.spacing.actionGap,
    paddingBottom: theme.spacing.labelGap,
    gap: theme.spacing.labelGap,
    flexShrink: 0,
  },

  nextAction: {
    // Use the full width and anchor the arrow.
    width: "100%",
    position: "relative",
    direction: "ltr",
  },

  nextArrow: {
    // Keep the arrow on the left and vertically centered.
    position: "absolute",
    left: theme.spacing.buttonPaddingHorizontal,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },

    cuisineGrid: {
    // Start from the right and show two cards per row.
    direction: "ltr",
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  content: {
    padding: theme.spacing.pagePadding,
    gap: theme.spacing.fieldGap,
  },

  intro: {
    gap: theme.spacing.labelGap,
    marginBottom: theme.spacing.actionGap,
  },

  description: {
    color: theme.colors.placeholder,
    lineHeight: 24,
  },

  section: {
    gap: theme.spacing.actionGap,
  },

 options: {
  // Start from the right and keep even spaces between cards.
  direction: "ltr",
  flexDirection: "row-reverse",
  flexWrap: "wrap",
  justifyContent: "space-between",
  rowGap: theme.spacing.labelGap,
},

  arabicText: {
    writingDirection: "rtl",
    textAlign: "auto",
    width: "100%",
  },

    budgetRow: {
    // Place the minimum on the right.
    direction: "ltr",
    flexDirection: "row-reverse",
    gap: theme.spacing.actionGap,
  },

  budgetField: {
    // Give both fields equal space.
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.labelGap,
  },

  numberInput: {
    // Keep numbers readable from left to right.
    writingDirection: "ltr",
    textAlign: "auto",
  },

  backButton: {
    // Keep the touch area comfortable.
    alignSelf: "center",
    minHeight: theme.sizes.touchTargetMin,
    paddingHorizontal: theme.spacing.buttonPaddingHorizontal,
    justifyContent: "center",
  },

  backText: {
    color: theme.colors.primary,
    textAlign: "center",
    writingDirection: "rtl",
    textDecorationLine: "underline",
  },

  pressed: {
    // Give feedback while pressing.
    opacity: 0.7,
  },
});
