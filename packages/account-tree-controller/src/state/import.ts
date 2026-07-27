import {
  AccountWalletType,
  toAccountGroupId,
  toAccountWalletId,
  toMultichainAccountGroupId,
} from '@metamask/account-api';
import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import { getUUIDFromAddressOfNormalAccount } from '@metamask/accounts-controller';
import { HdKeyring } from '@metamask/eth-hd-keyring/v2';
import { KeyringAccount } from '@metamask/keyring-api';
import { KeyringType } from '@metamask/keyring-api/v2';
import { KeyringTypes } from '@metamask/keyring-controller';

import type {
  AccountTreeControllerMessenger,
  AccountTreeControllerState,
} from '../types.js';
import type { AccountWalletEntropyObject } from '../wallet.js';
import { isMnemonicWalletObject } from './export.js';
import type {
  AccountTreePayload,
  AccountWalletMnemonicGroupEntry,
  AccountWalletMnemonicPayload,
  AccountWalletPayloadId,
  AccountWalletPrivateKeyGroupEntry,
} from './payload.js';
import { parsePayloadGroupId, toWalletPayloadId } from './payload.js';

/** Context required by {@link importState}. */
export type ImportContext = {
  getState: () => AccountTreeControllerState;
  messenger: AccountTreeControllerMessenger;
  setWalletName: (walletId: AccountWalletId, name: string) => void;
  /** Sets a group name. Implementations must resolve name conflicts automatically. */
  setGroupName: (groupId: AccountGroupId, name: string) => void;
  setGroupPinned: (groupId: AccountGroupId, pinned: boolean) => void;
  setGroupHidden: (groupId: AccountGroupId, hidden: boolean) => void;
};

/**
 * Searches the local wallet tree for an entropy wallet whose stable payload ID
 * matches `payloadWalletId`. The entropy source ID is derived on-the-fly via
 * `KeyringController:withKeyringV2Unsafe` rather than relying on cached metadata.
 *
 * @param context - Import context.
 * @param payloadWalletId - Payload wallet ID to match against.
 * @returns The matching local entropy wallet, or `undefined` if not found.
 */
async function findLocalWalletMnemonicFromPayloadId(
  context: ImportContext,
  payloadWalletId: AccountWalletPayloadId,
): Promise<AccountWalletEntropyObject | undefined> {
  const wallets = Object.values(context.getState().accountTree.wallets);

  for (const wallet of wallets) {
    if (isMnemonicWalletObject(wallet)) {
      const result = await context.messenger.call(
        'KeyringController:withKeyringV2Unsafe',
        { id: wallet.metadata.entropy.id },
        async ({ keyring }) => {
          const hdKeyring = keyring as HdKeyring;

          return toWalletPayloadId(await hdKeyring.toEntropySourceId());
        },
      );

      const localPayloadId = result as AccountWalletPayloadId;
      if (localPayloadId === payloadWalletId) {
        return wallet;
      }
    }
  }

  return undefined;
}

/**
 * Returns the local entropy wallet for the given ID.
 *
 * @param context - Import context.
 * @param id - Local wallet ID.
 * @returns The entropy wallet object.
 * @throws If the wallet is not found or is not an entropy wallet.
 */
function findLocalWalletMnemonicFromId(
  context: ImportContext,
  id: AccountWalletId,
): AccountWalletEntropyObject {
  const localWallets = context.getState().accountTree.wallets;

  if (!localWallets[id]) {
    throw new Error(
      `Failed to import mnemonic wallet: wallet not found after creation`,
    );
  }
  if (!isMnemonicWalletObject(localWallets[id])) {
    throw new Error(
      `Failed to import mnemonic wallet: wallet is not of type 'mnemonic'`,
    );
  }
  return localWallets[id];
}

/**
 * Applies name, pinned, and hidden metadata from a payload group entry to a local group.
 *
 * @param context - Import context providing the metadata setters.
 * @param localGroupId - Local group ID to update.
 * @param payloadGroupMetadata - Metadata from the payload group entry.
 */
function setGroupMetadata(
  context: ImportContext,
  localGroupId: AccountGroupId,
  payloadGroupMetadata: AccountWalletMnemonicGroupEntry['metadata'],
): void {
  context.setGroupName(localGroupId, payloadGroupMetadata.name);
  context.setGroupPinned(localGroupId, payloadGroupMetadata.pinned);
  context.setGroupHidden(localGroupId, payloadGroupMetadata.hidden);
}

/**
 * Applies a mnemonic wallet payload entry to the local state.
 *
 * If no local wallet with the same entropy source ID exists and a mnemonic is
 * present in the payload, a new HD wallet is created via
 * `MultichainAccountService:createMultichainAccountWallet`. Missing groups are
 * created in batches via `MultichainAccountService:createMultichainAccountGroups`.
 * Metadata (name, pinned, hidden) is applied to all groups afterward.
 *
 * @param context - Import context.
 * @param payloadWallet - The mnemonic wallet entry from the payload.
 */
async function importMnemonicWallet(
  context: ImportContext,
  payloadWallet: AccountWalletMnemonicPayload,
): Promise<void> {
  // Find the local wallet with the same entropy source ID if it exists.
  let localWallet = await findLocalWalletMnemonicFromPayloadId(
    context,
    payloadWallet.id,
  );

  if (!localWallet) {
    if (!payloadWallet.value) {
      // No mnemonic in payload and wallet doesn't exist locally — nothing to do.
      return;
    }

    // Import the mnemonic as a new HD wallet.
    const mnemonic = JSON.parse(payloadWallet.value);
    const { id } = await context.messenger.call(
      'MultichainAccountService:createMultichainAccountWallet',
      { type: 'import', mnemonic },
    );

    // Event handlers fire synchronously, so the wallet is in the tree now.
    localWallet = findLocalWalletMnemonicFromId(context, id);
  }

  context.setWalletName(localWallet.id, payloadWallet.metadata.name);

  // Compute range of group indices in the payload to import.
  let rangeIndex: number | undefined;
  const ranges: [number, number][] = [];
  for (const payloadGroup of payloadWallet.groups) {
    const localGroupId = toMultichainAccountGroupId(
      localWallet.id,
      payloadGroup.groupIndex,
    );

    if (localWallet.groups[localGroupId]) {
      if (rangeIndex !== undefined) {
        ranges.push([rangeIndex, payloadGroup.groupIndex - 1]);
        rangeIndex = undefined;
      }

      continue;
    }

    rangeIndex ??= payloadGroup.groupIndex;
  }
  for (const range of ranges) {
    await context.messenger.call(
      'MultichainAccountService:createMultichainAccountGroups',
      {
        entropySource: localWallet.metadata.entropy.id,
        fromGroupIndex: range[0],
        toGroupIndex: range[1],
      },
    );
  }

  // Re-read wallet after groups creation.
  localWallet = findLocalWalletMnemonicFromId(context, localWallet.id);

  for (const payloadGroup of payloadWallet.groups) {
    const localGroupId = toMultichainAccountGroupId(
      localWallet.id,
      payloadGroup.groupIndex,
    );

    setGroupMetadata(context, localGroupId, payloadGroup.metadata);
  }
}

/**
 * Applies private-key wallet group entries from the payload to the local state.
 *
 * For each group the account address is derived from the payload group ID. If the
 * account does not yet exist locally and a private key is provided, it is imported
 * via `KeyringController:withKeyringV2` using the `'private-key:import'` constructor.
 * Metadata (name, pinned, hidden) is then applied to the local group.
 *
 * @param context - Import context.
 * @param payloadGroups - Private-key group entries from the payload.
 */
async function importPrivateKeyWallet(
  context: ImportContext,
  payloadGroups: AccountWalletPrivateKeyGroupEntry[],
): Promise<void> {
  for (const payloadGroup of payloadGroups) {
    // Payload group ID format: "wallet:private-key/<address>"
    const payloadAccountAddress = parsePayloadGroupId(payloadGroup.id).subId;
    const payloadAccountId = getUUIDFromAddressOfNormalAccount(
      payloadAccountAddress,
    );

    const localWalletId = toAccountWalletId(
      AccountWalletType.Keyring,
      KeyringTypes.simple,
    );
    const localGroupId = toAccountGroupId(localWalletId, payloadAccountAddress);

    let localWallets = context.getState().accountTree.wallets;
    let localWallet = localWallets[localWalletId];
    let localGroup = localWallet?.groups[localGroupId];

    // EVM accounts have deterministic IDs, so we can re-use this to find the local group if it exists.
    const hasAccount = localGroup.accounts.some(
      (id) => id === payloadAccountId,
    );

    // If it doesn't exist, we need to import the private key.
    if (!hasAccount) {
      if (!payloadGroup.value) {
        // No importable secret — skip this account.
        continue;
      }

      const { privateKey, encoding } = payloadGroup.value;
      const result = await context.messenger.call(
        'KeyringController:withKeyringV2',
        { type: KeyringType.PrivateKey },
        async ({ keyring }) => {
          await keyring.createAccounts({
            type: 'private-key:import',
            privateKey,
            encoding,
          });
        },
      );

      // There should only be 1 account in the keyring after import.
      const [account] = result as KeyringAccount[];
      if (!account) {
        throw new Error('Failed to import private key for account');
      }
    }

    // Find the local group that contains this account.
    localWallets = context.getState().accountTree.wallets;
    localWallet = localWallets[localWalletId];
    localGroup = localWallet?.groups[localGroupId];
    if (!localGroup) {
      continue;
    }

    setGroupMetadata(context, localGroup.id, payloadGroup.metadata);
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
    } else {
      // Unknown types: skip silently (forward-compat).
    }
  }
}
