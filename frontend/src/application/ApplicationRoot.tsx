import { Stack } from "expo-router";
import { registerAuthMocks } from "@/features/auth";
import { USE_MOCK } from "@/shared/api/config";

// Mock responses are registered once, only when mock mode is on
if (USE_MOCK) {
  registerAuthMocks();
}

export function ApplicationRoot() {
  return <Stack screenOptions={{ headerShown: false }} />;
}