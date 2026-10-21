# Thouq frontend — Expo SDK 57

[Arabic architecture and learning guide](../Docs/Frontend-Architecture.ar.md)

## Current implementation

The app opens on the public Home screen without requiring sign-in.

The bottom tabs contain Home, Saved, and Account. Saved and Account
currently show placeholder pages.

The Home screen includes:

- Arabic welcome text using the shared fonts and theme.
- A text field that searches restaurant names and cuisines.
- A session card with a disabled "Start session" button marked "Coming soon".
- A restaurant list with a general food illustration.
- Loading, empty, and error states.
- An optional retry button.

Search filters the restaurant data already passed to the list.
It does not send a search request to a server.

## Preview data and current limits

Development mode uses three sample restaurants from
`src/features/restaurants/mocks.ts`.

The food image is illustrative and does not represent a specific restaurant.

The preview retry action returns the list to its ready state.
It does not make a network request.

The current Home page passes an empty list outside development mode.
Real restaurant data still needs API integration.

Sign-up, login, and phone verification screens are implemented.
They use the shared API client and support explicit mock mode.

Session storage helpers and a sign-out button are available.
Connecting these to the Account page is still pending.

Real authentication and SMS testing, preferences, restaurant API
integration, and session creation remain pending.

## Install and run

Use Node.js and Git, plus an Expo Go version compatible with SDK 57
or the team's development build.

From the repository root:

```sh
npm --prefix frontend ci
cp -n frontend/.env.example frontend/.env.local
npm run check
cd frontend
npm start
```

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
| `src/application/ApplicationRoot.tsx` | Loads fonts and composes the root navigation |
| `src/application/MainTabs.tsx` | Defines the three bottom tabs |
| `src/application/HomePage.tsx` | Composes the Home header, search field, session preview, and list |
| `src/application/SavedPlaceholderPage.tsx` | Temporary Saved page |
| `src/application/AccountPlaceholderPage.tsx` | Temporary Account page |
| `src/features/restaurants/RestaurantList.tsx` | Filters and displays restaurants and list states |
| `src/features/restaurants/components/RestaurantCard.tsx` | Displays one restaurant |
| `src/features/restaurants/types.ts` | Defines the restaurant data used by the UI |
| `src/features/restaurants/mocks.ts` | Provides sample data for development |
| `src/features/restaurants/index.ts` | Exposes the feature's public exports |
| `src/features/auth` | Contains account screens, API calls, mocks and session helpers |
| `src/shared/components` | Contains reusable text, input, and button components |
| `src/shared/theme.ts` | Defines shared colors, fonts, sizes, and spacing |
| `assets/images/food-illustration.png` | General food image used by restaurant cards |
| `assets/fonts` | Contains the Arabic fonts and their license |

The shared HTTP client is implemented in `src/shared/api`.
Preferences are still planned.
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

For the current Home implementation:

- TypeScript and architecture checks passed.
- All seven architecture checker tests passed.
- Home was reviewed on the iPhone 17 Pro simulator.
- Searching by cuisine and part of a restaurant name returned matching cards.
- A search with no matches showed the empty message.
- Clearing the search restored all sample cards.

These checks do not confirm API integration, SMS, or production readiness.
The architecture tests do not replace UI interaction testing.

The existing lint script does not have a configured ESLint installation.
Do not report lint as passing.
