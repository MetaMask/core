import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Json } from '@metamask/utils';

import { isBip44Account } from './BaseAccountProvider';
import { MOCK_HD_ACCOUNT_1 } from '../tests';

describe('isBip44Account', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns true if an account is BIP-44 compatible', () => {
    expect(isBip44Account(MOCK_HD_ACCOUNT_1)).toBe(true);
  });

  it.each([
    { tc: 'no entropy', options: { entropySource: undefined } },
    { tc: 'no index', options: { index: undefined } },
  ])(
    'returns false if an account is not BIP-44 compatible: $tc',
    ({ options }) => {
      const account: InternalAccount = {
        ...MOCK_HD_ACCOUNT_1,
        options: {
          ...MOCK_HD_ACCOUNT_1.options,
          ...options,
        } as unknown as Record<string, Json>, // To allow `undefined` values.
      };

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      expect(isBip44Account(account)).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
    },
  );
});
