import { useEffect } from "react";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";

import { registerAuthMocks } from "@/features/auth";
import { registerPreferencesMocks } from "@/features/preferences";
import { registerRestaurantMocks } from "@/features/restaurants";
import { registerSavedRestaurantsMocks } from "@/features/savedRestaurants";
import { USE_MOCK } from "@/shared/api/config";

// Register test responses only when mock mode is enabled.
if (USE_MOCK) {
  registerAuthMocks();
  registerPreferencesMocks();
  registerRestaurantMocks();
  registerSavedRestaurantsMocks();
}

void SplashScreen.preventAutoHideAsync();

export function ApplicationRoot() {
  const [fontsLoaded, fontError] = useFonts({
    "IBMPlexSansArabic-Regular": require(
      "../../assets/fonts/IBMPlexSansArabic-Regular.ttf"
    ),
    "IBMPlexSansArabic-Bold": require(
      "../../assets/fonts/IBMPlexSansArabic-Bold.ttf"
    ),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}