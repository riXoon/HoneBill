import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto.js';
import { FeedbackService } from './feedback.service.js';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  /** A report from the app's Help & Feedback screen. Tight limit: there is no session, so this keeps spam down. */
  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  submit(@Body() body: SubmitFeedbackDto) {
    return this.feedbackService.submit(body);
  }
}
