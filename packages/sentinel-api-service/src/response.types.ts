import type { Hex } from '@metamask/utils';

/**
 * A single network entry from the Sentinel `/networks` registry.
 */
export type SentinelNetwork = {
  /** Whether simulation (confirmations) is supported for this chain. */
  confirmations?: boolean;

  /** The chain ID, as a decimal number. */
  chainID?: number;

  /** The subdomain used to build the Sentinel URL for this chain. */
  network: string;

  /** Whether the gas station relay is supported for this chain. */
  relayTransactions?: boolean;

  /** Whether smart transactions are supported for this chain. */
  smartTransactions?: boolean;

  /** Whether the bundle path is supported for this chain. */
  sendBundle?: boolean;
};

/**
 * The Sentinel `/networks` registry response, keyed by decimal chain ID.
 */
export type SentinelNetworkRegistry = Record<string, SentinelNetwork>;

/**
 * Raw event log emitted by a simulated transaction.
 */
export type SentinelSimulationLog = {
  address: Hex;
  data: Hex;
  topics: Hex[];
};

/**
 * Call trace of a single simulated transaction.
 */
export type SentinelSimulationCallTrace = {
  calls?: SentinelSimulationCallTrace[] | null;
  error?: string;
  output?: Hex;
};

/**
 * State difference (pre/post) for a single simulated transaction.
 */
export type SentinelSimulationStateDiff = {
  post?: Record<Hex, unknown>;
  pre?: Record<Hex, unknown>;
};

/**
 * A token-denominated fee option returned by the simulation API when
 * `suggestFees` is requested.
 */
export type SentinelSimulationTokenFee = {
  balanceNeededToken?: Hex;
  currentBalanceToken?: Hex;
  feeRecipient?: Hex;
  rateWei?: Hex;
  serviceFee?: Hex;
  token?: {
    address: Hex;
    decimals: number;
    symbol: string;
  };
  transferEstimate?: Hex;
};

/**
 * The result of simulating a single transaction.
 */
export type SentinelSimulationResponseTransaction = {
  callTrace?: SentinelSimulationCallTrace;
  error?: string;
  fees?: SentinelSimulationTokenFee[];
  gasCost?: Hex;
  gasLimit?: Hex;
  gasUsed?: Hex;
  logs?: SentinelSimulationLog[];
  return?: Hex;
  stateDiff?: SentinelSimulationStateDiff;
};

/**
 * The response from the Sentinel simulation API.
 */
export type SentinelSimulationResponse = {
  sponsorship?: {
    error?: string;
    isSponsored?: boolean;
  };
  transactions: SentinelSimulationResponseTransaction[];
};

/**
 * The response from submitting a relay transaction.
 */
export type SentinelRelaySubmitResponse = {
  uuid: string;
};

/**
 * Terminal and non-terminal statuses reported by the relay status endpoint.
 */
export enum SentinelRelayStatus {
  Pending = 'PENDING',
  Success = 'VALIDATED',
}

/**
 * The normalized result of polling a relay transaction's status.
 */
export type SentinelRelayStatusResponse = {
  /**
   * The reason the relay failed, if any. May be `null` when the API explicitly
   * reports no error reason.
   */
  errorReason?: string | null;

  /** The current status of the relay transaction. */
  status: string;

  /** The on-chain transaction hash, once available. */
  transactionHash?: Hex;
};
