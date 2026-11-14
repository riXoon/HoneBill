import { ConfigService } from '@nestjs/config';
import { AppVersionService, compareVersions, isVersion } from './app-version.service';

function service(env: Record<string, string | undefined>) {
  const config = { get: jest.fn((key: string) => env[key]) } as unknown as ConfigService;
  return new AppVersionService(config);
}

describe('compareVersions', () => {
  it('orders by major, then minor, then patch, numerically', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
    expect(compareVersions('1.1.0-beta.1', '1.1.0')).toBe(0);
  });

  it('rejects anything that is not a version', () => {
    expect(() => compareVersions('1.0', '1.0.0')).toThrow();
    expect(isVersion('1.0')).toBe(false);
    expect(isVersion(' 1.4.2 ')).toBe(true);
    expect(isVersion(undefined)).toBe(false);
  });
});

describe('AppVersionService', () => {
  it('returns the configured release', () => {
    expect(
      service({
        APP_LATEST_VERSION: '1.2.0',
        APP_MIN_SUPPORTED_VERSION: '1.1.0',
        APP_DOWNLOAD_URL: 'https://honebill.app/download',
        APP_LATEST_NOTES: 'Faster sign-in.',
      }).getInfo(),
    ).toEqual({
      latestVersion: '1.2.0',
      minimumVersion: '1.1.0',
      downloadUrl: 'https://honebill.app/download',
      latestNotes: 'Faster sign-in.',
    });
  });

  it('returns nulls when nothing is configured', () => {
    expect(service({}).getInfo()).toEqual({ latestVersion: null, minimumVersion: null, downloadUrl: null, latestNotes: null });
  });

  it('ignores malformed versions', () => {
    const info = service({ APP_LATEST_VERSION: 'v2', APP_MIN_SUPPORTED_VERSION: '1.0' }).getInfo();
    expect(info.latestVersion).toBeNull();
    expect(info.minimumVersion).toBeNull();
  });

  it('drops a minimum newer than the latest release, so nobody is locked out with nothing to install', () => {
    const info = service({ APP_LATEST_VERSION: '1.1.0', APP_MIN_SUPPORTED_VERSION: '1.2.0' }).getInfo();
    expect(info.latestVersion).toBe('1.1.0');
    expect(info.minimumVersion).toBeNull();
  });
});
