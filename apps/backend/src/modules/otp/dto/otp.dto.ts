import { IsIn, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { OTP_PURPOSES, type OtpPurpose } from '../../../common/utils/otp.util.js';

export class SendOtpDto {
  @IsString()
  @MaxLength(30)
  phoneNumber!: string;

  @ValidateIf((_body, value) => value !== undefined)
  @IsIn(OTP_PURPOSES)
  purpose?: OtpPurpose;
}

export class VerifyOtpDto extends SendOtpDto {
  @IsString()
  @Matches(/^\d{4,8}$/)
  code!: string;
}
