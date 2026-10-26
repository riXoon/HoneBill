import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  CORS_ORIGIN: Joi.string().default('*'),
  DATABASE_URL: Joi.string().uri().default('postgresql://localhost:5432/mock'),
  SOROBAN_RPC_URL: Joi.string().uri().default('https://soroban-testnet.stellar.org'),
  STELLAR_HORIZON_URL: Joi.string().uri().default('https://horizon-testnet.stellar.org'),
  STELLAR_NETWORK_PASSPHRASE: Joi.string().default('Test SDF Network ; September 2015'),
  REDIS_URL: Joi.string().uri().optional(),
  REDIS_HOST: Joi.string().default('127.0.0.1'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_DB: Joi.number().min(0).default(0),
  QUEUE_ENABLED: Joi.boolean().default(false),
});
