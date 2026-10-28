import { registerMock } from "@/shared/api/mockTransport";
import type { AccountPreferences, PreferencesPayload } from "./api";

// One test account in memory; reset when the app reloads.
let saved: AccountPreferences = {
  is_saved: false, liked_cuisines: [], allergies: [],
  budget_min: null, budget_max: null, max_distance_km: null,
  seating_needs: null,
};

export function registerPreferencesMocks() {
  registerMock("GET", "/users/me/preferences", () => ({
    ...saved,
    liked_cuisines: [...saved.liked_cuisines],
    allergies: [...saved.allergies],
  }));
  registerMock("PUT", "/users/me/preferences", body => {
    const value = body as PreferencesPayload;
    saved = {
      ...value, is_saved: true,
      liked_cuisines: [...value.liked_cuisines],
      allergies: [...value.allergies],
    };
    return { message: "preferences saved" };
  });
}
