# Thouq frontend — Expo SDK 58

[Arabic architecture and learning guide](../Docs/Frontend-Architecture.ar.md)

## Current implementation

The app opens on the public Home screen without requiring sign-in.

The bottom tabs contain Home, Saved, and Account. Saved is a placeholder.
Account reads the session, shows the user name, and provides preferences and sign-out actions.

The Home screen includes:

- Arabic welcome text using the shared fonts and theme.
- A text field that searches restaurant names and cuisines.
- A session card with a disabled "Start session" button marked "Coming soon".
- A restaurant list with a general food illustration.
- Loading, empty, and error states.
- An optional retry button.

Search filters the restaurant data already passed to the list.
It does not send a search request to a server.

## Restaurant data and current limits

Home loads the first 20 restaurants from `GET /restaurants?limit=20`
through the shared API client. This endpoint does not need a login token.

`api.ts` sends the request.
`useRestaurants.ts` stores the results and manages loading, success,
error, and retry states.

The retry button sends a new request to the server.
A failed request shows an error; it does not switch to sample data.

Search filters only the restaurants already loaded on the device.
It does not search the full database. Pagination is not implemented yet.

The food image is illustrative and does not represent a specific restaurant.

Sample data remains in `mocks.ts`, but Home no longer uses it.
Home currently needs `EXPO_PUBLIC_USE_MOCK=false`; a restaurant response
has not been registered in the shared mock transport.

Sign-up, login, and phone verification screens are implemented.
They use the shared API client and support explicit mock mode.

Account uses the session helpers and the sign-out button.
The preferences button opens `/preferences` for a signed-in account.

End-to-end authentication and SMS testing for this combined frontend,
preferences, and session creation remain pending.

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
```

Restart Expo after changing these settings.

Commit `.env.example` so the team can copy the setup.
Keep `.env.local` on each developer's device; Git ignores it.

Press `i` in the Expo terminal to open the iOS Simulator.

For a phone, use the QR code with the compatible app on the same
Wi-Fi network, or follow the development build's connection method.

From `frontend`, `npm run web` starts the web app.

## Files

Paths below are relative to `frontend`.

| Path | Purpose |
|---|---|
| `src/app/(tabs)/_layout.tsx` | Opens the main tab layout |
| `src/app/(tabs)/index.tsx` | Opens Home at `/` |
| `src/app/(tabs)/saved.tsx` | Opens the Saved placeholder |
| `src/app/(tabs)/account.tsx` | Opens the Account placeholder |
| `src/app/sign-up.tsx` | Opens the sign-up screen |
| `src/app/preferences.tsx` | Opens account preferences |
| `src/application/ApplicationRoot.tsx` | Loads fonts and composes the root navigation |
| `src/application/MainTabs.tsx` | Defines the three bottom tabs |
| `src/application/HomePage.tsx` | Composes the Home header, search field, session preview, and list |
| `src/application/SavedPlaceholderPage.tsx` | Temporary Saved page |
| `src/application/AccountPlaceholderPage.tsx` | Shows the session, preferences entry, and sign-out |
| `src/features/restaurants/api.ts` | Requests the first 20 restaurants through the shared API client |
| `src/features/restaurants/useRestaurants.ts` | Stores restaurant data and manages loading, errors, and retry |
| `src/features/restaurants/RestaurantList.tsx` | Filters and displays restaurants and list states |
| `src/features/restaurants/components/RestaurantCard.tsx` | Displays one restaurant |
| `src/features/restaurants/types.ts` | Defines the restaurant data used by the UI |
| `src/features/restaurants/mocks.ts` | Provides sample data for development |
| `src/features/restaurants/index.ts` | Exposes the feature's public exports |
| `src/features/auth` | Contains account screens, API calls, mocks and session helpers |
| `src/features/preferences/AccountPreferencesScreen.tsx` | Loads the account, reads preferences, and handles save requests |
| `src/features/preferences/PreferencesForm.tsx` | Displays the six-step form without account or network calls |
| `src/features/preferences/model.ts` | Validates and converts form answers to and from the API shape |
| `src/features/preferences/api.ts` | Sends authenticated GET and PUT preference requests |
| `src/features/preferences/mocks.ts` | Provides one explicit in-memory test account |
| `src/features/preferences/components` | Cuisine, food, plate, seating, distance, allergy and progress UI |
| `src/features/preferences/index.ts` | Exposes the form, screen, draft type and mock registration |
| `assets/images/preferences` | Images for the preference choices and illustrations |
| `scripts/preferences.test.cjs` | Checks conversions, validation, API calls and mock read/write |
| `src/shared/components` | Contains reusable text, input, and button components |
| `src/shared/theme.ts` | Defines shared colors, fonts, sizes, and spacing |
| `assets/images/food-illustration.png` | General food image used by restaurant cards |
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

`npm run check` runs TypeScript, architecture boundary checks,
and seven tests for the architecture checker.

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

### Remaining checks

- Review the updated layout on a physical iPhone.
- Review narrow browser layouts and tab order.
- Configure and run ESLint.
- Test preference save/reload on a real device after backend #63 is deployed.
- Enable automatic post-login preferences routing only after that integration passes.

This review did not send an SMS or test a new login session.
It does not complete the shared development build task.

## Account preferences — 28 October 2026

The form covers cuisines, food types, seating, budget, distance, and allergies.
Existing cards, plate illustrations, and the six-step layout remain in use.
Next advances a step. The final button validates all answers and submits once.
A save request shows progress. Success appears only after a successful response.
A failed save keeps the form answers and allows retry.

`PreferencesForm` receives `initialValue`, `onSubmit` and `onExit`.
It can be reused by a future guest/session flow without account API calls.
That guest/session flow is not implemented here.

`AccountPreferencesScreen` loads the session via the public auth entrypoint,
then reads and writes `/users/me/preferences` using the shared client.
The `preferences -> auth` dependency is declared in `architecture.json`.
A failed initial load does not open an empty form that could overwrite saved data.

### Local testing

1. Sign out, then set `EXPO_PUBLIC_USE_MOCK=true` in `.env.local` and restart Expo.
2. Log in with the existing auth fixture: phone `0500000001`, code `123456`.
3. Open Account, then Preferences. Complete the steps and save.
4. Return to Account and reopen Preferences to read the saved test answers.
5. Sign out before restoring `EXPO_PUBLIC_USE_MOCK=false` and restarting Expo.

Mock preferences use one test account and live only in memory. Reload clears them.
No real SMS is sent in mock mode. Restaurants have no registered mock here, so
Home can show a request error while this explicit test mode is enabled.
The app never switches to mocks automatically after a real API failure.

Run these checks from the repository root:

```sh
npm run check
node --test frontend/scripts/preferences.test.cjs
git diff --check
git diff --cached --check
```

### Verification and remaining integration

The prepared candidate passed TypeScript, architecture checks, and focused
conversion/API/mock tests on 28 October 2026. UI save/reload tests on iPhone and
web still need to be run after applying the change.

On that date, the deployed GET `/users/me/preferences` and
GET `/users/me/recommendations?limit=10` returned 404. Neither path appeared in
the deployed OpenAPI document. This does not prove real persistence or personal
recommendations. Do not mark those flows complete based on the mock tests.

`PREFERENCES_READY` stays false in `auth/navigation.ts` until real integration
passes. The manual Account entry is available. Home remains public and general.

The contract stores an allergy list but has no explicit "no allergies" flag.
An empty list is therefore not presented as a confirmed no-allergy answer on
reload. See the [Arabic implementation and contract notes](../Docs/Preferences-Implementation.ar.md).
