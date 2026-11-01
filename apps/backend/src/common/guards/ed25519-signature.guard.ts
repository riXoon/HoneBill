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
const SIGNED_INTENT_KEY = 'backend:signed-intent';

export type Ed25519SignatureOperation = 'deposit' | 'withdraw' | 'transfer';
export type SignedIntentBuilder = (body: Record<string, unknown>) => string | null;

export function VerifyEd25519Signature(
  operation: Ed25519SignatureOperation,
): MethodDecorator {
  return applyDecorators(SetMetadata(ED25519_SIGNATURE_OPERATION, operation));
}

export const SignedIntent = (builder: SignedIntentBuilder) =>
  SetMetadata(SIGNED_INTENT_KEY, builder);

@Injectable()
export class Ed25519SignatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const body = isRecord(request.body) ? request.body : {};
    const targets = [context.getHandler(), context.getClass()];

    // Custom signed-intent builder takes precedence over the built-in operations.
    const buildIntent = this.reflector.getAllAndOverride<SignedIntentBuilder | undefined>(
      SIGNED_INTENT_KEY,
      targets,
    );
    if (buildIntent) return this.verifySignedIntent(request, body, buildIntent);

    const operation = this.reflector.getAllAndOverride<Ed25519SignatureOperation | undefined>(
      ED25519_SIGNATURE_OPERATION,
      targets,
    );
    if (!operation) {
      throw new Error(
        'Ed25519SignatureGuard requires @VerifyEd25519Signature or @SignedIntent metadata',
      );
    }
    return this.verifyOperation(request, body, operation);
  }

  private verifyOperation(
    request: Request,
    body: Record<string, unknown>,
    operation: Ed25519SignatureOperation,
  ): boolean {
    const sender = body.senderPublicKey;
    const amount = body.amountStroops;
    if (typeof sender !== 'string' || !sender || amount === undefined || amount === null || amount === '') {
      throw new BadRequestException('Missing required signature fields');
    }
    if (!StrKey.isValidEd25519PublicKey(sender)) {
      throw new BadRequestException('Invalid senderPublicKey format');
    }

    const signature = extractSignature(request);

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

    verifySignature(sender, message, signature);
    return true;
  }

  private verifySignedIntent(
    request: Request,
    body: Record<string, unknown>,
    buildMessage: SignedIntentBuilder,
  ): boolean {
    const message = buildMessage(body);
    // Let the route report its established 400/426 validation response when
    // the request is not yet a valid signed-intent shape.
    if (message === null) return true;

    const sender = body.senderPublicKey;
    if (typeof sender !== 'string' || !StrKey.isValidEd25519PublicKey(sender)) return true;

    const signature = extractSignature(request);
    verifySignature(sender, message, signature);
    return true;
  }
}

function extractSignature(request: Request): Buffer {
  const auth = request.header('authorization') ?? '';
  const value = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
  if (!value) throw new UnauthorizedException('Missing Authorization header');
  return decodeSignature(value);
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

function verifySignature(publicKey: string, message: string, signature: Buffer): void {
  let valid = false;
  try {
    valid = Keypair.fromPublicKey(publicKey).verify(Buffer.from(message, 'utf8'), signature);
  } catch {
    valid = false;
  }
  if (!valid) throw new UnauthorizedException('Invalid signature');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}