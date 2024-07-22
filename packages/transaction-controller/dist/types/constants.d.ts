export declare const CHAIN_IDS: {
    readonly MAINNET: "0x1";
    readonly GOERLI: "0x5";
    readonly BASE: "0x2105";
    readonly BASE_TESTNET: "0x14a33";
    readonly BSC: "0x38";
    readonly BSC_TESTNET: "0x61";
    readonly OPTIMISM: "0xa";
    readonly OPTIMISM_TESTNET: "0x1a4";
    readonly OPBNB: "0xcc";
    readonly OPBNB_TESTNET: "0x15eb";
    readonly OPTIMISM_SEPOLIA: "0xaa37dc";
    readonly POLYGON: "0x89";
    readonly POLYGON_TESTNET: "0x13881";
    readonly AVALANCHE: "0xa86a";
    readonly AVALANCHE_TESTNET: "0xa869";
    readonly FANTOM: "0xfa";
    readonly FANTOM_TESTNET: "0xfa2";
    readonly SEPOLIA: "0xaa36a7";
    readonly LINEA_GOERLI: "0xe704";
    readonly LINEA_SEPOLIA: "0xe705";
    readonly LINEA_MAINNET: "0xe708";
    readonly MOONBEAM: "0x504";
    readonly MOONBEAM_TESTNET: "0x507";
    readonly MOONRIVER: "0x505";
    readonly GNOSIS: "0x64";
    readonly ARBITRUM: "0xa4b1";
    readonly ZKSYNC_ERA: "0x144";
    readonly ZORA: "0x76adf1";
    readonly SCROLL: "0x82750";
    readonly SCROLL_SEPOLIA: "0x8274f";
};
export declare const DEFAULT_ETHERSCAN_DOMAIN = "etherscan.io";
export declare const DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX = "api";
export declare const ETHERSCAN_SUPPORTED_NETWORKS: {
    "0x5": {
        domain: string;
        subdomain: string;
    };
    "0x1": {
        domain: string;
        subdomain: string;
    };
    "0xaa36a7": {
        domain: string;
        subdomain: string;
    };
    "0xe704": {
        domain: string;
        subdomain: string;
    };
    "0xe705": {
        domain: string;
        subdomain: string;
    };
    "0xe708": {
        domain: string;
        subdomain: string;
    };
    "0x38": {
        domain: string;
        subdomain: string;
    };
    "0x61": {
        domain: string;
        subdomain: string;
    };
    "0xa": {
        domain: string;
        subdomain: string;
    };
    "0xaa37dc": {
        domain: string;
        subdomain: string;
    };
    "0x89": {
        domain: string;
        subdomain: string;
    };
    "0x13881": {
        domain: string;
        subdomain: string;
    };
    "0xa86a": {
        domain: string;
        subdomain: string;
    };
    "0xa869": {
        domain: string;
        subdomain: string;
    };
    "0xfa": {
        domain: string;
        subdomain: string;
    };
    "0xfa2": {
        domain: string;
        subdomain: string;
    };
    "0x504": {
        domain: string;
        subdomain: string;
    };
    "0x507": {
        domain: string;
        subdomain: string;
    };
    "0x505": {
        domain: string;
        subdomain: string;
    };
    "0x64": {
        domain: string;
        subdomain: string;
    };
};
export declare const GAS_BUFFER_CHAIN_OVERRIDES: {
    "0xa": number;
    "0xaa37dc": number;
};
/** Extract of the Wrapped ERC-20 ABI required for simulation. */
export declare const ABI_SIMULATION_ERC20_WRAPPED: {
    anonymous: boolean;
    inputs: {
        indexed: boolean;
        name: string;
        type: string;
    }[];
    name: string;
    type: string;
}[];
/** Extract of the legacy ERC-721 ABI required for simulation. */
export declare const ABI_SIMULATION_ERC721_LEGACY: {
    anonymous: boolean;
    inputs: {
        indexed: boolean;
        name: string;
        type: string;
    }[];
    name: string;
    type: string;
}[];
//# sourceMappingURL=constants.d.ts.map