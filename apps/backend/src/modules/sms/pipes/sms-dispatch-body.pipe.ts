import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SmsDispatchDto, type SmsDispatchInput } from '../dto/sms-dispatch.dto.js';

/** Parses the legacy stringified dispatch body form; the global ValidationPipe validates the DTO after this pipe. */
@Injectable()
export class SmsDispatchBodyPipe implements PipeTransform<unknown, SmsDispatchInput> {
  transform(body: unknown): SmsDispatchInput {
    let value = body;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value) as unknown;
      } catch {
        throw new BadRequestException({ error: 'Invalid JSON body' });
      }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException({ error: 'Job requires `to` and `message`' });
    }
    const job = value as Partial<SmsDispatchDto>;
    if (typeof job.to !== 'string' || typeof job.message !== 'string' || !job.message) {
      throw new BadRequestException({ error: 'Job requires `to` and `message`' });
    }
    const dto = plainToInstance(SmsDispatchDto, job);
    const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length) throw new BadRequestException({ error: 'Job requires `to` and `message`' });
    return dto;
  }
}
