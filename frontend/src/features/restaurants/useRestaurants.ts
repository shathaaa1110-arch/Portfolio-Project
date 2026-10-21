import { useEffect, useState } from "react";
import { getRestaurants } from "./api";
import type { RestaurantSummary } from "./types";

type LoadStatus = "loading" | "ready" | "error";

export function useRestaurants() {
  // Store the restaurants returned by the server.
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);

  // Track the current request state.
  const [status, setStatus] = useState<LoadStatus>("loading");

  // Changing this value starts another request.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadRestaurants() {
      setStatus("loading");

      try {
        const response = await getRestaurants();

        // Ignore results from an old request.
        if (!active) return;

        setRestaurants(response.restaurants);
        setStatus("ready");
      } catch {
        if (active) {
          setStatus("error");
        }
      }
    }

    void loadRestaurants();

    // Ignore this request after cleanup.
    return () => {
      active = false;
    };
  }, [attempt]);

  function retry() {
    setAttempt((previous) => previous + 1);
  }

  return { restaurants, status, retry };
}