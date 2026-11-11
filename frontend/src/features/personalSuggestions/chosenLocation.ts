import type { RecommendationLocation } from "./types";

// The place the person chose on Home, and the words shown for it.
export type ChosenLocation = { location: RecommendationLocation; label: string };

// Kept in memory only, for one account. A new Home, for example after saving preferences,
// shows the same place, and another account on this device never sees it.
let kept: { owner: string | null; chosen: ChosenLocation } | null = null;

// Keep the choice for this account; choosing no place forgets it.
export function rememberLocation(owner: string | null, chosen: ChosenLocation): void {
  kept = chosen.location.kind === "none" ? null : { owner, chosen };
}

// The place this account chose earlier, or null.
export function recallLocation(owner: string | null): ChosenLocation | null {
  return kept !== null && kept.owner === owner ? kept.chosen : null;
}
