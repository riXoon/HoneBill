import { IsString, MaxLength } from 'class-validator';

export class ProcessSettlementDto {
  @IsString()
  @MaxLength(4096)
  smsBody!: string;
}
