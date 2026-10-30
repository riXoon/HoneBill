import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface GatewayConfig {
  url: string;
  apiKey: string;
}

interface SendOptions {
  retries?: number;
  timeoutMs?: number;
  deadlineMs?: number;
}

@Injectable()
export class TextbeeService {
  constructor(private readonly config: ConfigService) {}

  async send(phoneNumber: string, message: string, options: SendOptions = {}): Promise<void> {
    const primary = this.getGatewayConfig('TEXTBEE_GATEWAY_URL', 'TEXTBEE_API_KEY');
    if (!primary) {
      throw new ServiceUnavailableException('TextBee SMS gateway is not configured.');
    }

    const fallback = this.getGatewayConfig('TEXTBEE_FALLBACK_GATEWAY_URL', 'TEXTBEE_FALLBACK_API_KEY');
    const retries = Math.max(
      0,
      Math.min(5, Number(options.retries ?? this.config.get('TEXTBEE_RETRIES') ?? 2)),
    );
    const timeoutMs = Math.max(
      1000,
      Number(options.timeoutMs ?? this.config.get('TEXTBEE_TIMEOUT_MS') ?? 4500),
    );
    const deadline = options.deadlineMs === undefined ? undefined : Date.now() + options.deadlineMs;
    const gateways = fallback ? [primary, fallback] : [primary];

    for (const gateway of gateways) {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        const remainingMs = deadline === undefined ? timeoutMs : deadline - Date.now();
        if (remainingMs <= 0) break;
        try {
          const response = await fetch(gateway.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': gateway.apiKey,
            },
            body: JSON.stringify({ recipients: [phoneNumber], message }),
            signal: AbortSignal.timeout(Math.min(timeoutMs, remainingMs)),
          });
          if (response.ok) {
            return;
          }
        } catch {
          // Retry the configured gateway, then try the fallback if available.
        }
        if (attempt < retries) {
          const backoffMs = 100 * (attempt + 1);
          const timeUntilDeadline = deadline === undefined ? backoffMs : deadline - Date.now();
          if (timeUntilDeadline <= 0) break;
          await new Promise((resolve) => setTimeout(resolve, Math.min(backoffMs, timeUntilDeadline)));
        }
      }
    }

    throw new BadGatewayException('TextBee could not deliver the verification message.');
  }

  private getGatewayConfig(urlKey: string, apiKeyKey: string): GatewayConfig | null {
    const url = this.config.get<string>(urlKey)?.trim();
    const apiKey = this.config.get<string>(apiKeyKey)?.trim();
    return url && apiKey ? { url, apiKey } : null;
  }
}
