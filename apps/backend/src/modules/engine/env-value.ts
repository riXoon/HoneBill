import type { ConfigService } from '@nestjs/config';

/**
 * A config value with surrounding spaces and quotes removed. Hosting dashboards (Vercel) keep quotes that were pasted
 * along with a value from a .env file, which turns a valid token into an invalid one.
 */
export function cleanEnvValue(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/^["']+|["']+$/g, '').trim() : '';
}

export function configValue(config: ConfigService, key: string): string {
  return cleanEnvValue(config.get<string>(key));
}
