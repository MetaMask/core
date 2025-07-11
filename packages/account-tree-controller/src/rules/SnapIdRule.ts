import { AccountWalletCategory } from '@metamask/account-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { SnapId } from '@metamask/snaps-sdk';
import { stripSnapPrefix } from '@metamask/snaps-utils';

import type { RuleMatch } from './Rule';
import { BaseRule } from './Rule';
import { hasKeyringType } from './utils';
import type { AccountTreeControllerMessenger } from '../AccountTreeController';
import { AccountTreeWallet } from '../AccountTreeWallet';

class SnapIdWallet extends AccountTreeWallet {
  readonly snapId: SnapId;

  constructor(messenger: AccountTreeControllerMessenger, snapId: SnapId) {
    super(messenger, AccountWalletCategory.Snap, snapId);
    this.snapId = snapId;
  }

  getDefaultName(): string {
    const snap = this.messenger.call('SnapController:get', this.snapId);
    const snapName = snap
      ? // TODO: Handle localization here, but that's a "client thing", so we don't have a `core` controller
        // to refer to.
        snap.manifest.proposedName
      : stripSnapPrefix(this.snapId);

    console.log('snapName is', snapName);
    return snapName;
  }
}

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
        id,
      };
    }

    return undefined;
  }

  build({ id: snapId }: RuleMatch) {
    // We assume that `type` is really a `KeyringTypes`.
    return new SnapIdWallet(this.messenger, snapId as SnapId);
  }
}
