import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/shared/api/errors";
import { getPersonalRecommendations } from "./api";
import type { PersonalRestaurant, RecommendationLocation } from "./types";

type RecommendationRequest = {
  token: string;
  location: RecommendationLocation;
  attempt: number;
};

type LoadState = {
  request: RecommendationRequest | null;
  status: "idle" | "loading" | "ready" | "error";
  restaurants: PersonalRestaurant[];
  error: ApiError | null;
};

const initialState: LoadState = {
  request: null,
  status: "idle",
  restaurants: [],
  error: null,
};

export function usePersonalRecommendations(
  token: string | null,
  location: RecommendationLocation | null,
) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>(initialState);

  // نعتمد على قيم الموقع، حتى لا يتكرر الطلب مع كل رسم للشاشة.
  const kind = location?.kind ?? null;
  const lat = location?.kind === "coordinates" ? location.lat : 0;
  const lon = location?.kind === "coordinates" ? location.lon : 0;
  const districtId = location?.kind === "district" ? location.districtId : "";

  const request = useMemo<RecommendationRequest | null>(() => {
    if (!token || kind === null) return null;

    const selectedLocation: RecommendationLocation =
      kind === "coordinates"
        ? { kind, lat, lon }
        : kind === "district"
          ? { kind, districtId }
          : { kind: "none" };

    return { token, location: selectedLocation, attempt };
  }, [token, kind, lat, lon, districtId, attempt]);

  useEffect(() => {
    if (!request) {
      setState(initialState);
      return;
    }

    let active = true;
    setState({ ...initialState, request, status: "loading" });

    async function load(current: RecommendationRequest) {
      try {
        const response = await getPersonalRecommendations(
          current.token,
          current.location,
        );

        if (!active) return;

        setState({
          request: current,
          status: "ready",
          restaurants: response.restaurants,
          error: null,
        });
      } catch (error) {
        if (!active) return;

        setState({
          ...initialState,
          request: current,
          status: "error",
          error: error instanceof ApiError
            ? error
            : new ApiError(0, "UNKNOWN_ERROR", "Could not load recommendations."),
        });
      }
    }

    void load(request);

    // تجاهل الرد المتأخر إذا تغير الطلب أو أُزيلت الشاشة.
    return () => { active = false; };
  }, [request]);

  // لا نظهر نتائج حساب أو موقع سابق، حتى قبل تشغيل effect الجديد.
  const currentState: LoadState = !request
    ? initialState
    : state.request === request
      ? state
      : { ...initialState, request, status: "loading" };

  function refresh() {
    if (!request || currentState.status === "loading") return;
    setAttempt((previous) => previous + 1);
  }

  return {
    restaurants: currentState.restaurants,
    status: currentState.status,
    error: currentState.error,
    refresh,
    retry: refresh,
  };
}