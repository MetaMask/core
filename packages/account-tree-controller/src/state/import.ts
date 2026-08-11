import {
  AccountWalletType,
  toAccountGroupId,
  toAccountWalletId,
  toMultichainAccountGroupId,
} from '@metamask/account-api';
import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import { getUUIDFromAddressOfNormalAccount } from '@metamask/accounts-controller';
import { HdKeyring } from '@metamask/eth-hd-keyring/v2';
import { EthAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import { decodeMnemonicWords } from '@metamask/keyring-sdk';

import type {
  AccountTreeControllerMessenger,
  AccountTreeControllerState,
} from '../types.js';
import type {
  AccountWalletEntropyObject,
  AccountWalletKeyringObject,
} from '../wallet.js';
import { isMnemonicWalletObject } from './export.js';
import type {
  AccountWalletMnemonicGroupEntry,
  AccountWalletMnemonicPayload,
  AccountWalletPayloadId,
  AccountWalletPrivateKeyGroupEntry,
} from './payload.js';
import { parsePayloadGroupId, toWalletPayloadId } from './payload.js';
import type { AccountTreeSnapshot } from './snapshot.js';

/** Context required by {@link importState}. */
export type ImportContext = {
  getState: () => AccountTreeControllerState;
  messenger: AccountTreeControllerMessenger;
  setWalletName: (walletId: AccountWalletId, name: string) => void;
  /** Sets a group name. Implementations must resolve name conflicts automatically. */
  setAccountGroupName: (groupId: AccountGroupId, name: string) => void;
  setAccountGroupPinned: (groupId: AccountGroupId, pinned: boolean) => void;
  setAccountGroupHideen: (groupId: AccountGroupId, hidden: boolean) => void;
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
  const localWallet = localWallets[id];

  if (!localWallet) {
    throw new Error(
      `Failed to import mnemonic wallet: wallet not found after creation`,
    );
  }
  if (!isMnemonicWalletObject(localWallet)) {
    throw new Error(
      `Failed to import mnemonic wallet: wallet is not of type 'mnemonic'`,
    );
  }
  return localWallet;
}

/**
 * Returns the local simple-keyring wallet, or `undefined` if none exists yet.
 *
 * The private-key wallet ID is static (derived solely from {@link KeyringTypes.simple}),
 * so no runtime argument is needed to locate it.
 *
 * @param context - Import context.
 * @returns The keyring wallet object, or `undefined` if not present in state.
 */
function findLocalWalletPrivateKey(
  context: ImportContext,
): AccountWalletKeyringObject | undefined {
  const localWalletId = toAccountWalletId(
    AccountWalletType.Keyring,
    KeyringTypes.simple,
  );
  const localWallet = context.getState().accountTree.wallets[localWalletId];
  return localWallet?.type === AccountWalletType.Keyring
    ? (localWallet as AccountWalletKeyringObject)
    : undefined;
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
  context.setAccountGroupName(localGroupId, payloadGroupMetadata.name);
  context.setAccountGroupPinned(localGroupId, payloadGroupMetadata.pinned);
  context.setAccountGroupHideen(localGroupId, payloadGroupMetadata.hidden);
}

/**
 * Computes the contiguous ranges of group indices that are present in the payload
 * but absent from the local wallet, so they can be created in batches.
 *
 * @param localWallet - The local entropy wallet to check existing groups against.
 * @param payloadGroups - Ordered group entries from the payload.
 * @returns An array of `[fromGroupIndex, toGroupIndex]` ranges to create.
 */
function getRangesFromPayloadGroups(
  localWallet: AccountWalletEntropyObject,
  payloadGroups: AccountWalletMnemonicGroupEntry[],
): [number, number][] {
  let rangeIndex: number | undefined;
  const ranges: [number, number][] = [];

  // Keep track of the last payload group so we can close the final range if needed.
  let lastPayloadGroup: AccountWalletMnemonicGroupEntry | undefined;
  for (const payloadGroup of payloadGroups) {
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
    lastPayloadGroup = payloadGroup;
  }

  if (rangeIndex !== undefined && lastPayloadGroup !== undefined) {
    ranges.push([rangeIndex, lastPayloadGroup.groupIndex]);
  }

  return ranges;
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
      // No mnemonic in payload and wallet doesn't exist locally -- nothing to do.
      return;
    }

    // Import the mnemonic as a new HD wallet.
    const mnemonic = decodeMnemonicWords(payloadWallet.value);
    const { id } = await context.messenger.call(
      'MultichainAccountService:createMultichainAccountWallet',
      { type: 'import', mnemonic },
    );

    // Event handlers fire synchronously, so the wallet is in the tree now.
    localWallet = findLocalWalletMnemonicFromId(context, id);
  }

  context.setWalletName(localWallet.id, payloadWallet.metadata.name);

  for (const range of getRangesFromPayloadGroups(
    localWallet,
    payloadWallet.groups,
  )) {
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
  const localWalletId = toAccountWalletId(
    AccountWalletType.Keyring,
    KeyringTypes.simple,
  );

  // Only EVM EOA accounts are supported for now. Non-EVM private keys require
  // Snap-based import routing (ADR-0007), which is not yet implemented. Skip the
  // entire entry so payloads from future clients are accepted without crashing.
  // In the same pass, collect groups whose key is not yet present locally.
  const localWallet = findLocalWalletPrivateKey(context);
  const supportedGroups: AccountWalletPrivateKeyGroupEntry[] = [];
  const missingGroups: AccountWalletPrivateKeyGroupEntry[] = [];

  for (const group of payloadGroups) {
    const type = group.value?.type;
    if (type !== undefined && type !== EthAccountType.Eoa) {
      continue;
    }

    supportedGroups.push(group);

    const address = parsePayloadGroupId(group.id).subId;
    const accountId = getUUIDFromAddressOfNormalAccount(address);
    const localGroupId = toAccountGroupId(localWalletId, address);
    const localGroup = localWallet?.groups[localGroupId];
    const hasAccount =
      localGroup?.accounts.some((id) => id === accountId) ?? false;

    if (!hasAccount && group.value !== undefined) {
      missingGroups.push(group);
    }
  }

  // Import all missing keys in a single :withController call to avoid
  // triggering multiple `KeyringController:stateChanged` events.
  if (missingGroups.length > 0) {
    await context.messenger.call(
      'KeyringController:withController',
      async (controller) => {
        // Find the existing simple keyring or create one if this is the
        // first private-key import (e.g. during onboarding).
        const existing = controller.keyrings.find(
          ({ keyring }) => keyring.type === KeyringTypes.simple,
        );
        const { keyringV2 } =
          existing ?? (await controller.addNewKeyring(KeyringTypes.simple));

        if (!keyringV2) {
          throw new Error('Simple keyring has no v2 interface');
        }

        for (const group of missingGroups) {
          // Safe to assert `group.value` is present because we filtered out groups
          // without a `value` above.
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const { privateKey, encoding } = group.value!;
          const [account] = await keyringV2.createAccounts({
            type: 'private-key:import',
            accountType: EthAccountType.Eoa,
            privateKey,
            encoding,
          });

          if (!account) {
            throw new Error('Failed to import private key for account');
          }
        }
      },
    );
  }

  // Re-read state once after all imports, then apply metadata to every group
  // that now exists locally.
  for (const group of supportedGroups) {
    const address = parsePayloadGroupId(group.id).subId;
    const localGroupId = toAccountGroupId(localWalletId, address);
    const localGroup = findLocalWalletPrivateKey(context)?.groups[localGroupId];
    if (!localGroup) {
      continue;
    }
    setGroupMetadata(context, localGroup.id, group.metadata);
  }
}

/**
 * Applies an {@link AccountTreeSnapshot} to the current controller state.
 *
 * The snapshot must already have been validated — typically via
 * {@link AccountTreeSnapshot.deserialize}. For each retained wallet:
 *
 * - `'mnemonic'`: imports the mnemonic when provided and not already present,
 *   then applies metadata to all groups.
 * - `'private-key'`: imports each retained group's key when provided and not
 *   already present, then applies metadata.
 *
 * @param context - Import context providing state, messenger, and setters.
 * @param snapshot - The validated snapshot to import.
 */
export async function importState(
  context: ImportContext,
  snapshot: AccountTreeSnapshot,
): Promise<void> {
  const payload = snapshot.serialize();

  for (const wallet of payload.wallets) {
    if (wallet.type === 'mnemonic') {
      await importMnemonicWallet(context, wallet);
    } else {
      await importPrivateKeyWallet(context, wallet.groups);
    }
  }
}
