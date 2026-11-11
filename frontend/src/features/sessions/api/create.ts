import { request } from "@/shared/api/client";
import { invalidResponseError } from "@/shared/api/errors";

export type CreateSessionInput = { name: string; starts_at: string; district: string };
export type CreatedSession = {
  outing_id: string;
  invite_code: string;
  invite_url: string | null;
  status: "invite";
};

export async function createSession(token: string, body: CreateSessionInput): Promise<CreatedSession> {
  const result = await request<CreatedSession>("POST", "/outings/session", { token, body });
  if (!result || !result.outing_id || !result.invite_code || result.status !== "invite" ||
      typeof result.outing_id !== "string" || typeof result.invite_code !== "string" ||
      !(result.invite_url === null || typeof result.invite_url === "string")) {
    throw invalidResponseError(201);
  }
  return result;
}
