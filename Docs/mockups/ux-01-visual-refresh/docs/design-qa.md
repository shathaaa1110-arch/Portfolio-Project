# Design and interaction QA — 18 October 2026

**final result: passed** — within the scope of a UI design prototype.

## Reference and comparison

Selected direction: option 2, immersive photo and information below. The original selection is `02-immersive-table.png` from the design exploration. The implemented vote screen preserves the full photo, cream surface, RTL title/facts, five example positions, labelled Like / Pass controls, details and undo.

Paired evidence:

- `../evidence/vote-comparison.png`: reference and rendered phone content, normalized to **393 × 852**.
- `../evidence/compare-hero.png`: photo, glass controls and surface boundary.
- `../evidence/compare-information.png`: name, facts, details and hierarchy.
- `../evidence/compare-actions.png`: voting controls, undo and footer.
- `../evidence/captures.json`: DOM-measured device screen dimensions; **393 × 852 at scale 1**.
- `../evidence/all-screens-contact.png`: overview of all 17 core screens.
- `../evidence/state-contact.png`: error and edge-state review.

Intentional differences: live iPhone status bar, camera cutout and home indicator belong to the device runtime. The photo is a new illustrative asset matched to the chosen composition. Text contrast and touch targets were increased for legibility. No fake timestamp or device chrome was painted into the product.

## Visual review

| Area | Result | Evidence / correction |
|---|---|---|
| Overall composition | Pass | Edge-to-edge photo, continuous cream content surface, green primary action, outlined pass action. |
| Arabic / RTL | Pass | Right-aligned reading order; LTR phone and invitation code; named buttons. |
| Typography and spacing | Pass | IBM Plex Sans Arabic regular/bold; common field and action rhythm across the 17 screens. |
| Color and contrast | Pass | Muted labels darkened; primary controls retain forest/cream identity. |
| Photos | Pass | Three coherent food images; all presented as illustrative; no real restaurant-photo claims. |
| Voting anatomy | Pass | Like on the right, Pass on the left; red pass icon, circular position dots, divider above review hint. |
| Overflow | Pass | Vote facts fit 343px content width. Primary vote controls ≥44px high. Long screens have scroll exports. |
| Sheets | Pass | Confirm, early end, retry and invite are phone-scoped; both confirmation and cancellation remain reachable. |
| Browser guest | Pass | Desktop form max width 480px at viewport 1440; phone width 375px with 20px sides; no horizontal overflow. |

## Interaction evidence

The following were exercised in the rendered browser, not inferred from filenames:

- Organizer form: Arabic phone digits normalized; demo code → optional defaults → create session → skip notifications → lobby.
- Lobby: generation disabled before readiness; retry preserved five participants and invite code and reset readiness to zero.
- Vote save failure: stayed on card 2; retry moved to card 3; undo restored card 2.
- Details: back returned to the same vote card.
- Voting: complete card sequence → review; explicit confirm → completion progress.
- Early end: confirmation showed 4/5 complete; result showed 3/5 likes = 60%, with 4/5 completion separately.
- Auto finish: completing the remaining simulated participants opened the result with 5/5 completion.
- Retry: new round returned to the same lobby with votes/readiness reset.
- Preference save failure: values remained visible; failure message shown without marking the participant ready.
- Browser guest: join by name → private preferences with explicit None → ready → simulated organizer start → vote → review → confirm → result.
- Removed guest: session details hidden, and Back did not restore session access.
- Empty states: no matching verified restaurants, no likes and no votes were rendered separately, without winner celebration.
- Details missing required data: no unsupported suitability claim; missing price/hours/rating are explicit.
- Notification denied/removed and join invalid/full/closed/removed/error layouts inspected.

A focus-scroll defect was found during sheet QA: focusing an animating dialog could scroll the device wrapper and expose a hidden keyboard asset. App-level focus handling now keeps the wrapper at scroll position zero while preserving the content scroll. Rechecked: wrapper scroll 0; keyboard `data-visible=false`; confirmation visible within the phone. Protected runtime files were not changed.

## Build and scope

- Original design workspace runtime integrity check: passed for **28 protected files**. This historical check is not a command in the simplified packaged source; the packaged source uses `npm run build`.
- `npm run build`: TypeScript and Vite production build passed.
- `node --check public/guest-preview.js`: passed.
- No unresolved P0/P1/P2 findings within the UI prototype scope.
- Non-blocking: Vite reports a bundle-size advisory (~561 kB before gzip); this design preview is not the production native bundle.

Not claimed as tested: real SMS, backend persistence, guest resume across refresh, concurrent participant events, production restaurant verification, native iOS notifications, native screen reader/device behavior or Expo build distribution. Those are explicitly documented integration work, not implemented behavior in this delivery.

التحقق يخص التصميم والمعاينة التفاعلية. التطبيق الفعلي وربطه بالخادم واختباره على آيفون يبقيان ضمن مهام التنفيذ.

Packaged source build: passed with the simplified local-only npm scripts. Local handoff link check: no missing files.

## Repository delivery check — 18 October 2026

- Clean dependency install (`npm ci --ignore-scripts`), TypeScript/Vite build and guest script syntax check: passed on Node 24.21.0 / npm 11.19.0.
- Updated only three transitive lockfile packages: `nanoid` 3.3.15 → 3.3.20, `postcss` 8.5.16 → 8.5.30, and `source-map-js` 1.2.1 → 1.2.2. `npm audit` then reported **0 known vulnerabilities**. Compiled JS/CSS output hashes remained unchanged by these lockfile updates.
- All **91 files** already tracked on `deployment` at `a94d79d` compared byte-for-byte: unchanged. The earlier handoff remains on its existing branch and PR #95.
- **17 screen mappings**, **52 PNG exports**, and all local Markdown targets resolve.
- `node_modules` and generated `dist` are excluded from the commit.
- Machine-readable results: [repository-delivery-check.json](../evidence/repository-delivery-check.json).

تم فحص نسخة الرفع بعد تحديث المكتبات الفرعية: البناء ناجح، وفحص المكتبات بلا ثغرات معروفة وقت الفحص. لم يتغير أي ملف قديم، وتعمل روابط التقرير والصور داخل الحزمة.
