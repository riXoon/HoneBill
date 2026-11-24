import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString, Matches } from 'class-validator';

export class VoucherStatusDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Matches(/^[A-Za-z0-9+/_-]{43}=?$/, { each: true })
  nonces!: string[];
}
