import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/shared/api/errors";
import { loadMyVotes, saveVote, type VoteProgress } from "./api";

// How long to wait before sending unsaved answers again after a failure that may pass.
export const RETRY_MS = 3000;

// "open": answers are taken now. "closed": voting has not started or has ended.
export type VotingStage = "loading" | "open" | "closed" | "error";

// Worth trying again later: no connection, a busy server, or too many requests.
function mayPass(error: ApiError): boolean {
  return error.status === 0 || error.status === 429 || error.status >= 500;
}

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, "UNKNOWN_ERROR", String(error));
}

const noPass = () => new ApiError(401, "NO_ACCESS", "This device has no pass for this outing.");

// This person's answers on the outing's cards, kept in step with the server.
// Opening restores the saved answers, so a reload continues where it stopped. Answers are saved
// in order, one request at a time, and a newer answer on the same card replaces the unsent one.
// Unsaved answers are sent again after a failure; the server keeps one answer per card, so this
// never counts a vote twice. The caller gives the token reader, so members and guests both work.
export function useVoting(outingId: string, itemIds: string[], getToken: () => Promise<string | null>, roundId?: string) {
  const [stage, setStage] = useState<VotingStage>("loading");
  const [outingStatus, setOutingStatus] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<VoteProgress | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [unsaved, setUnsaved] = useState(0);
  const [attempt, setAttempt] = useState(0);

  const readToken = useRef(getToken);
  readToken.current = getToken;
  const pending = useRef(new Map<string, boolean>());
  const sending = useRef<number | null>(null);
  const epoch = useRef(0);
  const open = useRef(false);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Read the saved answers when the screen opens, and again after reload().
  useEffect(() => {
    let current = true;
    epoch.current++;
    pending.current.clear(); sending.current = null;
    alive.current = true;
    open.current = false;
    setAnswers({}); setProgress(null); setOutingStatus(null); setUnsaved(0); setError(null);
    setStage("loading");
    (async () => {
      try {
        const token = await readToken.current();
        if (!current) return;
        if (token === null) throw noPass();
        const mine = await loadMyVotes(outingId, token, roundId);
        if (!current) return;
        setAnswers(Object.fromEntries(mine.votes.map((vote) => [vote.plan_item_id, vote.liked])));
        setProgress(mine);
        setOutingStatus(mine.status);
        setError(null);
        open.current = mine.status === "voting";
        setStage(open.current ? "open" : "closed");
      } catch (e) {
        if (!current) return;
        setError(asApiError(e));
        setStage("error");
      }
    })();
    return () => {
      current = false;
      alive.current = false;
      epoch.current++; open.current = false; pending.current.clear();
      clearTimeout(timer.current);
      timer.current = undefined;
    };
  }, [outingId, roundId, attempt]);

  // Send the oldest unsaved answer, then the next; stop on a failure and try again a little later.
  const flush = useCallback(async () => {
    if (sending.current !== null || !open.current || !alive.current) return;
    const requestEpoch = epoch.current;
    const first = pending.current.entries().next();
    if (first.done) return;
    const [planItemId, liked] = first.value;
    sending.current = requestEpoch;
    try {
      const token = await readToken.current();
      if (!alive.current || requestEpoch !== epoch.current) return;
      if (token === null) throw noPass();
      const saved = await saveVote(outingId, token, { plan_item_id: planItemId, liked }, roundId);
      if (!alive.current || requestEpoch !== epoch.current) return;
      // A newer answer on this card may have come while this one was on its way; that one stays queued.
      if (pending.current.get(planItemId) === liked) pending.current.delete(planItemId);
      setProgress(saved);
      setError(null);
      if (saved.voting_complete || saved.status !== "voting") {
        open.current = false;
        pending.current.clear();
        setOutingStatus(saved.status);
        setStage("closed");
      }
    } catch (e) {
      if (!alive.current || requestEpoch !== epoch.current) return;
      const failure = asApiError(e);
      setError(failure);
      if (mayPass(failure)) {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = undefined;
          void flush();
        }, RETRY_MS);
        return;
      }
      if (failure.code === "PLAN_ITEM_NOT_FOUND") {
        // This card is not in the outing's plan; drop it and keep the others.
        pending.current.delete(planItemId);
      } else {
        open.current = false;
        pending.current.clear();
        if (failure.code === "VOTING_NOT_OPEN") {
          // Voting ended meanwhile: read the answers the server kept.
          setAttempt((value) => value + 1);
        } else {
          setStage("error");
        }
      }
    } finally {
      if (requestEpoch === epoch.current) {
        sending.current = null;
        if (alive.current) setUnsaved(pending.current.size);
      }
    }
    if (alive.current && requestEpoch === epoch.current && open.current && timer.current === undefined) void flush();
  }, [outingId, roundId]);

  // Take an answer: it shows at once and is saved in the background. Returns false when voting is not open.
  const answer = useCallback(
    (planItemId: string, liked: boolean) => {
      if (!open.current) return false;
      setAnswers((previous) => ({ ...previous, [planItemId]: liked }));
      pending.current.set(planItemId, liked);
      setUnsaved(pending.current.size);
      void flush();
      return true;
    },
    [flush],
  );

  // Read everything again, for example after a failed first load.
  const reload = useCallback(() => {
    pending.current.clear();
    setUnsaved(0);
    setAttempt((value) => value + 1);
  }, []);

  // The first card without an answer is where to continue; after the last card it is null.
  const next = itemIds.find((id) => answers[id] === undefined) ?? null;
  const finished = itemIds.length > 0 && next === null;
  const offline = unsaved > 0 && error !== null && mayPass(error);
  return { stage, outingStatus, answers, next, finished, progress, unsaved, offline, error, answer, reload };
}
