/**
 * CowSwap API base URL
 */
export const COW_API_BASE = 'https://api.cow.fi';

/**
 * Mapping of chain IDs to CowSwap network paths
 */
export const COW_NETWORK_PATHS: Record<number, string> = {
  // Ethereum Mainnet
  1: 'mainnet',
  // Arbitrum One
  42161: 'arbitrum_one',
  // Base
  8453: 'base',
  // Avalanche C-Chain
  43114: 'avalanche',
  // Polygon PoS
  137: 'polygon',
};

/**
 * Default CowSwap settlement contract address
 */
export const COW_SETTLEMENT_CONTRACT =
  '0x9008D19f58AAbd9eD0D60971565AA8510560ab41';

/**
 * CowSwap provider configuration
 */
export const COWSWAP_PROVIDER_CONFIG = {
  name: 'cowswap',
  version: '1.0.0',
  supportedChains: Object.keys(COW_NETWORK_PATHS).map(Number),
  apiBaseUrl: COW_API_BASE,
  features: ['eip712-signing', 'meta-transactions', 'gasless-trading'],
  rateLimit: {
    requestsPerMinute: 60,
    burstLimit: 10,
  },
};
