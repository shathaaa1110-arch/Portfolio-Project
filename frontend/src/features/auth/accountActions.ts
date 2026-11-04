// The states of the My account page
export type LoadStatus = "loading" | "ready" | "error" | "signed-out";

// Which actions My account shows in each state.
// Sign-out stays available when the profile fails to load, so a user without a connection can still leave
export function accountActions(status: LoadStatus) {
  return {
    canSignIn: status === "signed-out",
    canRetry: status === "error",
    canSignOut: status === "ready" || status === "error",
  };
}
