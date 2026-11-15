import { messages } from '../i18n';
import { ApiError, errorMessage } from './api/client';

/** What to tell the user when the server refused (or could not check) an MPIN. */
export function pinErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const t = messages();
    if (error.status === 401 && error.attemptsRemaining !== undefined) return t.pin.wrong(error.attemptsRemaining);
    // Minutes even past an hour, as before: the server's lockout is 15 minutes.
    if (error.status === 423) return t.pin.locked(t.time.minutes(Math.max(1, Math.ceil((error.retryAfter ?? 900) / 60))));
  }
  return errorMessage(error);
}
