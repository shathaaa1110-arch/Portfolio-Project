import { type Href, router } from "expo-router";

// New or incomplete accounts set preferences first; completed accounts go to Home
export function goToApp(hasSavedPreferences: boolean): void {
  router.replace(hasSavedPreferences ? "/" : {
    pathname: "/preferences",
    params: { onboarding: "1" },
  } as Href);
}

type VerifyParams = {
  phone: string;
  codeLength: number;
  waitSeconds?: number; // Seconds before resend is allowed; 60 after a new code
  name?: string; // Only from sign-up
};

// Opens the code screen after a code was sent
export function goToVerify({ phone, codeLength, waitSeconds = 60, name }: VerifyParams): void {
  router.push({
    pathname: "/verify-phone",
    params: { phone, codeLength: String(codeLength), wait: String(waitSeconds), ...(name ? { name } : {}) },
  });
}

// Back to public browsing; sign-up and login never block opening the app
export function goBack(): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/");
  }
}
