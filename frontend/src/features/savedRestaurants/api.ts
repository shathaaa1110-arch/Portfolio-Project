import { request } from  "@/shared/api/client";
import type { RestaurantSummary } from "@/features/restaurants";

// Describe the saved restaurants response.
type SavedRestaurantsResponse = {
  restaurants: RestaurantSummary[];
  total: number;
  limit: number;
  offset: number;
};

// Load the signed-in user's saved restaurants (proposed route, #126).
export function getSavedRestaurants(token: string) {
    return request<SavedRestaurantsResponse>(
        "GET",
        "/users/me/saved-restaurants",
        { token },
    );
}

// Save a restaurant for the signed-in user; repeating it keeps one record.
export function saveRestaurant(token: string, restaurantId: number) {
    return request<null>(
        "PUT",
        `/users/me/saved-restaurants/${restaurantId}`,
        { token },
    );
}

// Remove a saved restaurant for the signed-in user.
export function removeSavedRestaurant(token: string, restaurantId: number) {
    return request<null>(
        "DELETE",
        `/users/me/saved-restaurants/${restaurantId}`,
        { token },
    );
}
