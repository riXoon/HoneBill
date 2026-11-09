import { HttpException } from '@nestjs/common';

/** Carries an endpoint's chosen HTTP status and JSON body through Nest's exception pipeline. */
export class ApiResponseException extends HttpException {
  /** Stores the exact JSON response body alongside its HTTP status for the global filter. */
  constructor(
    status: number,
    readonly responseBody: Record<string, unknown>,
  ) {
    super(responseBody, status);
  }
}
