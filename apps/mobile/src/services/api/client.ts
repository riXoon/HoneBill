import { API_BASE_URL } from '../../config/env';

/** `http`: the server answered with an error. `network`: no answer. `aborted`: the caller cancelled. */
export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'aborted' | 'config';

type ErrorBody = Record<string, unknown>;

/** Every failure from the API layer, so screens only handle one error type. */
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    /** HTTP status, or 0 when there was no response. */
    readonly status: number,
    message: string,
    readonly data: ErrorBody | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Seconds until a locked or rate-limited action may be retried, when the server says so. */
  get retryAfter(): number | undefined {
    return typeof this.data?.retryAfter === 'number' ? this.data.retryAfter : undefined;
  }

  /** Tries left before a lockout, on a wrong PIN or OTP. */
  get attemptsRemaining(): number | undefined {
    return typeof this.data?.attemptsRemaining === 'number' ? this.data.attemptsRemaining : undefined;
  }
}

export function isAborted(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'aborted';
}

/** Text a screen can show for any caught error. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}

type RequestOptions = {
  query?: Record<string, string | undefined>;
  body?: unknown;
  /** Cancels the request, e.g. when the screen unmounts. */
  signal?: AbortSignal;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;

/** The backend answers with `{ error }` (legacy shape) or Nest's `{ message }`, which may be a list. */
function messageFromBody(body: ErrorBody | null, status: number): string {
  const text = body?.error ?? body?.message;
  if (typeof text === 'string' && text) return text;
  if (Array.isArray(text) && text.length > 0) return text.join(', ');
  return `Request failed (${status}).`;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const pairs = Object.entries(query ?? {})
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return `${API_BASE_URL}/api/v2${path}${pairs.length > 0 ? `?${pairs.join('&')}` : ''}`;
}

export async function apiRequest<T>(method: 'GET' | 'POST', path: string, options: RequestOptions = {}): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiError('config', 0, 'The server address is not set. Add EXPO_PUBLIC_API_BASE_URL to .env.');
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onCallerAbort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', onCallerAbort);

  try {
    let response: Response;
    try {
      response = await fetch(buildUrl(path, options.query), {
        method,
        headers: {
          Accept: 'application/json',
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch {
      if (timedOut) throw new ApiError('timeout', 0, 'The server took too long to respond. Please try again.');
      if (options.signal?.aborted) throw new ApiError('aborted', 0, 'Request cancelled.');
      throw new ApiError('network', 0, 'Cannot reach the server. Check your connection and try again.');
    }

    // A proxy error page or an empty body must not crash the screen, so parse defensively.
    const raw = await response.text();
    let parsed: ErrorBody | null = null;
    if (raw) {
      try {
        const json: unknown = JSON.parse(raw);
        if (json && typeof json === 'object' && !Array.isArray(json)) parsed = json as ErrorBody;
      } catch {
        // Not JSON; fall through to the generic message.
      }
    }

    if (!response.ok) throw new ApiError('http', response.status, messageFromBody(parsed, response.status), parsed);
    return (parsed ?? {}) as T;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onCallerAbort);
  }
}
