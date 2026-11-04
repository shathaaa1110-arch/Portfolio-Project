import { request } from "@/shared/api/client";
import { ApiError, invalidResponseError } from "@/shared/api/errors";
import { RESTAURANT_SEARCH_ENABLED } from "@/shared/api/config";
import type { RestaurantSummary } from "./types";

// Ask for one page at a time, without a login token.
export const RESTAURANTS_PAGE_SIZE = 20;

export type RestaurantsResponse = {
  restaurants: RestaurantSummary[];
  total: number;
  limit: number;
  offset: number;
};

// offset is how many restaurants to skip: 0, 20, 40, ...
export async function getRestaurants(offset = 0, search = ""): Promise<RestaurantsResponse> {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("Restaurant offset must be a non-negative whole number.");
  }

  const query = search.trim();
  if (query && !RESTAURANT_SEARCH_ENABLED) {
    throw new ApiError(0, "SEARCH_UNAVAILABLE", "Global restaurant search is not available yet.");
  }
  const response = await request<RestaurantsResponse>(
    "GET",
    `/restaurants?limit=${RESTAURANTS_PAGE_SIZE}&offset=${offset}${query ? `&search=${encodeURIComponent(query)}` : ""}`,
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
