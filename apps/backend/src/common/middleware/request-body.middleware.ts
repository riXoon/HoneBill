import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type NextFunction, type Request, type Response } from 'express';

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

const captureRawBody = (req: Request, _res: Response, buffer: Buffer) => {
  (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
};

/** Install route-specific parsers first and preserve raw bodies for signed webhooks. */
export function configureRequestBodyParsing(app: NestExpressApplication): void {
  app.use(
    '/api/auth',
    express.text({
      type: (incoming) => {
        const req = incoming as Request;
        if (req.method !== 'POST') return false;
        const path = String(req.originalUrl ?? '').split('?')[0].replace(/\/+$/, '');
        if (path !== '/api/auth') return false;
        const contentType = String(req.headers['content-type'] ?? '').toLowerCase();
        return !/(urlencoded|multipart\/form-data)/.test(contentType);
      },
    }),
  );

  app.use('/api/auth/pin/verify', express.text({ type: () => true }), parseJsonOrNull);
  app.use('/api/otp', express.text({ type: () => true }), parseJsonOrNull);
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

  app.use(express.json({ strict: false, verify: captureRawBody }));
  app.use(express.urlencoded({ extended: true, verify: captureRawBody }));
}
