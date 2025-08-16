import { type Bip44Account } from '@metamask/account-api';
import type { SnapKeyring } from '@metamask/eth-snap-keyring';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Json, SnapId } from '@metamask/snaps-sdk';
import type { MultichainAccountServiceMessenger } from 'src/types';

import { BaseAccountProvider } from './BaseAccountProvider';

export type RestrictedSnapKeyringCreateAccount = (
  options: Record<string, Json>,
) => Promise<KeyringAccount>;

export abstract class SnapAccountProvider extends BaseAccountProvider {
  readonly snapId: SnapId;

  constructor(snapId: SnapId, messenger: MultichainAccountServiceMessenger) {
    super(messenger);

    this.snapId = snapId;
  }

  protected async getRestrictedSnapAccountCreator(): Promise<RestrictedSnapKeyringCreateAccount> {
    const createAccount = await this.withKeyring<
      SnapKeyring,
      SnapKeyring['createAccount']
    >({ type: KeyringTypes.snap }, async ({ keyring }) =>
      keyring.createAccount.bind(keyring),
    );

    return (options) =>
      createAccount(this.snapId, options, {
        displayAccountNameSuggestion: false,
        displayConfirmation: false,
        setSelectedAccount: false,
      });
  }

  abstract isAccountCompatible(account: Bip44Account<InternalAccount>): boolean;

  abstract createAccounts(options: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]>;

  abstract discoverAndCreateAccounts(options: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]>;
}
