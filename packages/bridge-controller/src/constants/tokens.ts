import { SolScope } from '@metamask/keyring-api';

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
export const DEFAULT_SOLANA_TOKEN_ADDRESS = `${SolScope.Mainnet}/slip44:501`;

export const CURRENCY_SYMBOLS = {
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

export const ETH_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  symbol: CURRENCY_SYMBOLS.ETH,
  name: 'Ether',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
  iconUrl: '',
};

export const BNB_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  symbol: CURRENCY_SYMBOLS.BNB,
  name: 'Binance Coin',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
  iconUrl: '',
} as const;

export const MATIC_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  symbol: CURRENCY_SYMBOLS.POL,
  name: 'Polygon',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
  iconUrl: '',
} as const;

export const AVAX_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  symbol: CURRENCY_SYMBOLS.AVALANCHE,
  name: 'Avalanche',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
  iconUrl: '',
} as const;

export const TEST_ETH_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  symbol: CURRENCY_SYMBOLS.TEST_ETH,
  name: 'Test Ether',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
  iconUrl: '',
} as const;

export const GOERLI_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  symbol: CURRENCY_SYMBOLS.ETH,
  name: 'Ether',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
  iconUrl: '',
} as const;

export const SEPOLIA_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  symbol: CURRENCY_SYMBOLS.ETH,
  name: 'Ether',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
  iconUrl: '',
} as const;

export const ARBITRUM_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  ...ETH_SWAPS_TOKEN_OBJECT,
} as const;

export const OPTIMISM_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  ...ETH_SWAPS_TOKEN_OBJECT,
} as const;

export const ZKSYNC_ERA_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  ...ETH_SWAPS_TOKEN_OBJECT,
} as const;

export const LINEA_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  ...ETH_SWAPS_TOKEN_OBJECT,
} as const;

export const BASE_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  ...ETH_SWAPS_TOKEN_OBJECT,
} as const;

const SOLANA_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  symbol: CURRENCY_SYMBOLS.SOL,
  name: 'Solana',
  address: DEFAULT_SOLANA_TOKEN_ADDRESS,
  decimals: 9,
  iconUrl: '',
};

const SWAPS_TESTNET_CHAIN_ID = '0x539';

export const SWAPS_CHAINID_DEFAULT_TOKEN_MAP = {
  [CHAIN_IDS.MAINNET]: ETH_SWAPS_TOKEN_OBJECT,
  [SWAPS_TESTNET_CHAIN_ID]: TEST_ETH_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.BSC]: BNB_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.POLYGON]: MATIC_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.GOERLI]: GOERLI_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.SEPOLIA]: GOERLI_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.AVALANCHE]: AVAX_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.OPTIMISM]: OPTIMISM_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.ARBITRUM]: ARBITRUM_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.ZKSYNC_ERA]: ZKSYNC_ERA_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.LINEA_MAINNET]: LINEA_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.BASE]: BASE_SWAPS_TOKEN_OBJECT,
  [SolScope.Mainnet]: SOLANA_SWAPS_TOKEN_OBJECT,
} as const;
