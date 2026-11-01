import { Keypair } from '@stellar/stellar-sdk';
const [L, N] = [process.argv[2] ?? 'http://localhost:3000', process.argv[3] ?? 'http://localhost:3002'];
const J = { 'content-type': 'application/json' };
const call = async (b, p, init) => {
  const r = await fetch(b + p, init);
  const t = await r.text(); let body = t; try { body = JSON.parse(t); } catch {}
  return { s: r.status, body };
};
const post = (o) => ({ method: 'POST', headers: J, body: JSON.stringify(o) });
const keys = (o) => (o && typeof o === 'object' ? Object.keys(o).sort().join(',') : String(o));
const rnd = () => '0999' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
const log = (label, a, b) => console.log(`${a.s === b.s ? 'OK  ' : 'DIFF'} ${label}: legacy ${a.s} / nest ${b.s}`);

// 1. register the same shape on each server, compare shapes and stored phone
const acct = {};
for (const [name, base] of [['legacy', L], ['nest', N]]) {
  const phone = rnd();
  const kp = Keypair.random().publicKey();
  const r = await call(base, '/api/register', post({ stellarPublicKey: kp, phoneNumber: phone, pin: '1234', firstName: 'Ana', lastName: 'Cruz' }));
  acct[name] = { phone, kp, shortId: r.body?.data?.shortId, r };
  console.log(name, 'register', r.s, 'data keys:', keys(r.body?.data), 'phone stored:', r.body?.data?.phoneNumber);
}
log('register status', acct.legacy.r, acct.nest.r);

// 2. cross-server reads: account made on one server, read on the other
for (const [from, to, base] of [['legacy', 'nest', N], ['nest', 'legacy', L]]) {
  const a = acct[from];
  const byId = await call(base, `/api/users/lookup?shortId=${a.shortId}`);
  const byPhone = await call(base, `/api/users/check?phone=${a.phone}`);
  const intl = await call(base, `/api/users/check?phone=%2B63${a.phone.slice(1)}`);
  const pin = await call(base, '/api/auth/pin/verify', post({ phoneNumber: a.phone, pin: '1234' }));
  console.log(`${from} -> read on ${to}: lookup ${byId.s} ${byId.body?.found}, check ${byPhone.s} ${byPhone.body?.exists}, +63 check ${intl.s} ${intl.body?.exists}, pin ${pin.s}`);
}

// 3. duplicates
for (const [name, base] of [['legacy', L], ['nest', N]]) {
  const a = acct[name];
  console.log(name, 'dup phone', (await call(base, '/api/register', post({ stellarPublicKey: Keypair.random().publicKey(), phoneNumber: a.phone }))).body);
  console.log(name, 'dup key  ', (await call(base, '/api/register', post({ stellarPublicKey: a.kp }))).body);
}