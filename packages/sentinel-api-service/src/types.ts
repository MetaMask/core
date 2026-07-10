import type { Hex } from '@metamask/utils';

/**
 * The feature that originated a relay (gas station) submission. Used purely as
 * metadata forwarded to the Sentinel API for observability. Redefined here so
 * that this package does not depend on `@metamask/smart-transactions-controller`.
 */
export enum SentinelFeature {
  Advanced = 'advanced',
  Default = 'default',
  Sponsored = 'sponsored',
}

/**
 * The kind of relay (gas station) submission. Redefined here so that this
 * package does not depend on `@metamask/smart-transactions-controller`.
 */
export enum SentinelKind {
  Bundle = 'bundle',
  Default = 'default',
  GaslessEIP7702 = 'gaslessEIP7702',
  GaslessSendBundle = 'gaslessSendBundle',
}

/**
 * Optional metadata forwarded with a relay submission for observability. All
 * fields are optional and passed through verbatim to the Sentinel API.
 */
export type SentinelMeta = {
  client?: string;
  clientVersion?: string;
  feature?: SentinelFeature;
  kind?: SentinelKind;
  origin?: string;
  txType?: string;
  wallet?: string;
};

/**
 * An EIP-7702 authorization entry, as accepted by the Sentinel simulation API.
 */
export type SentinelAuthorization = {
  /** Address of the smart contract that contains the code to be set. */
  address: Hex;

  /** Address of the account being upgraded. */
  from: Hex;
};

/**
 * A single transaction to simulate in a Sentinel simulation request.
 */
export type SentinelSimulationTransaction = {
  /** EIP-7702 authorization list for the transaction. */
  authorizationList?: SentinelAuthorization[];

  /** Data to send with the transaction. */
  data?: Hex;

  /** Sender of the transaction. */
  from: Hex;

  /** Gas limit for the transaction. */
  gas?: Hex;

  /** Maximum fee per gas for the transaction. */
  maxFeePerGas?: Hex;

  /** Maximum priority fee per gas for the transaction. */
  maxPriorityFeePerGas?: Hex;

  /** Recipient of the transaction. */
  to?: Hex;

  /** Value to send with the transaction. */
  value?: Hex;
};

/**
 * Overrides to blockchain state, keyed by address, for a simulation request.
 */
export type SentinelStateOverrides = {
  [address: Hex]: {
    /** Override the code for an address. */
    code?: Hex;

    /** Overrides to the storage slots for an address. */
    stateDiff?: {
      [slot: Hex]: Hex;
    };
  };
};

/**
 * A request to the Sentinel API to simulate transactions. This is the superset
 * of the shapes previously used by `@metamask/transaction-controller` and
 * `@metamask/transaction-pay-controller`.
 */
export type SentinelSimulationRequest = {
  /** Overrides to block data for the simulation. */
  blockOverrides?: {
    time?: Hex;
  };

  /** Overrides to blockchain state, keyed by address. */
  overrides?: SentinelStateOverrides;

  /** Whether to include available token fees in the response. */
  suggestFees?: {
    /** Whether the transaction is submitted via a delegation (EIP-7702). */
    with7702?: boolean;

    /** Whether to include the gas fee of the token transfer. */
    withFeeTransfer?: boolean;

    /** Whether to include the native transfer if available. */
    withTransfer?: boolean;
  };

  /**
   * Transactions to be sequentially simulated. State changes impact subsequent
   * transactions in the list.
   */
  transactions: SentinelSimulationTransaction[];

  /** Whether to include call traces in the response. Defaults to false. */
  withCallTrace?: boolean;

  /** Whether to include the default block data. Defaults to false. */
  withDefaultBlockOverrides?: boolean;

  /** Whether to use gas fees in the simulation. Defaults to false. */
  withGas?: boolean;

  /** Whether to include event logs in the response. Defaults to false. */
  withLogs?: boolean;
};

/**
 * A request to submit a signed relay (gas station) transaction to the Sentinel
 * API via `eth_sendRelayTransaction`.
 */
export type SentinelRelaySubmitRequest = {
  /** EIP-7702 authorization tuples for the delegation. */
  authorizationList?: SentinelSignedAuthorization[];

  /** The chain to submit the transaction on. */
  chainId: Hex;

  /** The encoded calldata (for example `redeemDelegations`). */
  data: Hex;

  /** Optional metadata forwarded to the API for observability. */
  metadata?: SentinelMeta;

  /** The recipient of the transaction (for example the DelegationManager). */
  to: Hex;
};

/**
 * A fully signed EIP-7702 authorization tuple, as submitted to the relay.
 */
export type SentinelSignedAuthorization = {
  address: Hex;
  chainId: Hex;
  nonce: Hex;
  r: Hex;
  s: Hex;
  yParity: Hex;
};

/**
 * A request to poll the status of a submitted relay transaction.
 */
export type SentinelRelayStatusRequest = {
  /** The chain the transaction was submitted on. */
  chainId: Hex;

  /** The UUID returned by {@link SentinelRelaySubmitResponse}. */
  uuid: string;
};
