import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import { EngineController } from '../src/modules/engine/engine.controller.js';
import { EngineService } from '../src/modules/engine/engine.service.js';
import { Ed25519SignatureGuard } from '../src/common/guards/ed25519-signature.guard.js';
import { Sep10JwtGuard } from '../src/common/guards/sep10-jwt.guard.js';

describe('Engine routes (HTTP e2e)', () => {
  let app: INestApplication;
  const engine = {
    prepareDeposit: jest.fn(async () => ({ xdr: 'unsigned-xdr' })),
    prepareTransfer: jest.fn(async () => ({ xdr: 'unsigned-transfer', txHash: 'hash' })),
    prepareWithdraw: jest.fn(async () => ({ xdr: 'unsigned-withdraw' })),
    prepareOfflineKey: jest.fn(),
    confirmOfflineKey: jest.fn(),
    registerRecipient: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [EngineController],
      providers: [
        Ed25519SignatureGuard,
        Reflector,
        { provide: EngineService, useValue: engine },
      ],
    }).overrideGuard(Sep10JwtGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => { if (app) await app.close(); });

  it('rejects a request with no signed-intent bearer token', async () => {
    const wallet = Keypair.random();
    await request(app.getHttpServer()).post('/api/engine/deposit').send({
      senderPublicKey: wallet.publicKey(), amountStroops: '100',
    }).expect(401).expect(({ body }) => {
      expect(body).toMatchObject({ message: 'Missing Authorization header', statusCode: 401 });
    });
    expect(engine.prepareDeposit).not.toHaveBeenCalled();
  });

  it('validates the Ed25519 intent before calling the deposit service', async () => {
    const wallet = Keypair.random();
    const body = { senderPublicKey: wallet.publicKey(), amountStroops: '100' };
    const message = 'deposit:' + body.senderPublicKey + ':' + body.amountStroops;
    const signature = wallet.sign(Buffer.from(message)).toString('base64');
    await request(app.getHttpServer()).post('/api/engine/deposit').set('Authorization', 'Bearer ' + signature)
      .send(body).expect(201, { xdr: 'unsigned-xdr' });
    expect(engine.prepareDeposit).toHaveBeenCalledWith(body);
  });

  it('rejects an invalid signature before business logic runs', async () => {
    const wallet = Keypair.random();
    await request(app.getHttpServer()).post('/api/engine/deposit')
      .set('Authorization', 'Bearer ' + Buffer.alloc(64).toString('base64'))
      .send({ senderPublicKey: wallet.publicKey(), amountStroops: '100' })
      .expect(401).expect(({ body }) => {
        expect(body).toMatchObject({ message: 'Invalid signature', statusCode: 401 });
      });
    expect(engine.prepareDeposit).not.toHaveBeenCalled();
  });
});
