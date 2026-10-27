import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { isSessionEnded, loadSession } from "@/features/auth";
import type { RestaurantSummary } from "@/features/restaurants";
import { getSavedRestaurants } from "./api";

type LoadStatus = "loading" | "ready" | "error" | "signed-out";

export function useSavedRestaurants() {
  // Store the saved restaurants returned by the server.
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);

  // Track the current request state.
  const [status, setStatus] = useState<LoadStatus>("loading");

  // Changing this value starts another request.
  const [attempt, setAttempt] = useState(0);

  // Reload every time the tab opens, because saving on Home changes the list.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadSaved() {
        setStatus("loading");

        // Saved restaurants belong to an account.
        const session = await loadSession();
        if (!active) return;
        if (!session) {
          setStatus("signed-out");
          return;
        }

        try {
          const response = await getSavedRestaurants(session.token);
          if (!active) return;
          setRestaurants(response.restaurants);
          setStatus("ready");
        } catch (error) {
          if (active) {
            setStatus(isSessionEnded(error) ? "signed-out" : "error");
          }
        }
      }

      void loadSaved();

      // Ignore this request after the tab loses focus.
      return () => {
        active = false;
      };
    }, [attempt]),
  );

  function retry() {
    setAttempt((previous) => previous + 1);
  }

  return { restaurants, status, retry };
}