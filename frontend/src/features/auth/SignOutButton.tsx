import { router } from "expo-router";
import { useState } from "react";
import { AppButton } from "@/shared/components";
import { signOut } from "./session";

// A working logout action that any screen can show, without needing the full My account screen
export function SignOutButton() {
  const [loading, setLoading] = useState(false);

  async function handlePress() {
    setLoading(true);
    await signOut();
    // The contract says: after logout, open the sign-up screen
    router.replace("/sign-up");
  }

  return <AppButton title={loading ? "جاري الخروج..." : "تسجيل الخروج"} disabled={loading} onPress={handlePress} />;
}