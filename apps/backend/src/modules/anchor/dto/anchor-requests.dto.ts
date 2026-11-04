import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, Matches } from 'class-validator';

const uppercaseAssetCode = Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value);
const amountAsString = Transform(({ value }) => value === undefined || value === null ? value : String(value));

export class InteractiveRampRequestDto {
  @IsOptional() @uppercaseAssetCode @IsString() @IsIn(['PHPC', 'USDC']) asset_code?: string;
  @IsOptional() @IsString() @MaxLength(255) memo?: string;
  @IsOptional() @IsString() @IsIn(['text', 'id', 'hash']) memo_type?: string;
}

export class SubmitWithdrawalRequestDto {
  @IsOptional() @IsString() @MaxLength(100) transaction_id?: string;
  @IsOptional() @amountAsString @IsString() @Matches(/^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/) amount?: string;
  @IsOptional() @IsString() @Matches(/^(?:09\d{9}|\+639\d{9})$/) gcash_number?: string;
}

export class ConfirmWithdrawalRequestDto {
  @IsOptional() @IsString() @MaxLength(100) transaction_id?: string;
  @IsOptional() @IsString() @Matches(/^[a-fA-F0-9]{64}$/) stellar_transaction_id?: string;
}

export class SimulatePaymentRequestDto {
  @IsOptional() @IsString() @MaxLength(100) transaction_id?: string;
  @IsOptional() @amountAsString @IsString() @Matches(/^(?:\d+(?:\.\d{1,7})?)$/) amount?: string;
  @IsOptional() @IsString() @MaxLength(4096) token?: string;
  @IsOptional() @IsString() @Matches(/^G[A-Z2-7]{55}$/) stellarAccount?: string;
  @IsOptional() @uppercaseAssetCode @IsString() @IsIn(['PHPC', 'USDC']) asset_code?: string;
}
