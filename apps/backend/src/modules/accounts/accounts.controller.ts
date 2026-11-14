import {
  All,
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  Patch,
  Post,
  Query,
  Req,
  Res,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AccountsService } from './accounts.service.js';
import { Throttle } from '@nestjs/throttler';
import { queryString } from '../../common/utils/query-string.js';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';
import { RegisterAccountDto } from './dto/register-account.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

type QueryStringValue = string | string[] | Record<string, string>;

@Controller()
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post('register')
  @Throttle({ default: { limit: 30, ttl: 600_000 } })
  register(@Body() body: RegisterAccountDto, @Req() request: RawBodyRequest<Request>) {
    const hasNoBody =
      request.rawBody?.length === 0 ||
      (request.headers['content-length'] === '0' ||
        (!request.headers['content-length'] &&
          !request.headers['transfer-encoding'] &&
          body !== null &&
          typeof body === 'object' &&
          Object.keys(body).length === 0));
    if (hasNoBody) {
      throw new ApiResponseException(400, { error: 'Invalid JSON body' });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiResponseException(400, { error: 'Invalid JSON body' });
    }
    return this.accountsService.register(body);
  }

  @All('register')
  unsupportedRegisterMethod(@Res() response: Response): void {
    response.status(HttpStatus.METHOD_NOT_ALLOWED).end();
  }

  @Get('users/check')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  checkUser(@Query('phone') phone?: QueryStringValue) {
    return this.accountsService.checkUser(queryString(phone) ?? '');
  }

  @Get('users/lookup')
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  lookupUser(@Query('shortId') shortId?: QueryStringValue, @Query('phone') phone?: QueryStringValue) {
    return this.accountsService.lookupUser(
      queryString(shortId)?.trim(),
      queryString(phone)?.trim(),
    );
  }

  @Patch('users/profile')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  updateProfile(@Body() body: UpdateProfileDto) {
    return this.accountsService.updateProfile(
      body.phoneNumber,
      body.pin.trim(),
      { firstName: body.firstName, lastName: body.lastName, email: body.email },
      body.verificationToken,
    );
  }

  @All('users/lookup')
  unsupportedLookupMethod(@Res() response: Response): void {
    response.status(HttpStatus.METHOD_NOT_ALLOWED).end();
  }

  @All('users/check')
  unsupportedCheckMethod(@Res() response: Response): void {
    response.status(HttpStatus.METHOD_NOT_ALLOWED).end();
  }
}
