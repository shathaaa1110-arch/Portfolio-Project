import { request } from "@/shared/api/client";
import type { RestaurantSummary } from "./types";

// Describe the response returned by the API.
type RestaurantsResponse = {
  restaurants: RestaurantSummary[];
  total: number;
  limit: number;
  offset: number;
};

// Load the first 20 restaurants without a login token.
export function getRestaurants() {
  return request<RestaurantsResponse>(
    "GET",
    "/restaurants?limit=20",
  );
}