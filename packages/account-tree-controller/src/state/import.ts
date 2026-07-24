import { AccountWalletType, toAccountGroupId, toAccountWalletId, toMultichainAccountGroupId } from '@metamask/account-api';
import { isMnemonicWalletObject } from './export.js';
import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import { KeyringTypes } from '@metamask/keyring-controller';

import type {
  AccountTreeControllerMessenger,
  AccountTreeControllerState,
} from '../types.js';
import type { AccountWalletEntropyObject } from '../wallet.js';
import type {
  AccountTreePayload,
  AccountWalletMnemonicGroupEntry,
  AccountWalletMnemonicPayload,
  AccountWalletPayloadId,
  AccountWalletPrivateKeyGroupEntry,
} from './payload.js';
import { parsePayloadGroupId, toWalletPayloadId } from './payload.js';
import { HdKeyring } from '@metamask/eth-hd-keyring/v2';
import { KeyringType } from '@metamask/keyring-api/v2';
import { KeyringAccount } from '@metamask/keyring-api';
import { getUUIDFromAddressOfNormalAccount } from '@metamask/accounts-controller';

export type ImportContext = {
  getState: () => AccountTreeControllerState;
  messenger: AccountTreeControllerMessenger;
  setWalletName: (walletId: AccountWalletId, name: string) => void;
  /** Sets a group name. Implementations should resolve conflicts automatically. */
  setGroupName: (groupId: AccountGroupId, name: string) => void;
  setGroupPinned: (groupId: AccountGroupId, pinned: boolean) => void;
  setGroupHidden: (groupId: AccountGroupId, hidden: boolean) => void;
};

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

function findLocalWalletMnemonicFromId(context: ImportContext, id: AccountWalletId) {
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
 * Applies name / pinned / hidden metadata for a single mnemonic group entry,
 * if the local group exists.
 *
 * @param context
 * @param localGroupId
 * @param payloadGroupMetadata
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
 * Imports a mnemonic wallet entry from the payload.
 *
 * @param context
 * @param payloadWallet
 * @param payloadWallet.id
 * @param payloadWallet.value
 * @param payloadWallet.metadata
 * @param payloadWallet.metadata.name
 * @param payloadWallet.groups
 */
async function importMnemonicWallet(
  context: ImportContext,
  payloadWallet: AccountWalletMnemonicPayload,
): Promise<void> {
  // Find the local wallet with the same entropy source ID if it exists.
  let localWallet = await findLocalWalletMnemonicFromPayloadId(context, payloadWallet.id);

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
    const localGroupId = toMultichainAccountGroupId(localWallet.id, payloadGroup.groupIndex);

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
  localWallet = findLocalWalletMnemonicFromId(
    context,
    localWallet.id,
  );

  for (const payloadGroup of payloadWallet.groups) {
    const localGroupId = toMultichainAccountGroupId(localWallet.id, payloadGroup.groupIndex);

    setGroupMetadata(context, localGroupId, payloadGroup.metadata);
  }
}

/**
 * Imports a private-key wallet entry from the payload.
 *
 * @param context
 * @param payloadGroups
 */
async function importPrivateKeyWallet(
  context: ImportContext,
  payloadGroups: AccountWalletPrivateKeyGroupEntry[],
): Promise<void> {
  for (const payloadGroup of payloadGroups) {
    // Payload group ID format: "wallet:private-key/<address>"
    const payloadAccountAddress = parsePayloadGroupId(payloadGroup.id).subId;
    const payloadAccountId = getUUIDFromAddressOfNormalAccount(payloadAccountAddress);

    const localWalletId = toAccountWalletId(AccountWalletType.Keyring, KeyringTypes.simple);
    const localGroupId = toAccountGroupId(localWalletId, payloadAccountAddress);

    let localWallets = context.getState().accountTree.wallets;
    let localWallet = localWallets[localWalletId];
    let localGroup = localWallet?.groups[localGroupId];

    // EVM accounts have deterministic IDs, so we can re-use this to find the local group if it exists.
    const hasAccount = localGroup.accounts.some((id) => id === payloadAccountId);

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