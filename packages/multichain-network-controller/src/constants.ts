import { type StateMetadata } from '@metamask/base-controller';
import { BtcScope, SolScope } from '@metamask/keyring-api';
import { NetworkStatus } from '@metamask/network-controller';

import type {
  MultichainNetworkConfiguration,
  MultichainNetworkControllerState,
  MultichainNetworkMetadata,
  SupportedCaipChainId,
} from './types';

export const BTC_NATIVE_ASSET = `${BtcScope.Mainnet}/slip44:0`;
export const SOL_NATIVE_ASSET = `${SolScope.Mainnet}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`;

/**
 * Supported networks by the MultichainNetworkController
 */
export const AVAILABLE_MULTICHAIN_NETWORK_CONFIGURATIONS: Record<
  SupportedCaipChainId,
  MultichainNetworkConfiguration
> = {
  [BtcScope.Mainnet]: {
    chainId: BtcScope.Mainnet,
    name: 'Bitcoin Mainnet',
    blockExplorerUrls: ['https://blockstream.info'],
    defaultBlockExplorerUrlIndex: 0,
    nativeCurrency: BTC_NATIVE_ASSET,
    isEvm: false,
  },
  [SolScope.Mainnet]: {
    chainId: SolScope.Mainnet,
    name: 'Solana Mainnet',
    blockExplorerUrls: ['https://explorer.solana.com'],
    defaultBlockExplorerUrlIndex: 0,
    nativeCurrency: SOL_NATIVE_ASSET,
    isEvm: false,
  },
};

/**
 * Metadata for the supported networks.
 */
export const NETWORKS_METADATA: Record<string, MultichainNetworkMetadata> = {
  [BtcScope.Mainnet]: {
    features: [],
    status: NetworkStatus.Available,
  },
  [SolScope.Mainnet]: {
    features: [],
    status: NetworkStatus.Available,
  },
};

/**
 * Default state of the {@link MultichainNetworkController}.
 *
 * @returns The default state of the {@link MultichainNetworkController}.
 */
export const DEFAULT_MULTICHAIN_NETWORK_CONTROLLER_STATE: MultichainNetworkControllerState =
  {
    multichainNetworkConfigurationsByChainId:
      AVAILABLE_MULTICHAIN_NETWORK_CONFIGURATIONS,
    selectedMultichainNetworkChainId: SolScope.Mainnet,
    isEvmSelected: true,
  };

/**
 * {@link MultichainNetworkController}'s metadata.
 *
 * This allows us to choose if fields of the state should be persisted or not
 * using the `persist` flag; and if they can be sent to Sentry or not, using
 * the `anonymous` flag.
 */
export const MULTICHAIN_NETWORK_CONTROLLER_METADATA = {
  multichainNetworkConfigurationsByChainId: { persist: true, anonymous: true },
  selectedMultichainNetworkChainId: { persist: true, anonymous: true },
  isEvmSelected: { persist: true, anonymous: true },
} satisfies StateMetadata<MultichainNetworkControllerState>;
