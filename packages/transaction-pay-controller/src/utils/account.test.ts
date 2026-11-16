import { describe, expect, it } from 'vitest';

import type { TransactionPayControllerMessenger } from '../types.js';
import { accountRequiresMfa } from './account.js';

describe('accountRequiresMfa', () => {
  it('returns false when account is undefined', () => {
    const messenger = {} as TransactionPayControllerMessenger;

    const result = accountRequiresMfa(messenger, undefined);

    expect(result).toBe(false);
  });

  it('returns false when account is empty string', () => {
    const messenger = {} as TransactionPayControllerMessenger;

    const result = accountRequiresMfa(messenger, '');

    expect(result).toBe(false);
  });
});
