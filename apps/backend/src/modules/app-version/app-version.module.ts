import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppVersionController } from './app-version.controller.js';
import { AppVersionService } from './app-version.service.js';
import { DownloadController } from './download.controller.js';

@Module({
  imports: [ConfigModule],
  controllers: [AppVersionController, DownloadController],
  providers: [AppVersionService],
})
export class AppVersionModule {}
