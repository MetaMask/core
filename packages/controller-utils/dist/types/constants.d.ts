import { NetworksTicker, ChainId, BuiltInNetworkName } from './types';
export declare const RPC = "rpc";
export declare const FALL_BACK_VS_CURRENCY = "ETH";
export declare const IPFS_DEFAULT_GATEWAY_URL = "https://cloudflare-ipfs.com/ipfs/";
export declare const GANACHE_CHAIN_ID = "0x539";
/**
 * The largest possible chain ID we can handle.
 * Explanation: https://gist.github.com/rekmarks/a47bd5f2525936c4b8eee31a16345553
 */
export declare const MAX_SAFE_CHAIN_ID = 4503599627370476;
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
    NFT: string;
    UNKNOWN: string;
};
export declare const TESTNET_TICKER_SYMBOLS: {
    GOERLI: string;
    SEPOLIA: string;
    LINEA_GOERLI: string;
    LINEA_SEPOLIA: string;
};
/**
 * Map of all build-in Infura networks to their network, ticker and chain IDs.
 */
export declare const BUILT_IN_NETWORKS: {
    readonly goerli: {
        readonly chainId: "0x5";
        readonly ticker: NetworksTicker.goerli;
        readonly rpcPrefs: {
            readonly blockExplorerUrl: "https://goerli.etherscan.io";
        };
    };
    readonly sepolia: {
        readonly chainId: "0xaa36a7";
        readonly ticker: NetworksTicker.sepolia;
        readonly rpcPrefs: {
            readonly blockExplorerUrl: "https://sepolia.etherscan.io";
        };
    };
    readonly mainnet: {
        readonly chainId: "0x1";
        readonly ticker: NetworksTicker.mainnet;
        readonly rpcPrefs: {
            readonly blockExplorerUrl: "https://etherscan.io";
        };
    };
    readonly "linea-goerli": {
        readonly chainId: "0xe704";
        readonly ticker: (typeof NetworksTicker)["linea-goerli"];
        readonly rpcPrefs: {
            readonly blockExplorerUrl: "https://goerli.lineascan.build";
        };
    };
    readonly "linea-sepolia": {
        readonly chainId: "0xe705";
        readonly ticker: (typeof NetworksTicker)["linea-goerli"];
        readonly rpcPrefs: {
            readonly blockExplorerUrl: "https://sepolia.lineascan.build";
        };
    };
    readonly "linea-mainnet": {
        readonly chainId: "0xe708";
        readonly ticker: NetworksTicker.mainnet;
        readonly rpcPrefs: {
            readonly blockExplorerUrl: "https://lineascan.build";
        };
    };
    readonly rpc: {
        readonly chainId: undefined;
        readonly blockExplorerUrl: undefined;
        readonly ticker: undefined;
        readonly rpcPrefs: undefined;
    };
};
export declare const OPENSEA_PROXY_URL = "https://proxy.api.cx.metamask.io/opensea/v1/api/v2";
export declare const NFT_API_BASE_URL = "https://nft.api.cx.metamask.io";
export declare const NFT_API_VERSION = "1";
export declare const NFT_API_TIMEOUT = 15000;
export declare const ORIGIN_METAMASK = "metamask";
/**
 * Approval request types for various operations.
 * These types are used by different controllers to create and manage
 * approval requests consistently.
 */
export declare enum ApprovalType {
    AddEthereumChain = "wallet_addEthereumChain",
    ConnectAccounts = "connect_accounts",
    EthDecrypt = "eth_decrypt",
    EthGetEncryptionPublicKey = "eth_getEncryptionPublicKey",
    EthSignTypedData = "eth_signTypedData",
    PersonalSign = "personal_sign",
    ResultError = "result_error",
    ResultSuccess = "result_success",
    SnapDialogAlert = "snap_dialog:alert",
    SnapDialogConfirmation = "snap_dialog:confirmation",
    SnapDialogPrompt = "snap_dialog:prompt",
    SwitchEthereumChain = "wallet_switchEthereumChain",
    Transaction = "transaction",
    Unlock = "unlock",
    WalletConnect = "wallet_connect",
    WalletRequestPermissions = "wallet_requestPermissions",
    WatchAsset = "wallet_watchAsset"
}
export declare const CHAIN_ID_TO_ETHERS_NETWORK_NAME_MAP: Record<ChainId, BuiltInNetworkName>;
//# sourceMappingURL=constants.d.ts.map