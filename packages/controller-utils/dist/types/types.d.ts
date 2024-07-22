/**
 * The names of built-in Infura networks
 */
export declare const InfuraNetworkType: {
    readonly mainnet: "mainnet";
    readonly goerli: "goerli";
    readonly sepolia: "sepolia";
    readonly 'linea-goerli': "linea-goerli";
    readonly 'linea-sepolia': "linea-sepolia";
    readonly 'linea-mainnet': "linea-mainnet";
};
export type InfuraNetworkType = (typeof InfuraNetworkType)[keyof typeof InfuraNetworkType];
/**
 * The "network type"; either the name of a built-in network, or "rpc" for custom networks.
 */
export declare const NetworkType: {
    readonly rpc: "rpc";
    readonly mainnet: "mainnet";
    readonly goerli: "goerli";
    readonly sepolia: "sepolia";
    readonly 'linea-goerli': "linea-goerli";
    readonly 'linea-sepolia': "linea-sepolia";
    readonly 'linea-mainnet': "linea-mainnet";
};
export type NetworkType = (typeof NetworkType)[keyof typeof NetworkType];
/**
 * A helper to determine whether a given input is NetworkType.
 *
 * @param val - the value to check whether it is NetworkType or not.
 * @returns boolean indicating whether or not the argument is NetworkType.
 */
export declare function isNetworkType(val: string): val is NetworkType;
/**
 * A type guard to determine whether the input is an InfuraNetworkType.
 *
 * @param value - The value to check.
 * @returns True if the given value is within the InfuraNetworkType enum,
 * false otherwise.
 */
export declare function isInfuraNetworkType(value: unknown): value is InfuraNetworkType;
/**
 * Names of networks built into the wallet.
 *
 * This includes both Infura and non-Infura networks.
 */
export declare enum BuiltInNetworkName {
    Mainnet = "mainnet",
    Goerli = "goerli",
    Sepolia = "sepolia",
    LineaGoerli = "linea-goerli",
    LineaSepolia = "linea-sepolia",
    LineaMainnet = "linea-mainnet",
    Aurora = "aurora"
}
/**
 * Decimal string chain IDs of built-in networks, by name.
 *
 * `toHex` not invoked to avoid cyclic dependency
 */
export declare const ChainId: {
    readonly mainnet: "0x1";
    readonly goerli: "0x5";
    readonly sepolia: "0xaa36a7";
    readonly aurora: "0x4e454152";
    readonly "linea-goerli": "0xe704";
    readonly "linea-sepolia": "0xe705";
    readonly "linea-mainnet": "0xe708";
};
export type ChainId = (typeof ChainId)[keyof typeof ChainId];
export declare enum NetworksTicker {
    mainnet = "ETH",
    goerli = "GoerliETH",
    sepolia = "SepoliaETH",
    'linea-goerli' = "LineaETH",
    'linea-sepolia' = "LineaETH",
    'linea-mainnet' = "ETH",
    rpc = ""
}
//# sourceMappingURL=types.d.ts.map