import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { loadSession } from "@/features/auth";
import {
  getAccountPreferences,
  type AccountPreferences,
} from "@/features/preferences";
import { ApiError } from "@/shared/api/errors";

type HomePreferencesState =
  | { status: "checking" }
  | { status: "signed-out" }
  | { status: "needs-preferences" }
  | {
      status: "ready";
      token: string;
      preferences: AccountPreferences;
    }
  | { status: "error"; error: ApiError };

export function useHomePreferences(refreshKey = 0) {
  const [state, setState] = useState<HomePreferencesState>({
    status: "checking",
  });
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setState({ status: "checking" });

      async function load() {
        try {
          const session = await loadSession();
          if (!active) return;

          // الزائر يتصفح المطاعم العامة دون طلب تفضيلات حساب.
          if (!session) {
            setState({ status: "signed-out" });
            return;
          }

          // نقرأ آخر تفضيلات محفوظة من الخادم.
          const preferences = await getAccountPreferences(session.token);
          if (!active) return;

          if (!preferences.is_saved) {
            setState({ status: "needs-preferences" });
            return;
          }

          setState({
            status: "ready",
            token: session.token,
            preferences,
          });
        } catch (error) {
          if (!active) return;

          if (error instanceof ApiError && error.status === 401) {
            setState({ status: "signed-out" });
          } else {
            setState({
              status: "error",
              error:
                error instanceof ApiError
                  ? error
                  : new ApiError(
                      0,
                      "UNKNOWN_ERROR",
                      "Could not load preferences.",
                    ),
            });
          }
        }
      }

      void load();

      // نتجاهل الطلب القديم عند مغادرة الرئيسية.
      return () => {
        active = false;
        setState({ status: "checking" });
      };
    }, [attempt, refreshKey]),
  );

  function reload() {
    if (state.status === "checking") return;
    setAttempt((previous) => previous + 1);
  }

  return { state, reload };
}
