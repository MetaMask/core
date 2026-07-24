import { AccountWalletType } from '@metamask/account-api';
import { KeyringTypes } from '@metamask/keyring-controller';

import type {
  AccountTreeControllerMessenger,
  AccountTreeControllerState,
} from '../types.js';
import type {
  AccountGroupPayloadId,
  AccountWalletMnemonicGroupEntry,
  AccountWalletMnemonicPayload,
  AccountWalletPayloadId,
  AccountWalletPrivateKeyGroupEntry,
  AccountWalletPrivateKeyPayload,
  ExportStateOptions,
} from './payload.js';
import { AccountTreeSnapshot } from './snapshot.js';

export type ExportContext = {
  getState: () => AccountTreeControllerState;
  messenger: AccountTreeControllerMessenger;
};

// Minimal structural interface — avoids adding @metamask/eth-hd-keyring as a dep.
type HdKeyringLike = {
  mnemonic: Uint8Array | null | undefined;
};

// Minimal structural interface for keyring v2 exportAccount.
type KeyringWithExport = {
  exportAccount(
    accountId: string,
    options: { type: string; encoding: string },
  ): Promise<{ privateKey: string; encoding: string }>;
};

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
  const { includeSecrets = false } = options;
  const state = context.getState();

  const { isUnlocked } = context.messenger.call('KeyringController:getState');
  const shouldIncludeSecrets = includeSecrets && isUnlocked;

  const localToPayload = new Map<string, string>();
  const payloadToLocal = new Map<string, string>();

  function trackIds(localId: string, payloadId: string): void {
    localToPayload.set(localId, payloadId);
    payloadToLocal.set(payloadId, localId);
  }

  const entries: Array<AccountWalletMnemonicPayload | AccountWalletPrivateKeyPayload> =
    [];

  // Singleton private-key payload wallet — all simple-keyring groups are merged here.
  let privateKeyWallet: AccountWalletPrivateKeyPayload | undefined;

  for (const wallet of Object.values(state.accountTree.wallets)) {
    if (wallet.type === AccountWalletType.Entropy) {
      const entropySourceId = wallet.metadata.entropy.id;
      const walletPayloadId: AccountWalletPayloadId = `wallet:${entropySourceId}`;

      trackIds(wallet.id, walletPayloadId);

      const groups: AccountWalletMnemonicGroupEntry[] = [];
      for (const group of Object.values(wallet.groups)) {
        const { groupIndex } = group.metadata.entropy;
        const groupPayloadId: AccountGroupPayloadId = `${walletPayloadId}/${groupIndex}`;

        trackIds(group.id, groupPayloadId);

        const groupMeta = state.accountGroupsMetadata[group.id];
        groups.push({
          id: groupPayloadId,
          groupIndex,
          metadata: {
            name: groupMeta?.name?.value ?? group.metadata.name,
            pinned: groupMeta?.pinned?.value ?? group.metadata.pinned,
            hidden: groupMeta?.hidden?.value ?? group.metadata.hidden,
          },
        });
      }

      const walletMeta = state.accountWalletsMetadata[wallet.id];
      let mnemonicValue: string | undefined;

      if (shouldIncludeSecrets) {
        try {
          const mnemonicBytes = await context.messenger.call(
            'KeyringController:withKeyringV2Unsafe',
            { id: entropySourceId },
            async ({ keyring }: { keyring: unknown }) => {
              const hd = keyring as HdKeyringLike;
              return hd.mnemonic ?? undefined;
            },
          );
          if (mnemonicBytes) {
            mnemonicValue = new TextDecoder().decode(mnemonicBytes);
          }
        } catch {
          // Vault locked or keyring not found — omit secret.
        }
      }

      entries.push({
        id: walletPayloadId,
        type: 'mnemonic',
        ...(mnemonicValue !== undefined && { value: mnemonicValue }),
        metadata: { name: walletMeta?.name?.value ?? wallet.metadata.name },
        groups,
      });
    } else if (
      wallet.type === AccountWalletType.Keyring &&
      wallet.metadata.keyring.type === KeyringTypes.simple
    ) {
      const walletPayloadId: AccountWalletPayloadId = 'wallet:private-key';

      if (!privateKeyWallet) {
        const walletMeta = state.accountWalletsMetadata[wallet.id];
        privateKeyWallet = {
          id: walletPayloadId,
          type: 'private-key',
          metadata: { name: walletMeta?.name?.value ?? wallet.metadata.name },
          groups: [],
        };
        entries.push(privateKeyWallet);
      }

      // Track this local wallet ID → singleton payload wallet ID (first wallet wins for reverse).
      if (!localToPayload.has(wallet.id)) {
        trackIds(wallet.id, walletPayloadId);
      }

      for (const group of Object.values(wallet.groups)) {
        const accountId = group.accounts[0];
        const account = context.messenger.call(
          'AccountsController:getAccount',
          accountId,
        );
        if (!account) {
          continue;
        }

        const { address } = account;
        const groupPayloadId: AccountGroupPayloadId = `wallet:private-key/${address}`;

        trackIds(group.id, groupPayloadId);

        const groupMeta = state.accountGroupsMetadata[group.id];
        let privateKeyValue: AccountWalletPrivateKeyGroupEntry['value'];

        if (shouldIncludeSecrets) {
          try {
            const exported = await context.messenger.call(
              'KeyringController:withKeyringV2',
              { address },
              async ({ keyring }: { keyring: unknown }) => {
                const k = keyring as KeyringWithExport;
                return k.exportAccount(accountId, {
                  type: 'private-key',
                  encoding: 'hexadecimal',
                });
              },
            );
            privateKeyValue = {
              privateKey: exported.privateKey,
              encoding: exported.encoding as 'hexadecimal' | 'base58' | 'base32',
            };
          } catch {
            // Key not accessible — omit secret.
          }
        }

        privateKeyWallet.groups.push({
          id: groupPayloadId,
          ...(privateKeyValue !== undefined && { value: privateKeyValue }),
          metadata: {
            name: groupMeta?.name?.value ?? group.metadata.name,
            pinned: groupMeta?.pinned?.value ?? group.metadata.pinned,
            hidden: groupMeta?.hidden?.value ?? group.metadata.hidden,
          },
        });
      }
    }
    // AccountWalletType.Snap and hardware keyrings: skipped in v1.
  }

  return new AccountTreeSnapshot(entries, { localToPayload, payloadToLocal });
}
