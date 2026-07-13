import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { Hex } from '@metamask/utils';
import type { QueryClientConfig } from '@tanstack/query-core';

import type { SentinelEnvironment, serviceName } from './constants';
import type { SentinelApiServiceMethodActions } from './sentinel-api-service-method-action-types';

/**
 * Invalidates cached queries for {@link SentinelApiService}.
 */
export type SentinelApiServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link SentinelApiService} exposes to other consumers.
 */
export type SentinelApiServiceActions =
  | SentinelApiServiceMethodActions
  | SentinelApiServiceInvalidateQueriesAction;

/**
 * Published when {@link SentinelApiService}'s cache is updated.
 */
export type SentinelApiServiceCacheUpdatedEvent = DataServiceCacheUpdatedEvent<
  typeof serviceName
>;

/**
 * Published when a key within {@link SentinelApiService}'s cache is updated.
 */
export type SentinelApiServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link SentinelApiService} exposes to other consumers.
 */
export type SentinelApiServiceEvents =
  | SentinelApiServiceCacheUpdatedEvent
  | SentinelApiServiceGranularCacheUpdatedEvent;

/**
 * Retrieves a bearer token from the `AuthenticationController` in
 * `@metamask/profile-sync-controller`. Declared structurally to avoid pulling
 * that package's transitive dependency tree in for a single action contract.
 */
type AuthenticationControllerGetBearerTokenAction = {
  type: 'AuthenticationController:getBearerToken';
  handler: (entropySourceId?: string) => Promise<string>;
};

/**
 * Actions from other messengers that {@link SentinelApiService} calls.
 */
type AllowedActions = AuthenticationControllerGetBearerTokenAction;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link SentinelApiService}.
 */
export type SentinelApiServiceMessenger = Messenger<
  typeof serviceName,
  SentinelApiServiceActions | AllowedActions,
  SentinelApiServiceEvents
>;

/**
 * Constructor options for {@link SentinelApiService}.
 */
export type SentinelApiServiceOptions = {
  /** The messenger suited for this service. */
  messenger: SentinelApiServiceMessenger;

  /**
   * The `fetch` function to use for requests. Defaults to the global `fetch`.
   */
  fetch?: typeof fetch;

  /**
   * The Sentinel API environment to target (`dev`, `uat`, or `prod`).
   * Defaults to `prod`.
   */
  environment?: SentinelEnvironment;

  /**
   * Identifier for the calling client (for example `extension` or `mobile`),
   * sent as the `X-Client-Id` header.
   */
  clientId?: string;

  /**
   * Version of the calling client, sent as the `X-Client-Version` header when
   * provided.
   */
  clientVersion?: string;

  /** Configuration for the underlying TanStack Query client. */
  queryClientConfig?: QueryClientConfig;

  /**
   * Options to pass to `createServicePolicy`. Retries are disabled by default
   * (`maxRetries: 0`) to preserve the single-attempt behaviour of the clients
   * this service replaces; pass `maxRetries` here to opt in.
   */
  policyOptions?: CreateServicePolicyOptions;
};

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
 * A request to look up the state of a submitted smart transaction by UUID.
 */
export type SentinelSmartTransactionRequest = {
  /** The chain the transaction was submitted on. */
  chainId: Hex;

  /** The UUID returned by {@link SentinelRelaySubmitResponse}. */
  uuid: string;
};

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
 * Terminal and non-terminal statuses reported by the smart-transactions
 * endpoint.
 */
export enum SentinelSmartTransactionStatus {
  Pending = 'PENDING',
  Validated = 'VALIDATED',
  Failed = 'FAILED',
}

/**
 * A single smart-transaction entry returned by the `/smart-transactions/{uuid}`
 * endpoint.
 */
export type SentinelSmartTransaction = {
  /** The on-chain transaction hash, once available. */
  hash?: string;

  /**
   * The current status of the smart transaction. Compare against
   * {@link SentinelSmartTransactionStatus} values.
   */
  status: string;

  /**
   * The reason the transaction failed, if any. May be `null` when the API
   * explicitly reports no error reason.
   */
  errorReason?: string | null;
};

/**
 * The response from the `/smart-transactions/{uuid}` endpoint. Consumers
 * select the transaction(s) they care about from the `transactions` array
 * (typically the first entry).
 */
export type SentinelSmartTransactionResponse = {
  transactions: SentinelSmartTransaction[];
};
