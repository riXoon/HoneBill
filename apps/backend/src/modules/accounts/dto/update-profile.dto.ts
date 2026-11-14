import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const trimmed = Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Edits to the account's details. The PIN proves the caller owns the account, so no session token is needed. */
export class UpdateProfileDto {
  @IsString()
  @MaxLength(30)
  phoneNumber!: string;

  @IsString()
  @Matches(/^\d{4,6}$/)
  pin!: string;

  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(254)
  @IsEmail()
  email?: string;

  /** From `POST /otp/verify`; required when the email changes. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  verificationToken?: string;
}
