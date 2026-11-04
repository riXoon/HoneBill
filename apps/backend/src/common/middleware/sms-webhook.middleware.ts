import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';

interface SmsWebhookRequest extends Request {
  // Correlates this request's response and logs without logging the signed payload.
  traceId?: string;
  // Exact bytes received from TextBee, used by TextbeeSignatureGuard for HMAC verification.
  rawBody?: Buffer;
}

/**
 * Installs Express middleware on the Nest app for /api/sms/webhook.
 * Run this before configureRequestBodyParsing: parsing and re-serializing JSON
 * can change whitespace/encoding and invalidate TextBee's signature.
 * Middleware runs before Nest guards and controllers; it does not authenticate
 * the payload itself. TextbeeSignatureGuard performs that check afterward.
 */
export function configureSmsWebhookMiddleware(app: NestExpressApplication): void {
  app.use(
    '/api/sms/webhook',
    // Create the trace ID before parsing, so even a rejected oversized POST has one.
    (req: SmsWebhookRequest, _res: Response, next: NextFunction) => {
      if (req.method === 'POST') req.traceId = randomUUID();
      // Continue to the next handler in this middleware chain.
      next();
    },
    // Read the stream into a Buffer regardless of Content-Type. Reject bodies over
    // 2 KB before JSON parsing or voucher processing consumes more resources.
    express.raw({ type: () => true, limit: '2kb' }),
    // Keep the Buffer on the property expected by the signature guard/controller.
    (req: SmsWebhookRequest, _res: Response, next: NextFunction) => {
      if (req.method === 'POST' && Buffer.isBuffer(req.body)) req.rawBody = req.body;
      next();
    },
  );
  // Express recognizes an error handler by its FOUR parameters. Parser failures
  // skip normal handlers and arrive here, including the raw parser's size error.
  app.use('/api/sms/webhook', (error: unknown, req: SmsWebhookRequest, res: Response, next: NextFunction) => {
    if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
      res.status(413).json({ error: 'Payload too large', traceId: req.traceId ?? randomUUID() });
      // The response is complete; do not continue to the webhook controller.
      return;
    }
    // Forward other errors to the remaining error handlers/Nest exception pipeline.
    next(error);
  });
}
