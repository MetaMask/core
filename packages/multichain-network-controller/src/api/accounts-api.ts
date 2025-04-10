import { BtcScope, SolScope, EthScope } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { type Infer, array, object } from '@metamask/superstruct';
import { CaipAccountIdStruct, parseCaipAccountId } from '@metamask/utils';
import type {
  CaipAccountAddress,
  CaipAccountId,
  CaipNamespace,
  CaipReference,
} from '@metamask/utils';

export const ActiveNetworksResponseStruct = object({
  activeNetworks: array(CaipAccountIdStruct),
});

export type ActiveNetworksResponse = Infer<typeof ActiveNetworksResponseStruct>;

/**
 * The active networks for the currently selected account.
 */
export type ActiveNetworksByAddress = Record<
  CaipAccountAddress,
  {
    // CAIP-2 namespace of the network.
    namespace: CaipNamespace;
    // Active chain IDs (CAIP-2 references) on that network (primarily used for EVM networks).
    activeChains: CaipReference[];
  }
>;

/**
 * The domain for multichain accounts API.
 */
export const MULTICHAIN_ACCOUNTS_BASE_URL =
  'https://accounts.api.cx.metamask.io';

/**
 * The client header for the multichain accounts API.
 */
export const MULTICHAIN_ACCOUNTS_CLIENT_HEADER = 'x-metamask-clientproduct';

/**
 * The client ID for the multichain accounts API.
 */
export const MULTICHAIN_ACCOUNTS_CLIENT_ID =
  'metamask-multichain-network-controller';

/**
 * The allowed active network scopes for the multichain network controller.
 */
export const MULTICHAIN_ALLOWED_ACTIVE_NETWORK_SCOPES = [
  String(BtcScope.Mainnet),
  String(SolScope.Mainnet),
  String(EthScope.Mainnet),
  String(EthScope.Testnet),
  String(EthScope.Eoa),
];

/**
 * Converts an internal account to an array of CAIP-10 account IDs.
 *
 * @param account - The internal account to convert
 * @returns The CAIP-10 account IDs
 */
export function toAllowedCaipAccountIds(
  account: InternalAccount,
): CaipAccountId[] {
  const formattedAccounts: CaipAccountId[] = [];
  for (const scope of account.scopes) {
    if (MULTICHAIN_ALLOWED_ACTIVE_NETWORK_SCOPES.includes(scope)) {
      formattedAccounts.push(`${scope}:${account.address}`);
    }
  }

  return formattedAccounts;
}

/**
 * Formats the API response into our state structure.
 * Example input: ["eip155:1:0x123...", "eip155:137:0x123...", "solana:1:0xabc..."]
 *
 * @param response - The raw API response
 * @returns Formatted networks by address
 */
export function toActiveNetworksByAddress(
  response: ActiveNetworksResponse,
): ActiveNetworksByAddress {
  const networksByAddress: ActiveNetworksByAddress = {};

  response.activeNetworks.forEach((network) => {
    const {
      address,
      chain: { namespace, reference },
    } = parseCaipAccountId(network);

    if (!networksByAddress[address]) {
      networksByAddress[address] = {
        namespace,
        activeChains: [],
      };
    }
    networksByAddress[address].activeChains.push(reference);
  });

  return networksByAddress;
}

/**
 * Constructs the URL for the active networks API endpoint.
 *
 * @param accountIds - Array of account IDs
 * @returns URL object for the API endpoint
 */
export function buildActiveNetworksUrl(accountIds: CaipAccountId[]): URL {
  const url = new URL(`${MULTICHAIN_ACCOUNTS_BASE_URL}/v2/activeNetworks`);
  url.searchParams.append('accountIds', accountIds.join(','));
  return url;
}
