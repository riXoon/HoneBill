import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const publicKey = /^G[A-Z2-7]{55}$/;
const cleanOptionalString = Transform(({ value }) =>
  typeof value === 'string' && value.trim() === '' ? undefined :
    typeof value === 'string' ? value.trim() : value,
);

export class RegisterAccountDto {
  [key: string]: unknown;
  @IsString()
  @Matches(publicKey)
  stellarPublicKey!: string;

  @IsOptional()
  @cleanOptionalString
  @IsString()
  @Matches(publicKey)
  offlineDeviceKey?: string;

  @IsOptional()
  @cleanOptionalString
  @IsString()
  @MaxLength(30)
  phoneNumber?: string;

  @IsOptional()
  @cleanOptionalString
  @IsString()
  @Matches(/^\d{4,6}$/)
  pin?: string;

  @IsOptional()
  @cleanOptionalString
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @cleanOptionalString
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @cleanOptionalString
  @IsString()
  @MaxLength(254)
  @IsEmail()
  email?: string;

  @IsOptional()
  @cleanOptionalString
  @IsString()
  @MaxLength(4096)
  verificationToken?: string;
}
