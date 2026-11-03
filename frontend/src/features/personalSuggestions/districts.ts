import { request } from "@/shared/api/client";
import { invalidResponseError } from "@/shared/api/errors";

export type District = { id: string; name_ar: string; name_en?: string };

// Accept a list or a named list; never derive IDs from district names or array positions.
export async function getDistricts(): Promise<District[]> {
  const response = await request<unknown>("GET", "/districts");
  const items = Array.isArray(response) ? response
    : response && typeof response === "object" && "districts" in response ? response.districts : null;
  if (!Array.isArray(items) || items.some(item => !item ||
      typeof item.id !== "string" || !item.id.trim() ||
      typeof item.name_ar !== "string" || !item.name_ar.trim() ||
      (item.name_en !== undefined && typeof item.name_en !== "string")) ||
      new Set(items.map(item => item.id)).size !== items.length) {
    throw invalidResponseError(200);
  }
  return items;
}

export function filterDistricts(districts: District[], query: string): District[] {
  const normalize = (text: string) => text.normalize("NFKC").toLowerCase()
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670ـ]/g, "").replace(/[أإآٱ]/g, "ا").trim();
  const term = normalize(query);
  return districts.filter(item => normalize(item.name_ar).includes(term) ||
    normalize(item.name_en ?? "").includes(term));
}
