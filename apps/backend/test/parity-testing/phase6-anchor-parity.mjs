const legacyBase = process.env.PARITY_LEGACY_URL ?? 'http://127.0.0.1:3001';
const nestBase = process.env.PARITY_NEST_URL ?? 'http://127.0.0.1:3002';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function normalizedToml(value) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).join('\n');
}

async function call(base, path, options = {}) {
  try {
    const response = await fetch(`${base}${path}`, options);
    const text = await response.text();
    let body = text;
    try { body = JSON.parse(text); } catch { /* Preserve plain text TOML and error bodies. */ }
    return {
      ok: true,
      status: response.status,
      body,
      headers: {
        contentType: response.headers.get('content-type'),
        allowOrigin: response.headers.get('access-control-allow-origin'),
        cacheControl: response.headers.get('cache-control'),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const cases = [
  { name: 'GET stellar.toml', path: '/.well-known/stellar.toml', options: {}, headers: ['contentType', 'allowOrigin', 'cacheControl'] },
  { name: 'GET sep24/info', path: '/api/sep24/info', options: {}, headers: ['allowOrigin', 'cacheControl'] },
  { name: 'GET sep24/transaction without auth', path: '/api/sep24/transaction?id=parity-safe-probe', options: {} },
  { name: 'POST deposit initiation without auth', path: '/api/sep24/transactions/deposit/interactive', options: { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"asset_code":"PHPC"}' } },
  { name: 'POST withdraw initiation without auth', path: '/api/sep24/transactions/withdraw/interactive', options: { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"asset_code":"PHPC"}' } },
  { name: 'POST submit withdraw without auth', path: '/api/anchor/submit-withdraw', options: { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' } },
  { name: 'POST confirm withdraw without auth', path: '/api/anchor/confirm-withdraw', options: { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' } },
  { name: 'POST simulate payment without token', path: '/api/anchor/simulate-payment', options: { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"transaction_id":"parity-safe-probe","amount":"1"}' } },
  { name: 'POST submit withdraw malformed JSON', path: '/api/anchor/submit-withdraw', options: { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' } },
  { name: 'POST confirm withdraw malformed JSON', path: '/api/anchor/confirm-withdraw', options: { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' } },
  { name: 'POST simulate payment malformed JSON', path: '/api/anchor/simulate-payment', options: { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' } },
];

let ok = 0;
let diff = 0;
let blocked = 0;
for (const test of cases) {
  const [legacy, nest] = await Promise.all([
    call(legacyBase, test.path, test.options),
    call(nestBase, test.path, test.options),
  ]);
  if (!legacy.ok || !nest.ok) {
    blocked += 1;
    console.log(`BLOCKED ${test.name}: legacy=${legacy.ok ? 'reachable' : 'unreachable'} nest=${nest.ok ? 'reachable' : 'unreachable'}`);
    continue;
  }
  const headersEqual = (test.headers ?? []).every((key) => legacy.headers[key] === nest.headers[key]);
  const bodyEqual = test.name === 'GET stellar.toml' && typeof legacy.body === 'string' && typeof nest.body === 'string'
    ? normalizedToml(legacy.body) === normalizedToml(nest.body)
    : JSON.stringify(stable(legacy.body)) === JSON.stringify(stable(nest.body));
  const same = legacy.status === nest.status && bodyEqual && headersEqual;
  if (same) {
    ok += 1;
    console.log(`OK ${test.name}`);
  } else {
    diff += 1;
    let differingTomlKeys = '';
    if (test.name === 'GET stellar.toml' && typeof legacy.body === 'string' && typeof nest.body === 'string') {
      const pairs = (text) => new Map(text.split(/\r?\n/).map((line) => line.trim()).flatMap((line) => {
        const match = /^([A-Z_]+)=(.*)$/.exec(line);
        return match ? [[match[1], match[2]]] : [];
      }));
      const left = pairs(legacy.body);
      const right = pairs(nest.body);
      differingTomlKeys = [...new Set([...left.keys(), ...right.keys()])].filter((key) => left.get(key) !== right.get(key)).join(',');
    }
    console.log(`DIFF ${test.name}: status ${legacy.status}/${nest.status}, body_equal=${bodyEqual}, selected_headers_equal=${headersEqual}${differingTomlKeys ? `, differing_TOML_keys=${differingTomlKeys}` : ''}`);
  }
}
console.log(`Phase 6 safe Anchor parity: ${ok} OK / ${diff} DIFF / ${blocked} BLOCKED`);
if (diff > 0) process.exitCode = 1;
if (blocked === cases.length) process.exitCode = 2;
