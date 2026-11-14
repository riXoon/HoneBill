import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** "1.2.3" (an optional "-beta.1"-style suffix is ignored). */
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

/** Orders two "major.minor.patch" versions: negative when `a` is older, 0 when equal, positive when newer. */
export function compareVersions(a: string, b: string): number {
  const pa = SEMVER.exec(a.trim());
  const pb = SEMVER.exec(b.trim());
  if (!pa || !pb) throw new Error(`Not a version: ${pa ? b : a}`);
  for (let i = 1; i <= 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function isVersion(value: string | undefined | null): value is string {
  return typeof value === 'string' && SEMVER.test(value.trim());
}

export type AppVersionInfo = {
  /** The newest release people can download, or null when not configured. */
  latestVersion: string | null;
  /** Older apps must update before they can be used (e.g. after a voucher-format change). Null: no minimum. */
  minimumVersion: string | null;
  /** Where the APK is downloaded from. */
  downloadUrl: string | null;
  /** One line about the newest release, shown in the "update available" notice. */
  latestNotes: string | null;
};

/**
 * What the app needs to tell people about updates. Set by environment variables on each release (APP_LATEST_VERSION,
 * APP_MIN_SUPPORTED_VERSION, APP_DOWNLOAD_URL, APP_LATEST_NOTES), so publishing a new APK needs no code change.
 * Anything unset or malformed is returned as null, and the app then shows nothing for it.
 */
@Injectable()
export class AppVersionService {
  private readonly logger = new Logger(AppVersionService.name);

  constructor(private readonly config: ConfigService) {}

  getInfo(): AppVersionInfo {
    const latest = this.version('APP_LATEST_VERSION');
    let minimum = this.version('APP_MIN_SUPPORTED_VERSION');
    // A minimum above the newest release would lock everyone out with nothing to update to.
    if (latest && minimum && compareVersions(minimum, latest) > 0) {
      this.logger.warn('APP_MIN_SUPPORTED_VERSION is newer than APP_LATEST_VERSION; the minimum is ignored.');
      minimum = null;
    }
    return {
      latestVersion: latest,
      minimumVersion: minimum,
      downloadUrl: this.config.get<string>('APP_DOWNLOAD_URL')?.trim() || null,
      latestNotes: this.config.get<string>('APP_LATEST_NOTES')?.trim() || null,
    };
  }

  private version(key: string): string | null {
    const value = this.config.get<string>(key)?.trim();
    if (!value) return null;
    if (!isVersion(value)) {
      this.logger.warn(`${key} is not a version like 1.2.3; it is ignored.`);
      return null;
    }
    return value;
  }
}
