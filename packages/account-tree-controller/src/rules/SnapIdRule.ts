import {
  AccountWalletCategory,
  toAccountWalletId,
} from '@metamask/account-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { SnapId } from '@metamask/snaps-sdk';
import { stripSnapPrefix } from '@metamask/snaps-utils';

import type { RuleMatch } from './Rule';
import { BaseRule } from './Rule';
import { hasKeyringType } from './utils';

export class SnapIdRule extends BaseRule {
  match(account: InternalAccount): RuleMatch | undefined {
    if (
      hasKeyringType(account, KeyringTypes.snap) &&
      account.metadata.snap &&
      account.metadata.snap.enabled
    ) {
      const { id } = account.metadata.snap;

      return {
        category: AccountWalletCategory.Snap,
        id: toAccountWalletId(AccountWalletCategory.Snap, id),
        name: this.#getSnapName(id as SnapId),
      };
    }

    return undefined;
  }

  #getSnapName(snapId: SnapId): string {
    const snap = this.messenger.call('SnapController:get', snapId);
    const snapName = snap
      ? // TODO: Handle localization here, but that's a "client thing", so we don't have a `core` controller
        // to refer to.
        snap.manifest.proposedName
      : stripSnapPrefix(snapId);

    return snapName;
  }
}
