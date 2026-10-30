import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Sep10JwtGuard } from '../src/common/guards/sep10-jwt.guard.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { signVerificationToken } from '../src/common/utils/otp.util.js';

const TEST_SECRET = 'fake-sep10-jwt-secret-for-e2e-tests';
const TEST_ISSUER = 'anchor.test';

@Controller('_probe')
class ProbeController {
  @Get()
  @UseGuards(Sep10JwtGuard)
  ok() {
    return { ok: true };
  }
}

describe('Sep10JwtGuard (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: TEST_SECRET,
          signOptions: { algorithm: 'HS256', issuer: TEST_ISSUER, expiresIn: '1h' },
        }),
      ],
      controllers: [ProbeController],
      providers: [
        Sep10JwtGuard,
        { provide: AuthService, useValue: { tokenIssuer: TEST_ISSUER } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  const call = (authorization?: string) => {
    const req = request(app.getHttpServer()).get('/_probe');
    return authorization ? req.set('Authorization', authorization) : req;
  };

  it('rejects a request without a bearer token', async () => {
    await call().expect(401);
  });

  it('rejects a malformed token', async () => {
    await call('Bearer not-a-jwt').expect(401);
  });

  it('rejects an expired token', async () => {
    const token = await jwt.signAsync({ sub: 'GTEST' }, { expiresIn: -10 });
    await call(`Bearer ${token}`).expect(401);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await jwt.signAsync(
      { sub: 'GTEST' },
      { secret: 'different-fake-secret', issuer: TEST_ISSUER },
    );
    await call(`Bearer ${token}`).expect(401);
  });

  it('rejects a token with a different issuer', async () => {
    const token = await jwt.signAsync({ sub: 'GTEST' }, { issuer: 'other.test' });
    await call(`Bearer ${token}`).expect(401);
  });

  it('rejects HS512 even when signed with the expected secret', async () => {
    const token = await jwt.signAsync(
      { sub: 'GTEST' },
      { algorithm: 'HS512', issuer: TEST_ISSUER },
    );
    await call(`Bearer ${token}`).expect(401);
  });

  it('rejects an OTP verification token as a SEP-10 token', async () => {
    const token = signVerificationToken('+639000000001', TEST_SECRET);
    await call(`Bearer ${token}`).expect(401);
  });

  it('accepts a valid SEP-10 bearer token', async () => {
    const legacyTokenSigner = new JwtService({
      secret: TEST_SECRET,
      signOptions: {
        algorithm: 'HS256',
        issuer: TEST_ISSUER,
        expiresIn: '1h',
      },
    });
    const token = await legacyTokenSigner.signAsync({ sub: 'GTEST' });
    await call(`Bearer ${token}`).expect(200, { ok: true });
  });
});
