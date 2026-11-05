import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Keypair } from '@stellar/stellar-sdk';
import request from 'supertest';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisService } from '../src/infra/redis/redis.service.js';
import { AccountsController } from '../src/modules/accounts/accounts.controller.js';
import { AccountsService } from '../src/modules/accounts/accounts.service.js';
import { signVerificationToken } from '../src/common/utils/otp.util.js';
import { toDbPhone } from '../src/common/utils/phone.util.js';
import { classifyAccountUniqueConstraint } from '../src/modules/accounts/unique-constraint.js';

// Runs against a real Postgres (DATABASE_URL, migrations applied). Use a local dev database only.
// The test creates its own rows and deletes them by Stellar key in afterAll.
const OTP_SECRET = 'e2e-otp-secret-not-real';

describe('Register and users with real Postgres (e2e)', () => {
  const configValues: Record<string, unknown> = {};
  const createdKeys: string[] = [];
  let app: INestApplication | undefined;
  let prisma: PrismaService | undefined;

  const newKey = () => {
    const key = Keypair.random().publicKey();
    createdKeys.push(key);
    return key;
  };
  const newPhone = () => `0917${Math.floor(1000000 + Math.random() * 8999999)}`;
  const newShortId = () => Math.random().toString(36).slice(2, 8).padEnd(6, 'x');

  const getApp = () => {
    if (!app) throw new Error('Register E2E app was not initialized.');
    return app;
  };
  const getPrisma = () => {
    if (!prisma) throw new Error('Register E2E Prisma client was not initialized.');
    return prisma;
  };
  const register = (body: Record<string, unknown>) => {
    return request(getApp().getHttpServer()).post('/api/register').send(body);
  };

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

  async function captureUniqueViolation(run: () => Promise<unknown>): Promise<unknown> {
    try {
      await run();
    } catch (error) {
      return error;
    }
    throw new Error('Expected a unique constraint violation');
  }

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        'Register E2E requires DATABASE_URL. Set it in apps/backend/.env or the test environment.',
      );
    }

    let parsedDatabaseUrl: URL;
    try {
      parsedDatabaseUrl = new URL(databaseUrl);
    } catch {
      throw new Error('Register E2E requires DATABASE_URL to be a valid PostgreSQL URL.');
    }

    if (
      !['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol) ||
      !parsedDatabaseUrl.username ||
      !parsedDatabaseUrl.password
    ) {
      throw new Error(
        'Register E2E requires DATABASE_URL with a PostgreSQL username and password.',
      );
    }

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
    const application = moduleRef.createNestApplication();
    app = application;
    application.setGlobalPrefix('api');
    application.useGlobalFilters(new ApiExceptionFilter());
    await application.init();
    prisma = moduleRef.get(PrismaService);
  });

  beforeEach(() => {
    for (const key of Object.keys(configValues)) delete configValues[key];
    configValues.DATABASE_URL = process.env.DATABASE_URL;
    configValues.OTP_VERIFICATION_JWT_SECRET = OTP_SECRET;
  });

  afterAll(async () => {
    const database = prisma;
    if (database && createdKeys.length > 0) {
      await database.account.deleteMany({ where: { stellarPublicKey: { in: createdKeys } } });
    }
    await app?.close();
  });

  describe('POST /api/register', () => {
    it('returns the legacy invalid-body response for an empty request body', async () => {
      await request(getApp().getHttpServer())
        .post('/api/register')
        .set('Content-Type', 'application/json')
        .expect(400, { error: 'Invalid JSON body' });
    });

    it.each([
      ['null', 'Invalid JSON body'],
      ['"text"', 'Invalid JSON body'],
      ['[]', 'Missing required field: stellarPublicKey'],
    ])('matches legacy handling for JSON body %s', async (body, message) => {
      const response = await request(getApp().getHttpServer())
        .post('/api/register')
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(400);

      expect(response.body).toEqual({ error: message });
    });

    it('returns the legacy error for malformed JSON', async () => {
      await request(getApp().getHttpServer())
        .post('/api/register')
        .set('Content-Type', 'application/json')
        .send('{')
        .expect(400, { error: 'Invalid JSON body' });
    });

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

      const row = await getPrisma().account.findUnique({ where: { stellarPublicKey: key } });
      expect(row?.pin).toEqual(expect.any(String));
      expect(row?.pin).not.toBe('1234');
    });

    it('registers with only a Stellar key (phone and PIN are optional)', async () => {
      const res = await register({ stellarPublicKey: newKey() }).expect(201);
      expect(res.body.success).toBe(true);
    });

    it('stores whitespace-only optional fields as null', async () => {
      const key = newKey();
      await register({
        stellarPublicKey: key,
        firstName: '  ',
        lastName: '\t',
        email: '   ',
      }).expect(201);

      const row = await getPrisma().account.findUnique({ where: { stellarPublicKey: key } });
      expect(row).toMatchObject({ firstName: null, lastName: null, email: null });
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
      await getPrisma().account.create({ data: { shortId: newShortId(), role: 'USER', stellarPublicKey: key } });

      const error = await captureUniqueViolation(() =>
        getPrisma().account.create({ data: { shortId: newShortId(), role: 'USER', stellarPublicKey: key } }),
      );
      if (classifyAccountUniqueConstraint(error) !== 'stellarPublicKey') {
        throw new Error(`Unusable P2002 shape: ${JSON.stringify(error)}`);
      }
    });

    it('a duplicate short ID gives P2002 with a usable meta.target', async () => {
      const shortId = newShortId();
      await getPrisma().account.create({ data: { shortId, role: 'USER', stellarPublicKey: newKey() } });

      const error = await captureUniqueViolation(() =>
        getPrisma().account.create({ data: { shortId, role: 'USER', stellarPublicKey: newKey() } }),
      );
      if (classifyAccountUniqueConstraint(error) !== 'shortId') {
        throw new Error(`Unusable P2002 shape: ${JSON.stringify(error)}`);
      }
    });
  });

  describe('GET /api/users/check', () => {
    it('400 without a phone', async () => {
      await request(getApp().getHttpServer()).get('/api/users/check').expect(400);
    });

    it('{ exists: false } for an unknown phone', async () => {
      const res = await request(getApp().getHttpServer())
        .get('/api/users/check')
        .query({ phone: newPhone() })
        .expect(200);
      expect(res.body).toEqual({ exists: false });
    });

    it('finds the account for local, +63 and 63 phone formats', async () => {
      const { phone, key } = await registered();
      const db = toDbPhone(phone);
      for (const variant of [phone, `+${db}`, db]) {
        const res = await request(getApp().getHttpServer())
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
      await request(getApp().getHttpServer()).get('/api/users/lookup').expect(400);
    });

    it('404 { found: false } for an unknown short ID', async () => {
      await request(getApp().getHttpServer())
        .get('/api/users/lookup')
        .query({ shortId: 'zzNoSuchId' })
        .expect(404, { found: false });
    });

    it('finds by short ID with a display name', async () => {
      const { key, data } = await registered();
      const res = await request(getApp().getHttpServer())
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

    it('finds by phone for local, +63 and 63 formats', async () => {
      const { phone, key } = await registered();
      const db = toDbPhone(phone);
      for (const variant of [phone, `+${db}`, db]) {
        const res = await request(getApp().getHttpServer())
          .get('/api/users/lookup')
          .query({ phone: variant });
        expect({ variant, status: res.status }).toEqual({ variant, status: 200 });
        expect(res.body.stellarPublicKey).toBe(key);
      }
    });

    it('uses the first value of a repeated shortId query parameter', async () => {
      await request(getApp().getHttpServer())
        .get('/api/users/lookup?shortId=a&shortId=b')
        .expect(404, { found: false });
    });
  });
});