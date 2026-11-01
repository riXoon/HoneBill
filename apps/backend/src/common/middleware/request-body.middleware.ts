import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type NextFunction, type Request, type Response } from 'express';

// PIN/OTP routes preserve legacy behavior: malformed JSON becomes an empty input
// (null), allowing the service to return its own missing-field error message.
// _res is unused; next() continues processing with the normalized request body.
const parseJsonOrNull = (req: Request, _res: Response, next: (error?: unknown) => void) => {
  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body) as unknown;
    } catch {
      req.body = null;
    }
  }
  next();
};

// Express calls this verify callback before converting bytes into JSON/form data.
// Copy the bytes so signature checks can use the received body, not JSON.stringify.
const captureRawBody = (req: Request, _res: Response, buffer: Buffer) => {
  (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
};

/**
 * Installs request-body middleware on the Nest Express app before controllers run.
 * Route-specific text parsers must precede the general JSON parser: once a parser
 * consumes the request stream, a later parser cannot read those bytes again.
 * Call configureSmsWebhookMiddleware first to give TextBee its bounded raw parser.
 */
export function configureRequestBodyParsing(app: NestExpressApplication): void {
  // Keep the exact POST /api/auth body as text for AuthService's legacy parsing.
  // Form submissions are left for their respective parsers below.
  app.use(
    '/api/auth',
    express.text({
      type: (incoming) => {
        const req = incoming as Request;
        if (req.method !== 'POST') return false;
        // app.use matches subpaths too. Limit this parser to /api/auth itself;
        // remove query parameters and trailing slashes when checking the URL.
        const path = String(req.originalUrl ?? '').split('?')[0].replace(/\/+$/, '');
        if (path !== '/api/auth') return false;
        const contentType = String(req.headers['content-type'] ?? '').toLowerCase();
        return !/(urlencoded|multipart\/form-data)/.test(contentType);
      },
    }),
  );

  // Accept text for every Content-Type, then parse it ourselves so invalid JSON
  // uses the endpoint's validation response rather than Express's syntax error.
  app.use('/api/auth/pin/verify', express.text({ type: () => true }), parseJsonOrNull);
  app.use('/api/otp', express.text({ type: () => true }), parseJsonOrNull);
  // Match the legacy empty 405 response for unsupported OTP methods. OPTIONS
  // continues so CORS preflight handling can respond; no Allow header is added.
  app.use('/api/otp', (req: Request, res: Response, next: NextFunction) => {
    const path = String(req.originalUrl ?? '').split('?')[0].replace(/\/+$/, '');
    if (
      ['/api/otp/send', '/api/otp/verify'].includes(path) &&
      !['POST', 'OPTIONS'].includes(req.method)
    ) {
      res.status(405).end();
      return;
    }
    next();
  });

  // Dispatch authenticates before parsing JSON, as the legacy QStash endpoint did.
  // Keep malformed JSON as text until its guard has checked the dispatch secret.
  app.use('/api/sms/dispatch', express.text({ type: () => true, verify: captureRawBody }));

  // Parse remaining JSON requests. strict:false permits JSON primitives/null so
  // endpoint validation decides which values are acceptable. Already-consumed
  // request bodies (including raw TextBee Buffers) are not parsed a second time.
  app.use(express.json({ strict: false, verify: captureRawBody }));
  // Parse application/x-www-form-urlencoded requests, including nested fields.
  app.use(express.urlencoded({ extended: true, verify: captureRawBody }));
}
