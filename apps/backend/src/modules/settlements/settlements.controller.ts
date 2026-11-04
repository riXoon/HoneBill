import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { SettlementsService } from './settlements.util.js';
import { ProcessSettlementDto } from './dto/process-settlement.dto.js';

@Controller()
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Post('settlements')
  processSettlement(@Body() body: ProcessSettlementDto) {
    if (!body.smsBody) {
      throw new BadRequestException('Missing smsBody');
    }
    return this.settlementsService.processSettlement(body.smsBody);
  }
}
