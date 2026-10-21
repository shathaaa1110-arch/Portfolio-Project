import type { RestaurantSummary } from "./types";

// Preview data only. This is not a real restaurant.
export const previewRestaurant: RestaurantSummary = {
  id: 1,
  name_ar: "مطعم تجريبي — للمعاينة فقط",
  cuisines: ["سعودي", "مشاوي"],
  district: "حي تجريبي",
  rating: 4.5,
};
// Sample restaurants for checking the list layout.
export const previewRestaurants: RestaurantSummary[] = [
  previewRestaurant,
  {
    id: 2,
    name_ar: "مطعم تجريبي ٢",
    cuisines: ["شامي"],
    district: "حي تجريبي آخر",
    rating: null,
  },
  {
    id: 3,
    name_ar: "مطعم تجريبي باسم طويل لاختبار التفاف النص",
    cuisines: [],
    district: "",
    rating: 4.2,
  },
];