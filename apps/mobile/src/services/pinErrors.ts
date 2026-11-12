import { ApiError, errorMessage } from './api/client';

/** What to tell the user when the server refused (or could not check) an MPIN. */
export function pinErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 && error.attemptsRemaining !== undefined) {
      const left = error.attemptsRemaining;
      return `Incorrect MPIN. ${left} ${left === 1 ? 'try' : 'tries'} left.`;
    }
    if (error.status === 423) {
      const minutes = Math.max(1, Math.ceil((error.retryAfter ?? 900) / 60));
      return `Too many incorrect tries. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
    }
  }
  return errorMessage(error);
}
