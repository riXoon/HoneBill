import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ChangePinDto {
  @IsString()
  @MaxLength(30)
  phoneNumber!: string;

  @IsString()
  @Matches(/^\d{4,6}$/)
  currentPin!: string;

  @IsString()
  @Matches(/^\d{4,6}$/)
  newPin!: string;

  /** From `POST /otp/verify`: proves the caller holds the account's phone right now. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  verificationToken?: string;
}

/** Asks whether the MPIN / email can be changed now (24-hour cooldown), and whether an email is taken. */
export class ChangeAvailabilityDto {
  @IsString()
  @MaxLength(30)
  phoneNumber!: string;

  @IsString()
  @Matches(/^\d{4,6}$/)
  pin!: string;

  @IsOptional()
  @IsString()
  @MaxLength(254)
  @IsEmail()
  email?: string;
}
