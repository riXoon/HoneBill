import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
describe('AppModule', () => {
  it('compiles', async () => {
    const originalSecret = process.env.SECRET_SEP10_JWT_SECRET;
    process.env.SECRET_SEP10_JWT_SECRET = 'fake-sep10-secret-for-module-test';

    try {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      expect(moduleRef).toBeDefined();
      await moduleRef.close();
    } finally {
      if (originalSecret === undefined) {
        delete process.env.SECRET_SEP10_JWT_SECRET;
      } else {
        process.env.SECRET_SEP10_JWT_SECRET = originalSecret;
      }
    }
  });
});
