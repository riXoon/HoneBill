import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Body, Controller, INestApplication, Post, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Keypair } from '@stellar/stellar-sdk';
import request from 'supertest';
import {
  Ed25519SignatureGuard,
  VerifyEd25519Signature,
} from '../../src/common/guards/ed25519-signature.guard.js';

@Controller('signed-probe')
class SignedProbeController {
  @Post('deposit')
  @UseGuards(Ed25519SignatureGuard)
  @VerifyEd25519Signature('deposit')
  deposit(@Body() body: unknown) { return { ok: true, body }; }

  @Post('withdraw')
  @UseGuards(Ed25519SignatureGuard)
  @VerifyEd25519Signature('withdraw')
  withdraw(@Body() body: unknown) { return { ok: true, body }; }

  @Post('transfer')
  @UseGuards(Ed25519SignatureGuard)
  @VerifyEd25519Signature('transfer')
  transfer(@Body() body: unknown) { return { ok: true, body }; }
}

describe('Ed25519SignatureGuard (e2e)', () => {
  let app: INestApplication;
  const sender = Keypair.random();
  const recipient = Keypair.random();
  const token = Keypair.random().publicKey();
  const amountStroops = '1234567';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SignedProbeController],
      providers: [Ed25519SignatureGuard],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());

  function authorization(message: string): string {
    return `Bearer ${sender.sign(Buffer.from(message, 'utf8')).toString('base64')}`;
  }

  it.each(['deposit', 'withdraw'] as const)('accepts a valid %s signature', async (operation) => {
    const body = { senderPublicKey: sender.publicKey(), amountStroops };
    await request(app.getHttpServer())
      .post(`/signed-probe/${operation}`)
      .set('Authorization', authorization(`${operation}:${sender.publicKey()}:${amountStroops}`))
      .send(body)
      .expect(201, { ok: true, body });
  });

  it('accepts the versioned online transfer canonical message', async () => {
    const body = {
      senderPublicKey: sender.publicKey(), recipientPublicKey: recipient.publicKey(),
      tokenAddress: token, amountStroops,
    };
    const message = `transfer:v2:online:${token}:${sender.publicKey()}:${recipient.publicKey()}:${amountStroops}`;
    await request(app.getHttpServer())
      .post('/signed-probe/transfer')
      .set('Authorization', authorization(message))
      .send(body)
      .expect(201, { ok: true, body });
  });

  it('rejects missing bearer credentials and malformed signature encodings', async () => {
    const body = { senderPublicKey: sender.publicKey(), amountStroops };
    await request(app.getHttpServer()).post('/signed-probe/deposit').send(body).expect(401);
    await request(app.getHttpServer())
      .post('/signed-probe/deposit').set('Authorization', 'Bearer !!!').send(body).expect(401);
  });

  it('rejects a signature for another message and incomplete transfer fields', async () => {
    const body = { senderPublicKey: sender.publicKey(), amountStroops };
    await request(app.getHttpServer())
      .post('/signed-probe/deposit')
      .set('Authorization', authorization('withdraw:wrong-message'))
      .send(body)
      .expect(401);
    await request(app.getHttpServer())
      .post('/signed-probe/transfer')
      .set('Authorization', authorization('irrelevant'))
      .send(body)
      .expect(400);
  });
});
