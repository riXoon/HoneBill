/** Stable BullMQ name shared by the outbound SMS producer and worker. */
export const SMS_QUEUE_NAME = 'honebill-sms-notifications';
/** Preserves the former QStash flow-control cap for outbound notification jobs. */
export const SMS_QUEUE_MAX_PER_MINUTE = 10;
/** Sends messages sequentially to avoid concurrent gateway load. */
export const SMS_QUEUE_CONCURRENCY = 1;
/** Number of BullMQ retries after the initial outbound delivery attempt. */
export const SMS_QUEUE_RETRIES = 3;
/** Maximum raw TextBee webhook body accepted before JSON parsing. */
export const SMS_WEBHOOK_BODY_MAX_BYTES = 2048;
/** Maximum inbound SMS text size accepted for voucher parsing. */
export const SMS_WEBHOOK_MESSAGE_MAX_CHARS = 300;
/** Replay-cache lifetime for a voucher nonce. */
export const SMS_WEBHOOK_NONCE_TTL_SECONDS = 86_400;

export const smsVoucherKey = (canonicalNonce: string) => `honebill:sms:nonce:${canonicalNonce}`;
