import { useEffect } from "react";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { registerAuthMocks } from "@/features/auth";
import { USE_MOCK } from "@/shared/api/config";

// Mock responses are registered once, only when mock mode is on
if (USE_MOCK) {
  registerAuthMocks();
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