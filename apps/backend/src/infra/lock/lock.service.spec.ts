import { describe, expect, it } from '@jest/globals';
import { LockService } from './lock.service.js';

describe('LockService relayer mutex', () => {
  it('allows only one concurrent owner and requires that owner token to release', async () => {
    const values = new Map<string, string>();
    const redis = {
      set: async (key: string, value: string, _expiry: string, _ttl: number, mode: string) => {
        if (mode === 'NX' && values.has(key)) return null;
        values.set(key, value);
        return 'OK';
      },
      eval: async (_script: string, _count: number, key: string, token: string) => {
        if (values.get(key) !== token) return 0;
        values.delete(key);
        return 1;
      },
    };
    const lock = new LockService({ getClient: () => redis } as any);
    const [first, second] = await Promise.all([
      lock.acquire('relayer', 'owner-1', 30_000),
      lock.acquire('relayer', 'owner-2', 30_000),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    const owner = first ? 'owner-1' : 'owner-2';
    const other = first ? 'owner-2' : 'owner-1';
    expect(await lock.release('relayer', other)).toBe(false);
    expect(await lock.release('relayer', owner)).toBe(true);
    expect(await lock.acquire('relayer', 'owner-3', 30_000)).toBe(true);
  });
});
