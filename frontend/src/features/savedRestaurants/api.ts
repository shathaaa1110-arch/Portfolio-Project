import { request } from  "@/shared/api/client";
import type { RestaurantSummary } from "@/features/restaurants"

// Describe the saved restaurants response.
type SavedRestaurantsResponse = {
  restaurants: RestaurantSummary[];
  total: number;
  limit: number;
  offset: number;
};
