import { Controller, Get, Header } from '@nestjs/common';
import { AppVersionService } from './app-version.service.js';

@Controller('app')
export class AppVersionController {
  constructor(private readonly appVersion: AppVersionService) {}

  /** The newest app release, the oldest one still allowed, and where to download it. Public: asked before sign-in. */
  @Get('version')
  @Header('Cache-Control', 'public, max-age=300')
  version() {
    return this.appVersion.getInfo();
  }
}
