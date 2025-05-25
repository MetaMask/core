import { SolScope } from '@metamask/keyring-api';

import type { AllowedBridgeChainIds } from './bridge';
import { CHAIN_IDS } from './chains';

export type SwapsTokenObject = {
  /**
   * The symbol of token object
   */
  symbol: string;
  /**
   * The name for the network
   */
  name: string;
  /**
   * An address that the metaswap-api recognizes as the default token
   */
  address: string;
  /**
   * Number of digits after decimal point
   */
  decimals: number;
  /**
   * URL for token icon
   */
  iconUrl: string;
};

const DEFAULT_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

const CURRENCY_SYMBOLS = {
  ARBITRUM: 'ETH',
  AVALANCHE: 'AVAX',
  BNB: 'BNB',
  BUSD: 'BUSD',
  CELO: 'CELO',
  DAI: 'DAI',
  GNOSIS: 'XDAI',
  ETH: 'ETH',
  FANTOM: 'FTM',
  HARMONY: 'ONE',
  PALM: 'PALM',
  MATIC: 'MATIC',
  POL: 'POL',
  TEST_ETH: 'TESTETH',
  USDC: 'USDC',
  USDT: 'USDT',
  WETH: 'WETH',
  OPTIMISM: 'ETH',
  CRONOS: 'CRO',
  GLIMMER: 'GLMR',
  MOONRIVER: 'MOVR',
  ONE: 'ONE',
  SOL: 'SOL',
} as const;

const ETH_SWAPS_TOKEN_OBJECT = {
  symbol: CURRENCY_SYMBOLS.ETH,
  name: 'Ether',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
  iconUrl: '',
};

const BNB_SWAPS_TOKEN_OBJECT = {
  symbol: CURRENCY_SYMBOLS.BNB,
  name: 'Binance Coin',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
  iconUrl: '',
} as const;

const MATIC_SWAPS_TOKEN_OBJECT = {
  symbol: CURRENCY_SYMBOLS.POL,
  name: 'Polygon',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
  iconUrl: '',
} as const;

const AVAX_SWAPS_TOKEN_OBJECT = {
  symbol: CURRENCY_SYMBOLS.AVALANCHE,
  name: 'Avalanche',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
  iconUrl: '',
} as const;

const TEST_ETH_SWAPS_TOKEN_OBJECT = {
  symbol: CURRENCY_SYMBOLS.TEST_ETH,
  name: 'Test Ether',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
  iconUrl: '',
} as const;

const GOERLI_SWAPS_TOKEN_OBJECT = {
  symbol: CURRENCY_SYMBOLS.ETH,
  name: 'Ether',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
  iconUrl: '',
} as const;

const SEPOLIA_SWAPS_TOKEN_OBJECT = {
  symbol: CURRENCY_SYMBOLS.ETH,
  name: 'Ether',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
  iconUrl: '',
} as const;

const ARBITRUM_SWAPS_TOKEN_OBJECT = {
  ...ETH_SWAPS_TOKEN_OBJECT,
} as const;

const OPTIMISM_SWAPS_TOKEN_OBJECT = {
  ...ETH_SWAPS_TOKEN_OBJECT,
} as const;

const ZKSYNC_ERA_SWAPS_TOKEN_OBJECT = {
  ...ETH_SWAPS_TOKEN_OBJECT,
} as const;

const LINEA_SWAPS_TOKEN_OBJECT = {
  ...ETH_SWAPS_TOKEN_OBJECT,
} as const;

const BASE_SWAPS_TOKEN_OBJECT = {
  ...ETH_SWAPS_TOKEN_OBJECT,
} as const;

const SOLANA_SWAPS_TOKEN_OBJECT = {
  symbol: CURRENCY_SYMBOLS.SOL,
  name: 'Solana',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 9,
  iconUrl: '',
} as const;

const SWAPS_TESTNET_CHAIN_ID = '0x539';

export const SWAPS_CHAINID_DEFAULT_TOKEN_MAP = {
  [CHAIN_IDS.MAINNET]: ETH_SWAPS_TOKEN_OBJECT,
  [SWAPS_TESTNET_CHAIN_ID]: TEST_ETH_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.BSC]: BNB_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.POLYGON]: MATIC_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.GOERLI]: GOERLI_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.SEPOLIA]: SEPOLIA_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.AVALANCHE]: AVAX_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.OPTIMISM]: OPTIMISM_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.ARBITRUM]: ARBITRUM_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.ZKSYNC_ERA]: ZKSYNC_ERA_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.LINEA_MAINNET]: LINEA_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.BASE]: BASE_SWAPS_TOKEN_OBJECT,
  [SolScope.Mainnet]: SOLANA_SWAPS_TOKEN_OBJECT,
} as const;

export type SupportedSwapsNativeCurrencySymbols =
  (typeof SWAPS_CHAINID_DEFAULT_TOKEN_MAP)[
    | AllowedBridgeChainIds
    | typeof SWAPS_TESTNET_CHAIN_ID]['symbol'];

/**
 * A map of native currency symbols to their SLIP-44 representation
 * From {@link https://github.com/satoshilabs/slips/blob/master/slip-0044.md}
 */
export const SYMBOL_TO_SLIP44_MAP: Record<
  SupportedSwapsNativeCurrencySymbols,
  `${string}:${string}`
> = {
  SOL: 'slip44:501',
  ETH: 'slip44:60',
  POL: 'slip44:966',
  BNB: 'slip44:714',
  AVAX: 'slip44:9000',
  TESTETH: 'slip44:60',
};
