import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SmsDispatchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  to!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1600)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  traceId?: string;
}

export interface SmsDispatchInput {
  to: string;
  message: string;
  traceId?: string;
}
