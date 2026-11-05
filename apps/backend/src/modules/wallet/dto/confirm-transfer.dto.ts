import { IsString, Matches } from 'class-validator';

export class ConfirmTransferDto {
  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/)
  txHash!: string;
}
