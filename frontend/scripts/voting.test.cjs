const test = require("node:test");
const assert = require("node:assert/strict");
const { load, plain } = require("./helpers/render-feature.cjs");

const errors = load("shared/api/errors.ts");
const progress = { items_count: 3, members_count: 2, completed_count: 0 };

// The voting requests with a fake server that records each call and gives one reply.
function api(reply) {
  const calls = [];
  const voting = load("features/voting/api.ts", {
    "@/shared/api/client": { request: async (method, path, options) => { calls.push([method, path, options]); return reply; } },
    "@/shared/api/errors": errors,
  });
  return { ...voting, calls };
}

test("saving an answer sends only the card and the choice, with the token", async () => {
  const { saveVote, calls } = api({ plan_item_id: "i1", liked: true, voting_complete: false, status: "voting", ...progress });
  const saved = await saveVote("o1", "T", { plan_item_id: "i1", liked: true, extra: "not sent" });
  assert.equal(saved.voting_complete, false);
  assert.deepEqual(plain(calls[0]), ["POST", "/outings/o1/votes", { token: "T", body: { plan_item_id: "i1", liked: true } }]);
});

test("my answers come back for a reload, and replies the screen cannot use are errors", async () => {
  const mine = { outing_id: "o1", status: "voting", votes: [{ plan_item_id: "i1", liked: false }], answered_count: 1, ...progress };
  const { loadMyVotes, calls } = api(mine);
  assert.equal((await loadMyVotes("o1", "T")).votes[0].liked, false);
  assert.deepEqual(plain(calls[0]), ["GET", "/outings/o1/votes", { token: "T" }]);
  for (const broken of [null, { ...mine, votes: null }, { ...mine, votes: [{ plan_item_id: "i1" }] }, { ...mine, items_count: "3" }]) {
    await assert.rejects(api(broken).loadMyVotes("o1", "T"), { code: "INVALID_RESPONSE" });
  }
  for (const broken of [null, { plan_item_id: "i1", liked: true, status: "voting", ...progress }]) {
    await assert.rejects(api(broken).saveVote("o1", "T", { plan_item_id: "i1", liked: true }), { code: "INVALID_RESPONSE" });
  }
});
