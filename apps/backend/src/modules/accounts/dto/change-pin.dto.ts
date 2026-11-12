import { IsString, Matches, MaxLength } from 'class-validator';

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
}
