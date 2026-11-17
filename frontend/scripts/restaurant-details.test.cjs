const test = require('node:test');
const assert = require('node:assert/strict');
const { load, render, act, deferred, plain } = require('./helpers/render-feature.cjs');
const errors = load('shared/api/errors.ts');

test('details are fetched only when opened; a late reply cannot replace a new restaurant, and errors can retry', async t => {
  const calls = []; let current;
  const { useRestaurantDetails } = load('features/restaurants/useRestaurantDetails.ts', {
    '@/shared/api/errors': errors,
    './api': { getRestaurantDetails(id) { const pending = deferred(); calls.push({ id, ...pending }); return pending.promise; } },
  });
  function Probe({ id, visible }) { current = useRestaurantDetails(id, visible); return null; }
  const screen = await render(Probe, { id: 1, visible: false }); t.after(() => screen.close());
  assert.equal(calls.length, 0);
  await screen.update({ id: 1, visible: true }); assert.equal(current.status, 'loading');
  await screen.update({ id: 2, visible: true });
  await act(async () => calls[0].resolve({ id: 1 })); assert.equal(current.data, null);
  await act(async () => calls[1].reject(new errors.ApiError(0, 'NETWORK_ERROR', 'Offline')));
  assert.equal(current.status, 'error');
  await act(async () => current.retry());
  await act(async () => calls[2].resolve({ id: 2 }));
  assert.equal(current.data.id, 2);
  await screen.update({ id: 2, visible: false }); assert.equal(current.data, null);
  await screen.update({ id: 2, visible: true }); assert.equal(calls.length, 4);
  await act(async () => calls[3].reject(new errors.ApiError(404, 'RESTAURANT_NOT_FOUND', 'Missing')));
  assert.equal(current.status, 'missing');
});

test('hours do not invent opening status, weekdays or missing data', () => {
  const { restaurantHours } = load('features/restaurants/presentation.ts');
  assert.equal(restaurantHours(null), 'غير متوفرة حاليًا');
  assert.equal(restaurantHours({ open_24h: true, opens: null, closes: null, days_open: 7 }), '٢٤ ساعة · يوميًا');
  assert.equal(restaurantHours({ open_24h: false, opens: '16:00', closes: '01:30', days_open: 5 }), '٤:٠٠ م – ١:٣٠ ص · أيام العمل غير محددة');
});

test('search category keys match the backend and mock filters/details follow the same public contract', async () => {
  const fs = require('node:fs'), path = require('node:path');
  const options = load('features/restaurants/filterOptions.ts');
  const backend = fs.readFileSync(path.join(__dirname, '../../backend/app/services/plan/cuisines.py'), 'utf8');
  const keys = [...backend.matchAll(/^    "([a-z_]+)": \(/gm)].map(match => match[1]);
  assert.deepEqual(plain(options.cuisineFilters.map(([key]) => key)).sort(), keys.sort());
  const transport = load('shared/api/mockTransport.ts', { './errors': errors });
  load('features/restaurants/mocks.ts', { '@/shared/api/mockTransport': transport, '@/shared/api/errors': errors, './filterOptions': options }).registerRestaurantMocks();
  const api = load('features/restaurants/api.ts', { '@/shared/api/client': { request: transport.mockTransport }, '@/shared/api/errors': errors,
    '@/shared/api/config': { RESTAURANT_SEARCH_ENABLED: true } });
  const page = await api.getRestaurants(0, '', { cuisine: 'levant', districtId: 'preview-olaya' });
  assert.equal(page.total, 1); assert.equal(page.restaurants[0].id, 2);
  assert.equal((await api.getRestaurantDetails(2)).opening_hours.opens, '16:00');
  assert.equal((await api.getRestaurants(0, '', { cuisine: 'levant', districtId: 'preview-malqa' })).total, 0);
  await assert.rejects(() => api.getRestaurantDetails(999), { code: 'RESTAURANT_NOT_FOUND' });
});

test('details show fresh API data, keep directions visible, and never use stale card facts after a failure', async t => {
  const { native, shared } = require('./helpers/render-feature.cjs');
  let state = { status: 'loading', data: null, retry() {} };
  let retries = 0, closes = 0;
  const data = { id: 12, name_ar: 'المطعم من الخادم', name_en: null, cuisines: ['italian'], district: 'التعاون',
    rating: 4.8, rating_count: 120, spend_low: 55, spend_high: 100, summary: 'وصف فعلي من الخادم',
    opening_hours: { open_24h: false, opens: '07:00', closes: '23:00', days_open: 7 }, maps_url: 'https://maps.google.com/?q=24,46' };
  const { RestaurantDetails } = load('features/restaurants/components/RestaurantDetails.tsx', {
    'react-native': native, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-image': { Image: 'Image' }, 'expo-symbols': { SymbolView: 'SymbolView' },
    '@/shared/components': shared, '@/shared/theme': load('shared/theme.ts'),
    '../useRestaurantImage': { useRestaurantImage: () => ({ source: 1, illustrative: true, onError() {} }) },
    '../presentation': load('features/restaurants/presentation.ts'),
    '../useRestaurantDetails': { useRestaurantDetails: () => state },
    './RestaurantMapLink': { RestaurantMapLink: 'MapLink' },
  });
  const props = { restaurantId: 12, visible: true, name: 'اسم بطاقة قديم', cuisines: [],
    district: 'حي قديم', rating: 1, mapsUrl: 'https://maps.google.com/old', spendLow: 1, spendHigh: 2,
    onClose: () => { closes++; } };
  const screen = await render(RestaurantDetails, props); t.after(() => screen.close());
  const copy = () => screen.root.findAllByType('AppText').map(node => node.props.children).flat().join(' ');
  assert.equal(screen.root.findAllByType('MapLink').length, 0);
  assert(copy().includes('نحمّل تفاصيل المطعم'));
  state = { status: 'ready', data }; await screen.update({ ...props });
  assert(copy().includes(data.name_ar)); assert(copy().includes(data.summary)); assert(copy().includes('١٢٠ مراجعة'));
  assert(!copy().includes('حي قديم')); assert(!copy().includes('اسم بطاقة قديم'));
  const map = screen.root.findByType('MapLink'); assert.equal(map.props.mapsUrl, data.maps_url);
  assert.equal(screen.root.findByType('ScrollView').findAllByType('MapLink').length, 0); // Fixed footer, outside scrolling content.
  assert.equal(copy().includes('ليش اخترناه لك؟'), false);
  await screen.update({ ...props, reason: 'يناسب تفضيلاتك', distanceKm: 2 });
  assert(copy().includes('يناسب تفضيلاتك')); assert(copy().includes('٢ كم'));
  state = { status: 'ready', data: { ...data, rating: null, rating_count: null, summary: null, spend_low: null, spend_high: null, opening_hours: null, district: '', maps_url: null } };
  await screen.update({ ...props });
  assert(copy().includes('السعر غير متوفر')); assert(copy().includes('وصف المطعم غير متوفر حاليًا.'));
  assert(copy().includes('الحي غير متوفر')); assert(copy().includes('غير متوفرة حاليًا'));
  assert.equal(screen.root.findByType('MapLink').props.mapsUrl, null);
  state = { status: 'error', data: null, retry: () => { retries++; } }; await screen.update({ ...props });
  assert.equal(screen.root.findAllByType('MapLink').length, 0);
  assert(!copy().includes(data.summary));
  await act(async () => screen.root.findByProps({ title: 'إعادة تحميل التفاصيل' }).props.onPress()); assert.equal(retries, 1);
  state = { status: 'missing', data: null }; await screen.update({ ...props });
  assert.equal(screen.root.findAllByProps({ title: 'إعادة تحميل التفاصيل' }).length, 0);
  await act(async () => screen.root.findByProps({ title: 'العودة للمطاعم' }).props.onPress()); assert.equal(closes, 1);
  await act(async () => screen.root.findByProps({ accessibilityLabel: 'رجوع للقائمة' }).props.onPress()); assert.equal(closes, 2);
});
