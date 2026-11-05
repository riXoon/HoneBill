import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TEXTBEE_API_BASE = 'https://api.textbee.dev/api/v1/gateway/devices';
/** Default wall-clock budget shared across primary and backup SMS gateways. */
const DEFAULT_DEADLINE_MS = 15_000;
/** Avoids starting a request that cannot reasonably complete before the delivery deadline. */
const MIN_ATTEMPT_MS = 500;

export interface TextbeeGateway {
  name: 'primary' | 'fallback';
  url: string;
  apiKey: string;
  simSubscriptionId?: number;
}

export type TextbeeDeliveryResult =
  | { success: true; gateway: TextbeeGateway['name']; attempts: number; data?: unknown }
  | { success: false; error: string; attempts: number; retryable: boolean };

export interface TextbeeSendOptions {
  /** Number of retries after the first attempt on each configured device. */
  retries?: number;
  /** Per-attempt network timeout in milliseconds. */
  timeoutMs?: number;
  /** Total delivery budget across both devices. */
  deadlineMs?: number;
}

/** Normalizes Filipino local/international formats and rejects invalid E.164 recipients. */
function normalizeRecipient(phoneNumber: string): string | null {
  const compact = phoneNumber.trim().replace(/[\s().-]/g, '');
  let normalized = compact;
  if (/^09\d{9}$/.test(normalized)) normalized = `+63${normalized.slice(1)}`;
  else if (/^63\d{10}$/.test(normalized)) normalized = `+${normalized}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

/** Retries only gateway status codes considered transient by the legacy delivery contract. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Parses optional SIM selection while ignoring empty or invalid configuration. */
function parseSimId(raw: string | undefined): number | undefined {
  if (!raw?.trim()) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/** Uses an explicit gateway URL or derives TextBee's send endpoint from a device ID. */
function gatewayUrl(explicit: string | undefined, deviceId: string | undefined): string | undefined {
  if (explicit?.trim()) return explicit.trim();
  if (deviceId?.trim()) return `${TEXTBEE_API_BASE}/${deviceId.trim()}/send-sms`;
  return undefined;
}

@Injectable()
/** Sends TextBee messages with bounded retries and the configured backup device. */
export class TextbeeService {
  private readonly logger = new Logger(TextbeeService.name);

  constructor(private readonly config: ConfigService) {}

  /** Result-returning API for background delivery, where retryability controls BullMQ retries. */
  async deliver(
    phoneNumber: string,
    message: string,
    options: TextbeeSendOptions = {},
  ): Promise<TextbeeDeliveryResult> {
    const recipient = normalizeRecipient(phoneNumber);
    if (!recipient) {
      return { success: false, error: `Invalid phone recipient: "${phoneNumber}"`, attempts: 0, retryable: false };
    }

    const gateways = this.getGateways();
    if (gateways.length === 0) {
      return {
        success: false,
        error: 'Missing TextBee config (TEXTBEE_GATEWAY_URL or TEXTBEE_DEVICE_ID, and TEXTBEE_API_KEY)',
        attempts: 0,
        retryable: false,
      };
    }

    const retries = this.readInteger(options.retries, 'TEXTBEE_RETRIES', 2, 0, 5);
    const timeoutMs = this.readInteger(options.timeoutMs, 'TEXTBEE_TIMEOUT_MS', 4500, 1000);
    const deadline = Date.now() + (options.deadlineMs ?? DEFAULT_DEADLINE_MS);
    let attempts = 0;
    let last: TextbeeDeliveryResult = {
      success: false,
      error: 'No gateway attempted',
      attempts: 0,
      retryable: true,
    };

    for (const gateway of gateways) {
      const result = await this.sendViaGateway(gateway, recipient, message, retries, timeoutMs, deadline);
      attempts += result.attempts;
      if (result.success) return { ...result, attempts };
      last = result;
    }

    return { ...last, attempts };
  }

  /** Throwing wrapper retained for OTP callers that treat any failed delivery as an API error. */
  async send(phoneNumber: string, message: string, options: TextbeeSendOptions = {}): Promise<void> {
    const result = await this.deliver(phoneNumber, message, options);
    if (result.success) return;
    if (result.attempts === 0 && result.error.startsWith('Missing TextBee config')) {
      throw new ServiceUnavailableException('TextBee SMS gateway is not configured.');
    }
    throw new BadGatewayException(`TextBee could not deliver the verification message. ${result.error}`);
  }

  /** Returns configured primary and distinct fallback devices with their API keys and SIM IDs. */
  getGateways(): TextbeeGateway[] {
    const primaryKey = this.config.get<string>('TEXTBEE_API_KEY')?.trim();
    const primaryUrl = gatewayUrl(
      this.config.get<string>('TEXTBEE_GATEWAY_URL'),
      this.config.get<string>('TEXTBEE_DEVICE_ID'),
    ) ?? this.config.get<string>('TEXTBEE_TAILSCALE_URL')?.trim();
    const gateways: TextbeeGateway[] = [];
    if (primaryKey && primaryUrl) {
      gateways.push({
        name: 'primary',
        url: primaryUrl,
        apiKey: primaryKey,
        simSubscriptionId: parseSimId(this.config.get<string>('TEXTBEE_SIM_SUBSCRIPTION_ID')),
      });
    }

    const fallbackUrl = gatewayUrl(
      this.config.get<string>('TEXTBEE_FALLBACK_GATEWAY_URL'),
      this.config.get<string>('TEXTBEE_FALLBACK_DEVICE_ID'),
    );
    const fallbackKey =
      this.config.get<string>('TEXTBEE_FALLBACK_API_KEY')?.trim() || primaryKey;
    if (fallbackUrl && fallbackKey && fallbackUrl !== primaryUrl) {
      gateways.push({
        name: 'fallback',
        url: fallbackUrl,
        apiKey: fallbackKey,
        simSubscriptionId: parseSimId(
          this.config.get<string>('TEXTBEE_FALLBACK_SIM_SUBSCRIPTION_ID'),
        ),
      });
    }
    return gateways;
  }

  /** Sends through one device, applying attempt timeouts, retry delays, and the overall deadline. */
  private async sendViaGateway(
    gateway: TextbeeGateway,
    recipient: string,
    message: string,
    retries: number,
    timeoutMs: number,
    deadline: number,
  ): Promise<TextbeeDeliveryResult> {
    const body = JSON.stringify({
      recipients: [recipient],
      message,
      ...(gateway.simSubscriptionId === undefined ? {} : { simSubscriptionId: gateway.simSubscriptionId }),
    });
    let attempts = 0;
    let lastError = 'No attempt made (deadline exhausted)';

    for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_ATTEMPT_MS) break;
      attempts = attempt;
      try {
        const response = await fetch(gateway.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': gateway.apiKey },
          body,
          signal: AbortSignal.timeout(Math.min(timeoutMs, remaining)),
        });
        if (response.ok) {
          const data = await response.json().catch(() => null);
          return { success: true, gateway: gateway.name, attempts, data };
        }
        const responseText = await response.text().catch(() => '');
        lastError = `HTTP ${response.status}: ${responseText || 'Unknown gateway error'}`;
        if (!isRetryableStatus(response.status)) {
          return { success: false, error: lastError, attempts, retryable: false };
        }
      } catch (error) {
        const cause = (error as { cause?: { code?: string } })?.cause?.code;
        lastError = `${error instanceof Error ? error.message : 'Gateway unreachable'}${cause ? ` (${cause})` : ''}`;
      }

      if (attempt <= retries) {
        const backoff = 400 * attempt + Math.random() * 200;
        const remainingAfterAttempt = deadline - Date.now();
        if (remainingAfterAttempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(backoff, remainingAfterAttempt)));
        }
      }
    }

    this.logger.warn(`${gateway.name} TextBee delivery failed: ${lastError}`);
    return { success: false, error: lastError, attempts, retryable: true };
  }

  /** Reads numeric retry/timeout settings and clamps them to safe operational bounds. */
  private readInteger(
    override: number | undefined,
    configKey: string,
    defaultValue: number,
    min: number,
    max = Number.MAX_SAFE_INTEGER,
  ): number {
    const raw = override ?? this.config.get<number | string>(configKey) ?? defaultValue;
    const parsed = typeof raw === 'number' ? raw : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : defaultValue;
  }
}
