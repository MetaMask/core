import { EthAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { BaseAccountProvider } from './BaseAccountProvider';

export class EvmAccountProvider extends BaseAccountProvider {
  isAccountCompatible(account: InternalAccount): boolean {
    return (
      account.type === EthAccountType.Eoa &&
      account.metadata.keyring.type === (KeyringTypes.hd as string)
    );
  }
}
