import { useRef, useState } from "react";
import { router } from "expo-router";
import { completeIntro, OnboardingScreen } from "@/features/onboarding";

export function WelcomePage() {
  const pending = useRef(false);
  const [finishing, setFinishing] = useState(false);

  async function finish() {
    if (pending.current) return;
    pending.current = true;
    setFinishing(true);
    await completeIntro();
    router.replace("/");
  }

  return <OnboardingScreen onFinish={finish} finishing={finishing} />;
}
