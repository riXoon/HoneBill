// accounts.controller.spec.ts
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccountsController } from './accounts.controller.js';

describe('AccountsController query handling', () => {
  const checkUser = jest.fn<(p: string) => unknown>();
  const lookupUser = jest.fn<(s?: string, p?: string) => unknown>();
  const c = new AccountsController({ checkUser, lookupUser } as never);
  beforeEach(() => {jest.clearAllMocks()});

  it('uses the first value of repeated query parameters', () => {
    c.lookupUser(['a', 'b']);
    expect(lookupUser).toHaveBeenLastCalledWith('a', undefined);
    c.checkUser(['0917', '0918']);
    expect(checkUser).toHaveBeenLastCalledWith('0917');
  });
  it('ignores object-shaped query parameters', () => {
    c.lookupUser({ x: '1' } as never, undefined);
    expect(lookupUser).toHaveBeenLastCalledWith(undefined, undefined);
  });
  it('passes a single phone value and uses empty string when missing', () => {
    c.checkUser('0917');
    expect(checkUser).toHaveBeenLastCalledWith('0917');
    c.checkUser(undefined);
    expect(checkUser).toHaveBeenLastCalledWith('');
  });
  it('lookup trims both params; check does not trim', () => {
  c.lookupUser('  a  ', ' 0917 ');
  expect(lookupUser).toHaveBeenLastCalledWith('a', '0917');
  c.checkUser(' 0917 ');
  expect(checkUser).toHaveBeenLastCalledWith(' 0917 ');
    });
});