import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const trimmed = Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export const FEEDBACK_CATEGORIES = ['payment', 'account', 'bug', 'suggestion'] as const;
export type FeedbackCategoryInput = (typeof FEEDBACK_CATEGORIES)[number];

/** What the app attaches on its own. Every field is optional and short; nothing secret is ever sent. */
export class FeedbackContextDto {
  @IsOptional() @IsString() @MaxLength(40) appVersion?: string;
  @IsOptional() @IsString() @MaxLength(20) platform?: string;
  @IsOptional() @IsBoolean() online?: boolean;
  /** The transaction the report is about. */
  @IsOptional() @IsString() @MaxLength(120) transactionRef?: string;
  @IsOptional() @IsString() @MaxLength(20) transactionStatus?: string;
  @IsOptional() @IsString() @MaxLength(20) transactionSource?: string;
  @IsOptional() @IsNumber() transactionAmount?: number;
  @IsOptional() @IsString() @MaxLength(12) transactionAsset?: string;
  @IsOptional() @IsString() @MaxLength(80) transactionNonce?: string;
  @IsOptional() @IsString() @MaxLength(300) failureReason?: string;
  /** ISO time of the transaction. */
  @IsOptional() @IsString() @MaxLength(40) transactionTime?: string;
}

/** A report from the Help & Feedback screen. No session is needed, so it also works right after a failed sign-in. */
export class SubmitFeedbackDto {
  /** Made by the app per report (a UUID); a retried send with the same id is stored once. */
  @IsString()
  @Matches(/^[A-Za-z0-9-]{8,64}$/)
  clientId!: string;

  @IsIn(FEEDBACK_CATEGORIES)
  category!: FeedbackCategoryInput;

  @trimmed
  @IsString()
  @Length(5, 1000)
  message!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{6}$/)
  shortId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => FeedbackContextDto)
  context?: FeedbackContextDto;
}
