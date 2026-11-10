import { request } from "@/shared/api/client";
import { ApiError, invalidResponseError } from "@/shared/api/errors";

export type VotingResult = {
  round_id?: string;
  outing_id: string; status: "result";
  winner: null | {
    plan_item_id: string; restaurant_id: number; name_ar: string | null; name_en: string | null;
    district: string | null; maps_url: string | null; likes: number; support_percentage: number;
  };
  no_winner_reason: "everyone_passed" | "no_votes" | null;
  members_count: number; completed_count: number;
  items: { plan_item_id: string; rank: number; restaurant_id: number; name_ar: string | null; likes: number; support_percentage: number }[];
};

const count = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0;
const text = (v: unknown) => v === null || typeof v === "string";
const support = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
function checked(r: VotingResult, id: string, roundId?: string): VotingResult {
  if (roundId && r?.round_id !== roundId) throw new ApiError(409, "STALE_ROUND", "Different round");
  if (!r || r.outing_id !== id || r.status !== "result" || !count(r.members_count) || !count(r.completed_count) ||
      r.completed_count > r.members_count || !Array.isArray(r.items) || r.items.some(i => !i ||
        typeof i.plan_item_id !== "string" || !count(i.restaurant_id) || !count(i.rank) || !text(i.name_ar) ||
        !count(i.likes) || i.likes > r.members_count || !support(i.support_percentage)) ||
      (r.winner === null ? !["everyone_passed", "no_votes"].includes(r.no_winner_reason ?? "") :
        !r.winner || r.no_winner_reason !== null || typeof r.winner.plan_item_id !== "string" ||
        !count(r.winner.restaurant_id) || !text(r.winner.name_ar) || !text(r.winner.name_en) ||
        !text(r.winner.district) || !text(r.winner.maps_url) || !count(r.winner.likes) ||
        r.winner.likes === 0 || r.winner.likes > r.members_count || !support(r.winner.support_percentage))) {
    throw invalidResponseError(200);
  }
  return r;
}
export async function getVotingResult(id: string, token: string, roundId?: string): Promise<VotingResult> {
  return checked(await request<VotingResult>("GET", `/outings/${encodeURIComponent(id)}/result${roundId ? `?round_id=${encodeURIComponent(roundId)}` : ""}`, { token }), id, roundId);
}
export async function endVoting(id: string, token: string, roundId?: string): Promise<VotingResult> {
  return checked(await request<VotingResult>("POST", `/outings/${encodeURIComponent(id)}/end-voting`, { token, ...(roundId ? { body: { round_id: roundId } } : {}) }), id, roundId);
}
