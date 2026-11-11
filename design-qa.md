# PR #159 review fixes — 11 November 2026

- Retry and its organizer/guest copy are hidden when round support is off. No-winner results do not promise a new round.
- One shared flag gates all round-scoped requests. Tests pass an early server round ID with the flag off and verify legacy vote/preference/plan/result payloads.
- Vote reload waits for the pending save before restoring answers; a regression test checks that the last choice matches server state with at most one save in flight.
- Single-round results stop polling. Round-enabled guests still observe new state; the existing plan is reused between polls and replaced for a new round.
- Merged `deployment` through `b75b17c`, resolving both conflicts. `RestaurantCard` keeps `useRestaurantImage` and its category fallback, plus price/reason data. Both API guide sections are retained.
- `/sessions/[id]` is the current #159 session screen. Coordination with #157 remains a team handoff, not an agreement made in this change.

## Asset size and visual check

Same illustrations, aspect ratios and Haila alpha; WebP quality 88, alpha quality 100. The unused 1,597,874-byte `haila.png` was removed. Original sources remain in Git history.

| Asset | New dimensions | Previous bytes | New bytes |
|---|---|---:|---:|
| Haila gathering | 612 × 816 | 1,217,168 | 63,024 |
| Invitation paper | 1080 × 1214 | 2,051,325 | 43,918 |
| Restaurant hero | 1080 × 360 | 2,905,159 | 104,166 |
| Underline | 246 × 82 | 1,014,540 | 790 |
| Total used images | | 7,188,192 | 211,898 |

About 97% smaller. Dimensions target roughly 3× mobile display width/height while preserving source aspect ratios and existing contentFit behavior. The underline keeps its source ratio for both cover and fill uses.

The actual creation screen was opened and visually checked on iPhone 17 Simulator / iOS 26.4 through Expo Go 58 in local mock mode. Paper texture, hero and gold rule rendered without missing assets. The optimized Haila was inspected with transparency intact. `Docs/mockups/session-review/preview-ios.png` captures the subsequent round-2 readiness screen during the user’s local preview; it is visual evidence, not a claimed automated multi-device run. No native phone build was installed.

## Validation

- `npm run check`: TypeScript, architecture rules and 106 tests passed.
- Production web export: passed, 16 routes, `EXPO_PUBLIC_USE_MOCK=false` and rounds disabled.
- SQL, ERD and backend algorithms were not changed by these fixes. Incoming deployment changes retain their own history and documentation.
- Real retry still awaits #90 and backend integration acceptance.

Earlier sections below describe their original revisions and counts.

---

# Same-session retry review — 10 November 2026

**Frontend validation: passed in local mock mode. Real backend acceptance remains open in #90/#91.**

The existing cream/green theme, shared Arabic type, buttons, paper layout and blended Haila are reused. The organizer opens a short confirmation after a result or no matches. It explains unchanged invitation/participants/preferences and fresh readiness/votes. There is no new outing or automatic relaxation of participant limits.

## Evidence

- Actual local browser flow: create → invite → save preferences/ready → generation → three votes → winner → cancel retry (result retained) → confirm retry → round 2 readiness → explicitly ready → generation → first card with no saved votes.
- The URL retained the same outing and invite code throughout. The round number changed to 2; the start-voting action stayed disabled until readiness was reconfirmed.
- `Docs/mockups/session-retry/confirm-390.png` and `confirm-320.png`: confirmation at 390 × 844 and 320 × 740. Title wraps on the narrow screen, supporting copy and both actions remain readable and reachable. Haila has no opaque background or stretched proportions.
- `round-two-390.png`: same outing, new round number and explicit readiness after confirmation; the paper content scrolls independently of the fixed action.
- `new-votes-390.png`: round 2 starts at card 1 with zero completed participants and no review count carried from round 1.
- No browser console errors were reported. Temporary viewport overrides were reset.

## Checks and limits

- `npm run check`: TypeScript, architecture and 99 tests passed. Includes cancellation, duplicate clicks, failed retry, non-organizer attempts, preserved hard limits, no matches and stale reads/writes. Guest/member round transitions are covered by tests; the browser walkthrough used one mock organizer.
- Production web export passed with 16 routes, mock mode disabled and round support disabled.
- Existing single-round API requests remain compatible. The new retry adapter is gated until #90 and the provisional contract in `Docs/Session-Retry-Contract.md` are agreed and implemented. No backend, SQL or ERD changes, persistent vote-history implementation, live multiplayer acceptance or phone installation are claimed.
- Architecture/source ownership and the Arabic beginner guide were updated in the same change. Earlier reviews below describe their own revisions and test counts.

---

# Haila generation screen review — 10 November 2026

**final result: passed**

## Current target and evidence

The user requested one character combining the supplied expressive, map-carrying Haila with the existing watercolor/scarf Haila, and a simpler generation screen. The supplied screenshot is a character reference, not a request to reproduce its onboarding screen or surrounding desktop/chat content. That private screenshot is not included in the repository.

- Character target: `frontend/assets/images/sessions/haila-gathering.png`, 1086 × 1448, with alpha. Retains watercolor olive ribs and ochre scarf; adds expressive eyes, curled tip, map and gold shoes. At this revision the original `haila.png` was preserved; the 11 November optimization above removes it from app assets.
- Visual brief: `Docs/mockups/haila-generation/illustration-brief.md`.
- Before: `Docs/mockups/haila-generation/before-320.png`, 320 × 740.
- After: `Docs/mockups/haila-generation/after-320.png`, 320 × 740, and `after-390.png`, 390 × 844. Captured from the actual `SessionGenerating` component with the same session name; a temporary visual entry was removed before validation/commit.
- Combined evidence: `Docs/mockups/haila-generation/comparison.png`, 960 × 830, from `comparison.html`. The actual before/after screens are each displayed at their original 320 × 740 pixels, density 1. The character source occupies a separate 210 × 350 panel with its aspect ratio preserved. This combined artifact was opened and examined; source and implementation were not judged from paths alone.
- State: Arabic RTL, cream theme, “عشاء الأربعاء”, pending generation. No browser chrome or device bezel is included. The standalone character reference is an asset, not a full-screen mockup; its proportions are assessed within the new screen rather than treating the source onboarding layout as a pixel target.
- Integration evidence: `flow-generating-320.png` captures the same screen during the actual local mock request, followed by automatic navigation to the first restaurant card. DOM width/height confirmed 320 × 740. Browser console reported no errors.

## Findings and five fidelity surfaces

1. **P2 resolved — Character mismatch and visible cream image rectangle.** Replaced the loading/tip illustration with the merged transparent asset. Map, eyes and scarf remain visible at mobile size; the alpha edge blends into the cream canvas without a rectangular patch.
2. **P2 resolved — Repetitive copy and button-like loading pill.** Replaced the large pill and repeated paragraphs with a short heading/subtitle, a clearly informational row for taste/budget/distance, and a plain pending indicator. There is no fake action or staged completion claim.
3. **Fonts/typography:** existing IBM Plex Sans Arabic Regular/Bold retained. Heading is 27/42, body 14/26, supporting labels 12/21–23. At both inspected sizes, text is readable without clipping; title is one line. No source logo/calligraphy was approximated.
4. **Spacing/layout:** image slot is 272 px high normally and 220 px on short screens/large font scale. Full visible content fits 320 × 740 and 390 × 844 without scrolling at default text size. ScrollView remains available for larger text and long session names; no fixed text container truncates the main message. Header and existing four phases are retained.
5. **Colors/tokens:** existing forest green and cream are preserved, with restrained ochre icons/scarf. Rules are quiet neutral borders. The progress row no longer resembles a tappable button.
6. **Image quality:** true alpha confirmed; no stretching, text baked into the illustration, new decorative code drawings or placeholders. Reused gold underline and the existing platform icon component. HailaTip uses the same merged character for visual consistency.
7. **Copy/content:** the screen says it is preparing restaurants for the group, identifies the outing, and explains that voting follows automatically. Factors describe inputs, not live backend substeps. No percentage or countdown was introduced. The backend's district-based distance and allergy rules are unchanged.

No actionable P0/P1/P2 findings remain in this scoped visual comparison. Character detail and text are legible at 1:1 in the combined image; separate cropped evidence was unnecessary.

## Validation and limits

- Local browser flow: create → invitation → private preferences → save/ready → pending Haila → first voting card. Uses mock data, not authenticated production requests.
- `npm run check` passed: TypeScript, module architecture and 91 existing tests, including pending generation, empty results and failure recovery. No feature dependencies or API requests changed.
- Production-mode web export passed with 16 routes and the new bundled character asset; the temporary preview route is absent. `git diff --check` passed.
- Decorative float is gentler and respects the existing reduced-motion subscription; the spinner stops with reduced motion while pending copy remains. OS-level reduced-motion and large native text behavior were inspected in code, not tested on a physical device.
- Architecture/source map and Arabic beginner flow guide updated. API/SQL/ERD are unchanged and were not redrawn.
- Existing live multiplayer/device acceptance gaps remain. This update does not rebuild or install the iPhone app.

## Checklist

- [x] Blended character placed in the real component and shared tips.
- [x] Before/source/after inspected together at matched screen sizes.
- [x] Compact screen and normal mobile screen captured, no console errors.
- [x] Actual pending-request transition to voting exercised.
- [x] Temporary visual route removed; source and documentation checks passed.

---

# Earlier session and discovery UI review — 10 November 2026

The following records the earlier completed revision. Its Haila screenshot and cream-background polish note are superseded by the review above.

**final result: passed**

This covers the implemented local frontend and examined visual states. It does not close the live integration, native-device or missing backend dependencies in `Docs/Sprint-2-3-Frontend.ar.md`.

## Target and combined evidence

The requested direction is the previous watercolor invitation and textured paper, with clearer steps and reachable actions. The temporary compressed redesign was rejected. Original creation typography, art, paper and date composition were restored; invitation/preferences retain that paper with a compact masthead.

- Source: `Docs/mockups/session-creation/reference.png`, 852 × 1846 px.
- Previous actual screen: `Docs/mockups/session-refresh/before-create.png`, 390 × 844 px.
- Final actual screen: `Docs/mockups/session-refresh/create.png`, 390 × 844 px.
- Combined comparison: `Docs/mockups/session-refresh/comparison.png`, 1234 × 906 px, rendered from `comparison.html`. All three images were inspected together.
- Normalization: source displayed within 390 × 844 CSS px with preserved aspect ratio; approximately one pixel is letterboxing. Before/after are 390 × 844 captures at density 1. No device bezel/browser chrome.
- State: cream, Arabic RTL, “عشاء الأربعاء”, 20:30 Riyadh. Reference date is 4 November; before/after use future-valid 11 November. Reference has a selected district; actual before/after show the empty required district. These are intentional content differences.
- Each screen remains 390 px wide in the comparison. Text, controls and dividers are readable; a separate focused crop was unnecessary.

Final captures under `Docs/mockups/session-refresh/`:

| File | Actual viewport / state |
|---|---|
| `invite.png` | 390 × 844; paper invitation, participants and fixed action |
| `preferences.png` | 390 × 844; outing preference summary |
| `ready-320.png` | 320 × 740; ready state and fixed voting action |
| `generating-320.png` | 320 × 740; Haila during generation |
| `voting-320.png` | 320 × 740; one card, price and Like/Pass |
| `result-320.png` | 320 × 740; mock winner and server-shaped counts |
| `home-outing-selected.png` | 390 × 844; outing green, discovery neutral |
| `home-other-restaurants.png` | 390 × 844; personal list rows, then public list |

## Findings and iteration history

1. **P1 — Visual direction drift:** temporary compression and plain summaries lost the original paper design. Restored original creation styles and paper-based invitation/readiness. Post-fix evidence: `comparison.png`, `invite.png`, `preferences.png`.
2. **P2 — Long pages obscured the next action:** primary actions now sit outside the scroll area; participant details moved to a sheet and repeated explanations were shortened. Post-fix: invitation and 320-pixel readiness captures show reachable actions.
3. **P2 — Home selection was hard-coded:** green now follows the selected action. Final Home capture and regression test cover choosing outing and returning to discovery.
4. **P2 — Extra recommendations were hidden in the featured card:** removed expansion and passed the same response into regular list rows titled “مطاعم أخرى على ذوقك”. Final list capture and tests confirm placement; public search hides personal rows.
5. **P2 — Loading framing/copy:** removed a redundant paper frame around Haila and corrected a literal line-break escape. Final loading capture shows readable lines and an indeterminate progress indicator.

No actionable P0/P1/P2 visual findings remain in the examined states. Backend acceptance gaps are explicitly separate.

## Five fidelity surfaces

- **Fonts/typography:** existing IBM Plex Sans Arabic Regular/Bold retained. The previous creation hierarchy and Arabic numerals remain. Titles, code, steps and controls are legible. Reference calligraphy differs from the product typeface; preserving the existing font is intentional. Long compact-card names truncate, with full names in details/accessibility labels.
- **Spacing/layout:** hero/paper overlap, name divider, date/time columns and leaf preserved. Fixed footer improves reach while long content scrolls. Voting uses one card with stable bottom actions. DOM width was verified as 320 at the 320 × 740 viewport.
- **Colors/tokens:** existing forest green/cream retained. Active Home action has green background/light text; inactive has pale background/green text. Disabled and warning states remain distinct.
- **Images/assets:** reused watercolor hero, paper, gold stroke, Haila and category photos. No decorative vector/code substitutes. Category photos are described as illustrative. Haila's slight cream background is a minor P3 polish opportunity.
- **Copy/content:** four explicit phases, real pending-request loading, server winner/counts, tie explanation only when relevant, and honest missing price/hours/maps states. Public browsing is not labelled personalized.

## Interaction and validation

- Local mock flow exercised: creation → invitation → outing preferences → readiness → generation → voting/result. Earlier voting exercise included changing an answer through review; regression tests also cover this.
- A regression test also verifies that a restaurant present in both personal and public rows opens only one details sheet.
- Account flow: choose حي الملقا → save preferences → return to existing Home. District stayed selected and recommendations refreshed without reopening the picker. Opened extra recommendation details and returned to the list.
- Selected outing state and additional restaurant list placement inspected at 390 px. Readiness, generation and voting inspected at 320 px. Wider session layouts retain a centered column.
- Final Home test tab reported no console errors. Earlier transient Metro/file-merge errors and a cold-start connection failure were resolved before final UI review.
- `npm run check`: TypeScript, architecture and **91 tests**, zero failures. Four account tests passed separately.
- Production web export succeeded with 16 routes, real API URL and mock mode disabled. No production deployment or authenticated live vote test is implied.
- `git diff --check` passed.

## Remaining acceptance work

Physical iOS/Android, large accessibility text and live multi-participant synchronization remain untested. No phone build update, SMS or authenticated production writes were performed. Same-session retry needs #90's round contract; independent district filtering and standalone restaurant detail API are absent. Location cache is account-scoped memory for this app run, not permanent GPS storage; three native save cycles and denied-GPS behavior still need device acceptance.

## Completed checklist

- [x] Reference, previous and final renders compared together at matching density.
- [x] Original direction restored and post-fix captures inspected.
- [x] Five fidelity surfaces and narrow-screen primary controls reviewed.
- [x] Behavioral regressions and production export verified.
- [x] Architecture, API usage, source map and Arabic delivery guide updated. SQL/ERD are unchanged.
