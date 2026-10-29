import { Keypair } from '@stellar/stellar-sdk';

const [legacy, nest] = process.argv.slice(2);
if (!legacy || !nest) {
  throw new Error(
    'Usage: node ./test/box234-extra.tmp.mjs <legacy-url> <nest-url>',
  );
}

const only = new Set((process.env.ONLY ?? 'otp,register,pin').split(','));
const tally = { OK: 0, DIFF: 0 };

async function call(base, path, { method = 'POST', body, raw } = {}) {
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
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

  row(
    'PUT /api/otp/send',
    await call(legacy, '/api/otp/send', { method: 'PUT', body: {} }),
    await call(nest, '/api/otp/send', { method: 'PUT', body: {} }),
    (result) => result.status,
  );

  const legacyPhone = process.env.PARITY_OTP_PHONE_LEGACY;
  const nestPhone = process.env.PARITY_OTP_PHONE_NEST;
  const code = process.env.PARITY_OTP_CODE;
  if (
    process.env.PARITY_OTP_TEST_MODE_CONFIRMED === 'true' &&
    legacyPhone &&
    nestPhone &&
    code
  ) {
    const send = (base, phoneNumber) =>
      call(base, '/api/otp/send', { body: { phoneNumber } });
    const verify = (base, phoneNumber, otpCode) =>
      call(base, '/api/otp/verify', {
        body: { phoneNumber, code: otpCode },
      });
    const verifyShape = (result) =>
      result.json?.token || result.json?.verificationToken
        ? { status: result.status, keys: Object.keys(result.json).sort() }
        : result.json ?? result.text;

    row(
      'OTP verify before send',
      await verify(legacy, legacyPhone, code),
      await verify(nest, nestPhone, code),
      verifyShape,
    );
    row(
      'OTP send success',
      await send(legacy, legacyPhone),
      await send(nest, nestPhone),
    );
    row(
      'OTP verify wrong code',
      await verify(legacy, legacyPhone, '000000'),
      await verify(nest, nestPhone, '000000'),
      verifyShape,
    );
    row(
      'OTP verify correct code',
      await verify(legacy, legacyPhone, code),
      await verify(nest, nestPhone, code),
      verifyShape,
    );
    row(
      'OTP verify reuse',
      await verify(legacy, legacyPhone, code),
      await verify(nest, nestPhone, code),
      verifyShape,
    );

    const legacySends = [];
    const nestSends = [];
    for (let attempt = 0; attempt < 8; attempt++) {
      legacySends.push(await send(legacy, legacyPhone));
      nestSends.push(await send(nest, nestPhone));
    }
    row(
      'OTP send-limit sequence',
      { status: 200, json: legacySends.map((result) => [result.status, result.retryAfter != null]) },
      { status: 200, json: nestSends.map((result) => [result.status, result.retryAfter != null]) },
    );
  } else {
    console.log(
      'SKIP OTP live checks: confirm both servers use OTP_TEST_MODE with PARITY_OTP_TEST_MODE_CONFIRMED=true, and set both test phones plus PARITY_OTP_CODE',
    );
  }
}

if (only.has('register')) {
  const randomPublicKey = () => Keypair.random().publicKey();
  async function sendRegistration(fields, phones = [undefined, undefined]) {
    const [legacyPhone, nestPhone] = phones;
    return [
      await call(legacy, '/api/register', {
        body: {
          stellarPublicKey: randomPublicKey(),
          ...fields,
          ...(legacyPhone && { phoneNumber: legacyPhone }),
        },
      }),
      await call(nest, '/api/register', {
        body: {
          stellarPublicKey: randomPublicKey(),
          ...fields,
          ...(nestPhone && { phoneNumber: nestPhone }),
        },
      }),
    ];
  }

  async function compareRegistration(label, fields) {
    const phones = [
      process.env.PARITY_REGISTER_PHONE_LEGACY,
      process.env.PARITY_REGISTER_PHONE_NEST,
    ];
    const [legacyResult, nestResult] = await sendRegistration(fields, phones);
    row(label, legacyResult, nestResult, responseShape);
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
}

if (only.has('pin') && process.env.PARITY_PIN_PHONE) {
  const phone = process.env.PARITY_PIN_PHONE;
  const badPin = process.env.PARITY_PIN_BAD ?? '0000';
  const goodPin = process.env.PARITY_PIN_GOOD;
  if (badPin === goodPin) {
    throw new Error('PARITY_PIN_BAD must not match PARITY_PIN_GOOD.');
  }

  const clearCounter = async () => {
    if (!process.env.REDIS_URL || !process.env.PARITY_PIN_DBPHONE) {
      console.log(
        'WARN PIN counter not cleared; set REDIS_URL and PARITY_PIN_DBPHONE only for the disposable test Redis.',
      );
      return;
    }
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL);
    try {
      await redis.del(`pijin:pin:fail:${process.env.PARITY_PIN_DBPHONE}`);
    } finally {
      redis.disconnect();
    }
  };

  const lockoutSequence = async (base) => {
    await clearCounter();
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

  const legacyAttempts = await lockoutSequence(legacy);
  const nestAttempts = await lockoutSequence(nest);
  legacyAttempts.forEach((result, index) =>
    row(`PIN lockout attempt ${index + 1}`, result, nestAttempts[index]),
  );

  if (goodPin) {
    const recoverySequence = async (base) => {
      await clearCounter();
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
    const legacyRecovery = await recoverySequence(legacy);
    const nestRecovery = await recoverySequence(nest);
    legacyRecovery.forEach((result, index) =>
      row(`PIN clears counter step ${index + 1}`, result, nestRecovery[index]),
    );
  }
  await clearCounter();
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

console.log(`\nOK ${tally.OK}  DIFF ${tally.DIFF}`);
process.exitCode = tally.DIFF ? 1 : 0;
