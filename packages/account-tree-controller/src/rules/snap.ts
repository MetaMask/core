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
import type { AccountTreeWallet } from 'src/AccountTreeWallet';
import type { AccountContext } from 'src/types';

import { Rule } from './rule';

type SnapAccount<Account extends InternalAccount> = Account & {
  metadata: Account['metadata'] & {
    snap: {
      id: SnapId;
    };
  };
};

export class SnapRule extends Rule {
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

  match(account: InternalAccount): AccountContext | undefined {
    if (!this.isSnapAccount(account)) {
      return undefined;
    }

    const { id: snapId } = account.metadata.snap;

    const walletId = toAccountWalletId(this.category, snapId);
    const groupId = toAccountGroupId(walletId, account.address);

    return {
      walletId,
      groupId,
    };
  }

  getDefaultAccountWalletName(wallet: AccountTreeWallet): string {
    // Precondition: This method is invoked only if there was a match for
    // a Snap account, so we can type-cast here.
    const account = wallet.getAnyAccount() as SnapAccount<InternalAccount>;

    const { id: snapId } = account.metadata.snap;
    const snap = this.messenger.call('SnapController:get', snapId);
    const snapName = snap
      ? // TODO: Handle localization here, but that's a "client thing", so we don't have a `core` controller
        // to refer to.
        snap.manifest.proposedName
      : stripSnapPrefix(snapId);

    return snapName;
  }

  getDefaultAccountGroupName(group: AccountTreeGroup): string {
    // Precondition: This method is invoked only if there was a match for
    // a Snap account, so we can type-cast here. Also, each of those
    // account groups should contain only 1 account.
    const account = group.getOnlyAccount() as SnapAccount<InternalAccount>;

    // We only have 1 account for this kind of rule.
    return account.metadata.name;
  }
}
