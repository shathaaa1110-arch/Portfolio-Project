// Public browsing uses the same 18 category keys accepted by BE-27.
// These are filters for this search, not changes to the account's saved preferences.
export const cuisineFilters = [
  ["saudi_gulf", "سعودي وخليجي"], ["levant", "شامي"], ["american", "أمريكي"],
  ["italian", "إيطالي"], ["indian", "هندي وباكستاني"], ["asian", "آسيوي"],
  ["turk_persian", "تركي وإيراني"], ["egypt_arab", "مصري وعربي"], ["world", "عالمي"],
  ["grill", "مشويات"], ["sandwich", "ساندويتشات"], ["breakfast", "فطور"],
  ["seafood", "بحري"], ["healthy", "صحي"], ["coffee_tea", "قهوة وشاي"],
  ["sweets", "حلويات"], ["bakery", "مخبوزات"], ["juice", "عصيرات"],
] as const;

export type SearchDistrict = { id: string; name_ar: string; name_en?: string };

export function matchingDistricts(districts: SearchDistrict[], query: string) {
  const normalize = (text: string) => text.normalize("NFKC").toLowerCase()
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670ـ]/g, "").replace(/[أإآٱ]/g, "ا").trim();
  return districts.filter(item => normalize(item.name_ar).includes(normalize(query)) ||
    normalize(item.name_en ?? "").includes(normalize(query)));
}
