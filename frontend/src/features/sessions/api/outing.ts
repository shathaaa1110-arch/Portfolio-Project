import { request } from "@/shared/api/client";
import { invalidResponseError } from "@/shared/api/errors";
import type { PreferencesPayload, AccountPreferences } from "@/features/preferences";
import type { OutingStatus } from "./join";
import { checkRound, roundBody, roundQuery, validRoundIdentity, type RoundIdentity } from "./round";

export type Participant = {
  participant_id: string; name: string | null; attendance: string;
  preferences_done: boolean; is_organizer: boolean;
};
export type OutingState = RoundIdentity & {
  outing_id: string; name: string; status: OutingStatus; starts_at: string;
  district: string; invite_code: string;
  me: { participant_id: string; is_organizer: boolean };
  actions: string[];
  readiness: { ready_count: number; total_count: number };
  participants: Participant[];
  round_outcome?: "no_matches" | null;
};
export type OutingPreferences = AccountPreferences & { preferences_done: boolean; round_id?: string };
export type PlanItem = {
  plan_item_id: string; rank: number; match_score: number; reason: string;
  restaurant: {
    id: number; name_ar: string | null; name_en?: string | null; cuisines: string[];
    district: string | null; rating: number | null; maps_url: string | null;
    spend_low: number | null; spend_high: number | null; distance_km: number | null;
  };
};
export type OutingPlan = {
  round_id?: string;
  outing_id: string; status: OutingStatus; allergy_warning: string[];
  plan_items: PlanItem[]; message?: string;
};

const list = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string");
const numeric = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const optionalNumber = (v: unknown) => v === null || numeric(v);
const optionalText = (v: unknown) => v === null || typeof v === "string";
const path = (id: string) => `/outings/${encodeURIComponent(id)}`;

export async function getOuting(id: string, token: string): Promise<OutingState> {
  const s = await request<OutingState>("GET", path(id), { token });
  if (!s || s.outing_id !== id || typeof s.name !== "string" || !validRoundIdentity(s) ||
      (s.round_outcome != null && s.round_outcome !== "no_matches") ||
      !["invite", "preferences", "voting", "tiebreak", "result"].includes(s.status) ||
      typeof s.starts_at !== "string" || !Number.isFinite(Date.parse(s.starts_at)) || typeof s.district !== "string" || typeof s.invite_code !== "string" ||
      !s.me || typeof s.me.participant_id !== "string" || typeof s.me.is_organizer !== "boolean" ||
      !list(s.actions) || !s.readiness || !Number.isSafeInteger(s.readiness.ready_count) ||
      !Number.isSafeInteger(s.readiness.total_count) || !Array.isArray(s.participants) ||
      s.readiness.ready_count < 0 || s.readiness.total_count < s.readiness.ready_count ||
      s.participants.some(p => !p || typeof p.participant_id !== "string" || !optionalText(p.name) ||
        typeof p.attendance !== "string" || typeof p.preferences_done !== "boolean" || typeof p.is_organizer !== "boolean")) {
    throw invalidResponseError(200);
  }
  return s;
}

export async function startPreferences(id: string, token: string): Promise<void> {
  const result = await request<{ outing_id: string; status: string }>("POST", `${path(id)}/start-preferences`, { token });
  if (result?.outing_id !== id || result.status !== "preferences") throw invalidResponseError(200);
}

export async function getOutingPreferences(id: string, token: string, roundId?: string): Promise<OutingPreferences> {
  const p = await request<OutingPreferences>("GET", roundQuery(`${path(id)}/preferences`, roundId), { token });
  checkRound(p, roundId);
  if (!p || typeof p.is_saved !== "boolean" || typeof p.preferences_done !== "boolean" ||
      !list(p.liked_cuisines) || !list(p.allergies) || !optionalNumber(p.budget_min) ||
      !optionalNumber(p.budget_max) || !optionalNumber(p.max_distance_km) || !optionalText(p.seating_needs)) {
    throw invalidResponseError(200);
  }
  return p;
}

export async function saveOutingPreferences(id: string, token: string, body: PreferencesPayload, roundId?: string): Promise<void> {
  // PUT replaces every field: always send the full draft, including allergies and other limits.
  const r = await request<{ preferences_done: boolean; round_id?: string }>("PUT", `${path(id)}/preferences`, { token, body: roundId ? { ...body, round_id: roundId } : body });
  checkRound(r, roundId);
  if (!r || r.preferences_done !== false) throw invalidResponseError(200);
}

export async function markOutingReady(id: string, token: string, roundId?: string): Promise<void> {
  const r = await request<{ preferences_done: boolean; participant_id: string; round_id?: string }>("POST", `${path(id)}/preferences/ready`, { token, ...roundBody(roundId) });
  checkRound(r, roundId);
  if (!r || r.preferences_done !== true || typeof r.participant_id !== "string") throw invalidResponseError(200);
}

function checkedPlan(p: OutingPlan, id: string, roundId?: string): OutingPlan {
  checkRound(p, roundId);
  if (!p || p.outing_id !== id || !["preferences", "voting", "tiebreak", "result"].includes(p.status) ||
      !list(p.allergy_warning) || !Array.isArray(p.plan_items) || p.plan_items.some(item => {
        const r = item?.restaurant;
        return !item || typeof item.plan_item_id !== "string" || !numeric(item.rank) || !numeric(item.match_score) ||
          typeof item.reason !== "string" || !r || !numeric(r.id) || !optionalText(r.name_ar) ||
          !list(r.cuisines) || !optionalText(r.district) || !optionalText(r.maps_url) ||
          !optionalNumber(r.rating) || !optionalNumber(r.spend_low) || !optionalNumber(r.spend_high) || !optionalNumber(r.distance_km);
      })) throw invalidResponseError(200);
  return p;
}
export async function generatePlan(id: string, token: string, roundId?: string): Promise<OutingPlan> {
  return checkedPlan(await request<OutingPlan>("POST", `${path(id)}/start-voting`, { token, ...roundBody(roundId) }), id, roundId);
}
export async function getPlan(id: string, token: string, roundId?: string): Promise<OutingPlan> {
  return checkedPlan(await request<OutingPlan>("GET", roundQuery(`${path(id)}/plan`, roundId), { token }), id, roundId);
}
