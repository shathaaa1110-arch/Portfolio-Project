import { registerMock, registerMockPattern } from "@/shared/api/mockTransport";
import { ApiError } from "@/shared/api/errors";
import { cuisineFilters } from "./filterOptions";
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

// Fake list response for mock mode, using the preview restaurants.
export function registerRestaurantMocks(): void {
  // Small, explicit fixtures for combined filters, detail states and the preview flow.
  const catalog = previewRestaurants.map((item, index) => ({ ...item,
    name_en: null, cuisines: [(["saudi_gulf", "levant", "coffee_tea"] as const)[index]],
    district_id: index === 1 ? "preview-olaya" : "preview-malqa",
    district: index === 1 ? "حي العليا" : "حي الملقا",
    price_tier: 2, spend_low: index === 2 ? null : 40, spend_high: index === 2 ? null : 80,
    rating_count: index === 1 ? null : 120, summary: "وصف تجريبي لتوضيح طريقة عرض تفاصيل المطعم.",
    opening_hours: index === 2 ? null : { open_24h: index === 0, opens: "16:00", closes: "01:30", days_open: 7 },
    maps_url: "https://www.google.com/maps/search/?api=1&query=Riyadh", image_url: null,
  }));
  // Keep unfiltered and filtered previews on the same catalog.
  registerMockPattern("GET", /^\/restaurants(?:\?|$)/, path => {
    const params = new URL(path, "https://preview.invalid").searchParams;
    const search = (params.get("search") ?? "").trim();
    const cuisine = params.get("cuisine");
    const district = params.get("district_id");
    const offset = Number(params.get("offset") ?? 0);
    const items = catalog.filter(item => (!cuisine || item.cuisines.includes(cuisine as typeof item.cuisines[number])) &&
      (!district || item.district_id === district) && (!search || item.name_ar.includes(search) ||
        cuisineFilters.some(([key, label]) => item.cuisines.includes(key as typeof item.cuisines[number]) && label.includes(search))));
    return { restaurants: items.slice(offset, offset + 20), total: items.length, limit: 20, offset };
  });
  registerMock("GET", "/restaurants?limit=20&offset=0", () => ({ restaurants: catalog, total: catalog.length, limit: 20, offset: 0 }));
  registerMock("GET", "/restaurants?limit=20", () => ({ restaurants: catalog, total: catalog.length, limit: 20, offset: 0 }));
  registerMockPattern("GET", /^\/restaurants\/\d+$/, path => {
    const item = catalog.find(item => item.id === Number(path.split("/").at(-1)));
    if (!item) throw new ApiError(404, "RESTAURANT_NOT_FOUND", "Restaurant not found.");
    return item;
  });
}
