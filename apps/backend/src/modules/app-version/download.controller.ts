import { Controller, Get, Header, NotFoundException, Redirect } from '@nestjs/common';
import { AppVersionService } from './app-version.service.js';
import { renderDownloadPage } from './download-page.js';

/**
 * honebill.app/download: the public page people (and the app's "Download the update" button) open to get the APK.
 * Outside the /api/v2 prefix (see bootstrap.ts), so the address stays short and never changes between releases:
 * a new release only changes APP_APK_URL (where the file is stored) and APP_LATEST_VERSION.
 */
@Controller('download')
export class DownloadController {
  constructor(private readonly appVersion: AppVersionService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  page(): string {
    const info = this.appVersion.getInfo();
    return renderDownloadPage({
      version: info.latestVersion,
      notes: info.latestNotes,
      available: this.appVersion.getApkUrl() !== null,
    });
  }

  /** Sends the browser to the stored APK file. A redirect (not a copy) keeps large files off the serverless function. */
  @Get('honebill.apk')
  @Redirect()
  @Header('Cache-Control', 'no-store')
  apk(): { url: string; statusCode: number } {
    const url = this.appVersion.getApkUrl();
    if (!url) throw new NotFoundException('The download is not available yet.');
    return { url, statusCode: 302 };
  }
}
