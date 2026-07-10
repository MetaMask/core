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
  /** Address of the account that created the event. */
  address: Hex;

  /** Raw data in the event that is not indexed. */
  data: Hex;

  /** Raw indexed data from the event. */
  topics: Hex[];
};

/**
 * Call trace of a single simulated transaction.
 */
export type SentinelSimulationCallTrace = {
  /** Nested calls. */
  calls?: SentinelSimulationCallTrace[] | null;

  /** Error message for the call, if any. */
  error?: string;

  /** Raw event logs created by the call. */
  logs?: SentinelSimulationLog[] | null;

  /** Raw return data from the call (revert hex when reverted). */
  output?: Hex;
};

/**
 * Per-account state changes recorded by a simulated transaction.
 */
export type SentinelSimulationStateDiffAccount = {
  /** Native balance of the account. */
  balance?: Hex;

  /** Nonce of the account. */
  nonce?: Hex;

  /** Storage values per slot. */
  storage?: {
    [slot: Hex]: Hex;
  };
};

/**
 * Changes to the blockchain state (pre/post) for a single simulated
 * transaction. Each side is keyed by account address.
 */
export type SentinelSimulationStateDiff = {
  /** Initial blockchain state before the transaction. */
  pre?: {
    [address: Hex]: SentinelSimulationStateDiffAccount;
  };

  /** Updated blockchain state after the transaction. */
  post?: {
    [address: Hex]: SentinelSimulationStateDiffAccount;
  };
};

/**
 * A token-denominated fee option returned by the simulation API when
 * `suggestFees` is requested.
 */
export type SentinelSimulationTokenFee = {
  /** Amount of tokens needed to pay for gas. */
  balanceNeededToken: Hex;

  /** Current token balance of the sender. */
  currentBalanceToken: Hex;

  /** Account address that the token should be transferred to. */
  feeRecipient: Hex;

  /** Conversion rate of 1 token to native WEI. */
  rateWei: Hex;

  /** Portion of `balanceNeededToken` that is the fee paid to MetaMask. */
  serviceFee?: Hex;

  /** Token data independent of the current transaction. */
  token: {
    /** Address of the token contract. */
    address: Hex;

    /** Number of decimals used by the token. */
    decimals: number;

    /** Symbol of the token. */
    symbol: string;
  };

  /** Estimated gas limit required for the fee transfer. */
  transferEstimate: Hex;
};

/**
 * A single recommended fee level for a simulated transaction, including the
 * gas fee parameters and the token-fee options at that level.
 */
export type SentinelSimulationFeeLevel = {
  /** Gas limit for the fee level. */
  gas: Hex;

  /** Maximum fee per gas for the fee level. */
  maxFeePerGas: Hex;

  /** Maximum priority fee per gas for the fee level. */
  maxPriorityFeePerGas: Hex;

  /** Token fee options for the fee level. */
  tokenFees: SentinelSimulationTokenFee[];
};

/**
 * The result of simulating a single transaction.
 */
export type SentinelSimulationResponseTransaction = {
  /** Hierarchy of call data including nested calls and logs. */
  callTrace?: SentinelSimulationCallTrace;

  /** An error message indicating the transaction could not be simulated. */
  error?: string;

  /** Recommended gas fees for the transaction, per fee level. */
  fees?: SentinelSimulationFeeLevel[];

  /**
   * Estimated total gas cost of the transaction, in wei as a decimal number.
   * Included in the `stateDiff` when `withGas` is true.
   */
  gasCost?: number;

  /** Required `gasLimit` for the transaction. */
  gasLimit?: Hex;

  /** Total gas used by the transaction. */
  gasUsed?: Hex;

  /** Return value of the transaction (for example the balance from `balanceOf`). */
  return: Hex;

  /** Changes to the blockchain state produced by the transaction. */
  stateDiff?: SentinelSimulationStateDiff;
};

/**
 * The response from the Sentinel simulation API.
 */
export type SentinelSimulationResponse = {
  /** Sponsorship determination for the request. */
  sponsorship: {
    /** Whether the gas costs are sponsored (no transfer required). */
    isSponsored: boolean;

    /** Error message for the sponsorship determination, if any. */
    error: string | null;
  };

  /** Simulation data for each transaction in the request. */
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
