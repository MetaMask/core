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
} as const;

export type InfuraNetworkType =
  (typeof InfuraNetworkType)[keyof typeof InfuraNetworkType];

/**
 * The "network type"; either the name of a built-in network, or "rpc" for custom networks.
 */
export const NetworkType = {
  ...InfuraNetworkType,
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
} as const;
export type ChainId = (typeof ChainId)[keyof typeof ChainId];

export enum NetworksTicker {
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  mainnet = 'ETH',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  goerli = 'GoerliETH',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  sepolia = 'SepoliaETH',
  'linea-goerli' = 'LineaETH',
  'linea-sepolia' = 'LineaETH',
  'linea-mainnet' = 'ETH',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  rpc = '',
}

export const BlockExplorerUrl = {
  [BuiltInNetworkName.Mainnet]: 'https://etherscan.io',
  [BuiltInNetworkName.Goerli]: 'https://goerli.etherscan.io',
  [BuiltInNetworkName.Sepolia]: 'https://sepolia.etherscan.io',
  [BuiltInNetworkName.LineaGoerli]: 'https://goerli.lineascan.build',
  [BuiltInNetworkName.LineaSepolia]: 'https://sepolia.lineascan.build',
  [BuiltInNetworkName.LineaMainnet]: 'https://lineascan.build',
} as const satisfies Record<InfuraNetworkType, string>;
export type BlockExplorerUrl =
  (typeof BlockExplorerUrl)[keyof typeof BlockExplorerUrl];

export const NetworkNickname = {
  [BuiltInNetworkName.Mainnet]: 'Ethereum Mainnet',
  [BuiltInNetworkName.Goerli]: 'Goerli',
  [BuiltInNetworkName.Sepolia]: 'Sepolia',
  [BuiltInNetworkName.LineaGoerli]: 'Linea Goerli',
  [BuiltInNetworkName.LineaSepolia]: 'Linea Sepolia',
  [BuiltInNetworkName.LineaMainnet]: 'Linea',
} as const satisfies Record<InfuraNetworkType, string>;
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
   * @param context - The context in which the operation is running.
   */
  fn?: (context?: TraceContext) => ReturnType,
) => Promise<ReturnType>;
