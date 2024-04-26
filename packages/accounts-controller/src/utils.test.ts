import { EthAccountType } from '@metamask/keyring-api';

import { createMockInternalAccount } from './tests/mocks';
import { isEVMAccount } from './utils';

describe('isEVMAccount', () => {
  it.each([
    [EthAccountType.Eoa, true],
    [EthAccountType.Erc4337, true],
    ['bip122', false],
  ])('%s should return %s', (accountType, expected) => {
    expect(
      isEVMAccount(
        createMockInternalAccount({ type: accountType as EthAccountType }),
      ),
    ).toBe(expected);
  });
});
