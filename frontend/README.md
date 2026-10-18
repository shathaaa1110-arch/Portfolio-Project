# Thouq frontend — Expo SDK 57

[شرح عربي مفصل للتقسيم وملفات شذى وفهد](../Docs/Frontend-Architecture.ar.md)

## Current implementation

The legacy sign-up form has been split into a feature screen, reusable UI components and theme values. This form is temporary and is not the approved delivery design: #21 will build new account/login screens, replacing it. Its verification button still shows the original placeholder alert; it does not send SMS. Login, preferences, Home and the API client remain tracked implementation tasks. Design previews under `Docs/mockups/` are separate from this app.

## Install and run

Install Node.js and Git. Use the SDK 57-compatible Expo Go app or the team's iPhone development build (#58). From the repository root:

```sh
npm --prefix frontend ci
npm run check
cd frontend
npm start
```

Use the QR code with the compatible app on the same Wi-Fi network, or use the development build's connection method. `npm run web` starts the web app. `npx expo start --tunnel` is an alternative if local network access fails. Expo is installed with the project; no global Expo install is needed.

## Files

| Path (relative to frontend) | Purpose | Coordinator |
|---|---|---|
| `src/app` | Thin route entrypoints | Each screen owner; Shatha for root/layouts/tabs |
| `src/application` | App composition, providers and pages that combine features | Shatha; guest invitation page belongs to Fahad (#67) |
| `src/features/auth` | Sign-up, then login/verification/session behavior | Fahad |
| `src/features/preferences`, `src/features/restaurants` | Planned preferences and restaurant UI/API wrappers | Shatha |
| `src/shared/components`, `src/shared/theme.ts` | Reusable controls and visual identity | Shatha |
| `src/shared/api` | Planned generic HTTP transport (#20) | Fahad |
| `package.json`, `package-lock.json`, `app.json`, `tsconfig.json` | Shared configuration | Shatha coordinates changes |

Import another feature through its public `index.ts`. Register real feature dependencies in the root `architecture.json`. Keep feature-specific components/API wrappers in their feature; shared tools must not import features. Native styling uses `StyleSheet` plus theme values, not a global web CSS file.

## Checks

From the repository root or `frontend`:

```sh
npm run check:architecture
npm run check
```

`check` runs TypeScript, architecture boundaries, and the architecture checker's tests. From `frontend`, build the web output with `npx expo export --platform web`.

The pre-existing `lint` script has no configured ESLint installation yet; setting it up is tracked in #54. Do not report it as passing. Build/type checks do not replace real iPhone or API/SMS acceptance tests.
