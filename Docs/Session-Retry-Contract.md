# Same-session retry — frontend and backend contract

15 November 2026 · FE-27 #91, BE-31 #90, DB-07 #14.

**Status:** frontend #159 and backend/database #170 are merged in `deployment`
at `92412ee`. Migration `0012_outing_rounds` owns round history, plans, votes and
membership. The published web build enables rounds. Separate-device acceptance
remains in #36/#91; this document does not claim that acceptance is complete.

## Activation and compatibility

Use `EXPO_PUBLIC_SESSION_ROUNDS_ENABLED=true` with the current API.
`false` is only a compatibility setting for an older single-round server; the
current server rejects missing round identities with `409 STALE_ROUND`. The retry section and its organizer/guest copy are hidden while disabled, and no retry request can be sent. `shared/api/config.ts` owns the flag for both sessions and voting. Mock mode enables the local flow automatically. Enabling the flag alone is insufficient: the current outing must include a valid `round_id`/`round_number` pair and the organizer's `actions` must include `retry_round`.

With rounds disabled, early `round_id`/`round_number` metadata in outing state is ignored; preferences, readiness, plans, votes and results retain their deployed paths and payloads. Vote writes contain exactly `plan_item_id` and `liked`, even if a caller passes a round ID. With rounds enabled, responses must include either neither identity field (legacy) or both: a nonempty string identifier and a positive integer number. Partial or invalid identities then fail validation.

## State and retry

`GET /outings/{id}` retains its existing fields and adds:

```json
{
  "round_id": "round-1",
  "round_number": 1,
  "round_outcome": null,
  "actions": ["retry_round"]
}
```

`round_outcome` is `null` or `"no_matches"`. The latter makes an empty result visible to all participants after refresh. Only the organizer receives `retry_round`, after a settled result or no matching restaurants. It is not offered during active voting.

`POST /outings/{id}/retry`, with the existing Bearer token:

```json
{ "round_id": "round-1" }
```

Successful response (`200`):

```json
{
  "outing_id": "same-outing-id",
  "status": "preferences",
  "round_id": "round-2",
  "round_number": 2
}
```

The frontend requires the same outing, a different round identifier and exactly the next number. The invite code and participant identities remain unchanged. Saved per-outing preferences, including allergies, budget and distance limits, remain intact; every participant explicitly reconfirms readiness. New suggestions and votes belong to the new round.

The backend makes retry atomic and idempotent for the source round: simultaneous or repeated retries create at most one successor. Repeating the same request returns that successor while it is current; a request from an older round after another successor exists returns `409 STALE_ROUND`. Archive previous plans/votes/results on the backend rather than overwriting their history. The mock resets current in-memory state and does not implement persistent archival or database transactions.

## Round-scoped reads and writes

| Request | Identity sent | Required response |
|---|---|---|
| `GET /outings/{id}/preferences` | `?round_id=...` | Existing preferences plus `round_id` |
| `GET /outings/{id}/plan` | `?round_id=...` | Existing plan plus `round_id` |
| `GET /outings/{id}/votes` | `?round_id=...` | Existing private votes/progress plus `round_id` |
| `GET /outings/{id}/result` | `?round_id=...` | Existing result plus `round_id` |
| `PUT /outings/{id}/preferences` | Complete preference body plus `round_id` | Existing save response plus `round_id` |
| `POST /outings/{id}/preferences/ready` | `{ "round_id": "..." }` | Existing readiness response plus `round_id` |
| `POST /outings/{id}/start-voting` | `{ "round_id": "..." }` | Existing plan response plus `round_id` |
| `POST /outings/{id}/votes` | `plan_item_id`, `liked`, `round_id` | Existing saved vote/progress plus `round_id` |
| `POST /outings/{id}/end-voting` | `{ "round_id": "..." }` | Existing final result plus `round_id` |

After round awareness is enabled, the server must reject missing/stale round identifiers on these writes and refuse old round reads for the current-round interface. Use `409 STALE_ROUND`; never apply a delayed vote or preference save to a new round. Authorization still checks actual membership and organizer status on the server. Unsupported retry uses `503 ROUND_RETRY_UNAVAILABLE`; an invalid phase uses `409 ROUND_RETRY_NOT_ALLOWED`.

## Frontend transition and recovery

Confirmation explains what stays and what resets. Cancel sends nothing. Duplicate taps are locked. Failure keeps the visible result and offers state refresh, which also recovers if the server succeeded but its response was lost.

A verified successor clears the current plan, result, preference editor, vote restoration and pending vote queue. State polling moves members/guests to the same readiness screen. The current round keys the voting component; request epochs and response identity checks prevent earlier round work from replacing current content. No preference or hard limit is relaxed automatically, including after repeated empty results.

The screen caches a plan for the current outing, round and token while focused. It clears that cache on refocus, access failure or return to preferences. State polling stops at a single-round result; round-enabled results keep polling state so guests can observe the next round, without downloading the same plan every five seconds.

Reloading votes waits for any in-flight save to settle before restoring server answers and reopening controls. An older save cannot overtake a newer choice after reload.

## Validation and remaining device acceptance

The original 11 November frontend validation passed 106 tests; that count belongs to that revision. `session-retry.test.cjs` verifies production gating, exact payloads, response identities, concurrent local retries, unchanged invitation/participants/limits, fresh readiness/votes, no matches, cancellation, failed retry, guest permissions and delayed old responses. `voting.test.cjs` covers old pending writes/restoration after a round changes and reload during an in-flight save. Tests also cover hidden retry for both roles, no-winner copy, legacy payloads with early round metadata, terminal polling and plan reuse across polls.

Local browser evidence and its scope are in [`design-qa.md`](../design-qa.md).
Backend round ownership/history, concurrent retries and stale writes are tested
in `backend/tests/test_outing_rounds_integration.py`, included in the passing
[CI at 92412ee](https://github.com/shathaaa1110-arch/Portfolio-Project/actions/runs/43268119016).
The remaining acceptance is organizer and guest/member on separate devices using
the same current app, web and API versions, including a refreshed old browser tab.
