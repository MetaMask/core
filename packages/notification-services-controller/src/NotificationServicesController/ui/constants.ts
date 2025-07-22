import {
  NOTIFICATION_CHAINS_ID,
  type NOTIFICATION_CHAINS_IDS,
} from '../constants/notification-schema';

export const NOTIFICATION_NETWORK_CURRENCY_NAME = {
  [NOTIFICATION_CHAINS_ID.ETHEREUM]: 'Ethereum',
  [NOTIFICATION_CHAINS_ID.ARBITRUM]: 'Arbitrum',
  [NOTIFICATION_CHAINS_ID.AVALANCHE]: 'Avalanche',
  [NOTIFICATION_CHAINS_ID.BSC]: 'Binance',
  [NOTIFICATION_CHAINS_ID.BASE]: 'Base',
  [NOTIFICATION_CHAINS_ID.LINEA]: 'Linea',
  [NOTIFICATION_CHAINS_ID.OPTIMISM]: 'Optimism',
  [NOTIFICATION_CHAINS_ID.POLYGON]: 'Polygon',
  [NOTIFICATION_CHAINS_ID.SEI]: 'Sei Network',
} satisfies Record<NOTIFICATION_CHAINS_IDS, string>;

export const NOTIFICATION_NETWORK_CURRENCY_SYMBOL = {
  [NOTIFICATION_CHAINS_ID.ETHEREUM]: 'ETH',
  [NOTIFICATION_CHAINS_ID.ARBITRUM]: 'ETH',
  [NOTIFICATION_CHAINS_ID.AVALANCHE]: 'AVAX',
  [NOTIFICATION_CHAINS_ID.BSC]: 'BNB',
  [NOTIFICATION_CHAINS_ID.BASE]: 'ETH',
  [NOTIFICATION_CHAINS_ID.LINEA]: 'ETH',
  [NOTIFICATION_CHAINS_ID.OPTIMISM]: 'ETH',
  [NOTIFICATION_CHAINS_ID.POLYGON]: 'POL',
  [NOTIFICATION_CHAINS_ID.SEI]: 'SEI',
} satisfies Record<NOTIFICATION_CHAINS_IDS, string>;

export type BlockExplorerConfig = {
  url: string;
  name: string;
};

export const SUPPORTED_NOTIFICATION_BLOCK_EXPLORERS = {
  // ETHEREUM
  [NOTIFICATION_CHAINS_ID.ETHEREUM]: {
    url: 'https://etherscan.io',
    name: 'Etherscan',
  },
  // OPTIMISM
  [NOTIFICATION_CHAINS_ID.OPTIMISM]: {
    url: 'https://optimistic.etherscan.io',
    name: 'Optimistic Etherscan',
  },
  // BSC
  [NOTIFICATION_CHAINS_ID.BSC]: {
    url: 'https://bscscan.com',
    name: 'BscScan',
  },
  // BASE
  [NOTIFICATION_CHAINS_ID.BASE]: {
    url: 'https://basescan.org',
    name: 'BaseScan',
  },
  // POLYGON
  [NOTIFICATION_CHAINS_ID.POLYGON]: {
    url: 'https://polygonscan.com',
    name: 'PolygonScan',
  },
  // ARBITRUM
  [NOTIFICATION_CHAINS_ID.ARBITRUM]: {
    url: 'https://arbiscan.io',
    name: 'Arbiscan',
  },
  // AVALANCHE
  [NOTIFICATION_CHAINS_ID.AVALANCHE]: {
    url: 'https://snowtrace.io',
    name: 'Snowtrace',
  },
  // LINEA
  [NOTIFICATION_CHAINS_ID.LINEA]: {
    url: 'https://lineascan.build',
    name: 'LineaScan',
  },
  [NOTIFICATION_CHAINS_ID.SEI]: {
    url: 'https://seitrace.com/',
    name: 'SeiTrace',
  },
} satisfies Record<NOTIFICATION_CHAINS_IDS, BlockExplorerConfig>;

export { NOTIFICATION_CHAINS_ID } from '../constants/notification-schema';
