import { AddressZero } from '@ethersproject/constants';
import { SolScope } from '@metamask/keyring-api';
import type { Hex } from '@metamask/utils';

import { CHAIN_IDS } from './chains';
import type { BridgeControllerState } from '../types';

// TODO read from feature flags
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
  SolScope.Mainnet,
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

export const BRIDGE_PREFERRED_GAS_ESTIMATE = 'high';
export const BRIDGE_DEFAULT_SLIPPAGE = 0.5;
export const BRIDGE_MM_FEE_RATE = 0.875;
export const REFRESH_INTERVAL_MS = 30 * 1000;
export const DEFAULT_MAX_REFRESH_COUNT = 5;

export const BRIDGE_CONTROLLER_NAME = 'BridgeController';

export const DEFAULT_FEATURE_FLAG_CONFIG = {
  refreshRate: REFRESH_INTERVAL_MS,
  maxRefreshCount: DEFAULT_MAX_REFRESH_COUNT,
  support: false,
  chains: {},
};

export const DEFAULT_BRIDGE_CONTROLLER_STATE: BridgeControllerState = {
  bridgeFeatureFlags: DEFAULT_FEATURE_FLAG_CONFIG,
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
