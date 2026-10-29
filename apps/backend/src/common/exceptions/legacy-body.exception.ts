import { HttpException } from '@nestjs/common';

export class LegacyBodyException extends HttpException {
  constructor(
    status: number,
    readonly legacyBody: Record<string, unknown>,
  ) {
    super(legacyBody, status);
  }
}
