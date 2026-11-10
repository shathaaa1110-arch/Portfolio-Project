import { request } from "@/shared/api/client";
import { ApiError, invalidResponseError } from "@/shared/api/errors";
import { USE_MOCK } from "@/shared/api/config";

// Provisional FE-27 adapter. Keep off against the current single-round backend.
// Enable on a real server only after the contract in Docs/Session-Retry-Contract.md is agreed.
export const ROUND_RETRY_ENABLED = USE_MOCK || process.env.EXPO_PUBLIC_SESSION_ROUNDS_ENABLED === "true";
export type RoundIdentity = { round_id?: string; round_number?: number };
export type NewRound = { outing_id: string; status: "preferences"; round_id: string; round_number: number };

export function validRoundIdentity(value: RoundIdentity): boolean {
  return value.round_id === undefined && value.round_number === undefined ||
    typeof value.round_id === "string" && value.round_id.length > 0 &&
    Number.isSafeInteger(value.round_number) && value.round_number! > 0;
}
export function checkRound(value: { round_id?: string }, expected?: string): void {
  if (expected && value?.round_id !== expected) throw new ApiError(409, "STALE_ROUND", "Different round");
}
export function roundQuery(path: string, roundId?: string): string {
  return roundId ? `${path}?round_id=${encodeURIComponent(roundId)}` : path;
}
export function roundBody(roundId?: string): { body?: { round_id: string } } {
  return roundId ? { body: { round_id: roundId } } : {};
}
export async function retryRound(id: string, token: string, previous: Required<RoundIdentity>): Promise<NewRound> {
  if (!ROUND_RETRY_ENABLED) throw new ApiError(503, "ROUND_RETRY_UNAVAILABLE", "Retry not enabled");
  if (!validRoundIdentity(previous) || !previous.round_id) throw invalidResponseError(200);
  const next = await request<NewRound>("POST", `/outings/${encodeURIComponent(id)}/retry`, {
    token, body: { round_id: previous.round_id },
  });
  if (!next || next.outing_id !== id || next.status !== "preferences" || !validRoundIdentity(next) ||
      next.round_id === previous.round_id || next.round_number !== previous.round_number + 1) throw invalidResponseError(200);
  return next;
}
