import { AccountWalletType } from '@metamask/account-api';
import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import { AccountImportStrategy } from '@metamask/keyring-controller';

import type {
  AccountTreeControllerMessenger,
  AccountTreeControllerState,
} from '../types.js';
import type { AccountWalletEntropyObject } from '../wallet.js';
import type {
  AccountTreePayload,
  AccountWalletMnemonicGroupEntry,
  AccountWalletPrivateKeyGroupEntry,
} from './payload.js';

export type ImportContext = {
  getState: () => AccountTreeControllerState;
  messenger: AccountTreeControllerMessenger;
  setWalletName: (walletId: AccountWalletId, name: string) => void;
  /** Sets a group name. Implementations should resolve conflicts automatically. */
  setGroupName: (groupId: AccountGroupId, name: string) => void;
  setGroupPinned: (groupId: AccountGroupId, pinned: boolean) => void;
  setGroupHidden: (groupId: AccountGroupId, hidden: boolean) => void;
};

/**
 * Finds the local entropy wallet with the given `entropySourceId` in the
 * current state, or returns `undefined` if absent.
 */
function findLocalEntropyWallet(
  state: AccountTreeControllerState,
  entropySourceId: string,
): AccountWalletEntropyObject | undefined {
  return Object.values(state.accountTree.wallets).find(
    (w): w is AccountWalletEntropyObject =>
      w.type === AccountWalletType.Entropy &&
      w.metadata.entropy.id === entropySourceId,
  );
}

/**
 * Finds the local group in `wallet` whose `groupIndex` matches `payloadGroupIndex`.
 */
function findLocalGroupByIndex(
  wallet: AccountWalletEntropyObject,
  payloadGroupIndex: number,
): { id: AccountGroupId } | undefined {
  return Object.values(wallet.groups).find(
    (g) => g.metadata.entropy.groupIndex === payloadGroupIndex,
  );
}

/**
 * Applies name / pinned / hidden metadata for a single mnemonic group entry,
 * if the local group exists.
 */
function applyGroupMetadata(
  context: ImportContext,
  localGroupId: AccountGroupId,
  payloadGroupMetadata: AccountWalletMnemonicGroupEntry['metadata'],
): void {
  context.setGroupName(localGroupId, payloadGroupMetadata.name);
  context.setGroupPinned(localGroupId, payloadGroupMetadata.pinned);
  context.setGroupHidden(localGroupId, payloadGroupMetadata.hidden);
}

/**
 * Imports a mnemonic wallet entry from the payload.
 */
async function importMnemonicWallet(
  context: ImportContext,
  payloadWallet: {
    id: string;
    value?: string;
    metadata: { name: string };
    groups: AccountWalletMnemonicGroupEntry[];
  },
): Promise<void> {
  // Strip the `wallet:` prefix to get the EntropySourceId
  // e.g. "wallet:entropy:mnemonic:<uuid>" → "entropy:mnemonic:<uuid>"
  const entropySourceId = payloadWallet.id.slice('wallet:'.length);

  let localWallet = findLocalEntropyWallet(context.getState(), entropySourceId);

  if (!localWallet) {
    if (!payloadWallet.value) {
      // No mnemonic in payload and wallet doesn't exist locally — nothing to do.
      return;
    }

    // Import the mnemonic as a new HD wallet.
    const mnemonicBytes = new TextEncoder().encode(payloadWallet.value);
    await context.messenger.call(
      'MultichainAccountService:createMultichainAccountWallet',
      { type: 'import', mnemonic: mnemonicBytes },
    );

    // Event handlers fire synchronously, so the wallet is in the tree now.
    localWallet = findLocalEntropyWallet(context.getState(), entropySourceId);
    if (!localWallet) {
      return;
    }
  }

  const localWalletId = localWallet.id;
  context.setWalletName(localWalletId, payloadWallet.metadata.name);

  for (const payloadGroup of payloadWallet.groups) {
    let localGroup = findLocalGroupByIndex(localWallet, payloadGroup.groupIndex);

    if (!localGroup) {
      await context.messenger.call(
        'MultichainAccountService:createMultichainAccountGroup',
        { entropySource: entropySourceId, groupIndex: payloadGroup.groupIndex },
      );

      // Re-read wallet after group creation.
      const updatedWallet = findLocalEntropyWallet(
        context.getState(),
        entropySourceId,
      );
      localGroup = updatedWallet
        ? findLocalGroupByIndex(updatedWallet, payloadGroup.groupIndex)
        : undefined;
    }

    if (localGroup) {
      applyGroupMetadata(context, localGroup.id, payloadGroup.metadata);
    }
  }
}

/**
 * Imports a private-key wallet entry from the payload.
 */
async function importPrivateKeyWallet(
  context: ImportContext,
  payloadGroups: AccountWalletPrivateKeyGroupEntry[],
): Promise<void> {
  for (const payloadGroup of payloadGroups) {
    // Payload group ID format: "wallet:private-key/<address>"
    const address = payloadGroup.id.slice('wallet:private-key/'.length);

    const accounts = context.messenger.call(
      'AccountsController:listMultichainAccounts',
    );
    let account = accounts.find(
      (a) => a.address.toLowerCase() === address.toLowerCase(),
    );

    if (!account) {
      if (!payloadGroup.value || payloadGroup.value.encoding !== 'hexadecimal') {
        // No importable secret — skip this account.
        continue;
      }

      await context.messenger.call(
        'KeyringController:importAccountWithStrategy',
        AccountImportStrategy.privateKey,
        [payloadGroup.value.privateKey],
      );

      // Re-query accounts after import.
      const updatedAccounts = context.messenger.call(
        'AccountsController:listMultichainAccounts',
      );
      account = updatedAccounts.find(
        (a) => a.address.toLowerCase() === address.toLowerCase(),
      );
    }

    if (!account) {
      continue;
    }

    // Find the local group that contains this account.
    const localGroup = Object.values(context.getState().accountTree.wallets)
      .flatMap((w) => Object.values(w.groups))
      .find((g) => g.accounts.includes(account.id));

    if (!localGroup) {
      continue;
    }

    context.setGroupName(localGroup.id, payloadGroup.metadata.name);
    context.setGroupPinned(localGroup.id, payloadGroup.metadata.pinned);
    context.setGroupHidden(localGroup.id, payloadGroup.metadata.hidden);
  }
}

/**
 * Applies an {@link AccountTreePayload} to the current controller state.
 *
 * - For each `'mnemonic'` wallet: imports the mnemonic (if provided and not
 *   already present) and applies metadata to all groups.
 * - For each `'private-key'` group: imports the key (if provided and not
 *   already present) and applies metadata.
 * - Unknown wallet types are silently skipped for forward compatibility.
 *
 * @param context - Import context providing state, messenger, and setters.
 * @param payload - The validated payload to import.
 */
export async function importState(
  context: ImportContext,
  payload: AccountTreePayload,
): Promise<void> {
  for (const wallet of payload.wallets) {
    if (wallet.type === 'mnemonic') {
      await importMnemonicWallet(context, wallet);
    } else if (wallet.type === 'private-key') {
      await importPrivateKeyWallet(context, wallet.groups);
    }
    // Unknown types: skip silently (forward-compat).
  }
}
