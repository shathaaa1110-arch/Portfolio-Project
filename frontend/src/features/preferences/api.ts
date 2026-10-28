import { ApiError } from "@/shared/api/errors";
import { request } from "@/shared/api/client";

// Send the fields agreed with the backend team.
export type PreferencesPayload = {
  liked_cuisines: string[];
  allergies: string[];
  budget_min: number | null;
  budget_max: number | null;
  max_distance_km: number | null;
  seating_needs: string | null;
};

// Only the server decides whether preferences were saved.
export type AccountPreferences = PreferencesPayload & {
  is_saved: boolean;
};

// Read the signed-in account's saved answers.
export async function getAccountPreferences(token: string) {
  const result = await request<AccountPreferences>("GET", "/users/me/preferences", {
    token,
  });
  const list = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
  const amount = (value: unknown) => value === null || (typeof value === "number" && Number.isFinite(value));
  if (!result || typeof result.is_saved !== "boolean" ||
      !list(result.liked_cuisines) || !list(result.allergies) ||
      !amount(result.budget_min) || !amount(result.budget_max) || !amount(result.max_distance_km) ||
      !(result.seating_needs === null || typeof result.seating_needs === "string")) {
    throw new ApiError(200, "INVALID_RESPONSE", "Invalid preferences response");
  }
  return result;
}

// Save all answers; null clears an optional limit.
export async function saveAccountPreferences(
  token: string,
  preferences: PreferencesPayload,
) {
  const result = await request<{ message: string }>("PUT", "/users/me/preferences", {
    token,
    body: preferences,
  });
  if (!result || typeof result.message !== "string") {
    throw new ApiError(200, "INVALID_RESPONSE", "Invalid save response");
  }
  return result;
}
