import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';

const [legacy, nest] = [process.argv[2] ?? 'http://localhost:3000', process.argv[3] ?? 'http://localhost:3002'];
const kp = Keypair.random();
const key = kp.publicKey();
const paritySecret = process.env.PARITY_SECRET;
const funded = paritySecret ? Keypair.fromSecret(paritySecret) : null;
const origin = process.env.PARITY_ORIGIN ?? 'http://localhost:8081';
const J = { 'content-type': 'application/json' };
const post = (b) => ({ method: 'POST', headers: J, body: typeof b === 'string' ? b : JSON.stringify(b) });

// mode: exact = status + body, shape = status + body keys, status = status only, info = print only
const cases = [
  ['check no phone', '/api/users/check', undefined, 'exact'],
  ['check abc', '/api/users/check?phone=abc', undefined, 'exact'],
  ['check blank', '/api/users/check?phone=%20', undefined, 'exact'],
  ['check unknown', '/api/users/check?phone=00000000000', undefined, 'exact'],
  ['check repeated', '/api/users/check?phone=00000000000&phone=1', undefined, 'exact'],
  ['lookup none', '/api/users/lookup', undefined, 'exact'],
  ['lookup blank shortId', '/api/users/lookup?shortId=%20', undefined, 'exact'],
  ['lookup unknown', '/api/users/lookup?shortId=zzNoSuch', undefined, 'exact'],
  ['lookup repeated', '/api/users/lookup?shortId=zzNoSuch&shortId=b', undefined, 'exact'],
  ['lookup object param', '/api/users/lookup?shortId[x]=1', undefined, 'exact'],
  ['lookup phone abc', '/api/users/lookup?phone=abc', undefined, 'exact'],
  ['register bad json', '/api/register', post('{'), 'exact'],
  ['register no body', '/api/register', { method: 'POST', headers: J }, 'exact'],
  ['register null body', '/api/register', post('null'), 'exact'],
  ['register string body', '/api/register', post('"text"'), 'exact'],
  ['register array body', '/api/register', post([]), 'exact'],
  ['register empty', '/api/register', post({}), 'exact'],
  ['register bad key', '/api/register', post({ stellarPublicKey: 'abc' }), 'exact'],
  ['register bad offline key', '/api/register', post({ stellarPublicKey: key, offlineDeviceKey: 'x' }), 'exact'],
  ['register bad phone', '/api/register', post({ stellarPublicKey: key, phoneNumber: 'abc' }), 'exact'],
  ['auth no account', '/api/auth', undefined, 'exact'],
  ['auth invalid account', '/api/auth?account=GABC', undefined, 'exact'],
  ['auth valid account', `/api/auth?account=${key}`, undefined, 'shape'],
  ['auth repeated account', `/api/auth?account=${key}&account=GABC`, undefined, 'shape'],
  ['auth POST no body', '/api/auth', { method: 'POST' }, 'exact'],
  ['auth POST empty', '/api/auth', post({}), 'exact'],
  ['auth POST malformed tx', '/api/auth', post({ transaction: 'not-a-transaction' }), 'exact'],
  ['auth PUT', '/api/auth', { method: 'PUT' }, 'exact'],
  ['auth DELETE', '/api/auth', { method: 'DELETE' }, 'exact'],
  ['pin verify empty', '/api/auth/pin/verify', post({}), 'exact'],
  ['otp send empty', '/api/otp/send', post({}), 'exact'],
  ['otp send bad phone', '/api/otp/send', post({ phoneNumber: 'abc' }), 'exact'],
  ['otp verify empty', '/api/otp/verify', post({}), 'exact'],
  ['health', '/api/health', undefined, 'info'],
  ['auth POST ws transaction', '/api/auth', post({ transaction: '   ' }), 'exact'],
    ['auth POST numeric tx', '/api/auth', post({ transaction: 123 }), 'exact'],
    ['auth POST object tx', '/api/auth', post({ transaction: {} }), 'exact'],
    ['auth POST null body', '/api/auth', post('null'), 'exact'],
    ['auth POST string body', '/api/auth', post('"x"'), 'exact'],
    ['auth POST bad json', '/api/auth', post('{'), 'exact'],
    ['auth POST json empty body', '/api/auth', { method: 'POST', headers: J }, 'exact'],
    ['auth POST text/plain', '/api/auth', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"transaction":"x"}' }, 'exact'],
    ['auth POST form', '/api/auth', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'transaction=x' }, 'exact'],
    ['auth POST multipart', '/api/auth', (() => { const f = new FormData(); f.set('transaction', 'x'); return { method: 'POST', body: f }; })(), 'exact'],
    ['auth GET object account', '/api/auth?account[x]=1', undefined, 'exact'],
    ['pin verify bad json', '/api/auth/pin/verify', post('{'), 'exact'],
    ['pin verify bad phone', '/api/auth/pin/verify', post({ phoneNumber: 'abc', pin: '1234' }), 'exact'],
    ['pin verify bad pin', '/api/auth/pin/verify', post({ phoneNumber: '+639171234567', pin: 'ab' }), 'exact'],
    ['pin verify unknown account', '/api/auth/pin/verify', post({ phoneNumber: '+639170000000', pin: '1234' }), 'exact'],
    ['PUT users/check', '/api/users/check', { method: 'PUT' }, 'exact'],
    ['PUT register', '/api/register', { method: 'PUT' }, 'exact'],
    ['unknown route', '/api/nope', undefined, 'status'],
];

async function hit(base, path, init) {
  try {
    const r = await fetch(base + path, init);
    const text = await r.text();
    let body = text.slice(0, 200);
    try { body = JSON.parse(text); } catch {}
    return { status: r.status, body };
  } catch (e) {
    return { status: 0, body: String(e.cause?.code ?? e.message) };
  }
}
const sortKeys = (v) =>
  Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]))
  : v;
const exact = (b) => JSON.stringify(sortKeys(b));
const shape = (b) => (b && typeof b === 'object' ? Object.keys(b).sort().join(',') : String(b));

let ok = 0, diff = 0, blocked = 0, info = 0;
let expectedCount = 0;
const results = [];
const expected = new Map([
  ['PUT register', '405 vs 404 for an unsupported method'],
  ['unknown route', 'framework-specific 404 response bodies'],
]);

const routeOf = (path, init) => `${init?.method ?? 'GET'} ${path.split('?')[0]}`;

const apiFiles = {
  'GET /api/users/check': {
    legacy: 'apps/_legacy/backend/app/api/users/check/route.ts',
    nest: 'apps/backend/src/modules/accounts/accounts.controller.ts',
  },
  'PUT /api/users/check': {
    legacy: 'apps/_legacy/backend/app/api/users/check/route.ts',
    nest: 'apps/backend/src/modules/accounts/accounts.controller.ts',
  },
  'GET /api/users/lookup': {
    legacy: 'apps/_legacy/backend/app/api/users/lookup/route.ts',
    nest: 'apps/backend/src/modules/accounts/accounts.controller.ts',
  },
  'POST /api/register': {
    legacy: 'apps/_legacy/backend/app/api/register/route.ts',
    nest: 'apps/backend/src/modules/accounts/accounts.controller.ts',
  },
  'PUT /api/register': {
    legacy: 'apps/_legacy/backend/app/api/register/route.ts',
    nest: 'apps/backend/src/modules/accounts/accounts.controller.ts',
  },
  'GET /api/auth': {
    legacy: 'apps/_legacy/backend/app/api/auth/route.ts',
    nest: 'apps/backend/src/modules/auth/auth.controller.ts',
  },
  'POST /api/auth': {
    legacy: 'apps/_legacy/backend/app/api/auth/route.ts',
    nest: 'apps/backend/src/modules/auth/auth.controller.ts',
  },
  'PUT /api/auth': {
    legacy: 'apps/_legacy/backend/app/api/auth/route.ts',
    nest: 'apps/backend/src/modules/auth/auth.controller.ts',
  },
  'DELETE /api/auth': {
    legacy: 'apps/_legacy/backend/app/api/auth/route.ts',
    nest: 'apps/backend/src/modules/auth/auth.controller.ts',
  },
  'POST /api/auth/pin/verify': {
    legacy: 'apps/_legacy/backend/app/api/auth/pin/verify/route.ts',
    nest: 'apps/backend/src/modules/auth/auth.controller.ts',
  },
  'POST /api/otp/send': {
    legacy: 'apps/_legacy/backend/app/api/otp/send/route.ts',
    nest: 'apps/backend/src/modules/otp/otp.controller.ts',
  },
  'POST /api/otp/verify': {
    legacy: 'apps/_legacy/backend/app/api/otp/verify/route.ts',
    nest: 'apps/backend/src/modules/otp/otp.controller.ts',
  },
  'GET /api/health': {
    legacy: 'apps/_legacy/backend/app/api/health/route.ts',
    nest: 'apps/backend/src/modules/health/health.controller.ts',
  },
  'GET /api/nope': {
    legacy: 'Next.js framework 404 (no route file)',
    nest: 'NestJS not-found handler (no controller)',
  },
};

function record(verdict, label, route) {
  results.push({ verdict, label, route });
  console.log(`${verdict.padEnd(9)}${route.padEnd(30)}${label}`);
}

function allowExpected(label, verdict) {
  return verdict === 'DIFF' && expected.has(label) ? 'EXPECTED' : verdict;
}

function countVerdict(verdict) {
  ({
    OK: () => ok++,
    EXPECTED: () => expectedCount++,
    DIFF: () => diff++,
    BLOCKED: () => blocked++,
    INFO: () => info++,
  })[verdict]();
}

function compareProbe(label, route, legacyResult, nestResult, equal) {
  const verdict = legacyResult.status === 0 ||
    nestResult.status === 0 ||
    legacyResult.responses?.includes(0) ||
    nestResult.responses?.includes(0)
    ? 'BLOCKED'
    : equal(legacyResult, nestResult) ? 'OK' : 'DIFF';
  countVerdict(verdict);
  record(verdict, label, route);
  if (verdict !== 'OK') {
    console.log(`         legacy ${JSON.stringify(legacyResult).slice(0, 400)}`);
    console.log(`         nest   ${JSON.stringify(nestResult).slice(0, 400)}`);
  }
}

function report(label, route, legacyResult, nestResult, showLegacySummary = false) {
  const same = exact(legacyResult) === exact(nestResult);
  const verdict = allowExpected(label, same ? 'OK' : 'DIFF');
  if (verdict === 'OK') ok++;
  else if (verdict === 'EXPECTED') expectedCount++;
  else diff++;

  record(verdict, label, route);
  if (showLegacySummary) {
    console.log(`         legacy summary ${JSON.stringify(legacyResult)}`);
  }
  if (verdict !== 'OK') {
    console.log(`         legacy ${JSON.stringify(legacyResult).slice(0, 400)}`);
    console.log(`         nest   ${JSON.stringify(nestResult).slice(0, 400)}`);
    if (verdict === 'EXPECTED') {
      console.log(`         expected: ${expected.get(label)}`);
    }
  }
}

async function summarize(base, account, qs = '') {
  const result = await hit(base, `/api/auth?account=${account}${qs}`);
  const { transaction, network_passphrase } = result.body ?? {};
  if (!transaction) return result;

  const tx = TransactionBuilder.fromXDR(transaction, network_passphrase);
  return {
    status: result.status,
    keys: Object.keys(result.body).sort(),
    network_passphrase,
    source: tx.source,
    sequence: tx.sequence,
    window: Number(tx.timeBounds.maxTime) - Number(tx.timeBounds.minTime),
    memo: tx.memo.type === 'none' ? null : [tx.memo.type, String(tx.memo.value)],
    signatures: tx.signatures.length,
    ops: tx.operations.map((operation) => ({
      type: operation.type,
      source: operation.source,
      name: operation.name,
      valueLen: operation.value?.length,
    })),
  };
}

async function signed(base, account) {
  const result = await hit(base, `/api/auth?account=${account.publicKey()}`);
  if (!result.body?.transaction || !result.body?.network_passphrase) return result;
  const transaction = TransactionBuilder.fromXDR(
    result.body.transaction,
    result.body.network_passphrase,
  );
  transaction.sign(account);
  return transaction.toXDR();
}

async function exchange(base, xdr) {
  if (typeof xdr !== 'string') return xdr;
  const result = await hit(base, '/api/auth', post({ transaction: xdr }));
  return { status: result.status, token: result.body?.token };
}

const claims = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());

async function signAndPost(base, account, signer) {
  const challenge = await hit(base, `/api/auth?account=${account.publicKey()}`);
  if (!challenge.body?.transaction || !challenge.body?.network_passphrase) return challenge;

  const transaction = TransactionBuilder.fromXDR(
    challenge.body.transaction,
    challenge.body.network_passphrase,
  );
  if (signer) transaction.sign(signer);
  const result = await hit(base, '/api/auth', post({ transaction: transaction.toXDR() }));
  if (!result.body?.token) return result;

  const tokenClaims = claims(result.body.token);
  return {
    status: result.status,
    keys: Object.keys(result.body).sort(),
    claimKeys: Object.keys(tokenClaims).sort(),
    iss: tokenClaims.iss,
    sub: tokenClaims.sub,
    lifetime: tokenClaims.exp - tokenClaims.iat,
  };
}

for (const [label, path, init, mode] of cases) {
  const l = await hit(legacy, path, init);
  const n = await hit(nest, path, init);
  let verdict;
  if (l.status >= 500) verdict = 'BLOCKED';
  else if (l.status !== n.status) verdict = 'DIFF';
  else if (mode === 'info') verdict = 'INFO';
  else if (mode === 'status') verdict = 'OK';
  else verdict = (mode === 'exact' ? exact(l.body) === exact(n.body) : shape(l.body) === shape(n.body)) ? 'OK' : 'DIFF';
  verdict = allowExpected(label, verdict);
  countVerdict(verdict);
  record(verdict, label, routeOf(path, init));
  if (verdict !== 'OK') {
    console.log(`         legacy ${l.status} ${JSON.stringify(l.body).slice(0, 160)}`);
    console.log(`         nest   ${n.status} ${JSON.stringify(n.body).slice(0, 160)}`);
    if (verdict === 'EXPECTED') console.log(`         expected: ${expected.get(label)}`);
  }
}

for (const [label, account, query] of [
  ['challenge plain', key, ''],
  ['challenge memo', key, '&memo=123'],
  ['challenge bad memo', key, '&memo=not-a-number'],
  ['challenge home_domain', key, '&home_domain=evil.example'],
  ['challenge client_domain', key, '&client_domain=evil.example'],
  ['challenge padded account', encodeURIComponent(` ${key} `), ''],
  ['challenge lowercase account', key.toLowerCase(), ''],
]) {
  report(
    label,
    'GET /api/auth',
    await summarize(legacy, account, query),
    await summarize(nest, account, query),
    true,
  );
}

if (!funded) {
  blocked++;
  record('BLOCKED', 'funded rows skipped: PARITY_SECRET not set', 'POST /api/auth');
}

const tokenCases = [
  ['POST client-signed, unfunded', kp, kp],
  ...(funded
    ? [
        ['POST unsigned, funded', funded, null],
        ['POST wrong signer, funded', funded, Keypair.random()],
        ['POST funded success + claims', funded, funded],
      ]
    : []),
];

for (const [label, account, signer] of tokenCases) {
  report(
    label,
    'POST /api/auth',
    await signAndPost(legacy, account, signer),
    await signAndPost(nest, account, signer),
    true,
  );
}

if (funded) {
  const replay = {};
  for (const [name, base] of [['legacy', legacy], ['nest', nest]]) {
    const challenge = await signed(base, funded);
    if (typeof challenge !== 'string') {
      replay[name] = [challenge.status, challenge.status];
      continue;
    }
    const first = await exchange(base, challenge);
    const second = await exchange(base, challenge);
    replay[name] = [first.status, second.status];
  }
  compareProbe(
    'SEP-10 replay status',
    'POST /api/auth',
    { status: replay.legacy?.[0] ?? 0, responses: replay.legacy },
    { status: replay.nest?.[0] ?? 0, responses: replay.nest },
    (a, b) => exact(a.responses) === exact(b.responses),
  );

  if (process.env.GUARDED_PATH) {
    const legacyXdr = await signed(legacy, funded);
    const nestXdr = await signed(nest, funded);
    const legacyToken = await exchange(legacy, legacyXdr);
    const nestToken = await exchange(nest, nestXdr);
    const callGuard = async (base, token) => {
      if (typeof token !== 'string') return { status: 0 };
      try {
        const response = await fetch(`${base}${process.env.GUARDED_PATH}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        return { status: response.status };
      } catch (error) {
        return { status: 0, error: String(error.cause?.code ?? error.message) };
      }
    };
    const legacyTokenOnNest = await callGuard(nest, legacyToken.token);
    const nestTokenOnLegacy = await callGuard(legacy, nestToken.token);
    compareProbe(
      'cross-server token compatibility',
      `GET ${process.env.GUARDED_PATH}`,
      {
        status: legacyTokenOnNest.status,
        tokenIssued: legacyToken.status === 200,
      },
      {
        status: nestTokenOnLegacy.status,
        tokenIssued: nestToken.status === 200,
      },
      (a, b) =>
        a.status !== 401 &&
        b.status !== 401 &&
        a.tokenIssued &&
        b.tokenIssued,
    );
  }
} else {
  console.log('SKIP replay probe: PARITY_SECRET not set (funded token probe is already BLOCKED above)');
  if (process.env.GUARDED_PATH) console.log('SKIP cross-server token probe: PARITY_SECRET not set');
}

const corsKeys = [
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-allow-credentials',
  'access-control-max-age',
];
async function cors(base, path, method) {
  try {
    const response = await fetch(`${base}${path}`, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': method,
        'access-control-request-headers': 'authorization,content-type,x-signature',
      },
    });
    return {
      status: response.status,
      headers: Object.fromEntries(corsKeys.map((name) => [name, response.headers.get(name)])),
    };
  } catch (error) {
    return { status: 0, error: String(error.cause?.code ?? error.message) };
  }
}

for (const [path, method] of [
  ['/api/auth', 'POST'],
  ['/api/register', 'POST'],
  ['/api/health', 'GET'],
]) {
  const legacyResult = await cors(legacy, path, method);
  const nestResult = await cors(nest, path, method);
  compareProbe(
    `CORS preflight ${method} ${path}`,
    `OPTIONS ${path}`,
    legacyResult,
    nestResult,
    (a, b) => exact(a) === exact(b),
  );
}

console.log(`\nOK ${ok}  EXPECTED ${expectedCount}  DIFF ${diff}  BLOCKED ${blocked}  INFO ${info}`);

for (const verdict of ['DIFF', 'BLOCKED', 'EXPECTED', 'INFO', 'OK']) {
  const rows = results.filter((result) => result.verdict === verdict);
  if (!rows.length) continue;
  console.log(`\n${verdict} (${rows.length})`);
  for (const result of rows) {
    console.log(`  ${result.route.padEnd(30)}${result.label}`);
  }
}

console.log('\nAPI source files');
for (const [route, files] of Object.entries(apiFiles)) {
  if (!results.some((result) => result.route === route)) continue;
  console.log(`  ${route}`);
  console.log(`    legacy: ${files.legacy}`);
  console.log(`    nest:   ${files.nest}`);
}

const byRoute = {};
for (const result of results) {
  byRoute[result.route] ??= { OK: 0, EXPECTED: 0, DIFF: 0, BLOCKED: 0, INFO: 0 };
  byRoute[result.route][result.verdict]++;
}
console.table(byRoute);
process.exitCode = diff || blocked ? 1 : 0;