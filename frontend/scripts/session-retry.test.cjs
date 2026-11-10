const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { load, render, native, shared, act, deferred, plain } = require('./helpers/render-feature.cjs');
const { roundApi } = require('./helpers/round-api.cjs');
const errors = load('shared/api/errors.ts');
const theme = load('shared/theme.ts');
const pref = { is_saved: true, preferences_done: true, liked_cuisines: ['grill_bbq'], allergies: ['peanuts'], budget_min: 30, budget_max: 100, max_distance_km: 5, seating_needs: 'هادئ' };
const next = { outing_id: 'o1', status: 'preferences', round_id: 'r2', round_number: 2 };

test('retry stays off against the legacy server, scopes the request and rejects false success', async () => {
  const calls = []; let response = next;
  const request = async (...args) => { calls.push(args); return response; };
  const previous = { round_id: 'r1', round_number: 1 };
  await assert.rejects(roundApi(request, false).retryRound('o1', 'T', previous), { code: 'ROUND_RETRY_UNAVAILABLE' });
  assert.equal(calls.length, 0);
  const api = roundApi(request);
  assert.deepEqual(plain(await api.retryRound('o1', 'T', previous)), next);
  assert.deepEqual(plain(calls[0]), ['POST', '/outings/o1/retry', { token: 'T', body: { round_id: 'r1' } }]);
  for (const bad of [null, { ...next, outing_id: 'other' }, { ...next, round_id: 'r1' }, { ...next, round_number: 1 }, { ...next, status: 'result' }]) {
    response = bad; await assert.rejects(api.retryRound('o1', 'T', previous), { code: 'INVALID_RESPONSE' });
  }
});

test('round-aware preferences, plans, votes and results reject replies from a different round', async () => {
  const calls = [];
  const client = { request: async (...args) => { calls.push(args); return { round_id: 'old' }; } };
  const outing = load('features/sessions/api/outing.ts', { '@/shared/api/client': client, '@/shared/api/errors': errors, './round': roundApi() });
  const voting = load('features/voting/api.ts', { '@/shared/api/client': client, '@/shared/api/errors': errors });
  const result = load('features/voting/result.ts', { '@/shared/api/client': client, '@/shared/api/errors': errors });
  for (const run of [() => outing.getOutingPreferences('o1', 'guest', 'r2'), () => outing.getPlan('o1', 'guest', 'r2'),
    () => outing.saveOutingPreferences('o1', 'guest', pref, 'r2'), () => outing.markOutingReady('o1', 'guest', 'r2'),
    () => voting.loadMyVotes('o1', 'guest', 'r2'), () => voting.saveVote('o1', 'guest', { plan_item_id: 'i2', liked: true }, 'r2'),
    () => result.getVotingResult('o1', 'guest', 'r2'), () => result.endVoting('o1', 'guest', 'r2')]) {
    await assert.rejects(run(), { code: 'STALE_ROUND' });
  }
  assert.equal(calls[0][1], '/outings/o1/preferences?round_id=r2');
  assert.equal(calls[2][2].body.round_id, 'r2');
  assert.equal(calls[5][2].body.round_id, 'r2');
});

async function mockOuting() {
  const transport = load('shared/api/mockTransport.ts', { './errors': errors });
  transport.registerMock('GET', '/users/me', () => ({ name: 'شذى' }));
  transport.registerMock('GET', '/users/me/preferences', () => ({ ...pref }));
  load('features/sessions/flowMocks.ts', { '@/shared/api/errors': errors, '@/shared/api/mockTransport': transport }).registerSessionFlowMocks({ generationDelayMs: 0 });
  const call = (method, path, body, token = 'owner') => transport.mockTransport(method, path, body, token);
  const created = await call('POST', '/outings/session', { name: 'عشاء', starts_at: '2026-11-11T20:30:00+03:00', district: 'preview-malqa' });
  const base = `/outings/${created.outing_id}`;
  const guest = await call('POST', `/outings/${created.invite_code}/join-guest`, { guest_name: 'ضيف' });
  await call('POST', `${base}/start-preferences`);
  await call('PUT', `${base}/preferences`, pref, guest.guest_token);
  const ready = async roundId => {
    await call('POST', `${base}/preferences/ready`, { round_id: roundId });
    await call('POST', `${base}/preferences/ready`, { round_id: roundId }, guest.guest_token);
  };
  return { call, created, base, guest, ready };
}

test('retry preserves invitation, members and hard limits; resets readiness/votes once and rejects old writes', async () => {
  const h = await mockOuting(); const { call, base, guest, created } = h;
  const before = await call('GET', base); const r1 = before.round_id;
  await h.ready(r1);
  const plan = await call('POST', `${base}/start-voting`, { round_id: r1 });
  await assert.rejects(call('POST', `${base}/retry`, { round_id: r1 }), { code: 'ROUND_RETRY_NOT_ALLOWED' });
  for (const token of ['owner', guest.guest_token]) for (const item of plan.plan_items) await call('POST', `${base}/votes`, { round_id: r1, plan_item_id: item.plan_item_id, liked: true }, token);
  const oldResult = await call('GET', `${base}/result`);
  assert(oldResult.winner);
  await assert.rejects(call('POST', `${base}/retry`, { round_id: r1 }, guest.guest_token), { code: 'ORGANIZER_ONLY' });
  const [a, b] = await Promise.all([call('POST', `${base}/retry`, { round_id: r1 }), call('POST', `${base}/retry`, { round_id: r1 })]);
  assert.deepEqual(plain(a), plain(b)); assert.equal(a.round_number, 2);
  const after = await call('GET', base, undefined, guest.guest_token);
  assert.equal(after.outing_id, before.outing_id); assert.equal(after.invite_code, before.invite_code);
  assert.deepEqual(after.participants.map(p => p.participant_id), before.participants.map(p => p.participant_id));
  assert.equal(after.readiness.ready_count, 0); assert(after.participants.every(p => !p.preferences_done));
  const own = await call('GET', `${base}/preferences?round_id=${a.round_id}`, undefined, guest.guest_token);
  for (const field of ['liked_cuisines', 'allergies', 'budget_min', 'budget_max', 'max_distance_km', 'seating_needs']) assert.deepEqual(plain(own[field]), plain(pref[field]));
  assert.equal((await call('GET', `${base}/votes`)).votes.length, 0);
  assert.equal((await call('GET', `/outings/by-code/${created.invite_code}`)).can_join, true);
  await assert.rejects(call('GET', `${base}/plan`), { code: 'PLAN_NOT_READY' });
  await assert.rejects(call('GET', `${base}/preferences?round_id=${r1}`), { code: 'STALE_ROUND' });
  for (const [method, suffix, body] of [['PUT', '/preferences', pref], ['POST', '/preferences/ready', {}], ['POST', '/votes', { plan_item_id: plan.plan_items[0].plan_item_id, liked: false }], ['POST', '/end-voting', {}]]) {
    await assert.rejects(call(method, `${base}${suffix}`, { ...body, round_id: r1 }), { code: 'STALE_ROUND' });
  }
  await assert.rejects(call('POST', `${base}/start-voting`, { round_id: a.round_id }), { code: 'NOT_EVERYONE_READY' });
  await call('POST', `${base}/preferences/ready`, { round_id: a.round_id });
  await assert.rejects(call('POST', `${base}/start-voting`, { round_id: a.round_id }), { code: 'NOT_EVERYONE_READY' });
  await call('POST', `${base}/preferences/ready`, { round_id: a.round_id }, guest.guest_token);
  const newPlan = await call('POST', `${base}/start-voting`, { round_id: a.round_id });
  assert.equal(newPlan.round_id, a.round_id);
  assert(newPlan.plan_items.every(i => !plan.plan_items.some(old => old.plan_item_id === i.plan_item_id)));
  assert.equal((await call('GET', `${base}/votes`)).completed_count, 0);
  assert.equal(oldResult.round_id, r1);
});

test('no-match retry is visible to the guest and never relaxes an incompatible budget', async () => {
  const h = await mockOuting(); const { call, base, guest } = h;
  const r1 = (await call('GET', base)).round_id;
  await call('PUT', `${base}/preferences`, { ...pref, budget_min: 0, budget_max: 10 });
  await h.ready(r1);
  assert.equal((await call('POST', `${base}/start-voting`, { round_id: r1 })).plan_items.length, 0);
  assert.equal((await call('GET', base, undefined, guest.guest_token)).round_outcome, 'no_matches');
  const second = await call('POST', `${base}/retry`, { round_id: r1 });
  assert.equal((await call('GET', `${base}/preferences`)).budget_max, 10);
  await h.ready(second.round_id);
  assert.equal((await call('POST', `${base}/start-voting`, { round_id: second.round_id })).plan_items.length, 0);
});

async function screenHarness(t, { organizer = true } = {}) {
  let current = { outing_id: 'o1', round_id: 'r1', round_number: 1, name: 'عشاء', starts_at: '2026-11-11T20:30:00+03:00', status: 'result', district: '001', invite_code: 'ABCD',
    me: { participant_id: 'p1', is_organizer: organizer }, actions: organizer ? ['retry_round'] : [], readiness: { ready_count: 1, total_count: 1 },
    participants: [{ participant_id: 'p1', name: 'شذى', preferences_done: true, attendance: 'confirmed', is_organizer: organizer }] };
  let delayedState = null; const reset = deferred(); const calls = [], timers = [];
  const api = { getOuting: async () => { if (delayedState) { const pending = delayedState; delayedState = null; return pending.promise; } return structuredClone(current); },
    getPlan: async () => ({ outing_id: 'o1', round_id: current.round_id, status: current.status, plan_items: [], allergy_warning: [] }),
    getOutingPreferences: async () => ({ ...pref, preferences_done: false, round_id: current.round_id }),
    saveOutingPreferences: async (...args) => calls.push(['save', ...args]), markOutingReady: async (...args) => calls.push(['ready', ...args]),
  };
  const preferences = load('features/preferences/model.ts', { './validation': load('features/preferences/validation.ts') });
  const Screen = load('features/sessions/SessionScreen.tsx', {
    'react-native': native, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { router: {}, useLocalSearchParams: () => ({ id: 'o1', code: 'ABCD' }), useFocusEffect: cb => React.useEffect(cb, [cb]) },
    '@/features/preferences': { ...preferences, PreferencesForm: 'Form' }, '@/shared/components': shared,
    '@/shared/api/errors': errors, '@/shared/api/config': { USE_MOCK: true }, '@/shared/theme': theme,
    './api/outing': api, './api/round': { ROUND_RETRY_ENABLED: true, retryRound: (...args) => { calls.push(['retry', ...args]); return reset.promise; } },
    './identity': { outingToken: async () => 'T' }, './guestPass': { loadGuestPass: async () => null, removeGuestPass: async () => {} },
    './model': load('features/sessions/model.ts', { '@/shared/api/errors': errors }), './SessionGenerating': { SessionGenerating: 'Generating' }, './SessionVoting': { SessionVoting: 'Voting' },
    './components/SessionRetry': { SessionRetry: 'Retry' },
    './components/SessionChrome': { SessionHeader: 'Header', SessionIcon: 'Icon', SessionSheet: 'Sheet' },
    './components/SessionLayout': { QuietButton: 'QuietButton', SessionFooter: 'Footer', room: {} },
    './components/SessionVisuals': { SessionMasthead: 'Masthead', SessionPaper: 'Paper', SessionSteps: 'Steps' },
  }, { setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {} });
  const screen = await render(Screen.SessionScreen); t.after(() => screen.close());
  return { screen, calls, reset, timers, state: () => current, setState: value => { current = value; }, delay: value => { delayedState = value; },
    retry: () => screen.root.findByType('Voting').props.retry.props,
    second: () => ({ ...current, ...next, actions: [], readiness: { ready_count: 0, total_count: 1 }, participants: current.participants.map(p => ({ ...p, preferences_done: false })) }),
  };
}

test('confirmation cancels safely, duplicate taps send once and a late old-state reply cannot restore the old result', async t => {
  const h = await screenHarness(t);
  await act(async () => h.retry().onOpen()); assert.equal(h.retry().open, true);
  await act(async () => h.retry().onClose()); assert.equal(h.calls.length, 0);
  const old = structuredClone(h.state()), delayed = deferred(); h.delay(delayed);
  let poll; await act(async () => { poll = h.screen.root.findByType('Voting').props.refresh(); });
  await act(async () => h.retry().onOpen());
  let pending; await act(async () => { pending = h.retry().onConfirm(); });
  await act(async () => h.retry().onConfirm()); assert.equal(h.calls.length, 1);
  h.setState(h.second());
  await act(async () => { h.reset.resolve(next); await pending; });
  await act(async () => { delayed.resolve(old); await poll; });
  assert.equal(h.screen.root.findAllByType('Voting').length, 0);
  assert(h.screen.root.findAllByType('AppButton').some(b => b.props.title === 'اعتماد تفضيلاتي · أنا جاهز'));
  assert(h.screen.root.findAllByType('AppText').some(x => JSON.stringify(x.props.children).includes('جولة جديدة')));
});

test('failed retry preserves the result; non-organizers cannot submit and old preference editors cannot save', async t => {
  const failed = await screenHarness(t);
  await act(async () => failed.retry().onOpen());
  let pending; await act(async () => { pending = failed.retry().onConfirm(); });
  await act(async () => { failed.reset.reject(new errors.ApiError(0, 'NETWORK_ERROR', '')); await pending; });
  assert(failed.retry().error); assert(failed.screen.root.findByType('Voting'));
  const guest = await screenHarness(t, { organizer: false });
  await act(async () => { guest.retry().onOpen(); await guest.retry().onConfirm(); });
  assert.equal(guest.calls.length, 0);
  const h = await screenHarness(t); h.setState(h.second());
  await act(async () => h.screen.root.findByType('Voting').props.refresh());
  await act(async () => h.screen.root.findAllByType('QuietButton').find(b => b.props.title === 'تعديل ذوقي وتفضيلاتي').props.onPress());
  const oldForm = h.screen.root.findByType('Form').props;
  h.setState({ ...h.state(), round_id: 'r3', round_number: 3 });
  await act(async () => h.timers.at(-1)());
  assert.equal(h.screen.root.findAllByType('Form').length, 0);
  await act(async () => oldForm.onSubmit(oldForm.initialValue));
  assert.equal(h.calls.length, 0);
});
