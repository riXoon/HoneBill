import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';

const BASE = process.env.BASE ?? 'http://localhost:3000/api';
const json = { 'Content-Type': 'application/json' };

async function call(label, url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  const shown = body && typeof body === 'object' ? { ...body } : body;
  if (shown?.transaction) shown.transaction = shown.transaction.slice(0, 16) + '...';
  if (shown?.token) shown.token = '<redacted>';
  console.log(`\n[${label}] status ${res.status}`);
  console.log(JSON.stringify(shown));
  return { status: res.status, body };
}

const claims = (token) =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

async function fund(kp) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
    if (r.ok) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Friendbot funding failed');
}

async function handshake(label, kp, memo) {
  const q = `account=${kp.publicKey()}${memo ? `&memo=${memo}` : ''}`;
  const ch = await call(`${label}: GET challenge`, `${BASE}/auth?${q}`);
  if (ch.status !== 200) return;
  const tx = TransactionBuilder.fromXDR(ch.body.transaction, ch.body.network_passphrase);
  tx.sign(kp);
  const res = await call(`${label}: POST signed challenge`, `${BASE}/auth`, {
    method: 'POST', headers: json, body: JSON.stringify({ transaction: tx.toXDR() }),
  });
  if (res.status === 200 && res.body.token) {
    const c = claims(res.body.token);
    console.log('decoded claims:', JSON.stringify({
      sub_matches_account: c.sub === kp.publicKey(),
      iss: c.iss, memo: c.memo ?? '(none)',
      ttl_seconds: c.exp - c.iat, has_exp: typeof c.exp === 'number',
      extra_claims: Object.keys(c).filter((k) => !['sub','iss','iat','exp','memo'].includes(k)),
    }));
  }
}

const kp = Keypair.random();
console.log(`Target: ${BASE}`);

// Challenge and rejection paths
await call('GET valid account', `${BASE}/auth?account=${kp.publicKey()}`);
await call('GET missing account', `${BASE}/auth`);
await call('GET invalid account', `${BASE}/auth?account=GABC`);
await call('GET bad memo', `${BASE}/auth?account=${kp.publicKey()}&memo=abc`);
await call('POST garbage tx', `${BASE}/auth`, { method: 'POST', headers: json, body: '{"transaction":"garbage"}' });
await call('POST empty body', `${BASE}/auth`, { method: 'POST', headers: json, body: '{}' });

// Unfunded account (should be 401)
await handshake('unfunded', Keypair.random());

// Funded account, no memo, then with memo
await fund(kp);
await handshake('funded', kp);
await handshake('funded+memo', kp, '12345');