import { type Href, router } from "expo-router";

// New or incomplete accounts set preferences first; completed accounts go to Home
export function goToApp(hasSavedPreferences: boolean, returnTo?: string): void {
  // Only the in-app create route is allowed; never navigate to an arbitrary supplied URL.
  const destination = returnTo === "/sessions/new" ? returnTo : undefined;
  router.replace(hasSavedPreferences ? destination ?? "/" : {
    pathname: "/preferences",
    params: { onboarding: "1", ...(destination ? { returnTo: destination } : {}) },
  } as Href);
}

type VerifyParams = {
  phone: string;
  codeLength: number;
  waitSeconds?: number; // Seconds before resend is allowed; 60 after a new code
  name?: string; // Only from sign-up
  returnTo?: string;
};

// Opens the code screen after a code was sent
export function goToVerify({ phone, codeLength, waitSeconds = 60, name, returnTo }: VerifyParams): void {
  router.push({
    pathname: "/verify-phone",
    params: { phone, codeLength: String(codeLength), wait: String(waitSeconds), ...(name ? { name } : {}),
      ...(returnTo === "/sessions/new" ? { returnTo } : {}) },
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
