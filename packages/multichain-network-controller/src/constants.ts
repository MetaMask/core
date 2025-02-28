import { type StateMetadata } from '@metamask/base-controller';
import { type CaipChainId, BtcScope, SolScope } from '@metamask/keyring-api';
import { NetworkStatus } from '@metamask/network-controller';

import type {
  MultichainNetworkConfiguration,
  MultichainNetworkControllerState,
  MultichainNetworkMetadata,
  SupportedCaipChainId,
} from './types';

export const BTC_NATIVE_ASSET = `${BtcScope.Mainnet}/slip44:0`;
export const BTC_TESTNET_NATIVE_ASSET = `${BtcScope.Testnet}/slip44:0`;
export const SOL_NATIVE_ASSET = `${SolScope.Mainnet}/slip44:501`;
export const SOL_TESTNET_NATIVE_ASSET = `${SolScope.Testnet}/slip44:501`;
export const SOL_DEVNET_NATIVE_ASSET = `${SolScope.Devnet}/slip44:501`;

export const MULTICHAIN_NETWORK_IDS: CaipChainId[] = [
  BtcScope.Mainnet,
  BtcScope.Testnet,
  SolScope.Mainnet,
  SolScope.Testnet,
  SolScope.Devnet,
] as const;

/**
 * Supported networks by the MultichainNetworkController
 */
export const AVAILABLE_MULTICHAIN_NETWORK_CONFIGURATIONS: Partial<
  Record<SupportedCaipChainId, MultichainNetworkConfiguration>
> = {
  [BtcScope.Mainnet]: {
    chainId: BtcScope.Mainnet,
    name: 'Bitcoin Mainnet',
    nativeCurrency: BTC_NATIVE_ASSET,
    isEvm: false,
  },
  [SolScope.Mainnet]: {
    chainId: SolScope.Mainnet,
    name: 'Solana Mainnet',
    nativeCurrency: SOL_NATIVE_ASSET,
    isEvm: false,
  },
};

/**
 * Supported networks by the MultichainNetworkController
 */
export const AVAILABLE_MULTICHAIN_TESTNET_NETWORK_CONFIGURATIONS: Partial<
  Record<SupportedCaipChainId, MultichainNetworkConfiguration>
> = {
  [BtcScope.Testnet]: {
    chainId: BtcScope.Testnet,
    name: 'Bitcoin Testnet',
    nativeCurrency: BTC_TESTNET_NATIVE_ASSET,
    isEvm: false,
  },
  [SolScope.Testnet]: {
    chainId: SolScope.Testnet,
    name: 'Solana Mainnet',
    nativeCurrency: SOL_TESTNET_NATIVE_ASSET,
    isEvm: false,
  },
  [SolScope.Devnet]: {
    chainId: SolScope.Devnet,
    name: 'Solana Mainnet',
    nativeCurrency: SOL_DEVNET_NATIVE_ASSET,
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
 * @param enableTestnets - Whether to enable testnets or not.
 * @returns The default state of the {@link MultichainNetworkController}.
 */
export const getDefaultMultichainNetworkControllerState = (
  enableTestnets: boolean = false,
): MultichainNetworkControllerState => {
  return {
    multichainNetworkConfigurationsByChainId: enableTestnets
      ? {
          ...AVAILABLE_MULTICHAIN_NETWORK_CONFIGURATIONS,
          ...AVAILABLE_MULTICHAIN_TESTNET_NETWORK_CONFIGURATIONS,
        }
      : AVAILABLE_MULTICHAIN_NETWORK_CONFIGURATIONS,
    selectedMultichainNetworkChainId: SolScope.Mainnet,
    isEvmSelected: true,
  };
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
