import type { InternalAccount } from '@metamask/keyring-internal-api';
import { expect } from 'vitest';

import { createMockInternalAccount } from './mocks.js';

/**
 * Builds the account a test expects to see, with the timestamps left as
 * "any number" matchers.
 *
 * This lives apart from `mocks.ts` because `expect.any` produces a Vitest
 * asymmetric matcher, which Jest's `expect` does not understand - and `mocks.ts`
 * is still imported by packages running under Jest.
 *
 * @param args - The same arguments `createMockInternalAccount` takes.
 * @returns The expected internal account.
 */
export const createExpectedInternalAccount = (
  args: Parameters<typeof createMockInternalAccount>[0],
): InternalAccount => {
  return createMockInternalAccount({
    ...args,
    importTime: expect.any(Number),
    lastSelected: expect.any(Number),
  });
};
