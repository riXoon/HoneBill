import { Keypair } from '@stellar/stellar-sdk';

const [legacy, nest] = process.argv.slice(2);
if (!legacy || !nest) {
  throw new Error(
    'Usage: node ./test/parity-testing/box234-extra.tmp.mjs <legacy-url> <nest-url>',
  );
}

for (const [name, base] of [
  ['legacy', legacy],
  ['nest', nest],
]) {
  try {
    await fetch(`${base}/api/health`);
  } catch {
    console.error(`BLOCKED: ${name} not reachable at ${base}. No requests sent.`);
    process.exit(2);
  }
}

const only = new Set((process.env.ONLY ?? 'otp,register,pin,methods').split(','));
const tally = { OK: 0, DIFF: 0, BLOCKED: 0 };

async function call(base, path, { method = 'POST', body, raw, headers = {} } = {}) {
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body:
        method === 'GET'
          ? undefined
          : raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return {
      status: response.status,
      allow: response.headers.get('allow'),
      retryAfter: response.headers.get('retry-after'),
      json,
      text,
    };
  } catch (error) {
    return {
      status: 0,
      retryAfter: null,
      json: null,
      text: String(error.cause?.code ?? error),
    };
  }
}

const near = (a, b) => Math.abs(Number(a) - Number(b)) <= 2;

function same(a, b, pick) {
  if (a.status === 0 || b.status === 0 || a.status !== b.status) return false;
  if ((a.retryAfter == null) !== (b.retryAfter == null)) return false;
  if (a.retryAfter != null && !near(a.retryAfter, b.retryAfter)) return false;

  const legacyBody = structuredClone(pick(a));
  const nestBody = structuredClone(pick(b));
  if (
    legacyBody?.retryAfter != null &&
    nestBody?.retryAfter != null &&
    near(legacyBody.retryAfter, nestBody.retryAfter)
  ) {
    nestBody.retryAfter = legacyBody.retryAfter;
  }
  return JSON.stringify(legacyBody) === JSON.stringify(nestBody);
}

function row(name, legacyResult, nestResult, pick = (result) => result.json ?? result.text) {
  const matches = same(legacyResult, nestResult, pick);
  tally[matches ? 'OK' : 'DIFF']++;
  console.log(`${matches ? 'OK  ' : 'DIFF'}  ${name}`);
  if (!matches) {
    for (const [label, result] of [
      ['legacy', legacyResult],
      ['nest  ', nestResult],
    ]) {
      console.log(
        `   ${label} ${result.status} ${result.retryAfter ?? ''} ${JSON.stringify(pick(result)).slice(0, 220)}`,
      );
    }
  }
}

function expectResult(name, result, predicate, safeBody = (r) => r.json ?? r.text) {
  const passed = result.status !== 0 && predicate(result);
  tally[passed ? 'OK' : 'DIFF']++;
  console.log(`${passed ? 'OK  ' : 'DIFF'}  ${name}`);
  if (!passed) console.log(`   got ${result.status} ${JSON.stringify(safeBody(result)).slice(0, 220)}`);
  return passed;
}

function strictRow(name, legacyResult, nestResult, expectedLegacy, expectedNest, pick) {
  expectResult(`${name} legacy expectation`, legacyResult, expectedLegacy, pick);
  expectResult(`${name} Nest expectation`, nestResult, expectedNest, pick);
  row(`${name} parity`, legacyResult, nestResult, pick);
}

const responseShape = (result) =>
  !result.json?.data
    ? result.json ?? result.text
    : {
        success: result.json.success,
        keys: Object.keys(result.json.data).sort(),
        firstName: result.json.data.firstName,
        lastName: result.json.data.lastName,
        email: result.json.data.email,
        phoneNumber: result.json.data.phoneNumber,
        offlineDeviceKey: result.json.data.offlineDeviceKey,
        role: result.json.data.role,
        hasPin: 'pin' in result.json.data,
      };

if (only.has('otp')) {
  for (const path of ['/api/otp/send', '/api/otp/verify']) {
    row(
      `OTP bad JSON ${path}`,
      await call(legacy, path, { raw: '{' }),
      await call(nest, path, { raw: '{' }),
    );
  }

  for (const path of ['/api/otp/send', '/api/otp/verify']) {
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
      const unsupported = (result) => result.status === 405 && result.text === '';
      strictRow(
        `${method} ${path}`,
        await call(legacy, path, { method }),
        await call(nest, path, { method }),
        unsupported,
        unsupported,
        (result) => ({ status: result.status, allow: result.allow, body: result.text }),
      );
    }
  }

  const legacyPhone = process.env.PARITY_OTP_PHONE_LEGACY;
  const nestPhone = process.env.PARITY_OTP_PHONE_NEST;
  const code = process.env.PARITY_OTP_CODE;
  if (
    process.env.PARITY_OTP_TEST_MODE_CONFIRMED === 'true' &&
    legacyPhone &&
    nestPhone &&
    code
  ) {
    const send = (base, phoneNumber, ip) =>
      call(base, '/api/otp/send', {
        body: { phoneNumber },
        headers: ip ? { 'x-forwarded-for': ip } : {},
      });
    const verify = (base, phoneNumber, otpCode) =>
      call(base, '/api/otp/verify', {
        body: { phoneNumber, code: otpCode },
      });
    const verifyShape = (result) => {
      if (!result.json || typeof result.json !== 'object') return result.json ?? result.text;
      const { token, verificationToken, ...body } = result.json;
      return {
        ...body,
        ...(token !== undefined && { token: typeof token }),
        ...(verificationToken !== undefined && { verificationToken: typeof verificationToken }),
      };
    };
    const expired = (result) =>
      result.status === 400 &&
      result.json?.error === 'OTP has expired or was never sent. Please request a new one.';
    const invalidCode = (result) =>
      result.status === 401 &&
      result.json?.error === 'Invalid verification code.' &&
      result.json?.attemptsRemaining === 4;
    const sent = (result) =>
      result.status === 200 &&
      result.json?.success === true &&
      result.json?.message === 'OTP sent successfully.';
    const verified = (result) => {
      const token = result.json?.verificationToken ?? result.json?.token;
      return result.status === 200 && result.json?.success === true &&
        result.json?.message === 'Phone number verified.' &&
        typeof token === 'string' && token.split('.').length === 3 &&
        Number.isFinite(Number(result.json?.expiresIn)) && Number(result.json.expiresIn) > 0;
    };

    strictRow(
      'OTP verify before send',
      await verify(legacy, legacyPhone, code),
      await verify(nest, nestPhone, code),
      expired, expired, verifyShape,
    );
    strictRow(
      'OTP send success',
      await send(legacy, legacyPhone),
      await send(nest, nestPhone),
      sent, sent,
    );
    strictRow(
      'OTP verify wrong code',
      await verify(legacy, legacyPhone, code === '000000' ? '000001' : '000000'),
      await verify(nest, nestPhone, code === '000000' ? '000001' : '000000'),
      invalidCode, invalidCode, verifyShape,
    );
    strictRow(
      'OTP verify correct code',
      await verify(legacy, legacyPhone, code),
      await verify(nest, nestPhone, code),
      verified, verified,
    );
    strictRow(
      'OTP verify reuse',
      await verify(legacy, legacyPhone, code),
      await verify(nest, nestPhone, code),
      expired, expired, verifyShape,
    );

    const limitPhones = [
      process.env.PARITY_OTP_LIMIT_PHONE_LEGACY,
      process.env.PARITY_OTP_LIMIT_PHONE_NEST,
    ];
    if (limitPhones.every(Boolean)) {
      const limitSequence = async (base, phone, ip) => {
        const results = [];
        for (let attempt = 0; attempt < 8; attempt++) {
          results.push(await send(base, phone, ip));
        }
        return results;
      };
      const legacySends = await limitSequence(legacy, limitPhones[0], '198.51.100.41');
      const nestSends = await limitSequence(nest, limitPhones[1], '198.51.100.41');
      const statuses = (results) => results.map((result) => result.status);
      console.log(`OTP send-limit statuses: legacy ${statuses(legacySends).join(',')} | Nest ${statuses(nestSends).join(',')}`);
      const limitAtExpectedPoint = (results) =>
        results[0]?.status === 200 && results[1]?.status === 200 &&
        results[2]?.status === 200 && results[3]?.status === 429;
      expectResult('OTP send-limit legacy assertion (429 on request 4)',
        { status: legacySends[3]?.status ?? 0, json: statuses(legacySends) },
        () => limitAtExpectedPoint(legacySends), (r) => r.json);
      expectResult('OTP send-limit Nest assertion (429 on request 4)',
        { status: nestSends[3]?.status ?? 0, json: statuses(nestSends) },
        () => limitAtExpectedPoint(nestSends), (r) => r.json);
      row('OTP send-limit sequence parity',
        { status: 200, json: statuses(legacySends) },
        { status: 200, json: statuses(nestSends) });
    } else {
      tally.BLOCKED++;
      console.log('BLOCKED OTP send-limit sequence: set distinct allow-listed PARITY_OTP_LIMIT_PHONE_LEGACY and PARITY_OTP_LIMIT_PHONE_NEST values.');
    }
  } else {
    tally.BLOCKED++;
    console.log(
      'SKIP OTP live checks: confirm both servers use OTP_TEST_MODE with PARITY_OTP_TEST_MODE_CONFIRMED=true, and set both test phones plus PARITY_OTP_CODE',
    );
  }
}

if (only.has('methods')) {
  const methodCases = [
    ['/api/register', 'POST'],
    ['/api/users/check', 'GET'],
    ['/api/users/lookup', 'GET'],
  ];
  for (const [path, supported] of methodCases) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      if (method === supported) continue;
      const unsupported = (result) => result.status === 405 && result.text === '';
      strictRow(
        `${method} ${path}`,
        await call(legacy, path, { method }),
        await call(nest, path, { method }),
        unsupported,
        unsupported,
        (result) => ({ status: result.status, allow: result.allow, body: result.text }),
      );
    }
  }
}

if (only.has('register')) {
  const randomPublicKey = () => Keypair.random().publicKey();
  const created = { legacy: [], nest: [] };
  async function sendRegistration(fields, phones = [undefined, undefined]) {
    const [legacyPhone, nestPhone] = phones;
    const legacyKey = randomPublicKey();
    const nestKey = randomPublicKey();
    created.legacy.push(legacyKey);
    created.nest.push(nestKey);
    return [
      await call(legacy, '/api/register', {
        body: {
          stellarPublicKey: legacyKey,
          ...fields,
          ...(legacyPhone && { phoneNumber: legacyPhone }),
        },
      }),
      await call(nest, '/api/register', {
        body: {
          stellarPublicKey: nestKey,
          ...fields,
          ...(nestPhone && { phoneNumber: nestPhone }),
        },
      }),
    ];
  }

  function reportRegistration(label, legacyResult, nestResult) {
    if (legacyResult.status !== 201) {
      console.log(`BLOCKED ${label}: legacy returned ${legacyResult.status}`);
      tally.DIFF++;
      return;
    }
    if (
      label.includes('PIN') &&
      (responseShape(legacyResult).hasPin || responseShape(nestResult).hasPin)
    ) {
      console.log(`DIFF  ${label}: pin returned`);
      tally.DIFF++;
      return;
    }
    row(label, legacyResult, nestResult, responseShape);
  }

  async function compareRegistration(label, fields) {
    const phones = [
      process.env.PARITY_REGISTER_PHONE_LEGACY,
      process.env.PARITY_REGISTER_PHONE_NEST,
    ];
    const [legacyResult, nestResult] = await sendRegistration(fields, phones);
    reportRegistration(label, legacyResult, nestResult);
  }

  await compareRegistration('register blank names/email', {
    firstName: '  ',
    lastName: '',
    email: '   ',
  });
  await compareRegistration('register padded names and uppercase email', {
    firstName: ' Ana ',
    lastName: ' Cruz ',
    email: ' A@B.CO ',
  });
  await compareRegistration('register PIN omitted from response', {
    pin: '1234',
  });
  console.log(
    'NOTE registration probes create test rows in both databases; clean them up after the run.',
  );
  console.log('Created keys:', JSON.stringify(created));
}

if (only.has('pin') && process.env.PARITY_PIN_PHONE) {
  const phone = process.env.PARITY_PIN_PHONE;
  const badPin = process.env.PARITY_PIN_BAD ?? '0000';
  const goodPin = process.env.PARITY_PIN_GOOD;
  if (badPin === goodPin) {
    throw new Error('PARITY_PIN_BAD must not match PARITY_PIN_GOOD.');
  }

  const clearCounter = async (server) => {
    const redisUrl = process.env[`REDIS_URL_${server.toUpperCase()}`];
    if (!redisUrl || !process.env.PARITY_PIN_DBPHONE) {
      console.log(
        `WARN ${server} PIN counter not cleared; set REDIS_URL_${server.toUpperCase()} and PARITY_PIN_DBPHONE only for disposable test Redis.`,
      );
      return;
    }
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(redisUrl);
    try {
      await redis.del(`honebill:pin:fail:${process.env.PARITY_PIN_DBPHONE}`);
    } finally {
      redis.disconnect();
    }
  };

  const lockoutSequence = async (server, base) => {
    await clearCounter(server);
    const results = [];
    for (let attempt = 1; attempt <= 7; attempt++) {
      results.push(
        await call(base, '/api/auth/pin/verify', {
          body: { phoneNumber: phone, pin: badPin },
        }),
      );
    }
    return results;
  };

  const legacyAttempts = await lockoutSequence('legacy', legacy);
  const nestAttempts = await lockoutSequence('nest', nest);
  legacyAttempts.forEach((result, index) =>
    row(`PIN lockout attempt ${index + 1}`, result, nestAttempts[index]),
  );

  if (goodPin) {
    const recoverySequence = async (server, base) => {
      await clearCounter(server);
      const results = [];
      for (const pin of [badPin, badPin, goodPin, badPin]) {
        results.push(
          await call(base, '/api/auth/pin/verify', {
            body: { phoneNumber: phone, pin },
          }),
        );
      }
      return results;
    };
    const legacyRecovery = await recoverySequence('legacy', legacy);
    const nestRecovery = await recoverySequence('nest', nest);
    legacyRecovery.forEach((result, index) =>
      row(`PIN clears counter step ${index + 1}`, result, nestRecovery[index]),
    );
  }
  await clearCounter('legacy');
  await clearCounter('nest');
} else if (only.has('pin')) {
  console.log('SKIP PIN lockout: set PARITY_PIN_PHONE to a disposable registered test account.');
}

if (only.has('burst')) {
  const burst = async (base) => {
    const results = [];
    for (let attempt = 1; attempt <= 40; attempt++) {
      const result = await call(base, '/api/auth/pin/verify', { body: {} });
      results.push(result);
      if (result.status === 429) break;
    }
    return results;
  };

  const legacyBurst = await burst(legacy);
  console.log('Waiting 65 seconds for the legacy throttle window to reset.');
  await new Promise((resolve) => setTimeout(resolve, 65_000));
  const nestBurst = await burst(nest);
  const legacyLimited = legacyBurst.at(-1);
  const nestLimited = nestBurst.at(-1);
  console.log(
    `First 429 request: legacy ${legacyBurst.findIndex((result) => result.status === 429) + 1 || 'not reached'}, nest ${nestBurst.findIndex((result) => result.status === 429) + 1 || 'not reached'}`,
  );
  const ra = (result) => Number(result.retryAfter);
  const raOk = (result) =>
    Number.isInteger(ra(result)) && ra(result) >= 1 && ra(result) <= 60;
  const matches =
    legacyLimited?.status === 429 &&
    nestLimited?.status === 429 &&
    JSON.stringify(legacyLimited.json ?? legacyLimited.text) ===
      JSON.stringify(nestLimited.json ?? nestLimited.text) &&
    raOk(legacyLimited) &&
    raOk(nestLimited);
  tally[matches ? 'OK' : 'DIFF']++;
  console.log(`${matches ? 'OK  ' : 'DIFF'}  PIN 429 response`);
  if (!matches) {
    for (const [label, result] of [
      ['legacy', legacyLimited],
      ['nest  ', nestLimited],
    ]) {
      console.log(
        `   ${label} ${result?.status ?? 'missing'} Retry-After=${result?.retryAfter ?? 'missing'} ${JSON.stringify(result?.json ?? result?.text).slice(0, 220)}`,
      );
    }
  }
}

console.log(`\nOK ${tally.OK}  DIFF ${tally.DIFF}  BLOCKED ${tally.BLOCKED ?? 0}`);
process.exitCode = tally.DIFF || tally.BLOCKED ? 1 : 0;
