import {
  AccountWalletCategory,
  toAccountGroupId,
  toAccountWalletId,
} from '@metamask/account-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { SnapId } from '@metamask/snaps-sdk';
import { stripSnapPrefix } from '@metamask/snaps-utils';
import type { AccountTreeGroup } from 'src/AccountTreeGroup';
import type {
  AccountTreeWallet,
  AccountTreeWalletSnapOptions,
} from 'src/AccountTreeWallet';

import type { AccountTreeRuleResult } from '../AccountTreeRule';
import { AccountTreeRule } from '../AccountTreeRule';

type SnapAccount<Account extends InternalAccount> = Account & {
  metadata: Account['metadata'] & {
    snap: {
      id: SnapId;
    };
  };
};

export class SnapRule extends AccountTreeRule {
  readonly category = AccountWalletCategory.Snap;

  isSnapAccount(
    account: InternalAccount,
  ): account is SnapAccount<InternalAccount> {
    return (
      account.metadata.keyring.type === (KeyringTypes.snap as string) &&
      account.metadata.snap !== undefined &&
      account.metadata.snap.enabled
    );
  }

  match(account: InternalAccount): AccountTreeRuleResult | undefined {
    if (!this.isSnapAccount(account)) {
      return undefined;
    }

    const { id: snapId } = account.metadata.snap;

    const wallet: AccountTreeRuleResult['wallet'] = {
      id: toAccountWalletId(this.category, snapId),
      options: {
        type: AccountWalletCategory.Snap,
        snap: {
          id: snapId,
        },
      },
    };

    const group: AccountTreeRuleResult['group'] = {
      id: toAccountGroupId(wallet.id, account.address),
    };

    return {
      wallet,
      group,
    };
  }

  getDefaultAccountWalletName(wallet: AccountTreeWallet): string {
    // Precondition: We assume the AccountTreeController will always use
    // the proper wallet instance.
    const options = wallet.options as AccountTreeWalletSnapOptions;

    const snap = this.messenger.call('SnapController:get', options.snap.id);
    const snapName = snap
      ? // TODO: Handle localization here, but that's a "client thing", so we don't have a `core` controller
        // to refer to.
        snap.manifest.proposedName
      : stripSnapPrefix(options.snap.id);

    return snapName;
  }

  getDefaultAccountGroupName(group: AccountTreeGroup): string {
    // Precondition: This account group should contain only 1 account.
    return group.getOnlyAccount().metadata.name;
  }
}
