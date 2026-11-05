import { Body, Controller, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Sep10JwtGuard } from '../../common/guards/sep10-jwt.guard.js';
import {
  Ed25519SignatureGuard,
  SignedIntent,
} from '../../common/guards/ed25519-signature.guard.js';
import { EngineService } from './engine.service.js';

type AuthenticatedRequest = Request & { user?: { sub?: unknown } };
type EngineBody = Record<string, unknown>;

@Controller('engine')
export class EngineController {
  constructor(private readonly engine: EngineService) {}

  @Post('deposit')
  @UseGuards(Ed25519SignatureGuard)
  @SignedIntent((body) => hasFields(body, ['senderPublicKey', 'amountStroops'])
    ? `deposit:${body.senderPublicKey}:${body.amountStroops}` : null)
  deposit(@Body() body: EngineBody) {
    return this.engine.prepareDeposit(body ?? {});
  }

  @Post('transfer')
  @UseGuards(Ed25519SignatureGuard)
  @SignedIntent((body) => {
    if (body.paymentMode !== 'online' || body.clientProtocol !== 2) return null;
    return hasFields(body, ['tokenAddress', 'senderPublicKey', 'recipientPublicKey', 'amountStroops'])
      ? `transfer:v2:online:${body.tokenAddress}:${body.senderPublicKey}:${body.recipientPublicKey}:${body.amountStroops}`
      : null;
  })
  transfer(@Body() body: EngineBody) {
    return this.engine.prepareTransfer(body ?? {});
  }

  @Post('withdraw')
  @UseGuards(Ed25519SignatureGuard)
  @SignedIntent((body) => hasFields(body, ['senderPublicKey', 'amountStroops'])
    ? `withdraw:${body.senderPublicKey}:${body.amountStroops}` : null)
  withdraw(@Body() body: EngineBody) {
    return this.engine.prepareWithdraw(body ?? {});
  }

  @Post('offline-key')
  @UseGuards(Sep10JwtGuard)
  prepareOfflineKey(@Req() request: AuthenticatedRequest, @Body() body: EngineBody) {
    return this.engine.prepareOfflineKey(authenticatedSubject(request), body ?? {});
  }

  @Patch('offline-key')
  @UseGuards(Sep10JwtGuard)
  confirmOfflineKey(@Req() request: AuthenticatedRequest, @Body() body: EngineBody) {
    return this.engine.confirmOfflineKey(authenticatedSubject(request), body ?? {});
  }

  @Post('recipient-registry')
  @UseGuards(Sep10JwtGuard)
  registerRecipient(@Req() request: AuthenticatedRequest) {
    return this.engine.registerRecipient(authenticatedSubject(request));
  }
}

function authenticatedSubject(request: AuthenticatedRequest): string {
  if (typeof request.user?.sub !== 'string' || request.user.sub.length === 0) {
    throw new UnauthorizedException('Invalid JWT subject');
  }
  return request.user.sub;
}

function hasFields(body: EngineBody, fields: string[]): boolean {
  return fields.every((field) => typeof body[field] === 'string' && body[field] !== '');
}
