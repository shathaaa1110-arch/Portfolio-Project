import { request } from "@/shared/api/client";
import { ApiError, invalidResponseError } from "@/shared/api/errors";
import type {
  PersonalRestaurant,
  PersonalRecommendationsResponse,
  RecommendationLocation,
} from "./types";

const RECOMMENDATIONS_LIMIT = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// نتحقق من البيانات التي ستستخدمها البطاقة قبل عرضها.
function isPersonalRestaurant(value: unknown): value is PersonalRestaurant {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "number" && Number.isSafeInteger(value.id) &&
    typeof value.name_ar === "string" &&
    Array.isArray(value.cuisines) &&
    value.cuisines.every((item) => typeof item === "string") &&
    typeof value.district === "string" &&
    (value.rating === null || isFiniteNumber(value.rating)) &&
    isFiniteNumber(value.match_score) &&
    value.match_score >= 0 && value.match_score <= 100 &&
    typeof value.reason === "string" &&
    (value.distance_km === null ||
      (isFiniteNumber(value.distance_km) && value.distance_km >= 0))
  );
}

export async function getPersonalRecommendations(
  token: string,
  location: RecommendationLocation = { kind: "none" },
): Promise<PersonalRecommendationsResponse> {
  if (!token.trim()) {
    throw new ApiError(401, "INVALID_TOKEN", "Sign in to get recommendations.");
  }

  const query = [`limit=${RECOMMENDATIONS_LIMIT}`];

  if (location.kind === "coordinates") {
    const { lat, lon } = location;

    if (
      !isFiniteNumber(lat) || lat < -90 || lat > 90 ||
      !isFiniteNumber(lon) || lon < -180 || lon > 180
    ) {
      throw new ApiError(0, "INVALID_LOCATION", "Invalid coordinates.");
    }

    query.push(`lat=${lat}`, `lon=${lon}`);
  } else if (location.kind === "district") {
    const districtId = location.districtId.trim();

    if (!districtId) {
      throw new ApiError(0, "INVALID_LOCATION", "Choose a district.");
    }

    query.push(`district_id=${encodeURIComponent(districtId)}`);
  }

  // الباك يقرأ تفضيلات صاحب الرمز؛ لا نرسل user_id أو إجابات النموذج.
  const response = await request<unknown>(
    "GET",
    `/users/me/recommendations?${query.join("&")}`,
    { token },
  );

  if (
    !isRecord(response) ||
    !Array.isArray(response.restaurants) ||
    response.restaurants.length > RECOMMENDATIONS_LIMIT ||
    !response.restaurants.every(isPersonalRestaurant)
  ) {
    throw invalidResponseError(200);
  }

  // القائمة الفارغة رد صحيح: لا توجد نتائج، وليست مشكلة اتصال.
  return { restaurants: response.restaurants };
}