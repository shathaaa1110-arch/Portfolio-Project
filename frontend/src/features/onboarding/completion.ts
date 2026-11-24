import { useEffect, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// This flag belongs to the installation, not to an account or its preferences.
const STORAGE_KEY = "thouq.onboarding.v1";
let completed: boolean | null = null;
let reading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(value: boolean) {
  completed = value;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function loadIntroCompletion(): Promise<void> {
  if (completed !== null) return;
  if (reading) return reading;
  reading = (async () => {
    let seen = false;
    try {
      const value = Platform.OS === "web"
        ? globalThis.localStorage?.getItem(STORAGE_KEY)
        : await SecureStore.getItemAsync(STORAGE_KEY);
      seen = value === "done";
    } catch {
      // Restricted browser storage still allows the introduction and browsing.
    }
    // A slow read must not undo a completion that happened in the meantime.
    if (completed === null) publish(seen);
  })();
  return reading;
}

export async function completeIntro(): Promise<void> {
  publish(true);
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(STORAGE_KEY, "done");
    else await SecureStore.setItemAsync(STORAGE_KEY, "done");
  } catch {
    // Keep completion in memory so a storage failure never traps people here.
    // It may show again after restarting when persistent storage is unavailable.
  }
}

export function useIntroCompleted(): boolean | null {
  const value = useSyncExternalStore(subscribe, () => completed, () => null);
  useEffect(() => { void loadIntroCompletion(); }, []);
  return value;
}
