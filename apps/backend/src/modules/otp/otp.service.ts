import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isPlausiblePhone, normalizePhoneNumber } from '../../common/utils/phone.util.js';
import {
  generateOtp,
  getTestOtpCode,
  otpMatches,
  signVerificationToken,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_SECONDS,
  VERIFICATION_TOKEN_TTL_SECONDS,
} from '../../common/utils/otp.util.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { OtpRateLimitService } from '../../infra/redis/otp-rate-limit.service.js';
import { TextbeeService } from './textbee.service.js';

const INCREMENT_OTP_ATTEMPTS_SCRIPT = `
local attempts = redis.call('INCR', KEYS[2])
if attempts == 1 then
  redis.call('EXPIRE', KEYS[2], tonumber(ARGV[1]))
end
if attempts >= tonumber(ARGV[2]) then
  redis.call('DEL', KEYS[1], KEYS[2])
end
return attempts
`;

@Injectable()
export class OtpService {
  constructor(
    private readonly textbee: TextbeeService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly rateLimiter: OtpRateLimitService,
  ) {}

  async send(phoneNumber: string, clientIp: string) {
    if (!phoneNumber) {
      throw new BadRequestException('Phone number is required.');
    }
    if (!isPlausiblePhone(phoneNumber)) {
      throw new BadRequestException('Invalid phone number format.');
    }

    const formattedPhone = normalizePhoneNumber(phoneNumber);
    await this.rateLimiter.enforceSendLimits(clientIp, formattedPhone);

    const testCode = getTestOtpCode(formattedPhone, this.getOtpEnvironment());
    const code = testCode ?? generateOtp();
    const otpKey = `pijin:otp:${formattedPhone}`;
    const attemptsKey = `pijin:otp:attempts:${formattedPhone}`;
    const redis = this.redisService.getClient();
    try {
      await redis.set(otpKey, code, 'EX', OTP_TTL_SECONDS);
      await redis.del(attemptsKey);
    } catch {
      throw new ServiceUnavailableException('OTP service is temporarily unavailable.');
    }

    if (!testCode) {
      try {
        const message = `Pijin: Your verification code is ${code}. Valid for 5 minutes. Do not share this with anyone.`;
        await this.textbee.send(formattedPhone, message, {
          retries: 1,
          timeoutMs: 4000,
          deadlineMs: 8000,
        });
      } catch (error) {
        try {
          await redis.del(otpKey, attemptsKey);
        } catch {
          throw new ServiceUnavailableException('OTP service is temporarily unavailable.');
        }
        throw new HttpException(
          { error: "We couldn't send the SMS. Please try again.", code: 'SMS_FAILED' },
          502,
          { cause: error },
        );
      }
    }

    return {
      success: true,
      message: 'OTP sent successfully.',
    };
  }

  async verify(phoneNumber: string, code: string) {
    if (!phoneNumber || !code) {
      throw new BadRequestException('Phone number and code are required.');
    }

    const formattedPhone = normalizePhoneNumber(phoneNumber);
    const otpKey = `pijin:otp:${formattedPhone}`;
    const attemptsKey = `pijin:otp:attempts:${formattedPhone}`;
    const redis = this.redisService.getClient();
    let storedCode: string | null;
    try {
      storedCode = await redis.get(otpKey);
    } catch {
      throw new ServiceUnavailableException('OTP service is temporarily unavailable.');
    }
    if (storedCode === null) {
      throw new BadRequestException('OTP has expired or was never sent. Please request a new one.');
    }

    if (!otpMatches(storedCode, code)) {
      let attempts: number;
      try {
        attempts = Number(
          await redis.eval(
            INCREMENT_OTP_ATTEMPTS_SCRIPT,
            2,
            otpKey,
            attemptsKey,
            String(OTP_TTL_SECONDS),
            String(OTP_MAX_ATTEMPTS),
          ),
        );
      } catch {
        throw new ServiceUnavailableException('OTP service is temporarily unavailable.');
      }
      if (attempts >= OTP_MAX_ATTEMPTS) {
        throw new HttpException(
          { error: 'Too many incorrect attempts. Please request a new code.' },
          429,
        );
      }
      throw new UnauthorizedException({ error: 'Invalid verification code.', attemptsRemaining: OTP_MAX_ATTEMPTS - attempts });
    }

    try {
      await redis.del(otpKey, attemptsKey);
    } catch {
      throw new ServiceUnavailableException('OTP service is temporarily unavailable.');
    }

    const otpSecret = this.configService.get<string>('OTP_VERIFICATION_JWT_SECRET');
    const verificationToken = signVerificationToken(formattedPhone, otpSecret);
    if (!verificationToken && this.isOtpTokenRequired()) {
      throw new InternalServerErrorException('Internal Server Error');
    }

    return {
      success: true,
      message: 'Phone number verified.',
      ...(verificationToken ? { verificationToken, expiresIn: VERIFICATION_TOKEN_TTL_SECONDS } : {}),
    };
  }

  private getOtpEnvironment(): Record<string, string | undefined> {
    const testMode = this.configService.get<boolean | string>('OTP_TEST_MODE');
    return {
      OTP_TEST_MODE: String(testMode ?? ''),
      OTP_TEST_CODE: this.configService.get<string>('OTP_TEST_CODE'),
      OTP_TEST_NUMBERS: this.configService.get<string>('OTP_TEST_NUMBERS'),
    };
  }

  private isOtpTokenRequired(): boolean {
    const required = this.configService.get<boolean | string>('REQUIRE_OTP_TOKEN');
    return required === true || required === 'true';
  }
}
