import { type StateMetadata } from '@metamask/base-controller';
import {
  type CaipChainId,
  BtcScope,
  SolScope,
  TrxScope,
} from '@metamask/keyring-api';
import { NetworkStatus } from '@metamask/network-controller';

import type {
  MultichainNetworkConfiguration,
  MultichainNetworkControllerState,
  MultichainNetworkMetadata,
  SupportedCaipChainId,
} from './types';

export const BTC_NATIVE_ASSET = `${BtcScope.Mainnet}/slip44:0`;
export const BTC_TESTNET_NATIVE_ASSET = `${BtcScope.Testnet}/slip44:0`;
export const BTC_TESTNET4_NATIVE_ASSET = `${BtcScope.Testnet4}/slip44:0`;
export const BTC_SIGNET_NATIVE_ASSET = `${BtcScope.Signet}/slip44:0`;
export const BTC_REGTEST_NATIVE_ASSET = `${BtcScope.Regtest}/slip44:0`;
export const SOL_NATIVE_ASSET = `${SolScope.Mainnet}/slip44:501`;
export const SOL_TESTNET_NATIVE_ASSET = `${SolScope.Testnet}/slip44:501`;
export const SOL_DEVNET_NATIVE_ASSET = `${SolScope.Devnet}/slip44:501`;
export const TRX_NATIVE_ASSET = `${TrxScope.Mainnet}/slip44:195`;
export const TRX_NILE_NATIVE_ASSET = `${TrxScope.Nile}/slip44:195`;
export const TRX_SHASTA_NATIVE_ASSET = `${TrxScope.Shasta}/slip44:195`;

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
  [BtcScope.Testnet4]: {
    chainId: BtcScope.Testnet4,
    name: 'Bitcoin Testnet4',
    nativeCurrency: BTC_TESTNET4_NATIVE_ASSET,
    isEvm: false,
  },
  [BtcScope.Signet]: {
    chainId: BtcScope.Signet,
    name: 'Bitcoin Mutinynet',
    nativeCurrency: BTC_SIGNET_NATIVE_ASSET,
    isEvm: false,
  },
  [BtcScope.Regtest]: {
    chainId: BtcScope.Regtest,
    name: 'Bitcoin Regtest',
    nativeCurrency: BTC_REGTEST_NATIVE_ASSET,
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
  [TrxScope.Mainnet]: {
    chainId: TrxScope.Mainnet,
    name: 'Tron',
    nativeCurrency: TRX_NATIVE_ASSET,
    isEvm: false,
  },
  [TrxScope.Nile]: {
    chainId: TrxScope.Nile,
    name: 'Tron Nile',
    nativeCurrency: TRX_NILE_NATIVE_ASSET,
    isEvm: false,
  },
  [TrxScope.Shasta]: {
    chainId: TrxScope.Shasta,
    name: 'Tron Shasta',
    nativeCurrency: TRX_SHASTA_NATIVE_ASSET,
    isEvm: false,
  },
};

/**
 * Array of all the Non-EVM chain IDs.
 * This is a temporary mention until we develop
 * a more robust solution to identify testnet networks.
 */
export const NON_EVM_TESTNET_IDS: CaipChainId[] = [
  BtcScope.Testnet,
  BtcScope.Testnet4,
  BtcScope.Signet,
  BtcScope.Regtest,
  SolScope.Testnet,
  SolScope.Devnet,
];

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
    networksWithTransactionActivity: {},
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
  networksWithTransactionActivity: { persist: true, anonymous: true },
} satisfies StateMetadata<MultichainNetworkControllerState>;

/**
 * Multichain network ticker for the supported networks.
 * TODO: This should be part of the assets-controllers or the snap itself.
 */
export const MULTICHAIN_NETWORK_TICKER: Record<CaipChainId, string> = {
  [BtcScope.Mainnet]: 'BTC',
  [BtcScope.Testnet]: 'tBTC',
  [BtcScope.Testnet4]: 'tBTC',
  [BtcScope.Signet]: 'sBTC',
  [BtcScope.Regtest]: 'rBTC',
  [SolScope.Mainnet]: 'SOL',
  [SolScope.Testnet]: 'tSOL',
  [SolScope.Devnet]: 'dSOL',
  [TrxScope.Mainnet]: 'TRX',
  [TrxScope.Nile]: 'tTRX',
  [TrxScope.Shasta]: 'sTRX',
} as const;

/**
 * Multichain network asset decimals for the supported networks.
 * TODO: This should be part of the assets-controllers or the snap itself.
 */
export const MULTICHAIN_NETWORK_DECIMAL_PLACES: Record<CaipChainId, number> = {
  [BtcScope.Mainnet]: 8,
  [BtcScope.Testnet]: 8,
  [BtcScope.Testnet4]: 8,
  [BtcScope.Signet]: 8,
  [BtcScope.Regtest]: 8,
  [SolScope.Mainnet]: 5,
  [SolScope.Testnet]: 5,
  [SolScope.Devnet]: 5,
  [TrxScope.Mainnet]: 6,
  [TrxScope.Nile]: 6,
  [TrxScope.Shasta]: 6,
} as const;
