import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { KeyringClient } from '@metamask/keyring-snap-client';
import { KeyringClient as KeyringClientV2 } from '@metamask/keyring-snap-client/v2';
import type { CaipChainId } from '@metamask/utils';

/**
 * Transport used by both the v1 and v2 keyring clients. Matches the object the
 * {@link KeyringClient} constructor expects.
 */
export type Sender = ConstructorParameters<typeof KeyringClient>[0];

type DiscoveredAccount = Awaited<
  ReturnType<KeyringClient['discoverAccounts']>
>[number];

/**
 * Thin abstraction over the v1 and v2 keyring RPC clients so that provider call
 * sites (account re-sync and v1 discovery) don't have to branch on the keyring
 * protocol version. The v1 and v2 clients expose different method names (e.g.
 * v1 `listAccounts` vs v2 `getAccounts`), and v2 has no `discoverAccounts` — v2
 * discovery flows through `createAccounts({ bip44:discover })` on the bridge
 * keyring instead.
 */
export type SnapKeyringClient = {
  /**
   * Returns the accounts the Snap currently holds.
   */
  getAccounts(): Promise<KeyringAccount[]>;

  /**
   * Deletes an account by id from the Snap.
   *
   * @param id - The id of the account to delete.
   */
  deleteAccount(id: string): Promise<void>;

  /**
   * Discovers accounts for the given entropy source and group index.
   *
   * Only supported on the v1 client; the v2 client throws, since v2 discovery
   * goes through `createAccounts({ bip44:discover })`.
   *
   * @param scopes - The scopes to discover accounts on.
   * @param entropySource - The entropy source to discover accounts for.
   * @param groupIndex - The group index to discover accounts for.
   */
  discoverAccounts(
    scopes: CaipChainId[],
    entropySource: EntropySourceId,
    groupIndex: number,
  ): Promise<DiscoveredAccount[]>;
};

/**
 * Builds a version-agnostic {@link SnapKeyringClient} backed by either the v1
 * or v2 keyring client, based on the Snap's declared capabilities.
 *
 * @param sender - The transport used to talk to the Snap.
 * @param isV2 - Whether to back the client with the v2 keyring client.
 * @returns A {@link SnapKeyringClient}.
 */
export function createSnapKeyringClient(
  sender: Sender,
  isV2: boolean,
): SnapKeyringClient {
  if (isV2) {
    const client = new KeyringClientV2(sender);
    return {
      getAccounts: async () => client.getAccounts(),
      deleteAccount: async (id) => client.deleteAccount(id),
      discoverAccounts: async (): Promise<DiscoveredAccount[]> => {
        // v2 discovery is driven by `createAccounts({ bip44:discover })` through
        // the bridge keyring, so the client is never used for discovery here.
        throw new Error(
          'discoverAccounts is not supported on the v2 keyring client',
        );
      },
    };
  }

  const client = new KeyringClient(sender);
  return {
    getAccounts: async () => client.listAccounts(),
    deleteAccount: async (id) => client.deleteAccount(id),
    discoverAccounts: async (scopes, entropySource, groupIndex) =>
      client.discoverAccounts(scopes, entropySource, groupIndex),
  };
}
