import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { isSessionEnded, loadSession } from "@/features/auth";
import type { RestaurantSummary } from "@/features/restaurants";
import { getSavedRestaurants } from "./api";

type LoadStatus = "loading" | "ready" | "error" | "signed-out";

export function useSavedRestaurants() {
  // Saved restaurants of the current account only.
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);

  // Track the current request state.
  const [status, setStatus] = useState<LoadStatus>("loading");

  // Changing this value starts another request.
  const [attempt, setAttempt] = useState(0);

  // The account whose list is in memory, so another account never sees it.
  const ownerToken = useRef<string | null>(null);

  // Reload every time the tab opens, because another tab may have changed the list.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      // Forget the list and show a state instead of old data.
      function clearList(nextStatus: LoadStatus) {
        ownerToken.current = null;
        setRestaurants([]);
        setStatus(nextStatus);
      }

      async function loadSaved() {
        const session = await loadSession();
        if (!active) return;
        if (!session) {
          clearList("signed-out");
          return;
        }

        // A different account starts from an empty list.
        if (session.token !== ownerToken.current) {
          ownerToken.current = session.token;
          setRestaurants([]);
          setStatus("loading");
        }

        try {
          const response = await getSavedRestaurants(session.token);
          if (!active) return;
          setRestaurants(response.restaurants);
          setStatus("ready");
        } catch (error) {
          if (active) {
            clearList(isSessionEnded(error) ? "signed-out" : "error");
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

  // True only for restaurants saved by the current account.
  function isSaved(restaurantId: number) {
    return restaurants.some((restaurant) => restaurant.id === restaurantId);
  }

  // Update the list right after the server confirms a save or removal.
  function setSaved(restaurant: RestaurantSummary, saved: boolean) {
    setRestaurants((previous) => {
      const others = previous.filter((item) => item.id !== restaurant.id);
      return saved ? [...others, restaurant] : others;
    });
  }

  return { restaurants, status, retry, isSaved, setSaved };
}