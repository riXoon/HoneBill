import { ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

/** Keeps rate-limit failures in the API's shared { error } response shape. */
@Injectable()
export class ApiThrottlerGuard extends ThrottlerGuard {
  /** Emits the shared 429 response shape when Nest's rate limit is exceeded. */
  protected async throwThrottlingException(
    _context: ExecutionContext,
    _detail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new HttpException({ error: 'Too many requests. Please try again later.' }, 429);
  }
}
