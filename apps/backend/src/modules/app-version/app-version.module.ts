import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppVersionController } from './app-version.controller.js';
import { AppVersionService } from './app-version.service.js';

@Module({
  imports: [ConfigModule],
  controllers: [AppVersionController],
  providers: [AppVersionService],
})
export class AppVersionModule {}
