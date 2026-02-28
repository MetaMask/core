/**
 * The names of built-in Infura networks
 */
export const InfuraNetworkType = {
  mainnet: 'mainnet',
  goerli: 'goerli',
  sepolia: 'sepolia',
  'linea-goerli': 'linea-goerli',
  'linea-sepolia': 'linea-sepolia',
  'linea-mainnet': 'linea-mainnet',
  'base-mainnet': 'base-mainnet',
  'arbitrum-mainnet': 'arbitrum-mainnet',
  'bsc-mainnet': 'bsc-mainnet',
  'optimism-mainnet': 'optimism-mainnet',
  'polygon-mainnet': 'polygon-mainnet',
  'sei-mainnet': 'sei-mainnet',
} as const;

export type InfuraNetworkType =
  (typeof InfuraNetworkType)[keyof typeof InfuraNetworkType];

/**
 * Custom network types that are not part of Infura.
 */
export const CustomNetworkType = {
  /**
   * @deprecated `megaeth-testnet` is migrated to `megaeth-testnet-v2`.
   */
  'megaeth-testnet': 'megaeth-testnet',
  'megaeth-testnet-v2': 'megaeth-testnet-v2',
  'monad-testnet': 'monad-testnet',
} as const;
export type CustomNetworkType =
  (typeof CustomNetworkType)[keyof typeof CustomNetworkType];

/**
 * Network types supported including both Infura networks and other networks.
 */
export type BuiltInNetworkType = InfuraNetworkType | CustomNetworkType;

/**
 * The "network type"; either the name of a built-in network, or "rpc" for custom networks.
 */
export const NetworkType = {
  ...InfuraNetworkType,
  ...CustomNetworkType,
  rpc: 'rpc',
} as const;

export type NetworkType = (typeof NetworkType)[keyof typeof NetworkType];

/**
 * A helper to determine whether a given input is NetworkType.
 *
 * @param val - the value to check whether it is NetworkType or not.
 * @returns boolean indicating whether or not the argument is NetworkType.
 */
export function isNetworkType(val: string): val is NetworkType {
  return Object.values(NetworkType).includes(val as NetworkType);
}

/**
 * A type guard to determine whether the input is an InfuraNetworkType.
 *
 * @param value - The value to check.
 * @returns True if the given value is within the InfuraNetworkType enum,
 * false otherwise.
 */
export function isInfuraNetworkType(
  value: unknown,
): value is InfuraNetworkType {
  const infuraNetworkTypes: unknown[] = Object.keys(InfuraNetworkType);
  return infuraNetworkTypes.includes(value);
}

/**
 * Names of networks built into the wallet.
 *
 * This includes both Infura and non-Infura networks.
 */
export enum BuiltInNetworkName {
  Mainnet = 'mainnet',
  Goerli = 'goerli',
  Sepolia = 'sepolia',
  LineaGoerli = 'linea-goerli',
  LineaSepolia = 'linea-sepolia',
  LineaMainnet = 'linea-mainnet',
  Aurora = 'aurora',
  /**
   * @deprecated `MegaETHTestnet` is migrated to `MegaETHTestnetV2`.
   */
  MegaETHTestnet = 'megaeth-testnet',
  MegaETHTestnetV2 = 'megaeth-testnet-v2',
  MonadTestnet = 'monad-testnet',
  BaseMainnet = 'base-mainnet',
  ArbitrumOne = 'arbitrum-mainnet',
  BscMainnet = 'bsc-mainnet',
  OptimismMainnet = 'optimism-mainnet',
  PolygonMainnet = 'polygon-mainnet',
  SeiMainnet = 'sei-mainnet',
  MegaETHMainnet = 'megaeth-mainnet',
}

/**
 * Decimal string chain IDs of built-in networks, by name.
 *
 * `toHex` not invoked to avoid cyclic dependency
 */
export const ChainId = {
  [BuiltInNetworkName.Mainnet]: '0x1', // toHex(1)
  [BuiltInNetworkName.Goerli]: '0x5', // toHex(5)
  [BuiltInNetworkName.Sepolia]: '0xaa36a7', // toHex(11155111)
  [BuiltInNetworkName.Aurora]: '0x4e454152', // toHex(1313161554)
  [BuiltInNetworkName.LineaGoerli]: '0xe704', // toHex(59140)
  [BuiltInNetworkName.LineaSepolia]: '0xe705', // toHex(59141)
  [BuiltInNetworkName.LineaMainnet]: '0xe708', // toHex(59144)
  /**
   * @deprecated `MegaETHTestnet` is migrated to `MegaETHTestnetV2`.
   */
  [BuiltInNetworkName.MegaETHTestnet]: '0x18c6', // toHex(6342)
  [BuiltInNetworkName.MegaETHTestnetV2]: '0x18c7', // toHex(6343)
  [BuiltInNetworkName.MonadTestnet]: '0x279f', // toHex(10143)
  [BuiltInNetworkName.BaseMainnet]: '0x2105', // toHex(8453)
  [BuiltInNetworkName.ArbitrumOne]: '0xa4b1', // toHex(42161)
  [BuiltInNetworkName.BscMainnet]: '0x38', // toHex(56)
  [BuiltInNetworkName.OptimismMainnet]: '0xa', // toHex(10)
  [BuiltInNetworkName.PolygonMainnet]: '0x89', // toHex(137)
  [BuiltInNetworkName.SeiMainnet]: '0x531', // toHex(1329)
  [BuiltInNetworkName.MegaETHMainnet]: '0x10e6', // toHex(4326)
} as const;
export type ChainId = (typeof ChainId)[keyof typeof ChainId];

/* eslint-disable @typescript-eslint/naming-convention */
export enum NetworksTicker {
  mainnet = 'ETH',
  goerli = 'GoerliETH',
  sepolia = 'SepoliaETH',
  'linea-goerli' = 'LineaETH',
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  'linea-sepolia' = 'LineaETH',
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  'linea-mainnet' = 'ETH',
  /**
   * @deprecated `megaeth-testnet` is migrated to `megaeth-testnet-v2`.
   */
  'megaeth-testnet' = 'MegaETH',
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  'megaeth-testnet-v2' = 'MegaETH',
  'monad-testnet' = 'MON',
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  'base-mainnet' = 'ETH',
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  'arbitrum-mainnet' = 'ETH',
  'bsc-mainnet' = 'BNB',
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  'optimism-mainnet' = 'ETH',
  'polygon-mainnet' = 'POL',
  'sei-mainnet' = 'SEI',
  rpc = '',
}
/* eslint-enable @typescript-eslint/naming-convention */

export const BlockExplorerUrl = {
  [BuiltInNetworkName.Mainnet]: 'https://etherscan.io',
  [BuiltInNetworkName.Goerli]: 'https://goerli.etherscan.io',
  [BuiltInNetworkName.Sepolia]: 'https://sepolia.etherscan.io',
  [BuiltInNetworkName.LineaGoerli]: 'https://goerli.lineascan.build',
  [BuiltInNetworkName.LineaSepolia]: 'https://sepolia.lineascan.build',
  [BuiltInNetworkName.LineaMainnet]: 'https://lineascan.build',
  /**
   * @deprecated `MegaETHTestnet` is migrated to `MegaETHTestnetV2`.
   */
  [BuiltInNetworkName.MegaETHTestnet]: 'https://megaexplorer.xyz',
  [BuiltInNetworkName.MegaETHTestnetV2]:
    'https://megaeth-testnet-v2.blockscout.com',
  [BuiltInNetworkName.MonadTestnet]: 'https://testnet.monadexplorer.com',
  [BuiltInNetworkName.BaseMainnet]: 'https://basescan.org',
  [BuiltInNetworkName.ArbitrumOne]: 'https://arbiscan.io',
  [BuiltInNetworkName.BscMainnet]: 'https://bscscan.com',
  [BuiltInNetworkName.OptimismMainnet]: 'https://optimistic.etherscan.io',
  [BuiltInNetworkName.PolygonMainnet]: 'https://polygonscan.com',
  [BuiltInNetworkName.SeiMainnet]: 'https://seitrace.com',
} as const satisfies Record<BuiltInNetworkType, string>;
export type BlockExplorerUrl =
  (typeof BlockExplorerUrl)[keyof typeof BlockExplorerUrl];

export const NetworkNickname = {
  [BuiltInNetworkName.Mainnet]: 'Ethereum',
  [BuiltInNetworkName.Goerli]: 'Goerli',
  [BuiltInNetworkName.Sepolia]: 'Sepolia',
  [BuiltInNetworkName.LineaGoerli]: 'Linea Goerli',
  [BuiltInNetworkName.LineaSepolia]: 'Linea Sepolia',
  [BuiltInNetworkName.LineaMainnet]: 'Linea',
  /**
   * @deprecated `MegaETHTestnet` is migrated to `MegaETHTestnetV2`.
   */
  [BuiltInNetworkName.MegaETHTestnet]: 'Mega Testnet',
  [BuiltInNetworkName.MegaETHTestnetV2]: 'MegaETH Testnet',
  [BuiltInNetworkName.MonadTestnet]: 'Monad Testnet',
  [BuiltInNetworkName.BaseMainnet]: 'Base',
  [BuiltInNetworkName.ArbitrumOne]: 'Arbitrum',
  [BuiltInNetworkName.BscMainnet]: 'BNB Chain',
  [BuiltInNetworkName.OptimismMainnet]: 'OP',
  [BuiltInNetworkName.PolygonMainnet]: 'Polygon',
  [BuiltInNetworkName.SeiMainnet]: 'Sei',
} as const satisfies Record<BuiltInNetworkType, string>;
export type NetworkNickname =
  (typeof NetworkNickname)[keyof typeof NetworkNickname];

/**
 * Makes a selection of keys in a Record optional.
 *
 * @template Type - The Record that you want to operate on.
 * @template Key - The union of keys you want to make optional.
 */
// TODO: Move to @metamask/utils
export type Partialize<Type, Key extends keyof Type> = Omit<Type, Key> &
  Partial<Pick<Type, Key>>;

/** A context in which to execute a trace, in order to generate nested timings. */
export type TraceContext = unknown;

/** Request to trace an operation. */
export type TraceRequest = {
  /** Additional data to include in the trace. */
  data?: Record<string, number | string | boolean>;

  /** Name of the operation. */
  name: string;

  /**
   * Unique identifier for the trace.
   * Required if starting a trace and not providing a callback.
   */
  id?: string;

  /** Trace context in which to execute the operation. */
  parentContext?: TraceContext;

  /** Additional tags to include in the trace to filter results. */
  tags?: Record<string, number | string | boolean>;
};

/** Callback that traces the performance of an operation. */
export type TraceCallback = <ReturnType>(
  /** Request to trace the performance of an operation. */
  request: TraceRequest,

  /**
   * Callback to trace.
   * Thrown errors will not be caught, but the trace will still be recorded.
   *
   * @param context - The context in which the operation is running.
   */
  fn?: (context?: TraceContext) => ReturnType,
) => Promise<ReturnType>;
