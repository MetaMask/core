import type { AccountsControllerGetAccountByAddressAction } from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import type {
  ChainId,
  FeatureId,
  Quote,
  QuoteMetadata,
  QuoteResponse,
  MetaMetricsSwapsEventSource,
  SimulatedGasFeeLimits,
  TxData,
  TxFeeGasLimits,
  BridgeControllerTrackUnifiedSwapBridgeEventAction,
  BridgeControllerStopPollingForQuotesAction,
  BatchSellTradesResponse,
  BridgeControllerGetStateAction,
  InputPrimaryDenomination,
} from '@metamask/bridge-controller';
import type { KeyringControllerSignTypedMessageAction } from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
} from '@metamask/network-controller';
import type { AuthenticationControllerGetBearerTokenAction } from '@metamask/profile-sync-controller/auth';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type { SnapControllerHandleRequestAction } from '@metamask/snaps-controllers';
import type { Infer } from '@metamask/superstruct';
import type {
  TransactionControllerAddTransactionAction,
  TransactionControllerEstimateGasFeeAction,
  TransactionControllerGetStateAction,
  TransactionControllerIsAtomicBatchSupportedAction,
  TransactionControllerTransactionStatusUpdatedEvent,
  TransactionControllerTransactionSubmittedEvent,
  TransactionControllerUpdateTransactionAction,
  TransactionMeta,
  TransactionType,
} from '@metamask/transaction-controller';
import type { CaipAssetType } from '@metamask/utils';

import type { BridgeStatusControllerMethodActions } from './bridge-status-controller-method-action-types.js';
import { BRIDGE_STATUS_CONTROLLER_NAME } from './constants.js';
import { QuoteStatusState } from './quote-status-manager/constants.js';
import { StatusResponseSchema } from './utils/validators.js';

// All fields need to be types not interfaces, same with their children fields
// o/w you get a type error

export enum BridgeClientId {
  EXTENSION = 'extension',
  MOBILE = 'mobile',
}

export type FetchFunction = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<unknown>;

/**
 * These fields are specific to Solana transactions and can likely be infered from TransactionMeta
 *
 * @deprecated these should be removed eventually
 */
export type SolanaTransactionMeta = {
  isSolana: boolean;
  isBridgeTx: boolean;
};

export type StatusRequest = {
  bridgeId: string; // lifi, socket, squid
  srcTxHash?: string; // lifi, socket, squid, might be undefined for STX
  bridge: string; // lifi, socket, squid
  srcChainId: ChainId; // lifi, socket, squid
  destChainId: ChainId; // lifi, socket, squid
  quote?: Quote; // squid
  refuel?: boolean; // lifi
};

export type StatusRequestDto = Omit<
  StatusRequest,
  'quote' | 'srcChainId' | 'destChainId' | 'refuel'
> & {
  srcChainId: string; // lifi, socket, squid
  destChainId: string; // lifi, socket, squid
  requestId?: string;
  refuel?: string; // lifi
};

export type StatusRequestWithSrcTxHash = StatusRequest & {
  srcTxHash: string;
};

export enum BridgeId {
  HOP = 'hop',
  CELER = 'celer',
  CELERCIRCLE = 'celercircle',
  CONNEXT = 'connext',
  POLYGON = 'polygon',
  AVALANCHE = 'avalanche',
  MULTICHAIN = 'multichain',
  AXELAR = 'axelar',
  ACROSS = 'across',
  STARGATE = 'stargate',
  RELAY = 'relay',
  MAYAN = 'mayan',
}

export type StatusResponse = Infer<typeof StatusResponseSchema>;

export type RefuelStatusResponse = object & StatusResponse;

/**
 * This type ties together the quote, its tx params and the submitted txMeta.
 * Each trade/approval will have its own QuoteAndTxMetadata object.
 */
export type QuoteAndTxMetadata = {
  type: TransactionType;
  quoteResponse: QuoteResponse & QuoteMetadata;
  /**
   * The approval or trade object from the quote response
   */
  tx: TxData;
  assetsFiatValues?: { sending?: string; receiving?: string };
  /**
   * The simulated gas fee limits for the transaction provided by the bridge-api
   */
  txFee?: SimulatedGasFeeLimits | TxFeeGasLimits;
  /**
   * Transaction metadata from the TransactionController after submission
   */
  txMeta?: TransactionMeta;
};

export type BridgeHistoryItem = {
  txMetaId?: string; // Optional: not available pre-submission or on sync failure
  actionId?: string; // Only for non-batch EVM transactions
  /**
   * @deprecated the txMeta or orderUid should be used instead
   */
  originalTransactionId?: string; // Keep original transaction ID for intent transactions
  batchId?: string;
  /**
   * This is defined when the history item is for a batch sell transaction
   */
  batchSellData?: BatchSellTradesResponse;
  /**
   * This is defined when the history item corresponds to the 7702 batch's delegation tx.
   * It contains the list of quoteIds for the BatchSell quotes that are part of the 7702 batch.
   * Each quote can be retrieved from txHistory as `txHistory[quoteId]`.
   *
   * On single swaps/bridges this value is an empty array, or absent on history items
   * persisted before this field was introduced.
   */
  quoteIds?: string[];
  quote: Quote;
  /**
   * This is the the quote id used on single swaps/bridges. On batch sell, it is set
   * as the first item of `quoteIds`.
   *
   * This value is absent on history items persisted before this field was introduced.
   */
  quoteId?: string;
  reportedSubmittedTxHash?: string;
  status: StatusResponse;
  startTime: number; // timestamp in ms
  estimatedProcessingTimeInSeconds: number;
  slippagePercentage: number;
  completionTime?: number; // timestamp in ms
  pricingData?: {
    /**
     * The actual amount sent by user in non-atomic decimal form
     */
    amountSent: string;
    amountSentInUsd?: string;
    quotedGasInUsd?: string;
    quotedGasAmount?: string;
    quotedReturnInUsd?: string;
    quotedRefuelSrcAmountInUsd?: string;
    quotedRefuelDestAmountInUsd?: string;
  };
  initialDestAssetBalance?: string;
  targetContractAddress?: string;
  account: string;
  hasApprovalTx: boolean;
  approvalTxId?: string;
  featureId?: FeatureId;
  isStxEnabled?: boolean;
  /**
   * The location/entry point from which the user initiated the swap or bridge.
   * Used to attribute swaps to specific flows (e.g. Trending Explore).
   */
  location?: MetaMetricsSwapsEventSource;
  /**
   * Legacy A/B test metrics context (`ab_tests`) kept for backward compatibility.
   * Keys are test names, values are variant names (e.g. { token_details_layout: 'treatment' }).
   */
  abTests?: Record<string, string>;
  /**
   * New A/B test metrics context (`active_ab_tests`) that replaces `ab_tests`.
   * Kept separate so migration can run both payloads in parallel.
   * This field is an array of test objects.
   */
  activeAbTests?: { key: string; value: string }[];
  /**
   * Attempts tracking for exponential backoff on failed fetches.
   * We track the number of attempts and the last attempt time for each txMetaId that has failed at least once
   */
  attempts?: {
    counter: number;
    lastAttemptTime: number; // timestamp in ms
  };
  /**
   * Client-supplied security classification for the destination token at the
   * time the swap/bridge was submitted. Persisted so post-submit analytics
   * events (Completed, Failed, StatusValidationFailed) can include
   * `token_security_type_destination`. `null` when no security data was
   * available for the destination token.
   */
  tokenSecurityTypeDestination?: string | null;
  /**
   * The denomination shown as the primary source amount input when the
   * swap/bridge was submitted.
   */
  inputPrimaryDenomination?: InputPrimaryDenomination;
};

/**
 * @deprecated Use the separate action types instead (e.g.
 * `BridgeStatusControllerStartPollingForBridgeTxStatusAction`).
 */
export enum BridgeStatusAction {
  StartPollingForBridgeTxStatus = 'StartPollingForBridgeTxStatus',
  WipeBridgeStatus = 'WipeBridgeStatus',
  GetState = 'GetState',
  ResetState = 'ResetState',
  SubmitTx = 'SubmitTx',
  SubmitIntent = 'SubmitIntent',
  RestartPollingForFailedAttempts = 'RestartPollingForFailedAttempts',
  GetBridgeHistoryItemByTxMetaId = 'GetBridgeHistoryItemByTxMetaId',
}

export type TokenAmountValuesSerialized = {
  amount: string;
  valueInCurrency: string | null;
  usd: string | null;
};

export type QuoteMetadataSerialized = {
  gasFee: TokenAmountValuesSerialized;
  /**
   * The total network fee for the bridge transaction
   * estimatedGasFees + relayerFees
   */
  totalNetworkFee: TokenAmountValuesSerialized;
  /**
   * The total max network fee for the bridge transaction
   * maxGasFees + relayerFees
   */
  totalMaxNetworkFee: TokenAmountValuesSerialized;
  toTokenAmount: TokenAmountValuesSerialized;
  /**
   * The adjusted return for the bridge transaction
   * destTokenAmount - totalNetworkFee
   */
  adjustedReturn: Omit<TokenAmountValuesSerialized, 'amount'>;
  /**
   * The actual amount sent by user in non-atomic decimal form
   * srcTokenAmount + metabridgeFee
   */
  sentAmount: TokenAmountValuesSerialized;
  swapRate: string; // destTokenAmount / sentAmount
  /**
   * The cost of the bridge transaction
   * sentAmount - adjustedReturn
   */
  cost: Omit<TokenAmountValuesSerialized, 'amount'>;
};

export type StartPollingForBridgeTxStatusArgs = {
  bridgeTxMeta?: Pick<TransactionMeta, 'id' | 'hash' | 'batchId'>;
  actionId?: string;
  batchSellData?: BridgeHistoryItem['batchSellData'];
  quoteIds?: BridgeHistoryItem['quoteIds'];
  /**
   * @deprecated the txMeta or orderUid should be used instead
   */
  originalTransactionId?: string;
  quoteResponse: QuoteResponse & QuoteMetadata;
  startTime: BridgeHistoryItem['startTime'];
  slippagePercentage: BridgeHistoryItem['slippagePercentage'];
  initialDestAssetBalance?: BridgeHistoryItem['initialDestAssetBalance'];
  targetContractAddress?: BridgeHistoryItem['targetContractAddress'];
  approvalTxId?: BridgeHistoryItem['approvalTxId'];
  isStxEnabled?: BridgeHistoryItem['isStxEnabled'];
  location: MetaMetricsSwapsEventSource;
  // Legacy field for `ab_tests` metrics payload.
  abTests?: BridgeHistoryItem['abTests'];
  // New field for `active_ab_tests` metrics payload.
  activeAbTests?: BridgeHistoryItem['activeAbTests'];
  accountAddress: string;
  // Client-supplied destination token security classification, persisted on
  // the history item for post-submit analytics events.
  tokenSecurityTypeDestination?: BridgeHistoryItem['tokenSecurityTypeDestination'];
  // Primary denomination at submission time, persisted for post-submit analytics.
  inputPrimaryDenomination?: BridgeHistoryItem['inputPrimaryDenomination'];
};

/**
 * Chrome: The BigNumber values are automatically serialized to strings when sent to the background
 * Firefox: The BigNumber values are not serialized to strings when sent to the background,
 * so we force the ui to do it manually, by using StartPollingForBridgeTxStatusArgsSerialized type on the startPollingForBridgeTxStatus action
 */
export type StartPollingForBridgeTxStatusArgsSerialized = Omit<
  StartPollingForBridgeTxStatusArgs,
  'quoteResponse'
> & {
  quoteResponse: QuoteResponse & QuoteMetadata;
};

export type SourceChainTxMetaId = string;

export type QuoteStatusPersistEntry = {
  quoteId: string;
  srcTxHash: string;
  status: QuoteStatusState;
  createdAt: number;
  lastAttemptAt: number;
  txMetaId?: string;
};

export type BridgeStatusControllerState = {
  txHistory: Record<SourceChainTxMetaId, BridgeHistoryItem>;
  quoteUpdateStatusStore: Record<string, QuoteStatusPersistEntry>;
};

// Actions
export type BridgeStatusControllerGetStateAction = ControllerGetStateAction<
  typeof BRIDGE_STATUS_CONTROLLER_NAME,
  BridgeStatusControllerState
>;

export type BridgeStatusControllerActions =
  | BridgeStatusControllerGetStateAction
  | BridgeStatusControllerMethodActions;

// Events
export type BridgeStatusControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof BRIDGE_STATUS_CONTROLLER_NAME,
  BridgeStatusControllerState
>;
/**
 * This event is published when the destination bridge transaction is completed
 * The payload is the asset received on the destination chain
 */
export type BridgeStatusControllerDestinationTransactionCompletedEvent = {
  type: 'BridgeStatusController:destinationTransactionCompleted';
  payload: [CaipAssetType];
};

export type BridgeStatusControllerEvents =
  | BridgeStatusControllerStateChangeEvent
  | BridgeStatusControllerDestinationTransactionCompletedEvent;

/**
 * The external actions available to the BridgeStatusController.
 */
type AllowedActions =
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | RemoteFeatureFlagControllerGetStateAction
  | SnapControllerHandleRequestAction
  | TransactionControllerGetStateAction
  | TransactionControllerUpdateTransactionAction
  | TransactionControllerAddTransactionAction
  | TransactionControllerEstimateGasFeeAction
  | TransactionControllerIsAtomicBatchSupportedAction
  | BridgeControllerTrackUnifiedSwapBridgeEventAction
  | BridgeControllerStopPollingForQuotesAction
  | BridgeControllerGetStateAction
  | AccountsControllerGetAccountByAddressAction
  | AuthenticationControllerGetBearerTokenAction
  | KeyringControllerSignTypedMessageAction;

/**
 * The external events available to the BridgeStatusController.
 */
type AllowedEvents =
  | TransactionControllerTransactionStatusUpdatedEvent
  | TransactionControllerTransactionSubmittedEvent;

/**
 * The messenger for the BridgeStatusController.
 */
export type BridgeStatusControllerMessenger = Messenger<
  typeof BRIDGE_STATUS_CONTROLLER_NAME,
  BridgeStatusControllerActions | AllowedActions,
  BridgeStatusControllerEvents | AllowedEvents
>;
