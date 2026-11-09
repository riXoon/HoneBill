import { IsIn, IsInt, IsString, Matches } from 'class-validator';

const publicKey = /^G[A-Z2-7]{55}$/;
const contractAddress = /^C[A-Z2-7]{55}$/;
const stroops = /^[1-9]\d{0,37}$/;

export class DepositRequestDto {
  [key: string]: unknown;
  @IsString() @Matches(publicKey) senderPublicKey!: string;
  @IsString() @Matches(contractAddress) tokenAddress!: string;
  @IsString() @Matches(/^[0-9a-fA-F]{64}$/) offlineDevicePubkeyHex!: string;
  @IsString() @Matches(stroops) amountStroops!: string;
}

export class TransferRequestDto {
  [key: string]: unknown;
  @IsString() @Matches(publicKey) senderPublicKey!: string;
  @IsString() @Matches(publicKey) recipientPublicKey!: string;
  @IsString() @Matches(contractAddress) tokenAddress!: string;
  @IsString() @Matches(stroops) amountStroops!: string;
  @IsIn(['online']) paymentMode!: 'online';
  @IsInt() @IsIn([2]) clientProtocol!: number;
}

export class WithdrawRequestDto {
  [key: string]: unknown;
  @IsString() @Matches(publicKey) senderPublicKey!: string;
  @IsString() @Matches(contractAddress) tokenAddress!: string;
  @IsString() @Matches(stroops) amountStroops!: string;
}

export class OfflineKeyRequestDto {
  [key: string]: unknown;
  @IsString() @Matches(publicKey) offlineDeviceKey!: string;
}
