import { IsString, Matches, MaxLength } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @MaxLength(30)
  phoneNumber!: string;
}

export class VerifyOtpDto {
  @IsString()
  @MaxLength(30)
  phoneNumber!: string;

  @IsString()
  @Matches(/^\d{4,8}$/)
  code!: string;
}
