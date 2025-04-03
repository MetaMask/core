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
export const BTC_TESTNET_NATIVE_ASSET = `${BtcScope.Testnet}/slip44:0`;
export const BTC_SIGNET_NATIVE_ASSET = `${BtcScope.Signet}/slip44:0`;
export const SOL_NATIVE_ASSET = `${SolScope.Mainnet}/slip44:501`;
export const SOL_TESTNET_NATIVE_ASSET = `${SolScope.Testnet}/slip44:501`;
export const SOL_DEVNET_NATIVE_ASSET = `${SolScope.Devnet}/slip44:501`;

/**
 * Supported networks by the MultichainNetworkController
 */
export const AVAILABLE_MULTICHAIN_NETWORK_CONFIGURATIONS: Record<
  SupportedCaipChainId,
  MultichainNetworkConfiguration
> = {
  [BtcScope.Mainnet]: {
    chainId: BtcScope.Mainnet,
    name: 'Bitcoin',
    nativeCurrency: BTC_NATIVE_ASSET,
    isEvm: false,
  },
  [BtcScope.Testnet]: {
    chainId: BtcScope.Testnet,
    name: 'Bitcoin Testnet',
    nativeCurrency: BTC_TESTNET_NATIVE_ASSET,
    isEvm: false,
  },
  [BtcScope.Signet]: {
    chainId: BtcScope.Signet,
    name: 'Bitcoin Signet',
    nativeCurrency: BTC_SIGNET_NATIVE_ASSET,
    isEvm: false,
  },
  [SolScope.Mainnet]: {
    chainId: SolScope.Mainnet,
    name: 'Solana',
    nativeCurrency: SOL_NATIVE_ASSET,
    isEvm: false,
  },
  [SolScope.Testnet]: {
    chainId: SolScope.Testnet,
    name: 'Solana Testnet',
    nativeCurrency: SOL_TESTNET_NATIVE_ASSET,
    isEvm: false,
  },
  [SolScope.Devnet]: {
    chainId: SolScope.Devnet,
    name: 'Solana Devnet',
    nativeCurrency: SOL_DEVNET_NATIVE_ASSET,
    isEvm: false,
  },
};

/**
 * Array of all the Non-EVM chain IDs.
 * This is a temporary mention until we develop
 * a more robust solution to identify testnet networks.
 */
export const NON_EVM_TESTNET_IDS = [
  BtcScope.Testnet,
  BtcScope.Signet,
  SolScope.Testnet,
  SolScope.Devnet,
] as const;

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
export const getDefaultMultichainNetworkControllerState =
  (): MultichainNetworkControllerState => ({
    multichainNetworkConfigurationsByChainId:
      AVAILABLE_MULTICHAIN_NETWORK_CONFIGURATIONS,
    selectedMultichainNetworkChainId: SolScope.Mainnet,
    isEvmSelected: true,
  });

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
