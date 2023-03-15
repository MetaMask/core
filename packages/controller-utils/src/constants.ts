import { NetworkType, NetworksTicker, NetworksChainId } from './types';

export const RPC = 'rpc';
export const FALL_BACK_VS_CURRENCY = 'ETH';
export const IPFS_DEFAULT_GATEWAY_URL = 'https://cloudflare-ipfs.com/ipfs/';

// NETWORKS ID
export const GANACHE_CHAIN_ID = '1337';
/**
 * The largest possible chain ID we can handle.
 * Explanation: https://gist.github.com/rekmarks/a47bd5f2525936c4b8eee31a16345553
 */
export const MAX_SAFE_CHAIN_ID = 4503599627370476;

// TOKEN STANDARDS
export const ERC721 = 'ERC721';
export const ERC1155 = 'ERC1155';
export const ERC20 = 'ERC20';

// TOKEN INTERFACE IDS
export const ERC721_INTERFACE_ID = '0x80ac58cd';
export const ERC721_METADATA_INTERFACE_ID = '0x5b5e139f';
export const ERC721_ENUMERABLE_INTERFACE_ID = '0x780e9d63';
export const ERC1155_INTERFACE_ID = '0xd9b67a26';
export const ERC1155_METADATA_URI_INTERFACE_ID = '0x0e89341c';
export const ERC1155_TOKEN_RECEIVER_INTERFACE_ID = '0x4e2312e0';

// UNITS
export const GWEI = 'gwei';

// ASSET TYPES
export const ASSET_TYPES = {
  NATIVE: 'NATIVE',
  TOKEN: 'TOKEN',
  NFT: 'NFT',
  UNKNOWN: 'UNKNOWN',
};

// TICKER SYMBOLS
export const TESTNET_TICKER_SYMBOLS = {
  GOERLI: 'GoerliETH',
  SEPOLIA: 'SepoliaETH',
};

/**
 * Map of all build-in Infura networks to their network, ticker and chain IDs.
 */
export const BUILT_IN_NETWORKS = {
  [NetworkType.goerli]: {
    chainId: NetworksChainId.goerli,
    ticker: NetworksTicker.goerli,
    rpcPrefs: {
      blockExplorerUrl: `https://${NetworkType.goerli}.etherscan.io`,
    },
  },
  [NetworkType.sepolia]: {
    chainId: NetworksChainId.sepolia,
    ticker: NetworksTicker.sepolia,
    rpcPrefs: {
      blockExplorerUrl: `https://${NetworkType.sepolia}.etherscan.io`,
    },
  },
  [NetworkType.mainnet]: {
    chainId: NetworksChainId.mainnet,
    ticker: NetworksTicker.mainnet,
    rpcPrefs: {
      blockExplorerUrl: 'https://etherscan.io',
    },
  },
  [NetworkType.localhost]: {
    chainId: NetworksChainId.localhost,
    blockExplorerUrl: undefined,
    rpcPrefs: undefined,
  },
  [NetworkType.rpc]: {
    chainId: undefined,
    blockExplorerUrl: undefined,
    rpcPrefs: undefined,
  },
} as const;

// APIs
export const OPENSEA_PROXY_URL =
  'https://proxy.metafi.codefi.network/opensea/v1/api/v1';
export const OPENSEA_API_URL = 'https://api.opensea.io/api/v1';
export const OPENSEA_TEST_API_URL = 'https://testnets-api.opensea.io/api/v1';
