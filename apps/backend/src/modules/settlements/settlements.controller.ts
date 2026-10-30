import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { SettlementsService } from './settlements.util.js';

@Controller()
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Post('settlements')
  processSettlement(@Body() body: { smsBody?: string }) {
    if (!body?.smsBody) {
      throw new BadRequestException('Missing smsBody');
    }
    return this.settlementsService.processSettlement(body.smsBody);
  }
}
