import { createHmac, randomInt } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

// Read credentials without logging them. Each server may have its own secret.
function environment(directory) {
  const values = {};
  for (const name of ['.env', '.env.local']) {
    const path = fileURLToPath(new URL(`${directory}/${name}`, import.meta.url));
    if (existsSync(path)) Object.assign(values, parseEnv(readFileSync(path, 'utf8')));
  }
  return values;
}
const servers = [
  { name: 'legacy', url: process.argv[2] ?? 'http://127.0.0.1:3000', env: environment('../../../_legacy/backend') },
  { name: 'nest', url: process.argv[3] ?? 'http://127.0.0.1:3001', env: environment('../..') },
];
servers[0].secret = process.env.PARITY_LEGACY_WEBHOOK_SECRET ?? servers[0].env.TEXTBEE_WEBHOOK_SECRET;
servers[1].secret = process.env.PARITY_NEST_WEBHOOK_SECRET ?? servers[1].env.TEXTBEE_WEBHOOK_SECRET;

// Only volatile trace IDs are normalized; status, response shape, and error text
// must match. No valid vouchers or authenticated SMS sends are published here.
function normalize(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  return Object.fromEntries(Object.entries(body).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, key === 'traceId' ? '<traceId>' : value]));
}
const cases = [
  { name: 'unsigned webhook', raw: '{}', sign: false, status: 401 },
  { name: 'malformed signature', raw: '{}', signature: 'not-hex', status: 401 },
  { name: 'wrong signature', raw: '{}', signature: '0'.repeat(64), status: 401 },
  { name: 'tampered signed bytes', raw: '{ } ', signBody: '{ }', status: 401 },
  { name: 'invalid JSON', raw: '{', status: 400 },
  { name: 'missing sender/message', raw: '{}', status: 400 },
  { name: 'old receipt', raw: '{"event":"MESSAGE_SENT"}', status: 200 },
  { name: 'current receipt', raw: '{"webhookEvent":"MESSAGE_SENT"}', status: 200 },
  { name: 'status receipt', raw: '{"status":"sent"}', status: 200 },
  { name: 'ignored event', raw: '{"event":"MESSAGE_DELIVERED"}', status: 200 },
  { name: 'alternate signature header', raw: '{"event":"MESSAGE_SENT"}', header: 'x-textbee-signature', status: 200 },
  { name: 'sha256 signature prefix', raw: '{"event":"MESSAGE_SENT"}', prefix: 'sha256=', status: 200 },
  { name: 'stale timestamp', raw: '{}', timestamp: '1', status: 401, timestampReason: true },
  { name: 'invalid timestamp', raw: '{}', timestamp: 'invalid-timestamp', status: 401 },
  { name: 'SMS text above limit', raw: JSON.stringify({ sender: '+639171234567', message: 'x'.repeat(301) }), status: 400 },
  { name: 'raw body above limit', raw: JSON.stringify({ payload: 'x'.repeat(2100) }), status: 413 },
  { name: 'invalid voucher', raw: JSON.stringify({ event: 'MESSAGE_RECEIVED', data: { sender: `+639${randomInt(100000000, 999999999)}`, message: 'not-a-voucher' } }), status: 400 },
  { name: 'unauthorized dispatch', path: '/api/sms/dispatch', raw: '{}', sign: false, status: 401 },
  { name: 'unauthorized malformed dispatch', path: '/api/sms/dispatch', raw: '{', sign: false, status: 401 },
  { name: 'GET dispatch', path: '/api/sms/dispatch', method: 'GET', sign: false, status: 405 },
  ...['PUT', 'PATCH', 'DELETE'].flatMap((method) => ['webhook', 'dispatch'].map((route) => ({ name: `${method} ${route}`, path: `/api/sms/${route}`, method, sign: false, status: 405 }))),
];

let passed = 0, differences = 0, blocked = 0;
for (const server of servers) {
  try {
    const response = await fetch(`${server.url}/api/sms/webhook`, { signal: AbortSignal.timeout(5000) });
    if (response.status !== 200) throw new Error('webhook health unavailable');
    const body = await response.json();
    if (body.route !== '/api/sms/webhook' || body.success !== true) throw new Error('unexpected webhook health');
    console.log(`OK ${server.name} webhook health`);
  } catch {
    console.log(`BLOCKED ${server.name} webhook health`);
    process.exitCode = 2;
    break;
  }
}
if (!process.exitCode) {
  for (const probe of cases) {
    if (probe.sign !== false && !probe.signature && servers.some((server) => !server.secret)) {
      console.log(`BLOCKED ${probe.name}: webhook signing secret missing`); blocked++; continue;
    }
    const results = await Promise.all(servers.map(async (server) => {
      const headers = { 'content-type': 'application/json' };
      if (probe.sign !== false) headers[probe.header ?? 'x-signature'] = probe.signature ?? `${probe.prefix ?? ''}${createHmac('sha256', server.secret).update(probe.signBody ?? probe.raw).digest('hex')}`;
      if (probe.timestamp) headers['x-timestamp'] = probe.timestamp;
      try {
        const response = await fetch(`${server.url}${probe.path ?? '/api/sms/webhook'}`, { method: probe.method ?? 'POST', headers, body: probe.raw, signal: AbortSignal.timeout(8000) });
        const text = await response.text();
        let body = text;
        try { body = JSON.parse(text); } catch {}
        // Elapsed drift differs by fractions of a second between requests.
        if (probe.timestampReason && typeof body?.error === 'string') body.error = body.error.replace(/Timestamp drift [\d.]+s/, 'Timestamp drift <seconds>s');
        return { status: response.status, body: normalize(body) };
      } catch { return null; }
    }));
    if (results.some((result) => result === null)) { blocked++; console.log(`BLOCKED ${probe.name}: connection failure`); }
    else if (results.every((result) => result.status === probe.status) && JSON.stringify(results[0]) === JSON.stringify(results[1])) { passed++; console.log(`OK ${probe.name}`); }
    else { differences++; console.log(`DIFF ${probe.name} ${JSON.stringify(results)}`); }
  }
  console.log(`SMS parity: ${passed} OK / ${differences} DIFF / ${blocked} BLOCKED`);
  console.log('Not exercised live: authenticated dispatch delivery, successful voucher buffering, gateway fallback, or on-chain settlement. These require mocks or dedicated live inputs.');
  console.log('Expected migration changes: QStash dispatch auth becomes SMS_DISPATCH_SECRET; webhook health qstashToken becomes false.');
  process.exitCode = differences ? 1 : blocked ? 2 : 0;
}
