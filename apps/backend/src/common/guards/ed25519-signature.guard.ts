import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import type { Request } from 'express';

const ED25519_SIGNATURE_OPERATION = 'ed25519-signature-operation';

export type Ed25519SignatureOperation = 'deposit' | 'withdraw' | 'transfer';

export function VerifyEd25519Signature(
  operation: Ed25519SignatureOperation,
): MethodDecorator {
  return applyDecorators(SetMetadata(ED25519_SIGNATURE_OPERATION, operation));
}

type SignedRequestBody = {
  senderPublicKey?: unknown;
  amountStroops?: unknown;
  tokenAddress?: unknown;
  recipientPublicKey?: unknown;
};

type SignedRequest = Request & { body: SignedRequestBody };

@Injectable()
export class Ed25519SignatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const operation = this.reflector.getAllAndOverride<Ed25519SignatureOperation>(
      ED25519_SIGNATURE_OPERATION,
      [context.getHandler(), context.getClass()],
    );
    if (!operation) {
      throw new Error('Ed25519SignatureGuard requires @VerifyEd25519Signature metadata');
    }

    const request = context.switchToHttp().getRequest<SignedRequest>();
    const body = request.body ?? {};
    const sender = body.senderPublicKey;
    const amount = body.amountStroops;
    if (typeof sender !== 'string' || !sender || amount === undefined || amount === null || amount === '') {
      throw new BadRequestException('Missing required signature fields');
    }
    if (!StrKey.isValidEd25519PublicKey(sender)) {
      throw new BadRequestException('Invalid senderPublicKey format');
    }

    const auth = request.header('authorization') ?? '';
    const signatureBase64 = auth.startsWith('Bearer ')
      ? auth.slice('Bearer '.length).trim()
      : '';
    if (!signatureBase64) throw new UnauthorizedException('Missing Authorization header');

    const signature = decodeSignature(signatureBase64);
    let message: string;
    if (operation === 'transfer') {
      const recipient = body.recipientPublicKey;
      const token = body.tokenAddress;
      if (typeof recipient !== 'string' || typeof token !== 'string' || !recipient || !token) {
        throw new BadRequestException(
          'Missing required fields: senderPublicKey, recipientPublicKey, tokenAddress, amountStroops',
        );
      }
      if (!StrKey.isValidEd25519PublicKey(recipient)) {
        throw new BadRequestException('Invalid public key format');
      }
      message = `transfer:v2:online:${token}:${sender}:${recipient}:${String(amount)}`;
    } else {
      message = `${operation}:${sender}:${String(amount)}`;
    }

    try {
      if (!Keypair.fromPublicKey(sender).verify(Buffer.from(message, 'utf8'), signature)) {
        throw new UnauthorizedException('Invalid signature');
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid signature');
    }
    return true;
  }
}

function decodeSignature(value: string): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new UnauthorizedException('Invalid signature');
  }
  const signature = Buffer.from(value, 'base64');
  if (signature.length !== 64 || signature.toString('base64') !== value) {
    throw new UnauthorizedException('Invalid signature');
  }
  return signature;
}