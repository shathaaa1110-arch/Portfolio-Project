import { registerMock } from "@/shared/api/mockTransport";
import { previewRestaurants } from "@/features/restaurants";

// Saved restaurant ids for mock mode only; they reset when the app reloads.
const savedIds = new Set<number>();

// Fake saved-restaurant responses for mock mode.
export function registerSavedRestaurantsMocks(): void {
  // Return the preview restaurants that are currently saved.
  registerMock("GET", "/users/me/saved-restaurants", () => {
    const restaurants = previewRestaurants.filter((restaurant) =>
      savedIds.has(restaurant.id),
    );
    return { restaurants, total: restaurants.length, limit: 20, offset: 0 };
  });

  // The mock registry matches exact paths, so each restaurant gets its own routes.
  for (const restaurant of previewRestaurants) {
    const path = `/users/me/saved-restaurants/${restaurant.id}`;
    registerMock("PUT", path, () => {
      savedIds.add(restaurant.id);
      return null;
    });
    registerMock("DELETE", path, () => {
      savedIds.delete(restaurant.id);
      return null;
    });
  }
}
