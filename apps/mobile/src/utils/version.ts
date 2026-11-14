/** "1.2.3" (an optional "-beta.1"-style suffix is ignored). Same rules as the backend's app-version module. */
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

export function isVersion(value: unknown): value is string {
  return typeof value === 'string' && SEMVER.test(value.trim());
}

/** Negative when `a` is older than `b`, 0 when equal, positive when newer. Anything malformed counts as 0.0.0. */
export function compareVersions(a: string, b: string): number {
  const pa = SEMVER.exec(a.trim()) ?? [];
  const pb = SEMVER.exec(b.trim()) ?? [];
  for (let i = 1; i <= 3; i++) {
    const diff = Number(pa[i] ?? 0) - Number(pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
