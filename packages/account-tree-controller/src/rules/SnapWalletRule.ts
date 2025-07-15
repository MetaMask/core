import type { AccountWalletId } from '@metamask/account-api';
import {
  AccountWalletCategory,
  toAccountWalletId,
} from '@metamask/account-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { SnapId } from '@metamask/snaps-sdk';
import { stripSnapPrefix } from '@metamask/snaps-utils';

import { hasKeyringType } from './utils';
import type { WalletRuleMatch } from './WalletRule';
import { BaseWalletRule } from './WalletRule';
import type { AccountTreeControllerMessenger } from '../AccountTreeController';
import { MutableAccountTreeWallet } from '../AccountTreeWallet';

class SnapWallet extends MutableAccountTreeWallet {
  readonly snapId: SnapId;

  constructor(messenger: AccountTreeControllerMessenger, snapId: SnapId) {
    super(messenger, AccountWalletCategory.Snap, snapId);
    this.snapId = snapId;
  }

  static toAccountWalletId(snapId: SnapId) {
    return toAccountWalletId(AccountWalletCategory.Snap, snapId);
  }

  getDefaultName(): string {
    const snap = this.messenger.call('SnapController:get', this.snapId);
    const snapName = snap
      ? // TODO: Handle localization here, but that's a "client thing", so we don't have a `core` controller
        // to refer to.
        snap.manifest.proposedName
      : stripSnapPrefix(this.snapId);

    return snapName;
  }
}

export class SnapWalletRule extends BaseWalletRule {
  readonly #wallets: Map<AccountWalletId, SnapWallet>;

  constructor(messenger: AccountTreeControllerMessenger) {
    super(messenger);

    this.#wallets = new Map();
  }

  match(account: InternalAccount): WalletRuleMatch | undefined {
    if (
      hasKeyringType(account, KeyringTypes.snap) &&
      account.metadata.snap &&
      account.metadata.snap.enabled
    ) {
      const { id } = account.metadata.snap;
      const snapId = id as SnapId;

      // Check if a wallet already exists for that keyring type.
      let wallet = this.#wallets.get(SnapWallet.toAccountWalletId(snapId));
      if (!wallet) {
        wallet = new SnapWallet(this.messenger, snapId);
      }

      // This will automatically creates the group if it's missing.
      const group = wallet.addAccount(account);

      return {
        wallet,
        group,
      };
    }

    return undefined;
  }
}
