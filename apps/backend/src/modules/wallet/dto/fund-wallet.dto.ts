import { IsString, Matches } from 'class-validator';

export class FundWalletDto {
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/)
  publicKey!: string;
}
