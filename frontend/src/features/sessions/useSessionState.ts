import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { AppState } from "react-native";
import { ApiError } from "@/shared/api/errors";
import { loadOutingState, type OutingState } from "./api/state";
import { loadGuestPass, removeGuestPass } from "./guestPass";
import { outingToken } from "./identity";

// How often the waiting room asks for news while it is on screen.
export const POLL_MS = 4000;

// After these, asking again cannot help: this device has no access to the outing anymore.
const FINAL_ERRORS = ["NO_ACCESS", "INVALID_TOKEN", "TOKEN_EXPIRED", "NOT_A_PARTICIPANT", "OUTING_NOT_FOUND"];

// Keeps one outing's state fresh while its screen is focused and the app is in front.
// There is never more than one timer or one request at a time, however often the screen opens.
export function useSessionState(outingId: string, code: string) {
  const [state, setState] = useState<OutingState | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const pollNow = useRef(() => {});

  useFocusEffect(
    useCallback(() => {
      let focused = true;
      let busy = false;
      let askAgain = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let token: string | null = null;

      // Plan the next request, unless one is already planned or running.
      function schedule(delay: number) {
        if (focused && !busy && timer === undefined) {
          timer = setTimeout(poll, delay);
        }
      }

      async function poll() {
        timer = undefined;
        // In the background we stop here; coming back to the app starts again.
        if (!focused || AppState.currentState !== "active") {
          return;
        }
        busy = true;
        let final = false;
        try {
          token = token ?? (await outingToken(outingId, code));
          const next = await loadOutingState(outingId, token);
          if (focused) {
            setState(next);
            setError(null);
          }
        } catch (e) {
          const failure = e instanceof ApiError ? e : new ApiError(0, "UNKNOWN_ERROR", String(e));
          final = FINAL_ERRORS.includes(failure.code);
          if (final) {
            // Otherwise the join screen keeps sending the guest back here with the same refused pass.
            if (token !== null && (await loadGuestPass(code))?.guest_token === token) {
              await removeGuestPass(code);
            }
            // Read the token again if someone asks to retry later.
            token = null;
          }
          if (focused) {
            // A passing failure keeps the last good state on screen.
            setError(failure);
          }
        } finally {
          busy = false;
        }
        if (!final) {
          // Someone asked for news while this request was running, so ask again at once.
          schedule(askAgain ? 0 : POLL_MS);
        }
        askAgain = false;
      }

      // Ask now instead of waiting for the planned request; if one is running, ask right after it.
      pollNow.current = () => {
        if (busy) {
          askAgain = true;
          return;
        }
        clearTimeout(timer);
        timer = undefined;
        schedule(0);
      };
      const appState = AppState.addEventListener("change", (status) => {
        if (status === "active") {
          schedule(0);
        }
      });
      schedule(0);

      return () => {
        focused = false;
        clearTimeout(timer);
        timer = undefined;
        appState.remove();
        pollNow.current = () => {};
      };
    }, [outingId, code]),
  );

  // Ask right away, for example after the organizer starts the next stage.
  const refresh = useCallback(() => pollNow.current(), []);
  return { state, error, refresh };
}