import { useEffect, useState } from "react";
import { ApiError } from "@/shared/api/errors";
import { getRestaurantDetails } from "./api";
import type { RestaurantDetailsData } from "./types";

type State = { id: number; attempt: number; data: RestaurantDetailsData | null; status: "loading" | "ready" | "error" | "missing" };

export function useRestaurantDetails(id: number, visible: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    if (!visible) { setState(null); return; }
    let active = true;
    setState({ id, attempt, data: null, status: "loading" });
    getRestaurantDetails(id).then(data => {
      if (active) setState({ id, attempt, data, status: "ready" });
    }).catch(error => {
      if (active) setState({ id, attempt, data: null,
        status: error instanceof ApiError && error.code === "RESTAURANT_NOT_FOUND" ? "missing" : "error" });
    });
    return () => { active = false; };
  }, [id, visible, attempt]);
  const current = visible && state?.id === id && state.attempt === attempt ? state : null;
  return { data: current?.data ?? null, status: current?.status ?? "loading", retry: () => setAttempt(value => value + 1) };
}
