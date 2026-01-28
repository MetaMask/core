import { AddressZero } from '@ethersproject/constants';
import { BtcScope, SolScope, TrxScope } from '@metamask/keyring-api';
import type { Hex } from '@metamask/utils';

import { CHAIN_IDS } from './chains';
import type {
  BridgeControllerState,
  FeatureFlagsPlatformConfig,
} from '../types';

export const ALLOWED_BRIDGE_CHAIN_IDS = [
  CHAIN_IDS.MAINNET,
  CHAIN_IDS.BSC,
  CHAIN_IDS.POLYGON,
  CHAIN_IDS.ZKSYNC_ERA,
  CHAIN_IDS.AVALANCHE,
  CHAIN_IDS.OPTIMISM,
  CHAIN_IDS.ARBITRUM,
  CHAIN_IDS.LINEA_MAINNET,
  CHAIN_IDS.BASE,
  CHAIN_IDS.SEI,
  CHAIN_IDS.MONAD,
  CHAIN_IDS.HYPEREVM,
  CHAIN_IDS.MEGAETH,
  SolScope.Mainnet,
  BtcScope.Mainnet,
  TrxScope.Mainnet,
] as const;

export type AllowedBridgeChainIds = (typeof ALLOWED_BRIDGE_CHAIN_IDS)[number];

export const BRIDGE_DEV_API_BASE_URL = 'https://bridge.dev-api.cx.metamask.io';
export const BRIDGE_PROD_API_BASE_URL = 'https://bridge.api.cx.metamask.io';

export enum BridgeClientId {
  EXTENSION = 'extension',
  MOBILE = 'mobile',
}

export const ETH_USDT_ADDRESS = '0xdac17f958d2ee523a2206206994597c13d831ec7';
export const METABRIDGE_ETHEREUM_ADDRESS =
  '0x0439e60F02a8900a951603950d8D4527f400C3f1';
export const BRIDGE_QUOTE_MAX_ETA_SECONDS = 60 * 60; // 1 hour
export const BRIDGE_QUOTE_MAX_RETURN_DIFFERENCE_PERCENTAGE = 0.5; // if a quote returns in x times less return than the best quote, ignore it

export const BRIDGE_PREFERRED_GAS_ESTIMATE = 'medium';
export const BRIDGE_MM_FEE_RATE = 0.875;
export const REFRESH_INTERVAL_MS = 30 * 1000;
export const DEFAULT_MAX_REFRESH_COUNT = 5;

export const BRIDGE_CONTROLLER_NAME = 'BridgeController';

export const DEFAULT_CHAIN_RANKING = [
  { chainId: 'eip155:1', name: 'Ethereum' },
  { chainId: 'eip155:56', name: 'BNB' },
  { chainId: 'bip122:000000000019d6689c085ae165831e93', name: 'BTC' },
  { chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', name: 'Solana' },
  { chainId: 'tron:728126428', name: 'Tron' },
  { chainId: 'eip155:8453', name: 'Base' },
  { chainId: 'eip155:42161', name: 'Arbitrum' },
  { chainId: 'eip155:59144', name: 'Linea' },
  { chainId: 'eip155:137', name: 'Polygon' },
  { chainId: 'eip155:43114', name: 'Avalanche' },
  { chainId: 'eip155:10', name: 'Optimism' },
  { chainId: 'eip155:143', name: 'Monad' },
  { chainId: 'eip155:1329', name: 'Sei' },
  { chainId: 'eip155:999', name: 'HyperEVM' },
  { chainId: 'eip155:4326', name: 'MegaETH' },
  { chainId: 'eip155:324', name: 'zkSync' },
] as const;

export const DEFAULT_FEATURE_FLAG_CONFIG: FeatureFlagsPlatformConfig = {
  minimumVersion: '0.0.0',
  refreshRate: REFRESH_INTERVAL_MS,
  maxRefreshCount: DEFAULT_MAX_REFRESH_COUNT,
  support: false,
  chains: {},
  chainRanking: [...DEFAULT_CHAIN_RANKING],
};

export const DEFAULT_BRIDGE_CONTROLLER_STATE: BridgeControllerState = {
  quoteRequest: {
    srcTokenAddress: AddressZero,
  },
  quotesInitialLoadTime: null,
  quotes: [],
  quotesLastFetched: null,
  quotesLoadingStatus: null,
  quoteFetchError: null,
  quotesRefreshCount: 0,
  assetExchangeRates: {},
};

export const METABRIDGE_CHAIN_TO_ADDRESS_MAP: Record<Hex, string> = {
  [CHAIN_IDS.MAINNET]: METABRIDGE_ETHEREUM_ADDRESS,
};
