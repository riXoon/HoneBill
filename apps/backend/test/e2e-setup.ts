import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

process.env.NODE_ENV = 'test';

const envPath = resolve(__dirname, '..', '.env');
if (existsSync(envPath)) {
  const fileEnvironment = parseEnv(readFileSync(envPath, 'utf8'));
  for (const [key, value] of Object.entries(fileEnvironment)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
