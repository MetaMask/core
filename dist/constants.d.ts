import { NetworkType } from './network/NetworkController';
export declare const MAINNET = "mainnet";
export declare const RPC = "rpc";
export declare const FALL_BACK_VS_CURRENCY = "ETH";
export declare const IPFS_DEFAULT_GATEWAY_URL = "https://cloudflare-ipfs.com/ipfs/";
export declare const RINKEBY_CHAIN_ID = "4";
export declare const GANACHE_CHAIN_ID = "1337";
export declare const ERC721 = "ERC721";
export declare const ERC1155 = "ERC1155";
export declare const ERC20 = "ERC20";
export declare const ERC721_INTERFACE_ID = "0x80ac58cd";
export declare const ERC721_METADATA_INTERFACE_ID = "0x5b5e139f";
export declare const ERC721_ENUMERABLE_INTERFACE_ID = "0x780e9d63";
export declare const ERC1155_INTERFACE_ID = "0xd9b67a26";
export declare const ERC1155_METADATA_URI_INTERFACE_ID = "0x0e89341c";
export declare const ERC1155_TOKEN_RECEIVER_INTERFACE_ID = "0x4e2312e0";
export declare const GWEI = "gwei";
export declare const ASSET_TYPES: {
    NATIVE: string;
    TOKEN: string;
    COLLECTIBLE: string;
    UNKNOWN: string;
};
export declare const TESTNET_TICKER_SYMBOLS: {
    RINKEBY: string;
    GOERLI: string;
    ROPSTEN: string;
    KOVAN: string;
};
export declare const TESTNET_NETWORK_TYPE_TO_TICKER_SYMBOL: {
    [K in NetworkType]: string;
};
export declare const OPENSEA_PROXY_URL = "https://proxy.metaswap.codefi.network/opensea/v1/api/v1";
export declare const OPENSEA_API_URL = "https://api.opensea.io/api/v1";
export declare const OPENSEA_TEST_API_URL = "https://testnets-api.opensea.io/api/v1";
