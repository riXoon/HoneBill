import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import type { Request } from 'express';

export type SignedIntentBuilder = (body: Record<string, unknown>) => string | null;
const SIGNED_INTENT_KEY = 'backend:signed-intent';

export const SignedIntent = (builder: SignedIntentBuilder) =>
  SetMetadata(SIGNED_INTENT_KEY, builder);

@Injectable()
export class Ed25519SignatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const buildMessage = this.reflector.get<SignedIntentBuilder>(
      SIGNED_INTENT_KEY,
      context.getHandler(),
    );
    if (!buildMessage) return true;

    const request = context.switchToHttp().getRequest<Request & { body?: unknown }>();
    const body = isRecord(request.body) ? request.body : {};
    const message = buildMessage(body);
    // Let the route report its established 400/426 validation response when
    // the request is not yet a valid signed-intent shape.
    if (message === null) return true;

    const sender = body.senderPublicKey;
    if (typeof sender !== 'string' || !StrKey.isValidEd25519PublicKey(sender)) return true;

    const header = request.headers.authorization;
    const signature = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!signature || !isCanonicalEd25519Signature(signature)) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    try {
      const valid = Keypair.fromPublicKey(sender).verify(
        Buffer.from(message, 'utf8'),
        Buffer.from(signature, 'base64'),
      );
      if (!valid) throw new Error('bad signature');
    } catch {
      throw new UnauthorizedException('Invalid signature');
    }

    return true;
  }
}

function isCanonicalEd25519Signature(value: string): boolean {
  if (!/^[A-Za-z0-9+/]{86}==$/.test(value)) return false;
  const bytes = Buffer.from(value, 'base64');
  return bytes.length === 64 && bytes.toString('base64') === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
