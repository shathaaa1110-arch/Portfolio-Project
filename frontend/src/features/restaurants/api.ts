import { request } from "@/shared/api/client";
import { ApiError, invalidResponseError } from "@/shared/api/errors";
import { RESTAURANT_SEARCH_ENABLED } from "@/shared/api/config";
import type { RestaurantDetailsData, RestaurantFilters, RestaurantSummary } from "./types";

// Ask for one page at a time, without a login token.
export const RESTAURANTS_PAGE_SIZE = 20;

export type RestaurantsResponse = {
  restaurants: RestaurantSummary[];
  total: number;
  limit: number;
  offset: number;
};

// offset is how many restaurants to skip: 0, 20, 40, ...
export async function getRestaurants(offset = 0, search = "", filters: RestaurantFilters = {}): Promise<RestaurantsResponse> {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("Restaurant offset must be a non-negative whole number.");
  }

  const query = search.trim();
  const cuisine = filters.cuisine?.trim() ?? "";
  const district = filters.districtId?.trim() ?? "";
  if ((query || cuisine || district) && !RESTAURANT_SEARCH_ENABLED) {
    throw new ApiError(0, "SEARCH_UNAVAILABLE", "Global restaurant search is not available yet.");
  }
  const response = await request<RestaurantsResponse>(
    "GET",
    `/restaurants?limit=${RESTAURANTS_PAGE_SIZE}&offset=${offset}${query ? `&search=${encodeURIComponent(query)}` : ""}${cuisine ? `&cuisine=${encodeURIComponent(cuisine)}` : ""}${district ? `&district_id=${encodeURIComponent(district)}` : ""}`,
  );

  // An invalid response is an error, not an empty list.
  if (
    !response ||
    !Array.isArray(response.restaurants) ||
    !Number.isSafeInteger(response.total) ||
    response.total < 0 ||
    response.limit !== RESTAURANTS_PAGE_SIZE ||
    response.offset !== offset ||
    response.restaurants.length > RESTAURANTS_PAGE_SIZE
  ) {
    throw invalidResponseError(200);
  }

  // Check the fields used for list keys, names and cuisine labels.
  const hasInvalidRestaurant = response.restaurants.some(
    (restaurant) =>
      !restaurant ||
      !Number.isSafeInteger(restaurant.id) ||
      typeof restaurant.name_ar !== "string" ||
      typeof restaurant.district !== "string" ||
      !Array.isArray(restaurant.cuisines) ||
      restaurant.cuisines.some((cuisine) => typeof cuisine !== "string"),
  );

  if (hasInvalidRestaurant) {
    throw invalidResponseError(200);
  }

  return response;
}

// Details remain public. A recommendation's private reason stays with its original flow.
export async function getRestaurantDetails(id: number): Promise<RestaurantDetailsData> {
  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) {
    throw new ApiError(404, "RESTAURANT_NOT_FOUND", "Invalid restaurant ID.");
  }
  const r = await request<RestaurantDetailsData>("GET", `/restaurants/${id}`);
  const nullableText = (value: unknown) => value === null || typeof value === "string";
  const nullableNumber = (value: unknown) => value === null || (typeof value === "number" && Number.isFinite(value));
  if (!r || r.id !== id || typeof r.name_ar !== "string" || !nullableText(r.name_en) ||
      typeof r.district !== "string" || !nullableText(r.district_id) ||
      !Array.isArray(r.cuisines) || r.cuisines.some(value => typeof value !== "string") ||
      !nullableNumber(r.rating) || !nullableNumber(r.rating_count) || !nullableNumber(r.price_tier) ||
      !nullableNumber(r.spend_low) || !nullableNumber(r.spend_high) || !nullableText(r.summary) ||
      (r.image_url !== undefined && !nullableText(r.image_url)) || (r.maps_url !== undefined && !nullableText(r.maps_url))) {
    throw invalidResponseError(200);
  }
  const h = r.opening_hours;
  const time = (value: unknown) => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (h !== null && (!h || typeof h.open_24h !== "boolean" ||
      (!h.open_24h && (!time(h.opens) || !time(h.closes))) ||
      !(h.days_open === null || (Number.isInteger(h.days_open) && h.days_open >= 0 && h.days_open <= 7)))) {
    throw invalidResponseError(200);
  }
  return r;
}
