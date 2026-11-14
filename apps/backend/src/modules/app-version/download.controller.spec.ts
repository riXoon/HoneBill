import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../../bootstrap';
import { AppVersionModule } from './app-version.module';
import { renderDownloadPage } from './download-page';

async function appWith(env: Record<string, string>): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => env] }), AppVersionModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  // The real bootstrap, so the test proves /download sits outside the /api/v2 prefix.
  configureApp(app);
  await app.init();
  return app;
}

describe('honebill.app/download', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('serves the download page at /download, outside the API prefix', async () => {
    app = await appWith({
      APP_LATEST_VERSION: '1.1.0',
      APP_LATEST_NOTES: 'Forgot MPIN & more',
      APP_APK_URL: 'https://example.public.blob.vercel-storage.com/honebill-1.1.0.apk',
    });
    const res = await request(app.getHttpServer()).get('/download').expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Version 1.1.0');
    expect(res.text).toContain('Forgot MPIN &amp; more');
    expect(res.text).toContain('href="/download/honebill.apk"');
  });

  it('redirects /download/honebill.apk to the stored APK', async () => {
    app = await appWith({ APP_APK_URL: 'https://example.public.blob.vercel-storage.com/honebill-1.1.0.apk' });
    const res = await request(app.getHttpServer()).get('/download/honebill.apk').expect(302);
    expect(res.headers.location).toBe('https://example.public.blob.vercel-storage.com/honebill-1.1.0.apk');
  });

  it('says the download is not ready when no APK is configured', async () => {
    app = await appWith({});
    const page = await request(app.getHttpServer()).get('/download').expect(200);
    expect(page.text).toContain('not available yet');
    await request(app.getHttpServer()).get('/download/honebill.apk').expect(404);
  });

  it('still serves the version endpoint under the API prefix', async () => {
    app = await appWith({ APP_LATEST_VERSION: '1.1.0', APP_DOWNLOAD_URL: 'https://honebill.app/download' });
    const res = await request(app.getHttpServer()).get('/api/v2/app/version').expect(200);
    expect(res.body).toMatchObject({ latestVersion: '1.1.0', downloadUrl: 'https://honebill.app/download' });
  });
});

describe('renderDownloadPage', () => {
  it('escapes the notes', () => {
    expect(renderDownloadPage({ version: '1.1.0', notes: '<script>x</script>', available: true })).not.toContain('<script>x');
  });
});
