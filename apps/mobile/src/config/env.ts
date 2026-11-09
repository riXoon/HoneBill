/**
 * Public runtime config. Expo inlines `process.env.EXPO_PUBLIC_*` at bundle time, so each
 * variable must be read by its literal name (no destructuring or dynamic keys).
 */
const rawBaseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').trim();

/** Backend origin without a trailing slash or `/api[/v2]` (the client adds `/api/v2`). */
export const API_BASE_URL = rawBaseUrl.replace(/\/+$/, '').replace(/\/api(\/v2)?$/i, '');
