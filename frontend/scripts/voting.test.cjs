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
    "@/shared/api/errors": errors, "@/shared/api/config": { ROUND_RETRY_ENABLED: false },
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

// The vote logic with a fake server and a clock the test moves by hand.
const { render, act, deferred } = require("./helpers/render-feature.cjs");
const settle = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });

function fakeClock() {
  let now = 0;
  let lastId = 0;
  const timers = new Map();
  return {
    setTimeout: (run, ms) => { timers.set(++lastId, { run, at: now + ms }); return lastId; },
    clearTimeout: id => { timers.delete(id); },
    async advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= now && timers.delete(id)) timer.run();
      await settle();
    },
  };
}

// The hook on cards i1, i2, i3. `saved` are the answers the server already has; `save` answers each save request.
async function voting({ saved = [], status = "voting", save, mine, token = "T" } = {}) {
  const clock = fakeClock();
  const calls = { load: 0, save: [] };
  let inFlight = 0;
  let mostAtOnce = 0;
  const hook = load("features/voting/useVoting.ts", {
    "@/shared/api/errors": errors,
    "./api": {
      loadMyVotes: async () => {
        calls.load++;
        return mine ? mine(calls.load) : { outing_id: "o1", status, votes: saved, answered_count: saved.length, ...progress };
      },
      saveVote: async (outingId, usedToken, answer) => {
        calls.save.push(plain(answer));
        inFlight++; mostAtOnce = Math.max(mostAtOnce, inFlight);
        try {
          return await (save ? save(calls.save.length, answer) : { ...answer, voting_complete: false, status: "voting", ...progress });
        } finally { inFlight--; }
      },
    },
  }, { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  const view = {};
  function Screen() { Object.assign(view, hook.useVoting("o1", ["i1", "i2", "i3"], async () => token)); return null; }
  const screen = await render(Screen);
  await settle();
  return { clock, calls, view, screen, mostAtOnce: () => mostAtOnce };
}

test("opening restores my saved answers and continues at the first card without one", async () => {
  const { view } = await voting({ saved: [{ plan_item_id: "i1", liked: true }] });
  assert.equal(view.stage, "open");
  assert.deepEqual(plain(view.answers), { i1: true });
  assert.equal(view.next, "i2");
  assert.equal(view.finished, false);
});

test("answers are saved one at a time, in order, and a newer answer on the same card wins", async () => {
  const first = deferred();
  const { calls, view, mostAtOnce } = await voting({
    save: (n, answer) => (n === 1 ? first.promise : { ...answer, voting_complete: false, status: "voting", ...progress }),
  });
  await act(async () => { view.answer("i1", true); });
  await act(async () => { view.answer("i1", false); view.answer("i2", true); });
  assert.equal(calls.save.length, 1);
  assert.equal(view.unsaved, 2);
  first.resolve({ plan_item_id: "i1", liked: true, voting_complete: false, status: "voting", ...progress });
  await settle();
  assert.deepEqual(calls.save, [{ plan_item_id: "i1", liked: true }, { plan_item_id: "i1", liked: false }, { plan_item_id: "i2", liked: true }]);
  assert.equal(mostAtOnce(), 1);
  assert.equal(view.unsaved, 0);
  assert.deepEqual(plain(view.answers), { i1: false, i2: true });
});

test("after a network failure the answer stays and is sent again later, as the same card", async () => {
  const { clock, calls, view } = await voting({
    save: (n, answer) => {
      if (n === 1) throw new errors.ApiError(0, "NETWORK_ERROR", "");
      return { ...answer, voting_complete: false, status: "voting", ...progress };
    },
  });
  await act(async () => { view.answer("i2", true); });
  await settle();
  assert.equal(view.unsaved, 1);
  assert.equal(view.offline, true);
  await clock.advance(2999);
  assert.equal(calls.save.length, 1);
  await clock.advance(1);
  assert.deepEqual(calls.save, [{ plan_item_id: "i2", liked: true }, { plan_item_id: "i2", liked: true }]);
  assert.equal(view.unsaved, 0);
  assert.equal(view.offline, false);
  assert.equal(view.error, null);
});

test("when voting closed meanwhile, answering stops and the answers the server kept come back", async () => {
  const { calls, view } = await voting({
    mine: n => ({ outing_id: "o1", status: n === 1 ? "voting" : "result", votes: [{ plan_item_id: "i1", liked: true }], answered_count: 1, ...progress }),
    save: () => { throw new errors.ApiError(409, "VOTING_NOT_OPEN", ""); },
  });
  await act(async () => { view.answer("i2", false); });
  await settle();
  assert.equal(view.stage, "closed");
  assert.equal(view.outingStatus, "result");
  assert.deepEqual(plain(view.answers), { i1: true });
  assert.equal(view.answer("i3", true), false);
  assert.equal(calls.save.length, 1);
});

test("the answer that completes voting closes it, and without a pass nothing is asked", async () => {
  const done = await voting({ save: (n, answer) => ({ ...answer, voting_complete: true, status: "result", ...progress }) });
  await act(async () => { done.view.answer("i1", true); });
  await settle();
  assert.equal(done.view.stage, "closed");
  assert.equal(done.view.outingStatus, "result");

  const noPass = await voting({ token: null });
  assert.equal(noPass.view.stage, "error");
  assert.equal(noPass.view.error.code, "NO_ACCESS");
  assert.equal(noPass.calls.load, 0);
});

test("changing rounds drops queued votes and ignores an old save that finishes after the new round loads", async t => {
  const oldSave = deferred(), calls = [], view = {};
  const hook = load('features/voting/useVoting.ts', {
    '@/shared/api/errors': errors,
    './api': {
      loadMyVotes: async (id, token, round) => ({ outing_id: id, round_id: round, status: 'voting', votes: [], answered_count: 0, ...progress }),
      saveVote: async (id, token, answer, round) => { calls.push({ answer, round }); return round === 'r1' ? oldSave.promise : { ...answer, round_id: round, status: 'voting', voting_complete: false, ...progress }; },
    },
  });
  function Screen({ round }) { Object.assign(view, hook.useVoting('o1', round === 'r1' ? ['old1', 'old2'] : ['new1'], async () => 'T', round)); return null; }
  const screen = await render(Screen, { round: 'r1' }); t.after(() => screen.close());
  await act(async () => { view.answer('old1', true); view.answer('old2', true); });
  assert.equal(calls.length, 1);
  await screen.update({ round: 'r2' });
  await act(async () => { oldSave.resolve({ plan_item_id: 'old1', liked: true, status: 'result', voting_complete: true, ...progress }); });
  assert.deepEqual(plain(view.answers), {}); assert.equal(view.stage, 'open'); assert.equal(view.unsaved, 0);
  await act(async () => view.answer('new1', false));
  assert.deepEqual(calls.map(x => x.round), ['r1', 'r2']);
  assert.deepEqual(plain(view.answers), { new1: false });
});

test("late vote restoration from a previous round cannot replace the current answers", async t => {
  const oldRead = deferred(), view = {};
  const hook = load('features/voting/useVoting.ts', { '@/shared/api/errors': errors, './api': {
    loadMyVotes: async (id, token, round) => round === 'r1' ? oldRead.promise : { outing_id: id, status: 'voting', round_id: round, votes: [], ...progress },
    saveVote: async () => { throw Error('No write expected'); },
  } });
  function Screen({ round }) { Object.assign(view, hook.useVoting('o1', ['i1'], async () => 'T', round)); return null; }
  const screen = await render(Screen, { round: 'r1' }); t.after(() => screen.close());
  await screen.update({ round: 'r2' });
  await act(async () => oldRead.resolve({ outing_id: 'o1', status: 'result', round_id: 'r1', votes: [{ plan_item_id: 'i1', liked: true }], ...progress }));
  assert.deepEqual(plain(view.answers), {}); assert.equal(view.stage, 'open'); assert.equal(view.outingStatus, 'voting');
});

test('reload waits for the previous write before restoring answers and accepting a newer choice', async t => {
  const oldSave = deferred(); let serverAnswer;
  const h = await voting({
    mine: () => ({ outing_id: 'o1', status: 'voting', votes: serverAnswer === undefined ? [] : [{ plan_item_id: 'i1', liked: serverAnswer }], answered_count: serverAnswer === undefined ? 0 : 1, ...progress }),
    save: async (n, answer) => {
      if (n === 1) await oldSave.promise;
      serverAnswer = answer.liked;
      return { ...answer, status: 'voting', voting_complete: false, ...progress };
    },
  });
  t.after(() => h.screen.close());
  await act(async () => h.view.answer('i1', true));
  await act(async () => h.view.reload());
  assert.equal(h.view.stage, 'loading');
  assert.equal(h.view.answer('i1', false), false);
  assert.equal(h.calls.load, 1); assert.equal(h.calls.save.length, 1);
  await act(async () => oldSave.resolve());
  assert.equal(h.calls.load, 2); assert.equal(h.view.stage, 'open');
  assert.deepEqual(plain(h.view.answers), { i1: true });
  await act(async () => h.view.answer('i1', false));
  assert.equal(h.mostAtOnce(), 1);
  assert.equal(serverAnswer, false); assert.deepEqual(plain(h.view.answers), { i1: false });
  assert.equal(h.view.unsaved, 0);
});
