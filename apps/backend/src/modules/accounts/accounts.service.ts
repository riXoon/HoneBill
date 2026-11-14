import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { isPlausiblePhone, toDbPhone } from '../../common/utils/phone.util.js';
import { isValidPinFormat, hashPin, verifyPin } from '../../common/utils/pin.util.js';
import { generateBase62Id } from '../../common/utils/short-id.util.js';
import { signVerificationToken, verifyVerificationToken } from '../../common/utils/otp.util.js';
import { classifyAccountUniqueConstraint } from './unique-constraint.js';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';

const STELLAR_KEY_PATTERN = /^G[A-Z2-7]{55}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 50;
const MAX_EMAIL_LENGTH = 254;
const MAX_SHORT_ID_ATTEMPTS = 5;
const PIN_LOCKOUT_SECONDS = 15 * 60;
const MAX_FAILURES = 5;
const INCREMENT_PIN_FAILURES_SCRIPT = `
local failures = redis.call('INCR', KEYS[1])
if failures == 1 or failures >= tonumber(ARGV[1]) then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
return failures
`;

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async register(payload: Record<string, unknown>) {
    const stellarPublicKey = typeof payload.stellarPublicKey === 'string' ? payload.stellarPublicKey.trim() : '';
    if (!stellarPublicKey) {
      throw new BadRequestException('Missing required field: stellarPublicKey');
    }
    if (!STELLAR_KEY_PATTERN.test(stellarPublicKey)) {
      throw new BadRequestException('Invalid Stellar Public Key format');
    }

    const offlineDeviceKey = typeof payload.offlineDeviceKey === 'string' ? payload.offlineDeviceKey.trim() : '';
    if (offlineDeviceKey && !STELLAR_KEY_PATTERN.test(offlineDeviceKey)) {
      throw new BadRequestException('Invalid offline device public key format');
    }

    const fieldErrors: Record<string, string> = {};
    const rawPhone = typeof payload.phoneNumber === 'string' ? payload.phoneNumber.trim() : '';
    if (rawPhone && !isPlausiblePhone(rawPhone)) fieldErrors.phoneNumber = 'Invalid phone number.';
    const cleanPhone = rawPhone ? toDbPhone(rawPhone) : null;

    const rawPin = typeof payload.pin === 'string' ? payload.pin.trim() : '';
    if (rawPin && !isValidPinFormat(rawPin)) fieldErrors.pin = 'PIN must be 4 to 6 digits.';

    const firstName = optionalString(payload.firstName);
    const lastName = optionalString(payload.lastName);
    const email = optionalString(payload.email)?.toLowerCase() ?? null;

    if (firstName && firstName.length > MAX_NAME_LENGTH)
      fieldErrors.firstName = `First name must be at most ${MAX_NAME_LENGTH} characters.`;
    if (lastName && lastName.length > MAX_NAME_LENGTH)
      fieldErrors.lastName = `Last name must be at most ${MAX_NAME_LENGTH} characters.`;
    if (email && (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))) {
      fieldErrors.email = 'Invalid email address.';
    }
    if (Object.keys(fieldErrors).length > 0) {
      throw new ApiResponseException(400, { error: 'Validation failed', fieldErrors });
    }

    const verificationToken = typeof payload.verificationToken === 'string' ? payload.verificationToken.trim() : '';
    if (verificationToken || this.isOtpTokenRequired()) {
      const otpSecret = this.configService.get<string>('OTP_VERIFICATION_JWT_SECRET');
      if (
        !cleanPhone ||
        !verificationToken ||
        !verifyVerificationToken(verificationToken, cleanPhone, otpSecret)
      ) {
        throw new UnauthorizedException('Phone verification required. Please verify your number again.');
      }
    }

    const [existingKey, existingPhone] = await Promise.all([
      this.prisma.account.findUnique({ where: { stellarPublicKey }, select: { id: true } }),
      cleanPhone ? this.prisma.account.findFirst({ where: { phoneNumber: cleanPhone }, select: { id: true } }) : null,
    ]);

    if (existingKey) {
      throw new ConflictException('Stellar Public Key is already registered.');
    }
    if (existingPhone) {
      throw new ConflictException('Phone number is already registered.');
    }

    const pinHash = rawPin ? await hashPin(rawPin) : null;

    for (let attempt = 0; attempt < MAX_SHORT_ID_ATTEMPTS; attempt += 1) {
      try {
        const created = await this.prisma.account.create({
          data: {
            shortId: generateBase62Id(),
            role: 'USER',
            stellarPublicKey,
            offlineDeviceKey: offlineDeviceKey || null,
            pin: pinHash,
            phoneNumber: cleanPhone,
            firstName,
            lastName,
            email,
          },
        });

        const { pin: _pin, ...result } = created;
        return { success: true, data: result };
      } catch (error) {
        switch (classifyAccountUniqueConstraint(error)) {
          case 'shortId':
            continue;
          case 'phoneNumber':
            throw new ConflictException('Phone number is already registered.');
          case 'stellarPublicKey':
            throw new ConflictException('Stellar Public Key is already registered.');
          default:
            throw error;
        }
      }
    }

    throw new ApiResponseException(500, {
      error: 'Failed to generate a unique short ID. Please try again.',
    });
  }

  async checkUser(phone: string) {
    if (!phone) throw new BadRequestException('Missing required parameter: phone');
    const cleanPhone = toDbPhone(phone);
    if (!cleanPhone) throw new BadRequestException('Invalid phone number format');

    const account = await this.prisma.account.findFirst({
      where: { phoneNumber: cleanPhone },
      select: { stellarPublicKey: true, shortId: true },
    });

    if (!account) {
      return { exists: false };
    }

    return {
      exists: true,
      stellarPublicKey: account.stellarPublicKey,
      shortId: account.shortId,
    };
  }

  async lookupUser(shortId?: string, phone?: string) {
    if (!shortId && !phone) {
      throw new BadRequestException('Provide at least one query parameter: shortId or phone');
    }

    let account: {
      shortId: string;
      stellarPublicKey: string;
      offlineDeviceKey: string | null;
      firstName: string | null;
      lastName: string | null;
    } | null = null;

    if (shortId) {
      account = await this.prisma.account.findUnique({
        where: { shortId },
        select: {
          shortId: true,
          stellarPublicKey: true,
          offlineDeviceKey: true,
          firstName: true,
          lastName: true,
        },
      });
    } else if (phone) {
      account = await this.prisma.account.findFirst({
        where: { phoneNumber: toDbPhone(phone) },
        select: {
          shortId: true,
          stellarPublicKey: true,
          offlineDeviceKey: true,
          firstName: true,
          lastName: true,
        },
      });
    }

    if (!account) {
      throw new NotFoundException({ found: false });
    }

    const firstName = account.firstName ?? '';
    const lastName = account.lastName ?? '';
    const displayName = [firstName, lastName].filter(Boolean).join(' ') || account.shortId;

    return {
      found: true,
      shortId: account.shortId,
      stellarPublicKey: account.stellarPublicKey,
      offlineDeviceKey: account.offlineDeviceKey ?? null,
      displayName,
      firstName,
      lastName,
    };
  }

  async verifyPin(phoneNumber: string, pin: string) {
    if (!phoneNumber || !isPlausiblePhone(phoneNumber) || !isValidPinFormat(pin)) {
      throw new BadRequestException('A valid phone number and PIN are required.');
    }

    const dbPhone = toDbPhone(phoneNumber);
    const failKey = `honebill:pin:fail:${dbPhone}`;
    const redis = this.redisService.getClient();
    let currentFailures: number;
    let retryAfter: number;
    try {
      currentFailures = Number((await redis.get(failKey)) ?? 0);
      retryAfter = await redis.ttl(failKey);
    } catch {
      throw new ServiceUnavailableException('PIN verification is temporarily unavailable.');
    }
    if (currentFailures >= MAX_FAILURES) {
      throw new HttpException(
        {
          error: 'Too many incorrect PIN attempts. Please try again later.',
          retryAfter: retryAfter > 0 ? retryAfter : PIN_LOCKOUT_SECONDS,
        },
        423,
      );
    }

    const account = await this.prisma.account.findFirst({
      where: { phoneNumber: dbPhone },
      orderBy: { createdAt: 'desc' },
      select: { id: true, pin: true },
    });

    if (!account || !account.pin) {
      throw new NotFoundException('Account not found.');
    }

    const { ok, needsRehash } = await verifyPin(pin, account.pin);
    if (!ok) {
      let nextCount: number;
      try {
        nextCount = Number(
          await redis.eval(
            INCREMENT_PIN_FAILURES_SCRIPT,
            1,
            failKey,
            String(MAX_FAILURES),
            String(PIN_LOCKOUT_SECONDS),
          ),
        );
      } catch {
        throw new ServiceUnavailableException('PIN verification is temporarily unavailable.');
      }

      if (nextCount >= MAX_FAILURES) {
        throw new HttpException(
          {
            error: 'Too many incorrect PIN attempts. Please try again later.',
            retryAfter: PIN_LOCKOUT_SECONDS,
          },
          423,
        );
      }

      throw new UnauthorizedException({
        error: 'Incorrect PIN.',
        attemptsRemaining: MAX_FAILURES - nextCount,
      });
    }

    try {
      await redis.del(failKey);
    } catch {
      throw new ServiceUnavailableException('PIN verification is temporarily unavailable.');
    }

    if (needsRehash) {
      await this.prisma.account.update({ where: { id: account.id }, data: { pin: await hashPin(pin) } });
    }

    return { success: true };
  }

  /**
   * Whether the MPIN and the email can be changed right now, after checking the PIN (so it shares verifyPin's lockout
   * and reveals nothing to someone without it). The app asks before collecting an SMS code and a new value, so a
   * person in the cooldown is told up front. `retryAfter` is in seconds; 0 means allowed. With `email`, also says
   * whether another account already uses it.
   */
  async changeAvailability(phoneNumber: string, pin: string, email?: string) {
    await this.verifyPin(phoneNumber, pin);
    const account = await this.findChangeAccount(phoneNumber);
    if (!account) throw new NotFoundException('Account not found.');
    const wanted = email?.trim().toLowerCase();
    return {
      success: true,
      pin: { retryAfter: cooldownLeft(account.pinChangedAt) },
      email: { retryAfter: cooldownLeft(account.emailChangedAt) },
      ...(wanted ? { emailTaken: await this.emailInUse(wanted, account.id) } : {}),
    };
  }

  /**
   * Replaces the PIN. Needs the current PIN (sharing verifyPin's wrong-try lockout), a fresh SMS code for the
   * account's number, and no PIN change in the last 24 hours.
   */
  async changePin(phoneNumber: string, currentPin: string, newPin: string, verificationToken?: string) {
    if (!isValidPinFormat(newPin)) {
      throw new ApiResponseException(400, {
        error: 'Validation failed',
        fieldErrors: { newPin: 'PIN must be 4 to 6 digits.' },
      });
    }
    if (newPin === currentPin) {
      throw new ApiResponseException(400, {
        error: 'Validation failed',
        fieldErrors: { newPin: 'Choose a PIN different from the current one.' },
      });
    }

    // Checked before the PIN, so a refused change does not use up the person's PIN tries.
    const account = await this.findChangeAccount(phoneNumber);
    if (account) assertNoCooldown('pin', account.pinChangedAt);
    this.assertPhoneVerified(phoneNumber, verificationToken);

    await this.verifyPin(phoneNumber, currentPin);
    if (!account) throw new NotFoundException('Account not found.');

    await this.prisma.account.update({
      where: { id: account.id },
      data: { pin: await hashPin(newPin), pinChangedAt: new Date() },
    });
    return { success: true };
  }

  /**
   * Updates the name and/or email after checking the PIN. Fields left out are unchanged. Changing the email also needs
   * a fresh SMS code, no email change in the last 24 hours, and an address no other account uses.
   */
  async updateProfile(
    phoneNumber: string,
    pin: string,
    changes: { firstName?: string; lastName?: string; email?: string },
    verificationToken?: string,
  ) {
    const firstName = changes.firstName?.trim();
    const lastName = changes.lastName?.trim();
    const email = changes.email?.trim().toLowerCase();

    const fieldErrors: Record<string, string> = {};
    if (firstName !== undefined && !firstName) fieldErrors.firstName = 'First name is required.';
    if (lastName !== undefined && !lastName) fieldErrors.lastName = 'Last name is required.';
    if (email !== undefined && (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))) {
      fieldErrors.email = 'Invalid email address.';
    }
    if (Object.keys(fieldErrors).length > 0) {
      throw new ApiResponseException(400, { error: 'Validation failed', fieldErrors });
    }

    const account = await this.findChangeAccount(phoneNumber);
    // Saving the same address again is not a change, so it needs no code and does not start a cooldown.
    const emailChanging = email !== undefined && email !== account?.email;
    if (emailChanging) {
      if (account) assertNoCooldown('email', account.emailChangedAt);
      this.assertPhoneVerified(phoneNumber, verificationToken);
    }

    await this.verifyPin(phoneNumber, pin);
    if (!account) throw new NotFoundException('Account not found.');

    if (emailChanging && (await this.emailInUse(email, account.id))) {
      throw new ApiResponseException(409, {
        error: 'Validation failed',
        fieldErrors: { email: 'This email is already used by another account.' },
      });
    }

    const updated = await this.prisma.account.update({
      where: { id: account.id },
      data: {
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {}),
        ...(emailChanging ? { email, emailChangedAt: new Date() } : {}),
      },
      select: { firstName: true, lastName: true, email: true },
    });
    return { success: true, data: updated };
  }

  /** The account a PIN or email change applies to: the newest one on the number, as verifyPin uses. */
  private findChangeAccount(phoneNumber: string) {
    return this.prisma.account.findFirst({
      where: { phoneNumber: toDbPhone(phoneNumber) },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, pinChangedAt: true, emailChangedAt: true },
    });
  }

  /** Emails are stored lower-cased, so an exact match is a case-insensitive one. */
  private async emailInUse(email: string, ownId: number): Promise<boolean> {
    const other = await this.prisma.account.findFirst({ where: { email, NOT: { id: ownId } }, select: { id: true } });
    return other !== null;
  }

  /**
   * A sensitive change needs proof the person holds the account's phone right now: the token `POST /otp/verify`
   * returns. Required whenever the server can issue tokens; a development setup with no token secret skips it.
   */
  private assertPhoneVerified(phoneNumber: string, verificationToken?: string): void {
    const secret = this.configService.get<string>('OTP_VERIFICATION_JWT_SECRET');
    if (!secret && !this.isOtpTokenRequired()) return;
    const token = verificationToken?.trim() ?? '';
    if (!token || !verifyVerificationToken(token, phoneNumber, secret)) {
      throw new UnauthorizedException({
        error: 'Enter the code we texted to your number to confirm this change.',
        code: 'OTP_REQUIRED',
      });
    }
  }

  private isOtpTokenRequired(): boolean {
    const required = this.configService.get<boolean | string>('REQUIRE_OTP_TOKEN');
    return required === true || required === 'true';
  }
}

/** How long after a change the same field (MPIN or email) can change again. */
export const CHANGE_COOLDOWN_SECONDS = 24 * 60 * 60;

/** Seconds until a field changed at `changedAt` can change again; 0 when it can now. */
export function cooldownLeft(changedAt: Date | null | undefined, now = Date.now()): number {
  if (!changedAt) return 0;
  const left = changedAt.getTime() + CHANGE_COOLDOWN_SECONDS * 1000 - now;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** "23 hours" / "1 hour" / "45 minutes": how long until the cooldown ends, rounded up. */
export function describeWait(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.ceil(seconds / 3600);
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function assertNoCooldown(field: 'pin' | 'email', changedAt: Date | null): void {
  const retryAfter = cooldownLeft(changedAt);
  if (retryAfter === 0) return;
  const what = field === 'pin' ? 'MPIN' : 'email';
  throw new HttpException(
    {
      error: `You changed your ${what} recently. You can change it again in ${describeWait(retryAfter)}.`,
      code: 'CHANGE_COOLDOWN',
      retryAfter,
    },
    429,
  );
}

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
