import type { AccountsControllerGetAccountByAddressAction } from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import type {
  BridgeBackgroundAction,
  BridgeControllerAction,
  ChainId,
  FeatureId,
  Quote,
  QuoteMetadata,
  QuoteResponse,
  MetaMetricsSwapsEventSource,
} from '@metamask/bridge-controller';
import type { GetGasFeeState } from '@metamask/gas-fee-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
} from '@metamask/network-controller';
import type { AuthenticationControllerGetBearerTokenAction } from '@metamask/profile-sync-controller/auth';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';
import type { Infer } from '@metamask/superstruct';
import type {
  TransactionControllerGetStateAction,
  TransactionControllerTransactionConfirmedEvent,
  TransactionControllerTransactionFailedEvent,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { CaipAssetType } from '@metamask/utils';

import type { BridgeStatusController } from './bridge-status-controller';
import { BRIDGE_STATUS_CONTROLLER_NAME } from './constants';
import type { StatusResponseSchema } from './utils/validators';

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

export type BridgeHistoryItem = {
  txMetaId?: string; // Optional: not available pre-submission or on sync failure
  actionId?: string; // Only for non-batch EVM transactions
  originalTransactionId?: string; // Keep original transaction ID for intent transactions
  batchId?: string;
  quote: Quote;
  status: StatusResponse;
  startTime?: number; // timestamp in ms
  estimatedProcessingTimeInSeconds: number;
  slippagePercentage: number;
  completionTime?: number; // timestamp in ms
  pricingData?: {
    /**
     * The actual amount sent by user in non-atomic decimal form
     */
    amountSent: QuoteMetadata['sentAmount']['amount'];
    amountSentInUsd?: QuoteMetadata['sentAmount']['usd'];
    quotedGasInUsd?: QuoteMetadata['gasFee']['effective']['usd'];
    quotedGasAmount?: QuoteMetadata['gasFee']['effective']['amount'];
    quotedReturnInUsd?: QuoteMetadata['toTokenAmount']['usd'];
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
   * A/B test context to attribute swap/bridge events to specific experiments.
   * Keys are test names, values are variant names (e.g. { token_details_layout: 'treatment' }).
   */
  abTests?: Record<string, string>;
  /**
   * Attempts tracking for exponential backoff on failed fetches.
   * We track the number of attempts and the last attempt time for each txMetaId that has failed at least once
   */
  attempts?: {
    counter: number;
    lastAttemptTime: number; // timestamp in ms
  };
};

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
  bridgeTxMeta?: TransactionMeta;
  statusRequest: StatusRequest;
  quoteResponse: QuoteResponse & QuoteMetadata;
  startTime?: BridgeHistoryItem['startTime'];
  slippagePercentage: BridgeHistoryItem['slippagePercentage'];
  initialDestAssetBalance?: BridgeHistoryItem['initialDestAssetBalance'];
  targetContractAddress?: BridgeHistoryItem['targetContractAddress'];
  approvalTxId?: BridgeHistoryItem['approvalTxId'];
  isStxEnabled?: BridgeHistoryItem['isStxEnabled'];
  location?: BridgeHistoryItem['location'];
  abTests?: BridgeHistoryItem['abTests'];
  accountAddress: string;
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
  quoteResponse: QuoteResponse & Partial<QuoteMetadata>;
};

export type SourceChainTxMetaId = string;

export type BridgeStatusControllerState = {
  txHistory: Record<SourceChainTxMetaId, BridgeHistoryItem>;
};

// Actions
type BridgeStatusControllerAction<
  FunctionName extends keyof BridgeStatusController,
> = {
  type: `${typeof BRIDGE_STATUS_CONTROLLER_NAME}:${FunctionName}`;
  handler: BridgeStatusController[FunctionName];
};

export type BridgeStatusControllerGetStateAction = ControllerGetStateAction<
  typeof BRIDGE_STATUS_CONTROLLER_NAME,
  BridgeStatusControllerState
>;

// Maps to BridgeController function names
export type BridgeStatusControllerStartPollingForBridgeTxStatusAction =
  BridgeStatusControllerAction<'startPollingForBridgeTxStatus'>;

export type BridgeStatusControllerWipeBridgeStatusAction =
  BridgeStatusControllerAction<'wipeBridgeStatus'>;

export type BridgeStatusControllerResetStateAction =
  BridgeStatusControllerAction<'resetState'>;

export type BridgeStatusControllerSubmitTxAction =
  BridgeStatusControllerAction<'submitTx'>;

export type BridgeStatusControllerSubmitIntentAction =
  BridgeStatusControllerAction<'submitIntent'>;

export type BridgeStatusControllerRestartPollingForFailedAttemptsAction =
  BridgeStatusControllerAction<'restartPollingForFailedAttempts'>;

export type BridgeStatusControllerGetBridgeHistoryItemByTxMetaIdAction =
  BridgeStatusControllerAction<'getBridgeHistoryItemByTxMetaId'>;

export type BridgeStatusControllerActions =
  | BridgeStatusControllerStartPollingForBridgeTxStatusAction
  | BridgeStatusControllerWipeBridgeStatusAction
  | BridgeStatusControllerResetStateAction
  | BridgeStatusControllerGetStateAction
  | BridgeStatusControllerSubmitTxAction
  | BridgeStatusControllerSubmitIntentAction
  | BridgeStatusControllerRestartPollingForFailedAttemptsAction
  | BridgeStatusControllerGetBridgeHistoryItemByTxMetaIdAction;

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
  | HandleSnapRequest
  | TransactionControllerGetStateAction
  | BridgeControllerAction<BridgeBackgroundAction.TRACK_METAMETRICS_EVENT>
  | BridgeControllerAction<BridgeBackgroundAction.STOP_POLLING_FOR_QUOTES>
  | GetGasFeeState
  | AccountsControllerGetAccountByAddressAction
  | RemoteFeatureFlagControllerGetStateAction
  | AuthenticationControllerGetBearerTokenAction;

/**
 * The external events available to the BridgeStatusController.
 */
type AllowedEvents =
  | TransactionControllerTransactionFailedEvent
  | TransactionControllerTransactionConfirmedEvent;

/**
 * The messenger for the BridgeStatusController.
 */
export type BridgeStatusControllerMessenger = Messenger<
  typeof BRIDGE_STATUS_CONTROLLER_NAME,
  BridgeStatusControllerActions | AllowedActions,
  BridgeStatusControllerEvents | AllowedEvents
>;
