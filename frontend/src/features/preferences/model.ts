import type { AllergyChoicesValue } from "./components/AllergyChoices";
import type { AccountPreferences, PreferencesPayload } from "./api";
import { getBudgetError, getDistanceError } from "./validation";

export type PreferencesDraft = {
  selectedCuisines: string[];
  selectedFoodTypes: string[];
  selectedSeating: string[];
  seatingNotes: string;
  allergyChoices: AllergyChoicesValue;
  budgetMin: string;
  budgetMax: string;
  isBudgetUnlimited: boolean;
  maxDistance: string;
  isDistanceUnlimited: boolean;
};

// Translate screen IDs to the agreed API keys.
const foodKeys: Record<string, string> = {
  grills: "grill", sandwiches: "sandwich", breakfast: "breakfast",
  seafood: "seafood", healthy: "healthy", "coffee-tea": "coffee_tea",
  desserts: "sweets", bakery: "bakery", juices: "juice",
};
const seatingLabels: Record<string, string> = {
  families: "عائلات", quiet: "هادئ", friends: "أصدقاء",
  indoor: "داخلية", outdoor: "خارجية",
};
const allergyIds = [
  "milk", "eggs", "tree_nuts", "peanuts", "fish",
  "shellfish", "wheat", "soy", "sesame",
] as const;

export function emptyPreferences(): PreferencesDraft {
  return {
    selectedCuisines: [], selectedFoodTypes: [], selectedSeating: [],
    seatingNotes: "", allergyChoices: { selected: [], otherText: "", noAllergies: false },
    budgetMin: "", budgetMax: "", isBudgetUnlimited: false,
    maxDistance: "", isDistanceUnlimited: false,
  };
}

// Convert digits only when preparing numbers for the API.
function toNumber(text: string): number | null {
  const value = text.trim()
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/٫/g, ".");
  return value === "" ? null : Number(value);
}

function seatingText(value: PreferencesDraft): string {
  return [
    ...value.selectedSeating.map(id => seatingLabels[id] ?? id),
    value.seatingNotes.trim(),
  ].filter(Boolean).join("، ");
}

export function getDraftError(value: PreferencesDraft): string {
  const budget = value.isBudgetUnlimited ? "" : getBudgetError(value.budgetMin, value.budgetMax);
  const distance = value.isDistanceUnlimited ? "" : getDistanceError(value.maxDistance);
  if (budget || distance) return budget || distance;
  if (value.allergyChoices.selected.includes("other") && !value.allergyChoices.otherText.trim()) {
    return "اكتب نوع الحساسية الأخرى، أو ألغِ اختيار «أخرى».";
  }
  if (seatingText(value).length > 200) return "اختصر احتياجات الجلسة إلى ٢٠٠ حرف أو أقل.";
  return "";
}

export function toPreferencesPayload(value: PreferencesDraft): PreferencesPayload {
  const error = getDraftError(value);
  if (error) throw new Error(error);
  const other = value.allergyChoices.selected.includes("other")
    ? value.allergyChoices.otherText.split(/\r?\n/).map(text => text.trim()).filter(Boolean)
    : [];
  return {
    liked_cuisines: [...new Set([
      ...value.selectedCuisines,
      ...value.selectedFoodTypes.map(id => foodKeys[id] ?? id),
    ])],
    allergies: value.allergyChoices.noAllergies ? [] : [...new Set([
      ...value.allergyChoices.selected.filter(id => id !== "other"), ...other,
    ])],
    budget_min: value.isBudgetUnlimited ? null : toNumber(value.budgetMin),
    budget_max: value.isBudgetUnlimited ? null : toNumber(value.budgetMax),
    max_distance_km: value.isDistanceUnlimited ? null : toNumber(value.maxDistance),
    seating_needs: seatingText(value) || null,
  };
}

export function fromAccountPreferences(saved: AccountPreferences): PreferencesDraft {
  const foodEntries = Object.entries(foodKeys);
  const foodValues = Object.values(foodKeys);
  const knownAllergies = allergyIds.filter(id => saved.allergies.includes(id));
  const otherAllergies = saved.allergies.filter(id => !allergyIds.some(known => known === id));
  const seatingParts = (saved.seating_needs ?? "").split(/[،,\n]/).map(text => text.trim()).filter(Boolean);
  const seatingEntries = Object.entries(seatingLabels);
  const matchedSeating = seatingEntries.filter(([id, label]) => seatingParts.includes(id) || seatingParts.includes(label));
  const otherSeating = seatingParts.filter(part => !seatingEntries.some(([id, label]) => part === id || part === label));
  return {
    selectedCuisines: saved.liked_cuisines.filter(key => !foodValues.includes(key)),
    selectedFoodTypes: foodEntries.filter(([, key]) => saved.liked_cuisines.includes(key)).map(([id]) => id),
    selectedSeating: matchedSeating.map(([id]) => id),
    // Keep saved free text instead of silently dropping it.
    seatingNotes: otherSeating.join("، "),
    allergyChoices: {
      selected: [...knownAllergies, ...(otherAllergies.length ? ["other" as const] : [])],
      otherText: otherAllergies.join("\n"),
      // An empty API list does not prove an explicit no-allergy answer.
      noAllergies: false,
    },
    budgetMin: saved.budget_min === null ? "" : String(saved.budget_min),
    budgetMax: saved.budget_max === null ? "" : String(saved.budget_max),
    isBudgetUnlimited: saved.is_saved && saved.budget_min === null && saved.budget_max === null,
    maxDistance: saved.max_distance_km === null ? "" : String(saved.max_distance_km),
    isDistanceUnlimited: saved.is_saved && saved.max_distance_km === null,
  };
}
