import type { Bip44Account } from '@metamask/account-api';
import type {
  CreateAccountOptions,
  KeyringAccount,
  KeyringCapabilities,
} from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { AccountProviderWrapper } from './AccountProviderWrapper';
import { BaseBip44AccountProvider } from './BaseBip44AccountProvider';
import {
  getMultichainAccountServiceMessenger,
  getRootMessenger,
  MOCK_HD_KEYRING_1,
  MOCK_SOL_ACCOUNT_1,
} from '../tests';
import type { MultichainAccountServiceMessenger } from '../types';

class MockInnerProvider extends BaseBip44AccountProvider {
  readonly capabilities: KeyringCapabilities = {
    scopes: [],
    bip44: { deriveIndex: true },
  };

  getName(): string {
    return 'MockInnerProvider';
  }

  isAccountCompatible(_account: Bip44Account<KeyringAccount>): boolean {
    return true;
  }

  async createAccounts(
    _options: CreateAccountOptions,
  ): Promise<Bip44Account<KeyringAccount>[]> {
    return [];
  }

  async discoverAccounts(_options: {
    entropySource: string;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]> {
    return [];
  }

  resyncAccounts(_accounts: Bip44Account<InternalAccount>[]): Promise<void> {
    return Promise.resolve();
  }
}

function setup(): {
  wrapper: AccountProviderWrapper;
  innerProvider: MockInnerProvider;
} {
  const messenger = getRootMessenger();
  const multichainMessenger: MultichainAccountServiceMessenger =
    getMultichainAccountServiceMessenger(messenger);

  const innerProvider = new MockInnerProvider(multichainMessenger);
  const wrapper = new AccountProviderWrapper(
    multichainMessenger,
    innerProvider,
  );

  return { wrapper, innerProvider };
}

describe('AccountProviderWrapper', () => {
  describe('alignAccounts', () => {
    it('returns empty array when disabled', async () => {
      const { wrapper } = setup();

      wrapper.setEnabled(false);

      const result = await wrapper.alignAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      });

      expect(result).toStrictEqual([]);
    });

    it('does not delegate to inner provider when disabled', async () => {
      const { wrapper, innerProvider } = setup();
      innerProvider.init([MOCK_SOL_ACCOUNT_1.id]);

      const alignSpy = jest
        .spyOn(innerProvider, 'alignAccounts')
        .mockResolvedValue([MOCK_SOL_ACCOUNT_1.id]);

      wrapper.setEnabled(false);

      await wrapper.alignAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      });

      expect(alignSpy).not.toHaveBeenCalled();
    });

    it('delegates to inner provider when enabled', async () => {
      const { wrapper, innerProvider } = setup();
      innerProvider.init([MOCK_SOL_ACCOUNT_1.id]);

      const alignSpy = jest
        .spyOn(innerProvider, 'alignAccounts')
        .mockResolvedValue([MOCK_SOL_ACCOUNT_1.id]);

      const result = await wrapper.alignAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      });

      expect(alignSpy).toHaveBeenCalledWith({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      });
      expect(result).toStrictEqual([MOCK_SOL_ACCOUNT_1.id]);
    });
  });
});
