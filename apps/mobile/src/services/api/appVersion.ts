import { apiRequest } from './client';

/** GET /app/version. Every field is null when the backend has not been told about a release. */
export type AppVersionInfo = {
  latestVersion: string | null;
  minimumVersion: string | null;
  downloadUrl: string | null;
  latestNotes: string | null;
};

export function getAppVersionInfo(signal?: AbortSignal): Promise<AppVersionInfo> {
  return apiRequest('GET', '/app/version', { signal, timeoutMs: 10_000 });
}
