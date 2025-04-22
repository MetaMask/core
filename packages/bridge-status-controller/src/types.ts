import type {
  AccountsControllerGetAccountByAddressAction,
  AccountsControllerGetSelectedMultichainAccountAction,
} from '@metamask/accounts-controller';
import type { TokensControllerAddDetectedTokensAction } from '@metamask/assets-controllers';
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
import type { HandleSnapRequest } from '@metamask/snaps-controllers';
import type {
  TransactionControllerGetStateAction,
  TransactionMeta,
} from '@metamask/transaction-controller';

import type { BridgeStatusController } from './bridge-status-controller';
import type { BRIDGE_STATUS_CONTROLLER_NAME } from './constants';

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

export enum StatusTypes {
  UNKNOWN = 'UNKNOWN',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
  COMPLETE = 'COMPLETE',
}

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

export type Asset = {
  chainId: ChainId;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  icon?: string | null;
};

export type SrcChainStatus = {
  chainId: ChainId;
  /**
   * The txHash of the transaction on the source chain.
   * This might be undefined for smart transactions (STX)
   */
  txHash?: string;
  /**
   * The atomic amount of the token sent minus fees on the source chain
   */
  amount?: string;
  token?: Record<string, never> | Asset;
};

export type DestChainStatus = {
  chainId: ChainId;
  txHash?: string;
  /**
   * The atomic amount of the token received on the destination chain
   */
  amount?: string;
  token?: Record<string, never> | Asset;
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

export enum FeeType {
  METABRIDGE = 'metabridge',
  REFUEL = 'refuel',
}

export type FeeData = {
  amount: string;
  asset: Asset;
};

export type Protocol = {
  displayName?: string;
  icon?: string;
  name?: string; // for legacy quotes
};

export enum ActionTypes {
  BRIDGE = 'bridge',
  SWAP = 'swap',
  REFUEL = 'refuel',
}

export type Step = {
  action: ActionTypes;
  srcChainId: ChainId;
  destChainId?: ChainId;
  srcAsset: Asset;
  destAsset: Asset;
  srcAmount: string;
  destAmount: string;
  protocol: Protocol;
};

export type StatusResponse = {
  status: StatusTypes;
  srcChain: SrcChainStatus;
  destChain?: DestChainStatus;
  bridge?: BridgeId;
  isExpectedToken?: boolean;
  isUnrecognizedRouterAddress?: boolean;
  refuel?: RefuelStatusResponse;
};

export type RefuelStatusResponse = object & StatusResponse;

export type RefuelData = object & Step;

export type BridgeHistoryItem = {
  txMetaId: string; // Need this to handle STX that might not have a txHash immediately
  quote: Quote;
  status: StatusResponse;
  startTime?: number; // timestamp in ms
  estimatedProcessingTimeInSeconds: number;
  slippagePercentage: number;
  completionTime?: number; // timestamp in ms
  pricingData?: {
    /**
     * From QuoteMetadata.sentAmount.amount, the actual amount sent by user in non-atomic decimal form
     */
    amountSent: string;
    amountSentInUsd?: string;
    quotedGasInUsd?: string; // from QuoteMetadata.gasFee.usd
    quotedReturnInUsd?: string; // from QuoteMetadata.toTokenAmount.usd
    quotedRefuelSrcAmountInUsd?: string;
    quotedRefuelDestAmountInUsd?: string;
  };
  initialDestAssetBalance?: string;
  targetContractAddress?: string;
  account: string;
  hasApprovalTx: boolean;
  approvalTxId?: string;
};

export enum BridgeStatusAction {
  START_POLLING_FOR_BRIDGE_TX_STATUS = 'startPollingForBridgeTxStatus',
  WIPE_BRIDGE_STATUS = 'wipeBridgeStatus',
  GET_STATE = 'getState',
  RESET_STATE = 'resetState',
  SUBMIT_TX = 'submitTx',
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

export type BridgeStatusControllerActions =
  | BridgeStatusControllerStartPollingForBridgeTxStatusAction
  | BridgeStatusControllerWipeBridgeStatusAction
  | BridgeStatusControllerResetStateAction
  | BridgeStatusControllerGetStateAction
  | BridgeStatusControllerSubmitTxAction;

// Events
export type BridgeStatusControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof BRIDGE_STATUS_CONTROLLER_NAME,
  BridgeStatusControllerState
>;

export type BridgeStatusControllerBridgeTransactionCompleteEvent = {
  type: `${typeof BRIDGE_STATUS_CONTROLLER_NAME}:bridgeTransactionComplete`;
  payload: [{ bridgeHistoryItem: BridgeHistoryItem }];
};

export type BridgeStatusControllerBridgeTransactionFailedEvent = {
  type: `${typeof BRIDGE_STATUS_CONTROLLER_NAME}:bridgeTransactionFailed`;
  payload: [{ bridgeHistoryItem: BridgeHistoryItem }];
};

export type BridgeStatusControllerEvents =
  | BridgeStatusControllerStateChangeEvent
  | BridgeStatusControllerBridgeTransactionCompleteEvent
  | BridgeStatusControllerBridgeTransactionFailedEvent;

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
  | GetGasFeeState
  | AccountsControllerGetAccountByAddressAction
  | TokensControllerAddDetectedTokensAction;

/**
 * The external events available to the BridgeStatusController.
 */
type AllowedEvents = never;

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
