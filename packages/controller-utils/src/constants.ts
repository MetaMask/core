import { NetworkType } from './types';

export const MAINNET = 'mainnet';
export const RPC = 'rpc';
export const FALL_BACK_VS_CURRENCY = 'ETH';
export const IPFS_DEFAULT_GATEWAY_URL = 'https://cloudflare-ipfs.com/ipfs/';

// NETWORKS ID
export const RINKEBY_CHAIN_ID = '4';
export const GANACHE_CHAIN_ID = '1337';

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

// TRANSACTION CONTROLLER ERRORS
export const ESTIMATE_GAS_ERROR = 'eth_estimateGas rpc method error';

// ASSET TYPES
export const ASSET_TYPES = {
  NATIVE: 'NATIVE',
  TOKEN: 'TOKEN',
  COLLECTIBLE: 'COLLECTIBLE',
  UNKNOWN: 'UNKNOWN',
};

// TICKER SYMBOLS
export const TESTNET_TICKER_SYMBOLS = {
  RINKEBY: 'RinkebyETH',
  GOERLI: 'GoerliETH',
  ROPSTEN: 'RopstenETH',
  KOVAN: 'KovanETH',
};
// TYPED NetworkType TICKER SYMBOLS
export const TESTNET_NETWORK_TYPE_TO_TICKER_SYMBOL: {
  [K in NetworkType]: string;
} = {
  rinkeby: 'RinkebyETH',
  goerli: 'GoerliETH',
  ropsten: 'RopstenETH',
  kovan: 'KovanETH',
  mainnet: '',
  rpc: '',
  localhost: '',
};

// APIs
export const OPENSEA_PROXY_URL =
  'https://proxy.metaswap.codefi.network/opensea/v1/api/v1';
export const OPENSEA_API_URL = 'https://api.opensea.io/api/v1';
export const OPENSEA_TEST_API_URL = 'https://testnets-api.opensea.io/api/v1';
