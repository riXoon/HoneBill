import { describe, expect, it, jest } from '@jest/globals';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Sep10JwtGuard } from './sep10-jwt.guard.js';

const ISSUER = 'localhost:3000';

type VerifyAsync = (token: string, options: unknown) => Promise<unknown>;

function createContext(headers: Record<string, string>) {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers,
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

function createGuard(impl: VerifyAsync = () => Promise.resolve({})) {
  const verifyAsync = jest.fn<VerifyAsync>(impl);
  const guard = new Sep10JwtGuard(
    { verifyAsync } as never,
    { tokenIssuer: ISSUER } as never,
  );
  return { guard, verifyAsync };
}

describe('Sep10JwtGuard', () => {
  it('rejects a missing Authorization header', async () => {
    const { guard, verifyAsync } = createGuard();
    await expect(
      guard.canActivate(createContext({}).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects a non-Bearer scheme', async () => {
    const { guard, verifyAsync } = createGuard();
    await expect(
      guard.canActivate(
        createContext({ authorization: 'Basic abc123' }).context,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects an empty bearer token', async () => {
    const { guard, verifyAsync } = createGuard();
    await expect(
      guard.canActivate(createContext({ authorization: 'Bearer ' }).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects when token verification throws (bad signature, expired, wrong issuer)', async () => {
    const { guard } = createGuard(() =>
      Promise.reject(new Error('jwt expired')),
    );
    await expect(
      guard.canActivate(
        createContext({ authorization: 'Bearer x.y.z' }).context,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token without a non-empty string sub claim', async () => {
    const { guard } = createGuard(() => Promise.resolve({ iss: ISSUER }));

    await expect(
      guard.canActivate(
        createContext({ authorization: 'Bearer x.y.z' }).context,
      ),
    ).rejects.toThrow('Invalid or expired token');
  });

  it('rejects a whitespace-only sub claim', async () => {
    const { guard } = createGuard(() =>
      Promise.resolve({ sub: '   ', iss: ISSUER }),
    );

    await expect(
      guard.canActivate(
        createContext({ authorization: 'Bearer x.y.z' }).context,
      ),
    ).rejects.toThrow('Invalid or expired token');
  });

  it('accepts a valid token, sets request.user, and pins HS256 and the issuer', async () => {
    const claims = { sub: 'GABC', iss: ISSUER };
    const { guard, verifyAsync } = createGuard(() => Promise.resolve(claims));
    const { context, request } = createContext({
      authorization: 'Bearer x.y.z',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(request.user).toEqual(claims);
    expect(verifyAsync).toHaveBeenCalledWith('x.y.z', {
      algorithms: ['HS256'],
      issuer: ISSUER,
    });
  });
});
