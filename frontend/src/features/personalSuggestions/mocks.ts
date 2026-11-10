import { registerMock } from "@/shared/api/mockTransport";
import type { PersonalRestaurant } from "./types";

// Layout fixtures only; they do not run or replace the recommendation algorithm.
const examples: PersonalRestaurant[] = [
  { id: 101, name_ar: "مائدة الدار — تجريبي", cuisines: ["saudi"], district: "حي تجريبي", rating: 4.6,
    spend_low: 40, spend_high: 70, distance_km: 2, match_score: 92, reason: "بيانات معاينة لتجربة شكل الاقتراح." },
  { id: 102, name_ar: "بيت الباستا — تجريبي", cuisines: ["italian"], district: "حي تجريبي", rating: 4.4,
    spend_low: 55, spend_high: 90, distance_km: 3, match_score: 86, reason: "اقتراح تجريبي لتجربة القائمة وتفاصيل المطعم." },
  { id: 103, name_ar: "سفرة نجد — تجريبي", cuisines: ["saudi"], district: "حي تجريبي", rating: 4.3,
    spend_low: 35, spend_high: 65, distance_km: 4, match_score: 82, reason: "اقتراح تجريبي؛ ليس ناتجًا من خوارزمية حقيقية." },
];
export function registerPersonalSuggestionsMocks() {
  const response = () => ({ restaurants: examples.map(item => ({ ...item, cuisines: [...item.cuisines] })) });
  registerMock("GET", "/users/me/recommendations?limit=10", response);
  registerMock("GET", "/users/me/recommendations?limit=10&district_id=preview-malqa", response);
}
