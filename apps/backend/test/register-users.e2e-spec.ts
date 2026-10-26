import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Keypair } from '@stellar/stellar-sdk';
import request from 'supertest';
import { LegacyHttpExceptionFilter } from '../src/common/filters/legacy-http-exception.filter.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisService } from '../src/infra/redis/redis.service.js';
import { AccountsController } from '../src/modules/accounts/accounts.controller.js';
import { AccountsService } from '../src/modules/accounts/accounts.service.js';
import { signVerificationToken } from '../src/modules/auth/otp.util.js';
import { toDbPhone } from '../src/modules/auth/phone.util.js';

// Runs against a real Postgres (DATABASE_URL, migrations applied). Use a local dev database only.
// The test creates its own rows and deletes them by Stellar key in afterAll.
const OTP_SECRET = 'e2e-otp-secret-not-real';

type UniqueViolation = { code?: string; meta?: { target?: unknown } };

describe('Register and users with real Postgres (e2e)', () => {
  const configValues: Record<string, unknown> = {};
  const createdKeys: string[] = [];
  let app: INestApplication;
  let prisma: PrismaService;

  const newKey = () => {
    const key = Keypair.random().publicKey();
    createdKeys.push(key);
    return key;
  };
  const newPhone = () => `0917${Math.floor(1000000 + Math.random() * 8999999)}`;
  const newShortId = () => Math.random().toString(36).slice(2, 8).padEnd(6, 'x');

  const register = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/register').send(body);

  async function registered() {
    const phone = newPhone();
    const key = newKey();
    const res = await register({
      stellarPublicKey: key,
      phoneNumber: phone,
      firstName: 'Ana',
      lastName: 'Cruz',
    }).expect(201);
    return { phone, key, data: res.body.data as { shortId: string; phoneNumber: string } };
  }

  async function captureUniqueViolation(run: () => Promise<unknown>): Promise<UniqueViolation> {
    try {
      await run();
    } catch (error) {
      return error as UniqueViolation;
    }
    throw new Error('Expected a unique constraint violation');
  }

  const targetFieldsOf = (error: UniqueViolation): string[] => {
    const target = error.meta?.target;
    if (typeof target === 'string') return [target];
    return Array.isArray(target) ? target.map(String) : [];
  };

  beforeAll(async () => {
    configValues.DATABASE_URL = process.env.DATABASE_URL;
    const moduleRef = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [
        AccountsService,
        PrismaService,
        { provide: RedisService, useValue: { getClient: () => ({}) } },
        {
          provide: ConfigService,
          useValue: { get: (key: string, fallback?: unknown) => configValues[key] ?? fallback },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new LegacyHttpExceptionFilter());
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  beforeEach(() => {
    for (const key of Object.keys(configValues)) delete configValues[key];
    configValues.DATABASE_URL = process.env.DATABASE_URL;
    configValues.OTP_VERIFICATION_JWT_SECRET = OTP_SECRET;
  });

  afterAll(async () => {
    await prisma.account.deleteMany({ where: { stellarPublicKey: { in: createdKeys } } });
    await app.close();
  });

  describe('POST /api/register', () => {
    it('registers a user: 201, no pin in the body, PIN stored hashed, phone stored in DB format', async () => {
      const phone = newPhone();
      const key = newKey();
      const res = await register({
        stellarPublicKey: key,
        phoneNumber: phone,
        pin: '1234',
        firstName: 'Ana',
        lastName: 'Cruz',
        email: 'Ana@Example.com',
      }).expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).not.toHaveProperty('pin');
      expect(res.body.data).toMatchObject({
        stellarPublicKey: key,
        phoneNumber: toDbPhone(phone),
        firstName: 'Ana',
        lastName: 'Cruz',
        email: 'ana@example.com',
      });
      expect(typeof res.body.data.shortId).toBe('string');

      const row = await prisma.account.findUnique({ where: { stellarPublicKey: key } });
      expect(row?.pin).toEqual(expect.any(String));
      expect(row?.pin).not.toBe('1234');
    });

    it('registers with only a Stellar key (phone and PIN are optional)', async () => {
      const res = await register({ stellarPublicKey: newKey() }).expect(201);
      expect(res.body.success).toBe(true);
    });

    const invalidCases: Array<{ name: string; payload: () => Record<string, unknown>; message: string }> = [
      { name: 'missing Stellar key', payload: () => ({ phoneNumber: newPhone() }), message: 'Missing required field: stellarPublicKey' },
      { name: 'bad Stellar key format', payload: () => ({ stellarPublicKey: 'GABC' }), message: 'Invalid Stellar Public Key format' },
      { name: 'bad phone number', payload: () => ({ stellarPublicKey: newKey(), phoneNumber: '12' }), message: 'Invalid phone number.' },
      { name: 'bad PIN format', payload: () => ({ stellarPublicKey: newKey(), pin: '12' }), message: 'PIN must be 4 to 6 digits.' },
      { name: 'bad email', payload: () => ({ stellarPublicKey: newKey(), email: 'nope' }), message: 'Invalid email address.' },
      { name: 'first name too long', payload: () => ({ stellarPublicKey: newKey(), firstName: 'x'.repeat(51) }), message: 'First name must be at most 50 characters.' },
    ];
    for (const c of invalidCases) {
      it(`400 for ${c.name}`, async () => {
        const res = await register(c.payload()).expect(400);
        // Loose on purpose: tighten to the exact legacy body once the live parity diff is done.
        expect(JSON.stringify(res.body)).toContain(c.message);
      });
    }

    it('409 for a duplicate phone number, also when sent in another format', async () => {
      const first = await registered();
      const res = await register({
        stellarPublicKey: newKey(),
        phoneNumber: `+${toDbPhone(first.phone)}`,
      }).expect(409);
      expect(JSON.stringify(res.body)).toContain('Phone number is already registered.');
    });

    it('409 for a duplicate Stellar key', async () => {
      const first = await registered();
      const res = await register({ stellarPublicKey: first.key, phoneNumber: newPhone() }).expect(409);
      expect(JSON.stringify(res.body)).toContain('Stellar Public Key is already registered.');
    });

    it('requires a phone verification token for the right phone when REQUIRE_OTP_TOKEN is true', async () => {
      configValues.REQUIRE_OTP_TOKEN = 'true';
      const phone = newPhone();
      const key = newKey();

      await register({ stellarPublicKey: key, phoneNumber: phone }).expect(401);
      await register({
        stellarPublicKey: key,
        phoneNumber: phone,
        verificationToken: signVerificationToken(newPhone(), OTP_SECRET),
      }).expect(401);
      await register({
        stellarPublicKey: key,
        phoneNumber: phone,
        verificationToken: signVerificationToken(phone, OTP_SECRET),
      }).expect(201);
    });
  });

  describe('Prisma unique violations (what the register retry logic relies on)', () => {
    it('a duplicate Stellar key gives P2002 with a usable meta.target', async () => {
      const key = newKey();
      await prisma.account.create({ data: { shortId: newShortId(), role: 'USER', stellarPublicKey: key } });

      const error = await captureUniqueViolation(() =>
        prisma.account.create({ data: { shortId: newShortId(), role: 'USER', stellarPublicKey: key } }),
      );
      const fields = targetFieldsOf(error);
      if (error.code !== 'P2002' || !fields.some((f) => f.toLowerCase().includes('stellar'))) {
        throw new Error(`Unusable P2002 shape: ${JSON.stringify({ code: error.code, meta: error.meta })}`);
      }
    });

    it('a duplicate short ID gives P2002 with a usable meta.target', async () => {
      const shortId = newShortId();
      await prisma.account.create({ data: { shortId, role: 'USER', stellarPublicKey: newKey() } });

      const error = await captureUniqueViolation(() =>
        prisma.account.create({ data: { shortId, role: 'USER', stellarPublicKey: newKey() } }),
      );
      const fields = targetFieldsOf(error);
      if (error.code !== 'P2002' || !fields.some((f) => f.toLowerCase().includes('short'))) {
        throw new Error(`Unusable P2002 shape: ${JSON.stringify({ code: error.code, meta: error.meta })}`);
      }
    });
  });

  describe('GET /api/users/check', () => {
    it('400 without a phone', async () => {
      await request(app.getHttpServer()).get('/api/users/check').expect(400);
    });

    it('{ exists: false } for an unknown phone', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users/check')
        .query({ phone: newPhone() })
        .expect(200);
      expect(res.body).toEqual({ exists: false });
    });

    // DECISION TEST: asserts the behavior we expect (any phone format finds the account).
    // If the local-format case fails, compare with legacy users/check before changing the service:
    // either use toDbPhone in checkUser/lookupUser, or flip this test and log the legacy behavior.
    it('finds the account for local, +63 and 63 phone formats', async () => {
      const { phone, key } = await registered();
      const db = toDbPhone(phone);
      for (const variant of [phone, `+${db}`, db]) {
        const res = await request(app.getHttpServer())
          .get('/api/users/check')
          .query({ phone: variant })
          .expect(200);
        expect({ variant, exists: res.body.exists }).toEqual({ variant, exists: true });
        expect(res.body.stellarPublicKey).toBe(key);
      }
    });
  });

  describe('GET /api/users/lookup', () => {
    it('400 without shortId or phone', async () => {
      await request(app.getHttpServer()).get('/api/users/lookup').expect(400);
    });

    it('404 { found: false } for an unknown short ID', async () => {
      await request(app.getHttpServer())
        .get('/api/users/lookup')
        .query({ shortId: 'zzNoSuchId' })
        .expect(404, { found: false });
    });

    it('finds by short ID with a display name', async () => {
      const { key, data } = await registered();
      const res = await request(app.getHttpServer())
        .get('/api/users/lookup')
        .query({ shortId: data.shortId })
        .expect(200);
      expect(res.body).toMatchObject({
        found: true,
        shortId: data.shortId,
        stellarPublicKey: key,
        offlineDeviceKey: null,
        displayName: 'Ana Cruz',
        firstName: 'Ana',
        lastName: 'Cruz',
      });
    });

    // DECISION TEST: same normalisation question as users/check.
    it('finds by phone for local, +63 and 63 formats', async () => {
      const { phone, key } = await registered();
      const db = toDbPhone(phone);
      for (const variant of [phone, `+${db}`, db]) {
        const res = await request(app.getHttpServer())
          .get('/api/users/lookup')
          .query({ phone: variant });
        expect({ variant, status: res.status }).toEqual({ variant, status: 200 });
        expect(res.body.stellarPublicKey).toBe(key);
      }
    });

    // Needs the array guard in AccountsController (typeof checks on the query params).
    it('400 (not 500) for a repeated shortId query parameter', async () => {
      await request(app.getHttpServer()).get('/api/users/lookup?shortId=a&shortId=b').expect(400);
    });
  });
});