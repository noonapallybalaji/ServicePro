// Verifies a deployed ServicePro API end to end over HTTPS (Cloudflare Tunnel), exactly as n8n will
// call it. Creates real test bookings (status NEW) — cancel them in the admin app afterwards.
// Prints results only; never prints the key, tokens or codes.
//
// Usage (PowerShell):
//   $env:SERVICEPRO_API_URL  = 'https://api.example.com'      # public API origin
//   $env:SERVICEPRO_SITE_URL = 'https://www.example.com'      # public customer site origin
//   $env:SERVICEPRO_N8N_KEY  = '<the n8n integration key>'
//   node apps/api/scripts/verify-public-api.mjs
const env = (name) => {
  const value = process.env[name]?.trim().replace(/\/+$/, '');
  if (!value) throw new Error(`Set ${name}`);
  return value;
};
const API = env('SERVICEPRO_API_URL');
const SITE = env('SERVICEPRO_SITE_URL');
const KEY = env('SERVICEPRO_N8N_KEY');
const PINCODE = process.env.SERVICEPRO_TEST_PINCODE ?? '500081'; // a pincode your service areas cover
const PHONE = process.env.SERVICEPRO_TEST_PHONE; // optional: a number you own, for the test booking
const KEY_HEADER = 'X-ServicePro-Integration-Key';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
async function call(method, path, { body, headers = {}, base = API } = {}) {
  const started = Date.now();
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, ms: Date.now() - started, headers: res.headers };
}
const secretLike = (text) => /accessToken|eyJ[A-Za-z0-9_-]{10,}|developmentCode"\s*:\s*"\d|refreshToken|sp_n8n_/.test(text);

// Tomorrow 15:00–18:00 IST
const d = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
const slot = { preferredSlotStart: `${d}T15:00:00+05:30`, preferredSlotEnd: `${d}T18:00:00+05:30` };

// 1. Catalogue
const cat = await call('GET', '/api/v1/catalog/categories');
check('GET /api/v1/catalog/categories → 200 anonymous', cat.status === 200, `${cat.json?.length} categories, ${cat.ms} ms`);
const ac = cat.json?.find((c) => c.code === 'AC');
const acIssue = ac?.issueTypes?.find((i) => i.isActive);
check('catalogue has real ids, visit charge and issue types', Boolean(ac?.id && acIssue?.id && typeof ac.baseVisitCharge === 'number'),
  `AC ${ac?.id?.slice(0, 8)}…, issue "${acIssue?.name}", visit ₹${ac?.baseVisitCharge}`);
console.log('      category fields:', Object.keys(ac ?? {}).join(', '));
console.log('      issue fields   :', Object.keys(acIssue ?? {}).join(', '));

// 2. Serviceability
const yes = await call('GET', `/api/v1/catalog/serviceability/${PINCODE}`);
check(`serviceability ${PINCODE} → isServiceable true`, yes.status === 200 && yes.json?.isServiceable === true, JSON.stringify(yes.json));
const no = await call('GET', '/api/v1/catalog/serviceability/110001');
check('serviceability 110001 → isServiceable false', no.status === 200 && no.json?.isServiceable === false, JSON.stringify(no.json));
const bad = await call('GET', '/api/v1/catalog/serviceability/12ab');
check('serviceability malformed pincode → not serviceable (no error)', bad.status === 200 && bad.json?.isServiceable === false, `${bad.status} ${bad.text.slice(0, 80)}`);

// 3. Public booking code: never echoes the code outside Development
const code = await call('POST', '/api/v1/public/bookings/code', { body: { phone: '9876501234' } });
check('POST /api/v1/public/bookings/code → 200, no code in response', code.status === 200 && code.json?.developmentCode == null, `developmentCode=${code.json?.developmentCode}`);
const pub = await call('POST', '/api/v1/public/bookings', {
  body: { categoryId: ac.id, issueTypeId: acIssue.id, problemDescription: 'test', fullName: 'Test', phone: '9876501234', code: '000000',
    address: { label: 'Home', line1: 'Flat 1', line2: null, landmark: null, locality: 'Madhapur', city: 'Hyderabad', state: null, pincode: PINCODE, latitude: null, longitude: null }, ...slot },
});
check('POST /api/v1/public/bookings with a wrong code → 400, nothing created', pub.status === 400, pub.json?.title);

// 4. Protected endpoints stay protected
for (const [path, label] of [
  ['/api/v1/catalog/price-list', 'price list'],
  ['/api/v1/catalog/brands', 'brands'],
  ['/api/v1/admin/customers/by-phone/9876501234', 'admin customer lookup'],
  ['/api/v1/admin/service-requests', 'admin service requests'],
]) {
  const r = await call('GET', path);
  check(`${label} anonymous → 401`, r.status === 401, `${r.status}`);
  const k = await call('GET', path, { headers: { [KEY_HEADER]: KEY } });
  check(`${label} with the n8n key → 401/403 (key unlocks bookings only)`, k.status === 401 || k.status === 403, `${k.status}`);
}
const docs = await call('GET', '/docs');
check('/docs not exposed in Public mode', docs.status === 404, `${docs.status}`);

// 5. Integration booking
const phone = PHONE ?? `91987650${String(Date.now()).slice(-4)}`;
const booking = (key, confirmed = true, extra = {}) => ({
  idempotencyKey: key, customerConfirmed: confirmed, categoryId: ac.id, issueTypeId: acIssue.id,
  problemDescription: 'AC not cooling since yesterday (verification test)', fullName: 'Tunnel Test', phone,
  address: { label: 'Home', line1: 'Flat 12, Test Towers', line2: null, landmark: 'Near metro', locality: 'Madhapur', city: 'Hyderabad', state: null, pincode: PINCODE, latitude: null, longitude: null },
  ...slot, ...extra,
});
const key = `wamid.TEST${Date.now()}`;
const noKey = await call('POST', '/api/v1/integrations/bookings', { body: booking(key) });
check('integration booking without key → 401', noKey.status === 401, `${noKey.status}`);
const wrongKey = await call('POST', '/api/v1/integrations/bookings', { body: booking(key), headers: { [KEY_HEADER]: KEY.slice(0, -2) + 'xx' } });
check('integration booking with wrong key → 401', wrongKey.status === 401, `${wrongKey.status}`);
const unconfirmed = await call('POST', '/api/v1/integrations/bookings', { body: booking(key, false), headers: { [KEY_HEADER]: KEY } });
check('customerConfirmed=false → 400, nothing created', unconfirmed.status === 400, JSON.stringify(unconfirmed.json?.errors ?? unconfirmed.json?.title));
const notServiceable = await call('POST', '/api/v1/integrations/bookings', { body: booking(`${key}-x`, true, { address: { ...booking(key).address, pincode: '110001' } }), headers: { [KEY_HEADER]: KEY } });
check('unserviceable pincode → 400 booking.not_serviceable', notServiceable.status === 400 && notServiceable.json?.code === 'booking.not_serviceable', `${notServiceable.status} ${notServiceable.json?.code}`);
const unknownCategory = await call('POST', '/api/v1/integrations/bookings', { body: booking(`${key}-y`, true, { categoryId: '00000000-0000-0000-0000-000000000001' }), headers: { [KEY_HEADER]: KEY } });
check('unknown category id → 400 booking.category_invalid', unknownCategory.status === 400 && unknownCategory.json?.code === 'booking.category_invalid', `${unknownCategory.status} ${unknownCategory.json?.code}`);

const first = await call('POST', '/api/v1/integrations/bookings', { body: booking(key), headers: { [KEY_HEADER]: KEY } });
check('confirmed integration booking → 200', first.status === 200, `${first.json?.srNumber} ${first.json?.status} in ${first.ms} ms`);
console.log('      response:', JSON.stringify(first.json));
check('response is a request, not a confirmed appointment', first.json?.status === 'NEW' && first.json?.appointmentConfirmed === false);
check('response contains no session, token or code', !secretLike(first.text));
check('tracking URL points at the public site, not the API', first.json?.trackingUrl?.startsWith(`${SITE}/t/`), first.json?.trackingUrl?.replace(/\/t\/.*/, '/t/…'));

const retry = await call('POST', '/api/v1/integrations/bookings', { body: booking(key), headers: { [KEY_HEADER]: KEY } });
check('retry with the same idempotency key → same booking, duplicate=true', retry.status === 200 && retry.json?.srNumber === first.json?.srNumber && retry.json?.duplicate === true, `${retry.json?.srNumber} duplicate=${retry.json?.duplicate}`);

const raceKey = `wamid.RACE${Date.now()}`;
const race = await Promise.all(Array.from({ length: 5 }, () => call('POST', '/api/v1/integrations/bookings', { body: booking(raceKey), headers: { [KEY_HEADER]: KEY } })));
const raceNumbers = new Set(race.filter((r) => r.status === 200).map((r) => r.json.srNumber));
check('5 simultaneous deliveries of one confirmation → exactly one booking', raceNumbers.size === 1 && race.every((r) => r.status === 200), `statuses ${race.map((r) => r.status).join(',')}, SRs ${[...raceNumbers].join(',')}`);

// 6. Tracking, through the public site and its /api proxy
const token = first.json?.trackingUrl?.split('/t/')[1];
const track = await call('GET', `/api/v1/public/track/${token}`);
check('GET /api/v1/public/track/{token} → 200', track.status === 200, `status ${track.json?.status}, ${track.json?.categoryName}`);
const trackViaSite = await call('GET', `/api/v1/public/track/${token}`, { base: SITE });
check('tracking API reachable through the site origin (/api proxy)', trackViaSite.status === 200);
const page = await call('GET', `/t/${token}`, { base: SITE });
check('tracking page /t/{token} on the site → 200, noindex', page.status === 200 && /noindex/.test(page.headers.get('x-robots-tag') ?? ''), `x-robots-tag: ${page.headers.get('x-robots-tag')}`);
const bogus = await call('GET', '/api/v1/public/track/not-a-real-token');
check('unknown tracking token → 404', bogus.status === 404, `${bogus.status}`);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
console.log(`Test bookings created: ${first.json?.srNumber ?? '-'}, ${[...raceNumbers].join(', ') || '-'} (cancel them in the admin app).`);
process.exitCode = failed ? 1 : 0;
