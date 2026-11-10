import { ApiError } from "@/shared/api/errors";
import { mockTransport, registerMock } from "@/shared/api/mockTransport";
import type { AccountPreferences, PreferencesPayload } from "@/features/preferences";
import type { CreateSessionInput } from "./api/create";
import type { OutingPlan, OutingPreferences, OutingState, Participant } from "./api/outing";

const empty: AccountPreferences = { is_saved: false, liked_cuisines: [], allergies: [], budget_min: null,
  budget_max: null, max_distance_km: null, seating_needs: null };
let count = 0;

// Explicit development mode only. No production fallback and no automatic participant readiness.
export function registerSessionFlowMocks({ generationDelayMs = 3000 }: { generationDelayMs?: number } = {}) {
  registerMock("GET", "/districts", () => ({ districts: [
    { id: "preview-malqa", name_ar: "حي الملقا", name_en: "Al Malqa" },
    { id: "preview-olaya", name_ar: "حي العليا", name_en: "Al Olaya" },
  ] }));
  registerMock("POST", "/outings/session", async (raw, owner) => {
    const account = await mockTransport<{ name: string }>("GET", "/users/me", undefined, owner);
    const body = raw as CreateSessionInput;
    if (!body.name?.trim() || !body.starts_at || !body.district?.startsWith("preview-")) throw new ApiError(422, "VALIDATION_ERROR", "Invalid session");
    const id = `preview-outing-${++count}`;
    const code = `T${String(count + 222).slice(-3)}`;
    const people = new Map<string, Participant>();
    const preferences = new Map<string, OutingPreferences>();
    const organizer: Participant = { participant_id: `${id}-owner`, name: account.name, attendance: "confirmed", preferences_done: false, is_organizer: true };
    people.set(owner!, organizer);
    const saved = await mockTransport<AccountPreferences>("GET", "/users/me/preferences", undefined, owner);
    preferences.set(owner!, { ...saved, liked_cuisines: [...saved.liked_cuisines], allergies: [...saved.allergies], preferences_done: false });
    let status: OutingState["status"] = "invite";
    let roundNumber = 1;
    let roundId = `${id}-round-${roundNumber}`;
    let noMatches = false;
    const retries = new Map<string, { outing_id: string; status: "preferences"; round_id: string; round_number: number }>();
    let plan: OutingPlan | null = null;
    const votes = new Map<string, Map<string, boolean>>();
    const base = `/outings/${id}`;
    const requireRound = (raw: unknown) => {
      const supplied = (raw as { round_id?: string } | undefined)?.round_id;
      // Legacy first-round mock callers remain supported. After retry every write must be scoped.
      if (supplied !== undefined ? supplied !== roundId : roundNumber > 1) throw new ApiError(409, "STALE_ROUND", "Old round");
    };
    const reads = new Map<string, (raw: unknown, token?: string) => unknown>();
    const bindRoundReads = () => {
      const expected = roundId;
      for (const [suffix, handler] of reads) registerMock("GET", `${base}${suffix}?round_id=${encodeURIComponent(expected)}`, (raw, token) => {
        if (roundId !== expected) throw new ApiError(409, "STALE_ROUND", "Old round");
        return handler(raw, token);
      });
    };
    const read = (suffix: string, handler: (raw: unknown, token?: string) => unknown) => {
      reads.set(suffix, handler); registerMock("GET", `${base}${suffix}`, handler); bindRoundReads();
    };
    const me = (token?: string) => {
      const p = people.get(token ?? "");
      if (!p) throw new ApiError(403, "NOT_A_PARTICIPANT", "Join first");
      return p;
    };
    const isOrganizer = (token?: string) => { if (!me(token).is_organizer) throw new ApiError(403, "ORGANIZER_ONLY", "Organizer only"); };
    const counts = () => ({ ready_count: [...people.values()].filter(p => p.preferences_done).length, total_count: people.size });
    registerMock("GET", base, (_, token) => {
      const p = me(token), readiness = counts();
      return { outing_id: id, name: body.name, starts_at: body.starts_at, district: body.district, invite_code: code,
        round_id: roundId, round_number: roundNumber, round_outcome: noMatches ? "no_matches" : null,
        status, tiebreak_ends_at: null, me: { participant_id: p.participant_id, is_organizer: p.is_organizer }, readiness,
        participants: [...people.values()].map(p => ({ ...p })),
        actions: !p.is_organizer ? [] : status === "invite" ? ["start_preferences"] :
          status === "preferences" ? [...(readiness.ready_count === readiness.total_count ? ["start_voting"] : []), ...(noMatches ? ["retry_round"] : [])] :
            status === "voting" ? ["end_voting"] : status === "result" ? ["retry_round"] : [] };
    });
    registerMock("POST", `${base}/start-preferences`, (_, token) => {
      isOrganizer(token);
      if (!["invite", "preferences"].includes(status)) throw new ApiError(409, "INVALID_STATUS_TRANSITION", "Already started");
      status = "preferences"; return { outing_id: id, status };
    });
    read("/preferences", (_, token) => {
      const p = me(token);
      return { ...(preferences.get(token!) ?? empty), preferences_done: p.preferences_done, round_id: roundId };
    });
    registerMock("PUT", `${base}/preferences`, (raw, token) => {
      const p = me(token);
      requireRound(raw);
      if (!["invite", "preferences"].includes(status)) throw new ApiError(409, "PREFERENCES_LOCKED", "Locked");
      const value = raw as PreferencesPayload;
      preferences.set(token!, { liked_cuisines: [...value.liked_cuisines], allergies: [...value.allergies], budget_min: value.budget_min,
        budget_max: value.budget_max, max_distance_km: value.max_distance_km, seating_needs: value.seating_needs, is_saved: true, preferences_done: false });
      p.preferences_done = false;
      return { message: "outing preferences updated", preferences_done: false, round_id: roundId, ...counts() };
    });
    registerMock("POST", `${base}/preferences/ready`, (raw, token) => {
      const p = me(token);
      requireRound(raw);
      if (status !== "preferences") throw new ApiError(409, "PREFERENCES_NOT_OPEN", "Not open");
      if (!preferences.get(token!)?.is_saved) throw new ApiError(409, "PREFERENCES_REQUIRED", "Save first");
      p.preferences_done = true;
      const readiness = counts();
      return { participant_id: p.participant_id, preferences_done: true, round_id: roundId, ...readiness,
        all_ready: readiness.ready_count === readiness.total_count, outing_status: status };
    });
    registerMock("POST", `${base}/start-voting`, async (raw, token) => {
      isOrganizer(token);
      requireRound(raw);
      if (plan) return plan;
      if (status !== "preferences") throw new ApiError(409, "INVALID_STATUS_TRANSITION", "Not open");
      if (counts().ready_count < people.size) throw new ApiError(409, "NOT_EVERYONE_READY", "Wait");
      const all = [...preferences.values()];
      if (all.some(p => p.budget_max !== null && p.budget_max < 20)) {
        noMatches = true;
        return { outing_id: id, status, round_id: roundId, plan_items: [], allergy_warning: [], message: "No restaurant matches everyone's conditions." };
      }
      // Simulated latency only in the explicitly enabled development transport.
      const requestedRound = roundId;
      if (generationDelayMs > 0) await new Promise(resolve => setTimeout(resolve, generationDelayMs));
      if (requestedRound !== roundId) throw new ApiError(409, "STALE_ROUND", "Old generation");
      if (plan) return plan;
      noMatches = false;
      status = "voting";
      const samples = [
        { name: "مائدة الدار", cuisine: "grill_bbq", reason: "مشاوي تناسب الأذواق اللي اخترتوها.", low: 40, high: 80 },
        { name: "بيت الباستا", cuisine: "italian", reason: "اختيار إيطالي ضمن ميزانية الجلسة.", low: 45, high: 85 },
        { name: "سفرة نجد", cuisine: "saudi", reason: "نكهات محلية وجلسات مناسبة للجمعة.", low: 35, high: 75 },
      ];
      plan = { outing_id: id, status, round_id: roundId, allergy_warning: [...new Set(all.flatMap(p => p.allergies))],
        plan_items: samples.map((sample, i) => ({
          plan_item_id: `${roundId}-plan-${i + 1}`, rank: i + 1, match_score: 85 - i * 5, reason: sample.reason,
          restaurant: { id: i + 1, name_ar: sample.name, cuisines: [sample.cuisine], district: "حي الملقا",
            spend_low: sample.low, spend_high: sample.high, rating: 4.5 - i * 0.1, maps_url: null, distance_km: 2.1 + i },
        })) };
      return plan;
    });
    read("/plan", (_, token) => {
      me(token); if (!plan) throw new ApiError(409, "PLAN_NOT_READY", "Not ready"); return plan;
    });
    const progress = () => ({ items_count: plan?.plan_items.length ?? 0, members_count: people.size,
      completed_count: [...people.keys()].filter(key => !!plan?.plan_items.length && plan.plan_items.every(i => votes.get(key)?.has(i.plan_item_id))).length });
    const result = () => {
      const tally = (plan?.plan_items ?? []).map(item => ({ ...item,
        likes: [...votes.values()].filter(v => v.get(item.plan_item_id) === true).length,
        passes: [...votes.values()].filter(v => v.get(item.plan_item_id) === false).length,
      })).sort((a, b) => b.likes - a.likes || a.rank - b.rank || a.plan_item_id.localeCompare(b.plan_item_id));
      const top = tally[0]?.likes > 0 ? tally[0] : null;
      const support = (likes: number) => Math.round(likes * 100 / people.size);
      return { outing_id: id, status, round_id: roundId, winner: top ? { plan_item_id: top.plan_item_id, restaurant_id: top.restaurant.id,
        name_ar: top.restaurant.name_ar, name_en: top.restaurant.name_en ?? null, district: top.restaurant.district,
        maps_url: top.restaurant.maps_url, likes: top.likes, support_percentage: support(top.likes) } : null,
        no_winner_reason: top ? null : tally.some(t => t.passes > 0) ? "everyone_passed" : "no_votes",
        members_count: people.size, completed_count: progress().completed_count,
        items: tally.map(t => ({ plan_item_id: t.plan_item_id, rank: t.rank, restaurant_id: t.restaurant.id,
          name_ar: t.restaurant.name_ar, likes: t.likes, support_percentage: support(t.likes) })) };
    };
    read("/votes", (_, token) => {
      me(token);
      const mine = [...(votes.get(token!) ?? new Map<string, boolean>())].map(([plan_item_id, liked]) => ({ plan_item_id, liked }));
      return { outing_id: id, status, round_id: roundId, votes: mine, answered_count: mine.length, ...progress() };
    });
    registerMock("POST", `${base}/votes`, (raw, token) => {
      me(token);
      requireRound(raw);
      if (status !== "voting") throw new ApiError(409, "VOTING_NOT_OPEN", "Closed");
      const answer = raw as { plan_item_id: string; liked: boolean };
      if (!plan?.plan_items.some(i => i.plan_item_id === answer.plan_item_id)) throw new ApiError(404, "PLAN_ITEM_NOT_FOUND", "Unknown suggestion");
      if (typeof answer.liked !== "boolean" || Object.keys(answer).some(k => !["plan_item_id", "liked", "round_id"].includes(k))) throw new ApiError(422, "VALIDATION_ERROR", "Invalid vote");
      if (!votes.has(token!)) votes.set(token!, new Map());
      votes.get(token!)!.set(answer.plan_item_id, answer.liked);
      const complete = progress().completed_count === people.size;
      if (complete) { status = "result"; plan.status = status; }
      return { ...answer, status, round_id: roundId, voting_complete: complete, ...progress() };
    });
    registerMock("POST", `${base}/end-voting`, (raw, token) => {
      isOrganizer(token);
      requireRound(raw);
      if (!["voting", "result"].includes(status)) throw new ApiError(409, "VOTING_NOT_OPEN", "Not open");
      status = "result"; if (plan) plan.status = status; return result();
    });
    read("/result", (_, token) => {
      me(token);
      if (status !== "result") throw new ApiError(409, "RESULT_NOT_READY", "Not ready");
      return result();
    });
    registerMock("POST", `${base}/retry`, (raw, token) => {
      isOrganizer(token);
      const previous = (raw as { round_id?: string })?.round_id;
      const already = previous && retries.get(previous);
      if (already && already.round_id === roundId) return already;
      requireRound(raw);
      if (!previous || (status !== "result" && !noMatches)) throw new ApiError(409, "ROUND_RETRY_NOT_ALLOWED", "Finish first");
      roundNumber++; roundId = `${id}-round-${roundNumber}`;
      status = "preferences"; plan = null; noMatches = false; votes.clear();
      for (const p of people.values()) p.preferences_done = false;
      for (const p of preferences.values()) p.preferences_done = false;
      bindRoundReads();
      const next = { outing_id: id, status: "preferences" as const, round_id: roundId, round_number: roundNumber };
      retries.set(previous, next);
      return next;
    });
    registerMock("GET", `/outings/by-code/${code}`, () => ({ outing_id: id, name: body.name, organizer_name: account.name,
      starts_at: body.starts_at, district: body.district, status, participants_count: people.size,
      can_join: ["invite", "preferences"].includes(status) && people.size < 8,
      join_blocked_reason: !["invite", "preferences"].includes(status) ? "JOINING_CLOSED" : people.size >= 8 ? "OUTING_FULL" : null }));
    const join = async (guest: boolean, raw: unknown, token?: string) => {
      if (!guest && token && people.has(token)) return { outing_id: id, participant_id: me(token).participant_id, status };
      if (!["invite", "preferences"].includes(status)) throw new ApiError(409, "JOINING_CLOSED", "Closed");
      if (people.size >= 8) throw new ApiError(409, "OUTING_FULL", "Full");
      const member = guest ? null : await mockTransport<{ name: string }>("GET", "/users/me", undefined, token);
      const participant_id = `${id}-person-${people.size}`;
      const key = guest ? `preview-guest-${participant_id}` : token!;
      people.set(key, { participant_id, name: guest ? (raw as { guest_name: string }).guest_name : member!.name,
        attendance: "confirmed", preferences_done: false, is_organizer: false });
      if (!guest) preferences.set(key, { ...await mockTransport<AccountPreferences>("GET", "/users/me/preferences", undefined, token), preferences_done: false });
      return { outing_id: id, participant_id, status, ...(guest ? { guest_token: key } : {}) };
    };
    registerMock("POST", `/outings/${code}/join`, (raw, token) => join(false, raw, token));
    registerMock("POST", `/outings/${code}/join-guest`, raw => join(true, raw));
    return { outing_id: id, invite_code: code, invite_url: null, status };
  });
}
