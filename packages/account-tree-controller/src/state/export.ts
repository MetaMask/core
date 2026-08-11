import { AccountWalletType } from '@metamask/account-api';
import { HdKeyring } from '@metamask/eth-hd-keyring/v2';
import { EthAccountType } from '@metamask/keyring-api';
import { PrivateKeyExportedAccount } from '@metamask/keyring-api/v2';
import { KeyringTypes } from '@metamask/keyring-controller';
import { encodeMnemonicWords } from '@metamask/keyring-sdk';

import type {
  AccountTreeControllerMessenger,
  AccountTreeControllerState,
} from '../types.js';
import type { AccountWalletObject } from '../wallet.js';
import {
  AccountWalletEntropyObject,
  AccountWalletKeyringObject,
} from '../wallet.js';
import { IdMap } from './id-map.js';
import type {
  AccountTreeWalletEntry,
  AccountWalletMnemonicGroupEntry,
  AccountWalletMnemonicPayload,
  AccountWalletPrivateKeyGroupEntry,
  AccountWalletPrivateKeyPayload,
  ExportStateOptions,
} from './payload.js';
import {
  AccountWalletPayloadType,
  AccountWalletPrivateKeyEncoding,
  toWalletPayloadId,
  toGroupPayloadId,
} from './payload.js';
import { AccountTreeSnapshot } from './snapshot.js';

/**
 * Returns `true` if `wallet` is an HD entropy wallet ({@link AccountWalletEntropyObject}).
 *
 * @param wallet - The wallet object to test.
 * @returns Type predicate narrowing to {@link AccountWalletEntropyObject}.
 */
export function isMnemonicWalletObject(
  wallet: AccountWalletObject,
): wallet is AccountWalletEntropyObject {
  return wallet.type === AccountWalletType.Entropy;
}

/**
 * Returns `true` if `wallet` is an imported private-key wallet
 * ({@link AccountWalletKeyringObject} with keyring type {@link KeyringTypes.simple}).
 *
 * @param wallet - The wallet object to test.
 * @returns Type predicate narrowing to {@link AccountWalletKeyringObject}.
 */
export function isPrivateKeyWalletObject(
  wallet: AccountWalletObject,
): wallet is AccountWalletKeyringObject {
  return (
    wallet.type === AccountWalletType.Keyring &&
    wallet.metadata.keyring.type === KeyringTypes.simple
  );
}

/** Context required by {@link exportState}. */
export type ExportContext = {
  getState: () => AccountTreeControllerState;
  messenger: AccountTreeControllerMessenger;
};

/**
 * Exports a single entropy (HD) wallet object as an {@link AccountWalletMnemonicPayload}.
 *
 * Calls `KeyringController:withKeyringV2Unsafe` to derive the stable entropy source ID
 * via {@link HdKeyring.toEntropySourceId} and, when `includeSecrets` is `true`, to read
 * the raw mnemonic bytes.
 *
 * @param context - Export context.
 * @param walletObj - The local entropy wallet to export.
 * @param includeSecrets - When `true`, the BIP-39 mnemonic is included in the payload.
 * @param idMap - ID map to populate with local↔payload ID pairs for this wallet and its groups.
 * @returns The mnemonic wallet payload entry.
 * @throws If `includeSecrets` is `true` but the mnemonic cannot be read from the keyring.
 */
async function exportMnemonicWalletObject(
  context: ExportContext,
  walletObj: AccountWalletEntropyObject,
  includeSecrets: boolean,
  idMap: IdMap,
): Promise<AccountWalletMnemonicPayload> {
  const result = await context.messenger.call(
    'KeyringController:withKeyringV2Unsafe',
    // The local wallet entropy ID is the keyring ID.
    { id: walletObj.metadata.entropy.id },
    async ({ keyring }) => {
      const hdKeyring = keyring as HdKeyring;
      const includeMnemonic =
        includeSecrets &&
        hdKeyring.mnemonic !== null &&
        hdKeyring.mnemonic !== undefined;

      return {
        // Compute the stable entropy source ID from the keyring's mnemonic (BIP-39 seed).
        entropySourceId: await hdKeyring.toEntropySourceId(),
        // No need to include the mnemonic here if we're not exporting secrets.
        mnemonic: includeMnemonic ? hdKeyring.mnemonic : undefined,
      };
    },
  );
  const { entropySourceId, mnemonic } = result as {
    entropySourceId: string;
    mnemonic?: Uint8Array;
  };

  // We use the stable entropy source ID as the payload wallet ID, rather than the local wallet ID, to
  // ensure that the exported snapshot is stable across different installations and sessions.
  const wallet: AccountWalletMnemonicPayload = {
    type: AccountWalletPayloadType.Mnemonic,
    id: toWalletPayloadId(entropySourceId),
    metadata: { name: walletObj.metadata.name },
    groups: [],
  };

  idMap.add(walletObj.id, wallet.id);

  for (const groupObj of Object.values(walletObj.groups)) {
    const { groupIndex } = groupObj.metadata.entropy;

    const group: AccountWalletMnemonicGroupEntry = {
      id: toGroupPayloadId(wallet.id, groupIndex),
      groupIndex,
      metadata: {
        name: groupObj.metadata.name,
        pinned: groupObj.metadata.pinned,
        hidden: groupObj.metadata.hidden,
      },
    };

    idMap.add(groupObj.id, group.id);

    wallet.groups.push(group);
  }

  // Sort the groups by their `groupIndex` to ensure a stable order in the exported payload.
  wallet.groups.sort((group, otherGroup) => group.groupIndex - otherGroup.groupIndex);

  // This should never happen, but we check just in case.
  if (includeSecrets) {
    if (mnemonic === undefined) {
      throw new Error(`Failed to export mnemonic for wallet ${wallet.id}`);
    }

    wallet.value = encodeMnemonicWords(mnemonic);
  }

  return wallet;
}

/**
 * Exports a single simple-keyring wallet object as an {@link AccountWalletPrivateKeyPayload}.
 *
 * All groups from the wallet are merged into the `'private-key'` singleton payload entry.
 * When `includeSecrets` is `true`, each group's private key is exported via
 * `KeyringController:withKeyringV2`.
 *
 * @param context - Export context.
 * @param walletObj - The local simple-keyring wallet to export.
 * @param includeSecrets - When `true`, private keys are included in the payload.
 * @param idMap - ID map to populate with local↔payload ID pairs for this wallet and its groups.
 * @returns The private-key wallet payload entry.
 * @throws If `includeSecrets` is `true` but a private key cannot be exported for an account.
 */
async function exportPrivateKeyWalletObject(
  context: ExportContext,
  walletObj: AccountWalletKeyringObject,
  includeSecrets: boolean,
  idMap: IdMap,
): Promise<AccountWalletPrivateKeyPayload> {
  // We use a singleton wallet ID for private keys.
  const wallet: AccountWalletPrivateKeyPayload = {
    type: AccountWalletPayloadType.PrivateKey,
    id: toWalletPayloadId(AccountWalletPayloadType.PrivateKey),
    metadata: { name: walletObj.metadata.name },
    groups: [],
  };

  idMap.add(walletObj.id, wallet.id);

  for (const groupObj of Object.values(walletObj.groups)) {
    const accountId = groupObj.accounts[0];
    if (!accountId) {
      continue;
    }
    const account = context.messenger.call(
      'AccountsController:getAccount',
      accountId,
    );
    if (!account) {
      continue;
    }

    const { address } = account;

    let exported: PrivateKeyExportedAccount | undefined;
    if (includeSecrets) {
      const result = await context.messenger.call(
        'KeyringController:withKeyringV2',
        { address },
        async ({ keyring }) => {
          if (!keyring.exportAccount) {
            throw new Error(
              `Keyring for account ${accountId} does not support exportAccount`,
            );
          }

          return keyring.exportAccount(accountId, {
            type: 'private-key',
            encoding: AccountWalletPrivateKeyEncoding.Hexadecimal,
          });
        },
      );

      exported = result as PrivateKeyExportedAccount;
    }

    const group: AccountWalletPrivateKeyGroupEntry = {
      id: toGroupPayloadId(wallet.id, address),
      metadata: {
        name: groupObj.metadata.name,
        pinned: groupObj.metadata.pinned,
        hidden: groupObj.metadata.hidden,
      },
    };

    if (includeSecrets) {
      if (!exported) {
        throw new Error(
          `Failed to export private key for account ${accountId}`,
        );
      }
      group.value = {
        privateKey: exported.privateKey,
        encoding: exported.encoding,
        type: EthAccountType.Eoa,
      };
    }

    idMap.add(groupObj.id, group.id);

    wallet.groups.push(group);
  }

  return wallet;
}

/**
 * Builds an {@link AccountTreeSnapshot} from the current controller state.
 *
 * Iterates over all wallets in the tree:
 * - {@link AccountWalletType.Entropy} (HD) wallets -> `'mnemonic'` payload entries.
 * - {@link AccountWalletType.Keyring} wallets of type `simple` -> `'private-key'` payload entries.
 * - Snap wallets and hardware keyrings are skipped in v1.
 *
 * @param context - Export context providing state and messenger access.
 * @param options - Export options.
 * @returns A promise that resolves to the built snapshot.
 * @throws If `options.includeSecrets` is `true` and the vault is locked.
 */
export async function exportState(
  context: ExportContext,
  options: ExportStateOptions = {},
): Promise<AccountTreeSnapshot> {
  const state = context.getState();

  const includeSecrets = options.includeSecrets ?? false;
  const { isUnlocked } = context.messenger.call('KeyringController:getState');
  if (includeSecrets && !isUnlocked) {
    throw new Error('Cannot include secrets in export when vault is locked');
  }

  const idMap = new IdMap();
  const entries: AccountTreeWalletEntry[] = [];
  let privateKeyWallet: AccountWalletPrivateKeyPayload | undefined;

  for (const walletObj of Object.values(state.accountTree.wallets)) {
    if (isMnemonicWalletObject(walletObj)) {
      entries.push(
        await exportMnemonicWalletObject(
          context,
          walletObj,
          includeSecrets,
          idMap,
        ),
      );
    } else if (isPrivateKeyWalletObject(walletObj)) {
      const exported = await exportPrivateKeyWalletObject(
        context,
        walletObj,
        includeSecrets,
        idMap,
      );

      if (privateKeyWallet) {
        privateKeyWallet.groups.push(...exported.groups);
      } else {
        privateKeyWallet = exported;
      }
    } else {
      // AccountWalletType.Snap and hardware keyrings: skipped for now.
    }
  }

  if (privateKeyWallet) {
    entries.push(privateKeyWallet);
  }

  return new AccountTreeSnapshot(entries, idMap);
}
