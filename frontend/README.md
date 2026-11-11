# Thouq frontend — Expo SDK 58

[Arabic architecture and learning guide](../Docs/Frontend-Architecture.ar.md)

## Current implementation — 10 November 2026

Home is public and includes the approved hero, greeting/location, search,
Today's suggestion, and restaurant cards. Create session opens the selected watercolor/paper design and the backend-supported invitation → per-person preferences/readiness → suggestions flow.
Saved uses Fahad's `savedRestaurants` feature. The current Account composition
shows the account, preferences, and sign-out.

Home requests one page of 20 restaurants with `limit/offset`, without a token.
Next/Previous sit at the list footer; pull-to-refresh reloads the current page.
Failures keep the last successful page with retry. Initial failures display an
error state. There is no automatic fallback to mock data.

Search uses server-side name/cuisine filtering before pagination, a 350 ms typing
delay and stale-response protection. Public read-only requests on 10 November
verified a filtered total of 3,730 for “سعودي”, 33,784 unfiltered, and zero for an
unmatched query. Search is enabled by default; set
`EXPO_PUBLIC_RESTAURANT_SEARCH_ENABLED=false` only for older servers.
The selected Home action turns green. “ألقى مطعم” scrolls to the list and
“أخطّط طلعة” selects the outing action before opening creation.

Cards use illustrative category photos, Eastern Arabic numbers, and map links.
Details open in a separate bottom sheet, with one back action. Price/distance
appear only when valid values exist; opening details makes no extra API call.
Missing price/hours are labelled unavailable; no values are invented. Voting lives in the session screen.

GPS is requested only from the location chooser. A district alternative uses
server IDs from `GET /districts`; browsing remains possible without location.
Personal suggestions require saved account preferences and a valid API reply.
Today's choice displays one restaurant. Remaining personal recommendations are
regular list rows under “مطاعم أخرى على ذوقك”, followed by the public restaurant
section. One request supplies both sections; search hides personal rows. Failed services do not become fabricated recommendations.

The six-step preferences flow reads and writes `/users/me/preferences`.
After login, incomplete accounts enter preferences; completed accounts enter
Home. Successful saving updates the same session's completion flag and returns
to the existing Home using `dismissTo`, retaining its selected location. The
account-scoped location memory also survives a Home remount during this app run;
it is cleared for a different account and is not permanent GPS storage. Failed saves keep the answers.
Initial load failures offer retry/browse rather than an empty replacement form.

See the current [Sprint 2–3 frontend delivery and remaining dependencies](../Docs/Sprint-2-3-Frontend.ar.md).
Older dated verification notes below describe those historical revisions, not the current backend.

### Direct sessions

The organizer supplies a name, Riyadh date/time and a district ID. The current
backend uses the district center, not a midpoint of participants' locations.
No GPS is requested in this flow. Sign-in retains the creation draft in memory;
new accounts still complete onboarding before returning.

Invite/join, a five-second focused state refresh, full outing preference saves,
explicit Ready and organizer-triggered suggestions use existing backend routes.
Account defaults remain unchanged. A compact session flow now includes an actual-request
Haila generation screen, one-card voting, review, early-end confirmation and the server result.
The voting API and ordered retry hook from #161 are integrated with their commit history.
The shared paper, watercolor hero, typography and proposed Haila character keep
invite, join, readiness and voting consistent with the create screen. Fixed actions remain
visible on small screens; participant details open in a sheet.
See the [Arabic walkthrough and exact file ownership](../Docs/Session-Flow.ar.md).

## Install and run

Use Node.js and Git, plus an Expo Go version compatible with SDK 58
or the team's development build.

From the repository root:

```sh
npm --prefix frontend ci
cp -n frontend/.env.example frontend/.env.local
npm run check
cd frontend
npm start
```
The example file points to the shared API server.

If `frontend/.env.local` already exists, `cp -n` keeps it unchanged.
Open that file and make sure it contains:

```dotenv
EXPO_PUBLIC_API_URL=https://thouq-api.onrender.com/api/v1
EXPO_PUBLIC_USE_MOCK=false
EXPO_PUBLIC_RESTAURANT_SEARCH_ENABLED=false
```

Restart Expo after changing these settings.

Commit `.env.example` so the team can copy the setup.
Keep `.env.local` on each developer's device; Git ignores it.

Press `i` in the Expo terminal to open the iOS Simulator.

The personal iOS bundle identifier was removed from the shared app config.
Agree on a team identifier and signing setup before producing a shared native build.
Simulator/Expo Go success does not complete issue #58.

For a phone, use the QR code with the compatible app on the same
Wi-Fi network, or follow the development build's connection method.

From `frontend`, `npm run web` starts the web app.

## Files

Paths below are relative to `frontend`.

| Path | Purpose |
|---|---|
| `src/app/(tabs)/_layout.tsx` | Opens the main tab layout |
| `src/app/(tabs)/index.tsx` | Opens Home at `/` |
| `src/app/(tabs)/saved.tsx` | Opens the Saved screen |
| `src/app/(tabs)/account.tsx` | Opens the My account screen |
| `src/app/sign-up.tsx` | Opens the sign-up screen |
| `src/app/preferences.tsx` | Opens account preferences |
| `src/app/sessions/new.tsx` | Opens session creation |
| `src/app/sessions/[id].tsx` | Opens invitation, readiness or suggestions based on server state |
| `src/app/join/[code].tsx` | Supports backend invite links ending in /join/CODE |
| `src/features/sessions` | Session screens, editors, shared visuals, identity, API wrappers and explicit mocks |
| `src/application/ApplicationRoot.tsx` | Loads fonts and composes the root navigation |
| `src/application/MainTabs.tsx` | Defines the three bottom tabs |
| `src/application/HomePage.tsx` | Composes Home, search, location, recommendations, and paginated list |
| `src/application/SavedPlaceholderPage.tsx` | Composes the Saved feature |
| `src/features/auth/AccountScreen.tsx` | Shows the name and phone from the server, links to preferences and Saved, and signs out |
| `src/features/auth/accountActions.ts` | Decides which actions My account shows; sign-out stays when loading fails |
| `src/features/restaurants/api.ts` | Requests and validates one page of 20 restaurants at the supplied offset |
| `src/features/restaurants/useRestaurants.ts` | Stores restaurant data and manages loading, errors, and retry |
| `src/features/restaurants/RestaurantList.tsx` | Displays server results, cards, and list states without page-local filtering |
| `src/features/restaurants/components/RestaurantCard.tsx` | Displays a compact restaurant card and opens its separate details sheet |
| `src/features/restaurants/components/RestaurantDetails.tsx` | Shows restaurant details in a sliding modal without reflowing the list |
| `src/features/restaurants/components/RestaurantMapLink.tsx` | Validates and opens the supplied external map URL |
| `src/features/restaurants/presentation.ts` | Formats cuisine labels, Eastern Arabic numbers, and valid optional spend bounds |
| `src/features/restaurants/components/RestaurantPagination.tsx` | Shows page navigation and the counter at the list footer |
| `src/features/restaurants/types.ts` | Defines the restaurant data used by the UI |
| `src/features/restaurants/mocks.ts` | Provides sample data for development |
| `src/features/restaurants/index.ts` | Exposes the feature's public exports |
| `src/features/personalSuggestions` | District picker, API validation, recommendation state and stale-response isolation |
| `src/application/useHomePreferences.ts` | Refreshes saved preferences when Home focuses or refreshes |
| `src/application/HomeTodayPick.tsx` | Composes the featured and remaining personal recommendations |
| `src/features/auth` | Contains account screens, API calls, mocks and session helpers |
| `src/features/preferences/AccountPreferencesScreen.tsx` | Loads the account, reads preferences, and handles save requests |
| `src/features/preferences/PreferencesForm.tsx` | Displays the six-step form without account or network calls |
| `src/features/preferences/errors.ts` | Maps API field and request failures to Arabic messages |
| `src/features/preferences/model.ts` | Validates and converts form answers to and from the API shape |
| `src/features/preferences/api.ts` | Sends authenticated GET and PUT preference requests |
| `src/features/preferences/mocks.ts` | Provides one explicit in-memory test account |
| `src/features/preferences/components` | Cuisine, food, plate, seating, distance, allergy and progress UI |
| `src/features/preferences/index.ts` | Exposes the form, screen, draft type and mock registration |
| `assets/images/preferences` | Images for the preference choices and illustrations |
| `assets/images/auth` | Decorative photo for the sign-up and login screens |
| `src/features/auth/AuthHero.tsx` | Shows the photo and app name on sign-up and login |
| `scripts/preferences-flow.test.cjs` | Tests routing, form steps, session ownership and save/retry |
| `scripts/discovery-flow.test.cjs` | Tests hook races, page recovery, recommendation rendering, search visibility and the Home discovery action |
| `scripts/home-recommendations.test.cjs` | Tests recommendation and district request contracts |
| `scripts/preferences.test.cjs` | Checks conversions, validation, API calls and mock read/write |
| `scripts/auth.test.cjs` | Checks sign-out without a connection, My account actions and the mock account after reload |
| `scripts/restaurants-api.test.cjs` | Checks page requests, invalid replies, error preservation and mock compatibility; included in npm run check |
| `src/shared/components` | Contains reusable text, input, and button components |
| `src/shared/layout.ts` | Maps layout direction to the supported native/web style |
| `src/shared/theme.ts` | Defines shared colors, fonts, sizes, and spacing |
| `assets/images/food-illustration.png` | Fallback food illustration when no category image matches |
| `assets/fonts` | Contains the Arabic fonts and their license |

The shared HTTP client is implemented in `src/shared/api`.
The preferences frontend is implemented against the agreed contract.
Real persistence still depends on backend #63; see the status below.
See the [API setup guide](../Docs/Frontend-API-Usage.ar.md).

Import another feature through its public `index.ts`.
Declare implemented features and their required dependencies
in the root `architecture.json`.

Keep restaurant-specific behavior inside `features/restaurants`.
Shared tools must not import features.

Native styling uses `StyleSheet` and theme values.

## Validation

Run from the repository root:

```sh
npm run check
git diff --check
```

`npm run check` runs TypeScript, architecture boundaries and 91 tests:
7 architecture, 10 restaurant/API/presentation, 18 preference, 18 discovery,
24 session/join and 14 voting tests. Four account tests are run separately via
`node --test scripts/auth.test.cjs`. Component tests use real React state/effects
with stubbed services. Native devices and live multi-participant writes still
need acceptance testing; no phone build is included in this change.

### Web review — 24 October 2026

Tested locally at `http://127.0.0.1:8081/` using the shared API.

- TypeScript, architecture checks, and all seven tests passed.
- `git diff --check` passed.
- Home displayed real restaurant data without signing in.
- Saved and Account tabs opened.
- Navigation to sign-up and login worked.
- Returning to Home worked.
- The unsupported `direction` style warning disappeared.
- Bottom tab labels displayed without clipping.
- One restaurant request failed. Retry restored the list.
  The original request failure was not diagnosed.

Home uses platform-specific RTL styles for the search and session card.
Web tab labels have more vertical space; native tab sizing is unchanged.

### Current verification — 2 November 2026

- TypeScript, architecture boundaries, and all 47 tests passed.
- Production web export passed and generated 12 static routes outside the repository.
- iPhone 17 Pro Simulator / iOS 26.4 displayed real public restaurants.
  Details opened as a bottom sheet and returned to the same list position.
- A 402 px web viewport displayed Home, next/previous pages, the details sheet,
  and the server-search unavailable state.
- An isolated mock web copy exercised new-account routing, all six preference
  steps, Arabic budget/distance validation, Other allergy validation, successful
  save, return to Home, and reopening the stored test choices.
- These checks do not establish persistence on Neon, live personalized results,
  a physical-iPhone/Android pass, or the shared iPhone development build.

### Preferences assets and behavior

The 46 preference PNGs now total 6,374,647 bytes, down from 88,276,877 bytes
across 47 originals. Card/plate images are at most 600 px, and the budget/distance
illustrations are 1000 px wide. Names, PNG format, and transparency remain.
Unused `grills-plate.png` was removed. Only the current form step mounts its images.

The form accepts Arabic/Persian digits, budget and distance no-limit choices,
and up to 20 allergy values of 50 characters each. There is no business budget
ceiling added by this UI. Unknown saved allergy/seating text is preserved.
The current contract stores allergy arrays, not an explicit unanswered/null
state; an empty array is not displayed as confirmed no allergies on reload.

The draft survives step navigation and request failures while mounted. It is
not persisted across leaving/reloading the app or restarting login.
See the [Arabic preference guide](../Docs/Preferences-Implementation.ar.md).

### Isolated local testing

Use a separate test copy, edit its `.env.local`, and restart Expo. Do not rely
only on shell environment overrides: Expo may still read the file values.

```dotenv
EXPO_PUBLIC_USE_MOCK=true
EXPO_PUBLIC_API_URL=http://127.0.0.1:1/api/v1
EXPO_PUBLIC_RESTAURANT_SEARCH_ENABLED=false
```

The unreachable local API URL prevents accidental production requests from
this copy. The mock verification code is `123456`. Mock preferences are for
one account and live in memory; reload clears them. Home uses three explicit
mock restaurant fixtures. The real app keeps `EXPO_PUBLIC_USE_MOCK=false`.

Join-by-code test codes: `TEST` opens a session, `MAXX` is full, `SHUT` is
closed, and any other code is invalid. A guest who joined is remembered per
code, so use a private window to join again as a new guest.
The mock account keeps its name and phone after reload because its token carries
them. An unknown or older mock token requires signing in again. This does not
make mock preferences persistent; those still live in memory. No real SMS is
sent in mock mode, and the app never switches to mocks after a real API failure.

Run these checks from the repository root after resolving the merge:

```sh
npm run check
node --test frontend/scripts/auth.test.cjs
git diff --check
git diff --cached --check
```

### Account merge verification — 4 November 2026

After reconciling the account PR with deployment, `npm run check` passed
(TypeScript, architecture boundaries and 49 tests), and the four account tests
passed separately. Documentation keeps the current Home and preferences flow
and describes AccountScreen. This check did not repeat device or live API tests.

### Session flow verification — 6 November 2026

Session tests cover creation validation/deduplication, sign-in return, role and
readiness gates, full preference replacement, account isolation, guest bearer
tokens, blocked-storage recovery, and locks after suggestion generation. Local
web QA exercised edits, the sign-in round trip, invitation, all six preference
steps, Ready, and suggestions with explicit mock data; no SMS or live writes.
See `../design-qa.md` for visual evidence and viewport checks.

Mock-created sessions live in memory; a reload clears them. Create a new session
for full-flow preview. The older TEST/MAXX/SHUT fixtures cover join preview only.
Production export is a build check, not proof that the live API supports the flow.

### Remaining integration and device checks

Publish and validate preferences, recommendations, districts, and global search
with the backend owners. Repeat save/reopen/account-isolation tests against
the real API before accepting the end-to-end issues. Search's feature flag
must remain false until server filtering is verified.

Review the final flow on a physical iPhone and Android. Issue #58 additionally
needs a shared app identifier, Apple signing, and installation on the required
team devices. ESLint setup is separate from the currently passing check suite.
No database or ERD changes are included.

### Session refresh verification — 10 November 2026

The current session-voting tests cover one-card navigation, editing answers, pending-save
and role gates for early ending, automatic closure, private guest identity, no-vote/all-pass
results, malformed responses, and a two-participant mock round. Generation tests hold the
request pending and exercise errors and empty results; there is no production minimum delay.
The explicit mock simulates three seconds for this request so the Haila state is inspectable.

The live OpenAPI exposes start-voting, GET/POST votes, end-voting and result. This was a
read-only schema check, not an authenticated multi-device end-to-end test. Existing DB
constraints and the backend settlement transaction are reused, with no migration in this UI change.
