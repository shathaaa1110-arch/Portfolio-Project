// Display labels only: keep the API codes unchanged.
const cuisineLabels: Record<string, string> = {
  healthy_salads: "صحي وسلطات", specialty_coffee: "قهوة مختصة", bakery_pastry: "مخبوزات ومعجنات",
  japanese_sushi: "ياباني وسوشي", filipino: "فلبيني", shawarma: "شاورما",
  fried_chicken: "دجاج مقلي", ice_cream: "آيس كريم", other: "متنوع",
  saudi: "سعودي", saudi_gulf: "سعودي وخليجي", gulf: "خليجي",
  levant: "شامي", levantine: "شامي", lebanese: "لبناني", syrian: "سوري",
  american: "أمريكي", italian: "إيطالي", indian: "هندي", pakistani: "باكستاني",
  asian: "آسيوي", chinese: "صيني", japanese: "ياباني", korean: "كوري",
  thai: "تايلندي", turkish: "تركي", iranian: "إيراني", persian: "إيراني",
  turk_persian: "تركي وإيراني", egyptian: "مصري", arabic: "عربي",
  egypt_arab: "مصري وعربي", world: "عالمي", international: "عالمي",
  grill: "مشويات", grills: "مشويات", grill_bbq: "مشويات", bbq: "مشويات",
  sandwich: "ساندويتشات", sandwiches: "ساندويتشات", burgers: "برغر",
  burger: "برغر", pizza: "بيتزا", breakfast: "فطور", seafood: "بحري",
  healthy: "صحي", coffee: "قهوة", tea: "شاي", cafe: "مقهى",
  coffee_tea: "قهوة وشاي", desserts: "حلويات", sweets: "حلويات",
  bakery: "مخبوزات", juice: "عصيرات", juices: "عصيرات",
  gulf_khaleeji: "خليجي", yemeni: "يمني", mediterranean: "متوسطي",
  bangladeshi: "بنغلاديشي", afghan: "أفغاني", thai_vietnamese: "تايلندي وفيتنامي",
  indonesian_malaysian: "إندونيسي وماليزي", sudanese: "سوداني", moroccan: "مغربي",
  iraqi: "عراقي", mexican: "مكسيكي", french: "فرنسي", african: "أفريقي", ethiopian: "إثيوبي",
};

export function restaurantCuisineLabels(cuisines: string[]) {
  return [...new Set(cuisines.map((value) => {
    const text = value.trim();
    return cuisineLabels[text.toLowerCase()] ?? text;
  }).filter(Boolean))];
}

export function restaurantSubtitle(cuisines: string[], district: string) {
  const cuisine = restaurantCuisineLabels(cuisines)[0];
  return [cuisine, district?.trim()].filter(Boolean).join(" · ") || "مطعم";
}

export function restaurantDistance(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  if (value < 0.1) return "أقل من ١٠٠ م";
  return `${new Intl.NumberFormat("ar-SA-u-nu-arab", { maximumFractionDigits: 1 }).format(value)} كم`;
}

// الأرقام المشرقية للعرض فقط؛ قيمة التقييم الأصلية تبقى رقمًا.
export function restaurantRating(value: number | null): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 5) return null;
  return new Intl.NumberFormat("ar-SA-u-nu-arab", {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  }).format(value);
}

// Only display actual estimated spend bounds; never convert a price tier to SAR.
export function restaurantSpendRange(low: unknown, high: unknown): string | null {
  if (typeof low !== "number" || typeof high !== "number" ||
      !Number.isSafeInteger(low) || !Number.isSafeInteger(high) ||
      low <= 0 || high <= 0 || low > high) return null;
  const numbers = new Intl.NumberFormat("ar-SA-u-nu-arab");
  return `${numbers.format(low)}${low === high ? "" : `–${numbers.format(high)}`} ر.س`;
}
