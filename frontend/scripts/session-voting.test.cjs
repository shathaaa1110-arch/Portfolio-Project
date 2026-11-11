const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { load, render, native, shared, act, deferred, plain } = require('./helpers/render-feature.cjs');
const errors = load('shared/api/errors.ts');
const theme = load('shared/theme.ts');
const result = { outing_id: 'o1', status: 'result', winner: null, no_winner_reason: 'no_votes', members_count: 2, completed_count: 0, items: [] };

test('result APIs use the participant token, only the server chooses a winner, and malformed results are rejected', async () => {
  const calls = []; let response = result;
  const api = load('features/voting/result.ts', {
    '@/shared/api/errors': errors, '@/shared/api/config': { ROUND_RETRY_ENABLED: false },
    '@/shared/api/client': { request: async (...args) => { calls.push(args); return response; } },
  });
  assert.equal((await api.getVotingResult('o1', 'guest')).no_winner_reason, 'no_votes');
  assert.equal((await api.endVoting('o1', 'organizer')).winner, null);
  assert.deepEqual(plain(calls), [ ['GET', '/outings/o1/result', { token: 'guest' }], ['POST', '/outings/o1/end-voting', { token: 'organizer' }] ]);
  for (const invalid of [null, { ...result, outing_id: 'another' }, { ...result, completed_count: 3 },
    { ...result, no_winner_reason: null }, { ...result, winner: { plan_item_id: 'i1', likes: 0 } }]) {
    response = invalid; await assert.rejects(api.getVotingResult('o1', 'T'), { code: 'INVALID_RESPONSE' });
  }
});

async function harness(t, { organizer = true, unsaved = 0, offline = false, endResponse = result } = {}) {
  const votes = { stage: 'open', outingStatus: 'voting', answers: {}, next: 'i1', finished: false,
    progress: { items_count: 2, members_count: 2, completed_count: 0 }, unsaved, offline, error: null, reload() {} };
  const answers = [], ends = [], routes = [], shares = [];
  votes.answer = (id, liked) => answers.push([id, liked]);
  const voting = { useVoting: () => votes, loadMyVotes: async () => ({ completed_count: 0, status: 'voting' }),
    endVoting: async (...args) => { ends.push(args); return endResponse; }, getVotingResult: async () => endResponse };
  const props = { state: { outing_id: 'o1', name: 'عشاء', status: 'voting', readiness: { total_count: 2 }, me: { is_organizer: organizer }, actions: organizer ? ['end_voting'] : [] },
    plan: { plan_items: [ { plan_item_id: 'i1', rank: 1, match_score: 85, reason: 'مناسب', restaurant: { id: 1, name_ar: 'الأول', cuisines: [], district: null, rating: null } },
      { plan_item_id: 'i2', rank: 2, match_score: 80, reason: 'مناسب', restaurant: { id: 2, name_ar: 'الثاني', cuisines: [], district: null, rating: null } } ], allergy_warning: [] },
    getToken: async () => 'T', refresh: async () => {}, stale: false, error: '' };
  const Screen = load('features/sessions/SessionVoting.tsx', {
    'react-native': { ...native, Share: { share: async message => shares.push(message) } }, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, 'expo-image': { Image: 'Image' },
    'expo-router': { router: { replace: r => routes.push(r) }, useFocusEffect: cb => React.useEffect(cb, [cb]) },
    '@/features/restaurants': { RestaurantCard: 'RestaurantCard' }, '@/features/voting': voting,
    '@/shared/components': shared, '@/shared/theme': theme, '@/shared/api/config': { USE_MOCK: false },
    './model': load('features/sessions/model.ts', { '@/shared/api/errors': errors }),
    './components/SessionChrome': { SessionHeader: 'Header', SessionIcon: 'Icon', SessionSheet: ({ visible, children }) => visible ? React.createElement('Sheet', null, children) : null },
    './components/SessionVisuals': { HailaTip: 'Tip', SessionSteps: 'Steps' },
    './components/SessionLayout': { QuietButton: 'QuietButton', SessionFooter: 'Footer', SessionSummary: 'Summary', room: {} },
  }).SessionVoting;
  const screen = await render(Screen, props); t.after(() => screen.close());
  const button = title => screen.root.findAll(x => ['AppButton', 'QuietButton'].includes(x.type)).find(x => x.props.title === title);
  return { props, votes, screen, button, answers, ends, shares, update: () => screen.update({ ...props }) };
}

test('one suggestion at a time; Like and Pass send the visible plan item, and review can change an answer', async t => {
  const h = await harness(t);
  assert.equal(h.screen.root.findAllByType('RestaurantCard').length, 1);
  await act(async () => h.button('يعجبني').props.onPress());
  assert.deepEqual(h.answers, [['i1', true]]);
  h.votes.answers = { i1: true }; h.votes.next = 'i2'; await h.update();
  assert.equal(h.screen.root.findByType('RestaurantCard').props.name, 'الثاني');
  await act(async () => h.button('مراجعة اختياراتي (١)').props.onPress());
  const pass = h.screen.root.findAllByType('Pressable').find(x => x.props.accessibilityLabel === 'الأول: نتخطّاه');
  await act(async () => pass.props.onPress());
  assert.deepEqual(h.answers[1], ['i1', false]);
});

test('early end needs explicit in-app confirmation, organizer action and no unsaved votes', async t => {
  const h = await harness(t);
  assert.equal(h.button('إنهاء وإظهار النتيجة'), undefined);
  await act(async () => h.button('إنهاء التصويت مبكرًا').props.onPress());
  assert.equal(h.ends.length, 0);
  await act(async () => h.button('إنهاء وإظهار النتيجة').props.onPress());
  assert.deepEqual(h.ends, [['o1', 'T', undefined]]);
  assert.equal(h.button('يعجبني'), undefined);
  assert(h.screen.root.findAllByType('AppText').some(n => String(n.props.children).includes('قبل وصول أي إجابة')));
  const member = await harness(t, { organizer: false });
  assert.equal(member.button('إنهاء التصويت مبكرًا'), undefined);
  const pending = await harness(t, { unsaved: 1, offline: true });
  assert.equal(pending.button('إنهاء التصويت مبكرًا').props.disabled, true);
  assert(pending.screen.root.findAllByType('AppText').some(n => String(n.props.children).includes('لم تُحفظ كلها')));
});

test('a stale state disables voting and remote closure hides controls without fabricating a winner', async t => {
  const h = await harness(t);
  h.props.stale = true; await h.update(); assert.equal(h.button('يعجبني').props.disabled, true);
  h.props.state = { ...h.props.state, status: 'result' }; await h.update();
  assert.equal(h.button('يعجبني'), undefined);
  assert.equal(h.screen.root.findAllByType('RestaurantCard').length, 0);
});

test('mock follows server settlement: all must answer, changing a vote does not double it, rank resolves equal likes', async () => {
  const transport = load('shared/api/mockTransport.ts', { './errors': errors });
  const prefs = { is_saved: true, liked_cuisines: [], allergies: [], budget_min: null, budget_max: null, max_distance_km: null, seating_needs: null };
  transport.registerMock('GET', '/users/me', () => ({ name: 'منظم' }));
  transport.registerMock('GET', '/users/me/preferences', () => prefs);
  load('features/sessions/flowMocks.ts', { '@/shared/api/errors': errors, '@/shared/api/mockTransport': transport }).registerSessionFlowMocks({ generationDelayMs: 0 });
  const call = (method, path, body, token = 'owner') => transport.mockTransport(method, path, body, token);
  const make = async () => {
    const o = await call('POST', '/outings/session', { name: 'عشاء', starts_at: '2026-11-11T20:30:00+03:00', district: 'preview-malqa' });
    const base = `/outings/${o.outing_id}`;
    const guest = await call('POST', `/outings/${o.invite_code}/join-guest`, { guest_name: 'ضيف' });
    await call('POST', `${base}/start-preferences`);
    await call('POST', `${base}/preferences/ready`);
    await call('PUT', `${base}/preferences`, prefs, guest.guest_token);
    await call('POST', `${base}/preferences/ready`, undefined, guest.guest_token);
    return { base, guest: guest.guest_token, plan: await call('POST', `${base}/start-voting`) };
  };
  const { base, guest, plan } = await make();
  const answer = (item, liked, token) => call('POST', `${base}/votes`, { plan_item_id: item.plan_item_id, liked }, token);
  for (const item of plan.plan_items) await answer(item, item.rank === 1, 'owner');
  await answer(plan.plan_items[0], false, 'owner');
  await answer(plan.plan_items[1], true, 'owner');
  const mine = await call('GET', `${base}/votes`);
  assert.equal(mine.answered_count, 3); assert.equal(mine.completed_count, 1); assert.equal(mine.status, 'voting');
  await assert.rejects(call('GET', `${base}/result`), { code: 'RESULT_NOT_READY' });
  await assert.rejects(call('POST', `${base}/end-voting`, undefined, guest), { code: 'ORGANIZER_ONLY' });
  for (const item of plan.plan_items) await answer(item, item.rank === 1, guest);
  const settled = await call('GET', `${base}/result`);
  assert.equal(settled.winner.plan_item_id, plan.plan_items[0].plan_item_id);
  assert.equal(settled.winner.support_percentage, 50);
  await assert.rejects(answer(plan.plan_items[0], true, 'owner'), { code: 'VOTING_NOT_OPEN' });
  const empty = await make(); const noVotes = await call('POST', `${empty.base}/end-voting`);
  assert.equal(noVotes.no_winner_reason, 'no_votes'); assert.equal(noVotes.winner, null);
  const passed = await make();
  for (const item of passed.plan.plan_items) await call('POST', `${passed.base}/votes`, { plan_item_id: item.plan_item_id, liked: false });
  const skipped = await call('POST', `${passed.base}/end-voting`);
  assert.equal(skipped.no_winner_reason, 'everyone_passed'); assert.equal(skipped.completed_count, 1);
});

test('outing identity keeps the guest membership when the same device also has an account', async () => {
  let pass = { outing_id: 'o1', guest_token: 'guest' };
  const identity = load('features/sessions/identity.ts', { '@/shared/api/errors': errors,
    '@/features/auth': { loadSession: async () => ({ token: 'account' }) }, './guestPass': { loadGuestPass: async () => pass } });
  assert.equal(await identity.outingToken('o1', 'CODE'), 'guest');
  assert.equal(await identity.outingToken('o2', 'CODE'), 'account');
});


test('result shows server completion and a real tie, and shares only the winning restaurant', async t => {
  const final = { ...result, completed_count: 1, no_winner_reason: null,
    winner: { plan_item_id: 'i1', restaurant_id: 1, name_ar: 'الأول', name_en: null, district: 'الملقا', maps_url: 'https://maps.google.com/?q=restaurant', likes: 1, support_percentage: 50 },
    items: [{ plan_item_id: 'i1', name_ar: 'الأول', likes: 1, support_percentage: 50 }, { plan_item_id: 'i2', name_ar: 'الثاني', likes: 1, support_percentage: 50 }] };
  const h = await harness(t, { endResponse: final });
  h.props.state = { ...h.props.state, status: 'result' }; await h.update();
  assert.equal(h.screen.root.findByType('Summary').props.detail, '١ من ٢ أكملوا التصويت');
  assert(h.screen.root.findAllByType('AppText').some(n => String(n.props.children).includes('تعادلت الإعجابات')));
  await act(async () => h.button('مشاركة نتيجة الطلعة').props.onPress());
  assert.match(h.shares[0].message, /اختيار طلعتنا: الأول/);
  assert.match(h.shares[0].message, /https:\/\/maps.google.com/);
  assert.doesNotMatch(h.shares[0].message, /الثاني|guest|token/);
});

test('no-winner results do not promise an unavailable new round', async t => {
  for (const reason of ['no_votes', 'everyone_passed']) {
    const h = await harness(t, { endResponse: { ...result, no_winner_reason: reason } });
    h.props.state = { ...h.props.state, status: 'result' }; await h.update();
    const copy = h.screen.root.findAllByType('Tip').map(n => n.props.children).join(' ');
    assert.doesNotMatch(copy, /جولة جديدة|إعادة الجولة/);
    assert.match(copy, /ما حصلنا على اختيار مشترك/);
  }
});
