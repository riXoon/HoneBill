import { Keypair } from '@stellar/stellar-sdk';
const [L, N, mode] = process.argv.slice(2);
const servers = [['legacy', L], ['nest', N]];
const J = { 'content-type': 'application/json' };
const post = (o) => ({ method: 'POST', headers: J, body: JSON.stringify(o) });
const rnd = () => '0999' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
async function call(base, path, init) {
  const r = await fetch(base + path, init);
  const t = await r.text(); let body = t; try { body = JSON.parse(t); } catch {}
  return { s: r.status, body, ra: r.headers.get('retry-after') };
}

if (mode === 'lockout') {
  const out = {};
  for (const [name, base] of servers) {
    const phone = rnd();
    await call(base, '/api/register', post({ stellarPublicKey: Keypair.random().publicKey(), phoneNumber: phone, pin: '1234' }));
    const steps = [];
    for (let i = 1; i <= 7; i++) {
      const r = await call(base, '/api/auth/pin/verify', post({ phoneNumber: phone, pin: '0000' }));
      steps.push(`wrong #${i}: ${r.s} ${JSON.stringify(r.body)} retry-after=${r.ra}`);
    }
    const ok = await call(base, '/api/auth/pin/verify', post({ phoneNumber: phone, pin: '1234' }));
    steps.push(`correct while locked: ${ok.s} ${JSON.stringify(ok.body)} retry-after=${ok.ra}`);
    out[name] = steps;
  }
  out.legacy.forEach((l, i) => {
    const same = l === out.nest[i];
    console.log(same ? 'OK  ' : 'DIFF', l);
    if (!same) console.log('     nest  ', out.nest[i]);
  });
}

if (mode === 'burst') {
  const plans = [
    ['check (60/min)', 61, '/api/users/check?phone=0000'],
    ['lookup (300/min)', 301, '/api/users/lookup?shortId=zzNoSuch'],
    ['register (30/10min)', 31, '/api/register', post({})],
    ['pin verify (30/min)', 31, '/api/auth/pin/verify', post({})],
  ];
  for (const [label, n, path, init] of plans) {
    const res = {};
    for (const [name, base] of servers) {
      const counts = {}; let first429 = null;
      for (let i = 1; i <= n; i++) {
        const r = await call(base, path, init);
        counts[r.s] = (counts[r.s] ?? 0) + 1;
        if (r.s === 429 && !first429) first429 = `request #${i} body=${JSON.stringify(r.body)} retry-after=${r.ra}`;
      }
      res[name] = `${JSON.stringify(counts)} first429: ${first429}`;
    }
    console.log(res.legacy === res.nest ? 'OK  ' : 'DIFF', label, '\n  legacy', res.legacy, '\n  nest  ', res.nest);
  }
}