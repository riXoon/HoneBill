import { IsString, Matches, MaxLength } from 'class-validator';

export class VerifyPinDto {
  @IsString()
  @MaxLength(30)
  phoneNumber!: string;

  @IsString()
  @Matches(/^\d{4,6}$/)
  pin!: string;
}
