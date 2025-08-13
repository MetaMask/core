import type {
  AccountsControllerGetAccountByAddressAction,
  AccountsControllerGetSelectedMultichainAccountAction,
} from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
} from '@metamask/base-controller';
import type {
  BridgeBackgroundAction,
  BridgeControllerAction,
  ChainId,
  Quote,
  QuoteMetadata,
  QuoteResponse,
  TxData,
} from '@metamask/bridge-controller';
import type { GetGasFeeState } from '@metamask/gas-fee-controller';
import type {
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
} from '@metamask/network-controller';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';
import type { Infer } from '@metamask/superstruct';
import type {
  TransactionControllerGetStateAction,
  TransactionControllerTransactionConfirmedEvent,
  TransactionControllerTransactionFailedEvent,
  TransactionMeta,
} from '@metamask/transaction-controller';

import type { BridgeStatusController } from './bridge-status-controller';
import type { BRIDGE_STATUS_CONTROLLER_NAME } from './constants';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;

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
  txMetaId: string; // Need this to handle STX that might not have a txHash immediately
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
    quotedGasInUsd?:
      | QuoteMetadata['gasFee']['effective']['usd']
      | QuoteMetadata['gasFee']['total']['usd'];
    quotedReturnInUsd?: QuoteMetadata['toTokenAmount']['usd'];
    quotedRefuelSrcAmountInUsd?: string;
    quotedRefuelDestAmountInUsd?: string;
  };
  initialDestAssetBalance?: string;
  targetContractAddress?: string;
  account: string;
  hasApprovalTx: boolean;
  approvalTxId?: string;
  isStxEnabled?: boolean;
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
  START_POLLING_FOR_BRIDGE_TX_STATUS = 'startPollingForBridgeTxStatus',
  WIPE_BRIDGE_STATUS = 'wipeBridgeStatus',
  GET_STATE = 'getState',
  RESET_STATE = 'resetState',
  SUBMIT_TX = 'submitTx',
  RESTART_POLLING_FOR_FAILED_ATTEMPTS = 'restartPollingForFailedAttempts',
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
  bridgeTxMeta: TransactionMeta;
  statusRequest: StatusRequest;
  quoteResponse: QuoteResponse & QuoteMetadata;
  startTime?: BridgeHistoryItem['startTime'];
  slippagePercentage: BridgeHistoryItem['slippagePercentage'];
  initialDestAssetBalance?: BridgeHistoryItem['initialDestAssetBalance'];
  targetContractAddress?: BridgeHistoryItem['targetContractAddress'];
  approvalTxId?: BridgeHistoryItem['approvalTxId'];
  isStxEnabled?: BridgeHistoryItem['isStxEnabled'];
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
  quoteResponse: QuoteResponse<string | TxData> & QuoteMetadata;
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
  BridgeStatusControllerAction<BridgeStatusAction.START_POLLING_FOR_BRIDGE_TX_STATUS>;

export type BridgeStatusControllerWipeBridgeStatusAction =
  BridgeStatusControllerAction<BridgeStatusAction.WIPE_BRIDGE_STATUS>;

export type BridgeStatusControllerResetStateAction =
  BridgeStatusControllerAction<BridgeStatusAction.RESET_STATE>;

export type BridgeStatusControllerSubmitTxAction =
  BridgeStatusControllerAction<BridgeStatusAction.SUBMIT_TX>;

export type BridgeStatusControllerRestartPollingForFailedAttemptsAction =
  BridgeStatusControllerAction<BridgeStatusAction.RESTART_POLLING_FOR_FAILED_ATTEMPTS>;

export type BridgeStatusControllerActions =
  | BridgeStatusControllerStartPollingForBridgeTxStatusAction
  | BridgeStatusControllerWipeBridgeStatusAction
  | BridgeStatusControllerResetStateAction
  | BridgeStatusControllerGetStateAction
  | BridgeStatusControllerSubmitTxAction
  | BridgeStatusControllerRestartPollingForFailedAttemptsAction;

// Events
export type BridgeStatusControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof BRIDGE_STATUS_CONTROLLER_NAME,
  BridgeStatusControllerState
>;

export type BridgeStatusControllerEvents =
  BridgeStatusControllerStateChangeEvent;

/**
 * The external actions available to the BridgeStatusController.
 */
type AllowedActions =
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | AccountsControllerGetSelectedMultichainAccountAction
  | HandleSnapRequest
  | TransactionControllerGetStateAction
  | BridgeControllerAction<BridgeBackgroundAction.GET_BRIDGE_ERC20_ALLOWANCE>
  | BridgeControllerAction<BridgeBackgroundAction.TRACK_METAMETRICS_EVENT>
  | BridgeControllerAction<BridgeBackgroundAction.STOP_POLLING_FOR_QUOTES>
  | GetGasFeeState
  | AccountsControllerGetAccountByAddressAction
  | RemoteFeatureFlagControllerGetStateAction;

/**
 * The external events available to the BridgeStatusController.
 */
type AllowedEvents =
  | TransactionControllerTransactionFailedEvent
  | TransactionControllerTransactionConfirmedEvent;

/**
 * The messenger for the BridgeStatusController.
 */
export type BridgeStatusControllerMessenger = RestrictedMessenger<
  typeof BRIDGE_STATUS_CONTROLLER_NAME,
  BridgeStatusControllerActions | AllowedActions,
  BridgeStatusControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;
