import { request } from "@/shared/api/client";
import { invalidResponseError } from "@/shared/api/errors";

// One answer on one suggestion card: liked it or passed.
export type VoteAnswer = {
  plan_item_id: string;
  liked: boolean;
};

// How far the group is; who liked what stays private.
export type VoteProgress = {
  items_count: number;
  members_count: number;
  completed_count: number;
};

// My answers so far, read again after a reload (BE-19). status is the outing's stage, such as "voting".
export type MyVotes = VoteProgress & {
  outing_id: string;
  status: string;
  votes: VoteAnswer[];
  answered_count: number;
};

// What saving one answer returns; voting_complete is true when this answer ended voting for everyone.
export type SavedVote = VoteProgress &
  VoteAnswer & {
    voting_complete: boolean;
    status: string;
  };

// Save one answer. The server keeps one answer per card, so sending it again changes it instead of adding a vote.
export async function saveVote(outingId: string, token: string, answer: VoteAnswer): Promise<SavedVote> {
  const saved = await request<SavedVote>("POST", `/outings/${encodeURIComponent(outingId)}/votes`, {
    token,
    // Only these two fields: the server rejects anything else.
    body: { plan_item_id: answer.plan_item_id, liked: answer.liked },
  });

  if (
    !saved ||
    !isAnswer(saved) ||
    typeof saved.voting_complete !== "boolean" ||
    typeof saved.status !== "string" ||
    !isProgress(saved)
  ) {
    throw invalidResponseError(200);
  }
  return saved;
}

// My saved answers and the group's progress, so a reload continues where it stopped.
export async function loadMyVotes(outingId: string, token: string): Promise<MyVotes> {
  const mine = await request<MyVotes>("GET", `/outings/${encodeURIComponent(outingId)}/votes`, { token });

  if (
    !mine ||
    typeof mine.outing_id !== "string" ||
    typeof mine.status !== "string" ||
    !Array.isArray(mine.votes) ||
    !mine.votes.every(isAnswer) ||
    !Number.isSafeInteger(mine.answered_count) ||
    !isProgress(mine)
  ) {
    throw invalidResponseError(200);
  }
  return mine;
}

function isAnswer(answer: VoteAnswer): boolean {
  return !!answer && typeof answer.plan_item_id === "string" && typeof answer.liked === "boolean";
}

function isProgress(progress: VoteProgress): boolean {
  return (
    Number.isSafeInteger(progress.items_count) &&
    Number.isSafeInteger(progress.members_count) &&
    Number.isSafeInteger(progress.completed_count)
  );
}
