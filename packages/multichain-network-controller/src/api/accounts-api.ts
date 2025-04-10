import { BtcScope, SolScope, EthScope } from '@metamask/keyring-api';
import { type Infer, array, object } from '@metamask/superstruct';
import { CaipAccountIdStruct } from '@metamask/utils';
import type {
  CaipAccountAddress,
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
