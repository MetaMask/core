import { AccountGroupType, AccountWalletType } from '@metamask/account-api';
import { toAccountWalletId, toAccountGroupId } from '@metamask/account-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { SnapId } from '@metamask/snaps-sdk';
import { stripSnapPrefix } from '@metamask/snaps-utils';

import { BaseRule, type Rule, type RuleResult } from '../rule';
import type { AccountGroupObjectOf } from '../group';
import type { AccountWalletObjectOf } from '../wallet';

/**
 * Snap account type.
 */
type SnapAccount<Account extends InternalAccount> = Account & {
  metadata: Account['metadata'] & {
    snap: {
      id: SnapId;
    };
  };
};

/**
 * Check if an account is a Snap account.
 *
 * @param account - The account to check.
 * @returns True if the account is a Snap account, false otherwise.
 */
function isSnapAccount(
  account: InternalAccount,
): account is SnapAccount<InternalAccount> {
  return (
    account.metadata.keyring.type === (KeyringTypes.snap as string) &&
    account.metadata.snap !== undefined &&
    account.metadata.snap.enabled
  );
}

export class SnapRule
  extends BaseRule
  implements Rule<AccountWalletType.Snap, AccountGroupType.SingleAccount>
{
  readonly walletType = AccountWalletType.Snap;

  readonly groupType = AccountGroupType.SingleAccount;

  match(
    account: InternalAccount,
  ):
    | RuleResult<AccountWalletType.Snap, AccountGroupType.SingleAccount>
    | undefined {
    if (!isSnapAccount(account)) {
      return undefined;
    }

    const { id: snapId } = account.metadata.snap;

    const walletId = toAccountWalletId(this.walletType, snapId);
    const groupId = toAccountGroupId(walletId, account.address);

    return {
      wallet: {
        type: this.walletType,
        id: walletId,
        metadata: {
          snap: {
            id: snapId,
          },
        },
      },

      group: {
        type: this.groupType,
        id: groupId,
        metadata: {
          pinned: false,
          hidden: false,
        },
      },
    };
  }

  getDefaultAccountWalletName(
    wallet: AccountWalletObjectOf<AccountWalletType.Snap>,
  ): string {
    const snapId = wallet.metadata.snap.id;
    const snap = this.messenger.call('SnapController:get', snapId);
    const snapName = snap
      ? // TODO: Handle localization here, but that's a "client thing", so we don't have a `core` controller
        // to refer to.
        snap.manifest.proposedName
      : stripSnapPrefix(snapId);

    return snapName;
  }

  getComputedAccountGroupName(
    group: AccountGroupObjectOf<AccountGroupType.SingleAccount>,
  ): string {
    return super.getComputedAccountGroupName(group);
  }

  getDefaultAccountGroupName(
    group: AccountGroupObjectOf<AccountGroupType.SingleAccount>,
    index?: number,
  ): string {
    return super.getDefaultAccountGroupName(group, index);
  }
}
