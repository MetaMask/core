import { AccountWalletType } from '@metamask/account-api';
import { encodeMnemonic } from '@metamask/keyring-sdk';
import { KeyringTypes } from '@metamask/keyring-controller';

import type {
  AccountTreeControllerMessenger,
  AccountTreeControllerState,
} from '../types.js';
import type {
  AccountTreeWalletEntry,
  AccountWalletMnemonicGroupEntry,
  AccountWalletMnemonicPayload,
  AccountWalletPrivateKeyGroupEntry,
  AccountWalletPrivateKeyPayload,
  ExportStateOptions,
} from './payload.js';
import { IdMap } from './id-map.js';
import { AccountTreeSnapshot } from './snapshot.js';
import { AccountWalletEntropyObject, AccountWalletKeyringObject, AccountWalletObject } from '../wallet.js';
import { HdKeyring } from '@metamask/eth-hd-keyring/v2';
import { PrivateKeyExportedAccount } from '@metamask/keyring-api/v2';

export type ExportContext = {
  getState: () => AccountTreeControllerState;
  messenger: AccountTreeControllerMessenger;
};

function isMnemonicWalletObject(wallet: AccountWalletObject): wallet is AccountWalletEntropyObject {
  return wallet.type === AccountWalletType.Entropy;
}

async function exportMnemonicWalletObject(context: ExportContext, walletObj: AccountWalletEntropyObject, includeSecrets: boolean, idMap: IdMap): Promise<AccountWalletMnemonicPayload> {
  const result = await context.messenger.call(
    'KeyringController:withKeyringV2Unsafe',
    // The local wallet entropy ID is the keyring ID.
    { id: walletObj.metadata.entropy.id },
    async ({ keyring }) => {
      const hdKeyring = keyring as HdKeyring;
      const includeMnemonic = includeSecrets && hdKeyring.mnemonic !== null && hdKeyring.mnemonic !== undefined;

      return {
        // Compute the stable entropy source ID from the keyring's mnemonic (BIP-39 seed).
        entropySourceId: await hdKeyring.toEntropySourceId(),
        // No need to include the mnemonic here if we're not exporting secrets.
        mnemonic: includeMnemonic ? encodeMnemonic(hdKeyring.mnemonic) : undefined,
      };
    },
  );
  const { entropySourceId, mnemonic } = result as {
    entropySourceId: string;
    mnemonic?: number[];
  };

  // We use the stable entropy source ID as the payload wallet ID, rather than the local wallet ID, to
  // ensure that the exported snapshot is stable across different installations and sessions.
  const wallet: AccountWalletMnemonicPayload = {
    type: 'mnemonic',
    id: `wallet:${entropySourceId}`,
    metadata: { name: walletObj.metadata.name },
    groups: [],
  };

  idMap.add(walletObj.id, wallet.id);

  for (const groupObj of Object.values(walletObj.groups)) {
    const { groupIndex } = groupObj.metadata.entropy;

    const group: AccountWalletMnemonicGroupEntry = {
      id: `${wallet.id}/${groupIndex}`,
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

  // This should never happen, but we check just in case.
  if (includeSecrets) {
    if (mnemonic === undefined) {
      throw new Error(`Failed to export mnemonic for wallet ${wallet.id}`);
    }

    wallet.value = String(mnemonic); // FIXME: This should be a string, but the encodeMnemonic function returns a number array. We need to fix this in the keyring-sdk.
  }

  return wallet;
}

function isPrivateKeyWalletObject(wallet: AccountWalletObject): wallet is AccountWalletKeyringObject {
  return wallet.type === AccountWalletType.Keyring &&
    wallet.metadata.keyring.type === KeyringTypes.simple;
}

async function exportPrivateKeyWalletObject(context: ExportContext, walletObj: AccountWalletKeyringObject, includeSecrets: boolean, idMap: IdMap): Promise<AccountWalletPrivateKeyPayload> {
  // We use a singleton wallet ID for private keys.
  const wallet: AccountWalletPrivateKeyPayload = {
    type: 'private-key',
    id: `wallet:private-key`,
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
            throw new Error(`Keyring for account ${accountId} does not support exportAccount`);
          }

          return keyring.exportAccount(accountId, {
            type: 'private-key',
            encoding: 'hexadecimal',
          });
        },
      );

      exported = result as PrivateKeyExportedAccount;
    }

    const group: AccountWalletPrivateKeyGroupEntry = {
      id: `${wallet.id}/${address}`,
      metadata: {
        name: groupObj.metadata.name,
        pinned: groupObj.metadata.pinned,
        hidden: groupObj.metadata.hidden,
      },
    };

    if (includeSecrets) {
      if (!exported) {
        throw new Error(`Failed to export private key for account ${accountId}`);
      }
      group.value = {
        privateKey: exported.privateKey,
        encoding: exported.encoding,
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
 * - `Entropy` (BIP-44 HD) wallets → `'mnemonic'` payload entries.
 * - `Keyring` wallets with type `simple` → `'private-key'` payload entries.
 * - `Snap` wallets and hardware keyrings are skipped in v1.
 *
 * When `options.includeSecrets` is `true` **and** the vault is unlocked,
 * mnemonic phrases and private keys are included. Secret fields are silently
 * omitted when the vault is locked or a keyring cannot be accessed.
 *
 * @param context - Export context providing state and messenger access.
 * @param options - Export options.
 * @returns A promise that resolves to the built snapshot.
 */
export async function exportState(
  context: ExportContext,
  options: ExportStateOptions = {},
): Promise<AccountTreeSnapshot> {
  const state = context.getState();

  const includeSecrets = options.includeSecrets ?? false;
  const { isUnlocked } = context.messenger.call('KeyringController:getState');
  if (includeSecrets && !isUnlocked) {
    throw new Error(
      'Cannot include secrets in export when vault is locked',
    );
  }

  const idMap = new IdMap();
  const entries: AccountTreeWalletEntry[] = [];
  for (const walletObj of Object.values(state.accountTree.wallets)) {
    if (isMnemonicWalletObject(walletObj)) {
      entries.push(await exportMnemonicWalletObject(context, walletObj, includeSecrets, idMap));
    } else if (
      isPrivateKeyWalletObject(walletObj)
    ) {
      entries.push(await exportPrivateKeyWalletObject(context, walletObj, includeSecrets, idMap));
    } else {
      // AccountWalletType.Snap and hardware keyrings: skipped for now.
    }
  }

  return new AccountTreeSnapshot(entries, idMap);
}
