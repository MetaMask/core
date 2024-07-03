import { Hardfork, Common, type ChainConfig } from '@ethereumjs/common';
import type { TypedTransaction } from '@ethereumjs/tx';
import { TransactionFactory } from '@ethereumjs/tx';
import { bufferToHex } from '@ethereumjs/util';
import type { AccountsControllerGetSelectedAccountAction } from '@metamask/accounts-controller';
import type {
  AcceptResultCallbacks,
  AddApprovalRequest,
  AddResult,
} from '@metamask/approval-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import {
  query,
  ApprovalType,
  ORIGIN_METAMASK,
  convertHexToDecimal,
  isInfuraNetworkType,
} from '@metamask/controller-utils';
import EthQuery from '@metamask/eth-query';
import type {
  FetchGasFeeEstimateOptions,
  GasFeeState,
} from '@metamask/gas-fee-controller';
import type {
  BlockTracker,
  NetworkClientId,
  NetworkController,
  NetworkControllerStateChangeEvent,
  NetworkState,
  Provider,
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetNetworkClientByIdAction,
} from '@metamask/network-controller';
import { NetworkClientType } from '@metamask/network-controller';
import type {
  NonceLock,
  Transaction as NonceTrackerTransaction,
} from '@metamask/nonce-tracker';
import { NonceTracker } from '@metamask/nonce-tracker';
import { errorCodes, rpcErrors, providerErrors } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';
import { add0x } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import { MethodRegistry } from 'eth-method-registry';
// This package purposefully relies on Node's EventEmitter module.
// eslint-disable-next-line import/no-nodejs-modules
import { EventEmitter } from 'events';
import { cloneDeep, mapValues, merge, pickBy, sortBy, isEqual } from 'lodash';
import { v1 as random } from 'uuid';

import { DefaultGasFeeFlow } from './gas-flows/DefaultGasFeeFlow';
import { LineaGasFeeFlow } from './gas-flows/LineaGasFeeFlow';
import { OptimismLayer1GasFeeFlow } from './gas-flows/OptimismLayer1GasFeeFlow';
import { ScrollLayer1GasFeeFlow } from './gas-flows/ScrollLayer1GasFeeFlow';
import { TestGasFeeFlow } from './gas-flows/TestGasFeeFlow';
import { EtherscanRemoteTransactionSource } from './helpers/EtherscanRemoteTransactionSource';
import { GasFeePoller } from './helpers/GasFeePoller';
import type { IncomingTransactionOptions } from './helpers/IncomingTransactionHelper';
import { IncomingTransactionHelper } from './helpers/IncomingTransactionHelper';
import { MultichainTrackingHelper } from './helpers/MultichainTrackingHelper';
import { PendingTransactionTracker } from './helpers/PendingTransactionTracker';
import { projectLogger as log } from './logger';
import type {
  DappSuggestedGasFees,
  Layer1GasFeeFlow,
  SavedGasFees,
  SecurityProviderRequest,
  SendFlowHistoryEntry,
  TransactionParams,
  TransactionMeta,
  TransactionReceipt,
  WalletDevice,
  SecurityAlertResponse,
  GasFeeFlow,
  SimulationData,
  GasFeeEstimates,
  GasFeeFlowResponse,
} from './types';
import {
  TransactionEnvelopeType,
  TransactionType,
  TransactionStatus,
  SimulationErrorCode,
} from './types';
import { validateConfirmedExternalTransaction } from './utils/external-transactions';
import { addGasBuffer, estimateGas, updateGas } from './utils/gas';
import { updateGasFees } from './utils/gas-fees';
import { getGasFeeFlow } from './utils/gas-flow';
import {
  addInitialHistorySnapshot,
  updateTransactionHistory,
} from './utils/history';
import {
  getTransactionLayer1GasFee,
  updateTransactionLayer1GasFee,
} from './utils/layer1-gas-fee-flow';
import {
  getAndFormatTransactionsForNonceTracker,
  getNextNonce,
} from './utils/nonce';
import { getSimulationData } from './utils/simulation';
import {
  updatePostTransactionBalance,
  updateSwapsTransaction,
} from './utils/swaps';
import { determineTransactionType } from './utils/transaction-type';
import {
  getIncreasedPriceFromExisting,
  normalizeTransactionParams,
  isEIP1559Transaction,
  isFeeMarketEIP1559Values,
  isGasPriceValue,
  validateGasValues,
  validateIfTransactionUnapproved,
  validateMinimumIncrease,
  normalizeTxError,
  normalizeGasFeeValues,
} from './utils/utils';
import {
  validateTransactionOrigin,
  validateTxParams,
} from './utils/validation';

/**
 * Metadata for the TransactionController state, describing how to "anonymize"
 * the state and which parts should be persisted.
 */
const metadata = {
  transactions: {
    persist: true,
    anonymous: false,
  },
  methodData: {
    persist: true,
    anonymous: false,
  },
  lastFetchedBlockNumbers: {
    persist: true,
    anonymous: false,
  },
};

export const HARDFORK = Hardfork.London;

/**
 * Object with new transaction's meta and a promise resolving to the
 * transaction hash if successful.
 *
 * @property result - Promise resolving to a new transaction hash
 * @property transactionMeta - Meta information about this new transaction
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface Result {
  result: Promise<string>;
  transactionMeta: TransactionMeta;
}

// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface GasPriceValue {
  gasPrice: string;
}

// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface FeeMarketEIP1559Values {
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

/**
 * Method data registry object
 *
 * @property registryMethod - Registry method raw string
 * @property parsedRegistryMethod - Registry method object, containing name and method arguments
 */
export type MethodData = {
  registryMethod: string;
  parsedRegistryMethod:
    | {
        name: string;
        args: { type: string }[];
      }
    | {
        // We're using `any` instead of `undefined` for compatibility with `Json`
        // TODO: Correct this type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        name?: any;
        // We're using `any` instead of `undefined` for compatibility with `Json`
        // TODO: Correct this type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args?: any;
      };
};

/**
 * Transaction controller state
 *
 * @property transactions - A list of TransactionMeta objects
 * @property methodData - Object containing all known method data information
 * @property lastFetchedBlockNumbers - Last fetched block numbers.
 */
export type TransactionControllerState = {
  transactions: TransactionMeta[];
  methodData: Record<string, MethodData>;
  lastFetchedBlockNumbers: { [key: string]: number };
};

/**
 * Multiplier used to determine a transaction's increased gas fee during cancellation
 */
export const CANCEL_RATE = 1.1;

/**
 * Multiplier used to determine a transaction's increased gas fee during speed up
 */
export const SPEED_UP_RATE = 1.1;

/**
 * Represents the `TransactionController:getState` action.
 */
export type TransactionControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  TransactionControllerState
>;

/**
 * The internal actions available to the TransactionController.
 */
export type TransactionControllerActions = TransactionControllerGetStateAction;

/**
 * Configuration options for the PendingTransactionTracker
 *
 * @property isResubmitEnabled - Whether transaction publishing is automatically retried.
 */
export type PendingTransactionOptions = {
  isResubmitEnabled?: () => boolean;
};

/**
 * TransactionController constructor options.
 *
 * @property blockTracker - The block tracker used to poll for new blocks data.
 * @property disableHistory - Whether to disable storing history in transaction metadata.
 * @property disableSendFlowHistory - Explicitly disable transaction metadata history.
 * @property disableSwaps - Whether to disable additional processing on swaps transactions.
 * @property getCurrentAccountEIP1559Compatibility - Whether or not the account supports EIP-1559.
 * @property getCurrentNetworkEIP1559Compatibility - Whether or not the network supports EIP-1559.
 * @property getExternalPendingTransactions - Callback to retrieve pending transactions from external sources.
 * @property getGasFeeEstimates - Callback to retrieve gas fee estimates.
 * @property getNetworkClientRegistry - Gets the network client registry.
 * @property getNetworkState - Gets the state of the network controller.
 * @property getPermittedAccounts - Get accounts that a given origin has permissions for.
 * @property getSavedGasFees - Gets the saved gas fee config.
 * @property getSelectedAddress - Gets the address of the currently selected account.
 * @property incomingTransactions - Configuration options for incoming transaction support.
 * @property isMultichainEnabled - Enable multichain support.
 * @property isSimulationEnabled - Whether new transactions will be automatically simulated.
 * @property messenger - The controller messenger.
 * @property onNetworkStateChange - Allows subscribing to network controller state changes.
 * @property pendingTransactions - Configuration options for pending transaction support.
 * @property provider - The provider used to create the underlying EthQuery instance.
 * @property securityProviderRequest - A function for verifying a transaction, whether it is malicious or not.
 * @property sign - Function used to sign transactions.
 * @property state - Initial state to set on this controller.
 * @property transactionHistoryLimit - Transaction history limit.
 * @property hooks - The controller hooks.
 * @property hooks.afterSign - Additional logic to execute after signing a transaction. Return false to not change the status to signed.
 * @property hooks.beforeApproveOnInit - Additional logic to execute before starting an approval flow for a transaction during initialization. Return false to skip the transaction.
 * @property hooks.beforeCheckPendingTransaction - Additional logic to execute before checking pending transactions. Return false to prevent the broadcast of the transaction.
 * @property hooks.beforePublish - Additional logic to execute before publishing a transaction. Return false to prevent the broadcast of the transaction.
 * @property hooks.getAdditionalSignArguments - Returns additional arguments required to sign a transaction.
 * @property hooks.publish - Alternate logic to publish a transaction.
 */
export type TransactionControllerOptions = {
  blockTracker: BlockTracker;
  disableHistory: boolean;
  disableSendFlowHistory: boolean;
  disableSwaps: boolean;
  getCurrentAccountEIP1559Compatibility?: () => Promise<boolean>;
  getCurrentNetworkEIP1559Compatibility: () => Promise<boolean>;
  getExternalPendingTransactions?: (
    address: string,
    chainId?: string,
  ) => NonceTrackerTransaction[];
  getGasFeeEstimates?: (
    options: FetchGasFeeEstimateOptions,
  ) => Promise<GasFeeState>;
  getNetworkClientRegistry: NetworkController['getNetworkClientRegistry'];
  getNetworkState: () => NetworkState;
  getPermittedAccounts: (origin?: string) => Promise<string[]>;
  getSavedGasFees?: (chainId: Hex) => SavedGasFees | undefined;
  incomingTransactions?: IncomingTransactionOptions;
  isMultichainEnabled: boolean;
  isSimulationEnabled?: () => boolean;
  messenger: TransactionControllerMessenger;
  onNetworkStateChange: (listener: (state: NetworkState) => void) => void;
  pendingTransactions?: PendingTransactionOptions;
  provider: Provider;
  securityProviderRequest?: SecurityProviderRequest;
  sign?: (
    transaction: TypedTransaction,
    from: string,
    transactionMeta?: TransactionMeta,
  ) => Promise<TypedTransaction>;
  state?: Partial<TransactionControllerState>;
  testGasFeeFlows?: boolean;
  transactionHistoryLimit: number;
  hooks: {
    afterSign?: (
      transactionMeta: TransactionMeta,
      signedTx: TypedTransaction,
    ) => boolean;
    beforeApproveOnInit?: (transactionMeta: TransactionMeta) => boolean;
    beforeCheckPendingTransaction?: (
      transactionMeta: TransactionMeta,
    ) => boolean;
    beforePublish?: (transactionMeta: TransactionMeta) => boolean;
    getAdditionalSignArguments?: (
      transactionMeta: TransactionMeta,
    ) => (TransactionMeta | undefined)[];
    publish?: (
      transactionMeta: TransactionMeta,
    ) => Promise<{ transactionHash: string }>;
  };
};

/**
 * The name of the {@link TransactionController}.
 */
const controllerName = 'TransactionController';

/**
 * The external actions available to the {@link TransactionController}.
 */
export type AllowedActions =
  | AddApprovalRequest
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | NetworkControllerGetNetworkClientByIdAction
  | AccountsControllerGetSelectedAccountAction;

/**
 * The external events available to the {@link TransactionController}.
 */
export type AllowedEvents = NetworkControllerStateChangeEvent;

/**
 * Represents the `TransactionController:stateChange` event.
 */
export type TransactionControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  TransactionControllerState
>;

/**
 * Represents the `TransactionController:incomingTransactionBlockReceived` event.
 */
export type TransactionControllerIncomingTransactionBlockReceivedEvent = {
  type: `${typeof controllerName}:incomingTransactionBlockReceived`;
  payload: [blockNumber: number];
};

/**
 * Represents the `TransactionController:postTransactionBalanceUpdated` event.
 */
export type TransactionControllerPostTransactionBalanceUpdatedEvent = {
  type: `${typeof controllerName}:postTransactionBalanceUpdated`;
  payload: [
    {
      transactionMeta: TransactionMeta;
      approvalTransactionMeta?: TransactionMeta;
    },
  ];
};

/**
 * Represents the `TransactionController:speedUpTransactionAdded` event.
 */
export type TransactionControllerSpeedupTransactionAddedEvent = {
  type: `${typeof controllerName}:speedupTransactionAdded`;
  payload: [transactionMeta: TransactionMeta];
};

/**
 * Represents the `TransactionController:transactionApproved` event.
 */
export type TransactionControllerTransactionApprovedEvent = {
  type: `${typeof controllerName}:transactionApproved`;
  payload: [
    {
      transactionMeta: TransactionMeta;
      actionId?: string;
    },
  ];
};

/**
 * Represents the `TransactionController:transactionConfirmed` event.
 */
export type TransactionControllerTransactionConfirmedEvent = {
  type: `${typeof controllerName}:transactionConfirmed`;
  payload: [transactionMeta: TransactionMeta];
};

/**
 * Represents the `TransactionController:transactionDropped` event.
 */
export type TransactionControllerTransactionDroppedEvent = {
  type: `${typeof controllerName}:transactionDropped`;
  payload: [{ transactionMeta: TransactionMeta }];
};

/**
 * Represents the `TransactionController:transactionFailed` event.
 */
export type TransactionControllerTransactionFailedEvent = {
  type: `${typeof controllerName}:transactionFailed`;
  payload: [
    {
      actionId?: string;
      error: string;
      transactionMeta: TransactionMeta;
    },
  ];
};

/**
 * Represents the `TransactionController:transactionFinished` event.
 */
export type TransactionControllerTransactionFinishedEvent = {
  type: `${typeof controllerName}:transactionFinished`;
  payload: [transactionMeta: TransactionMeta];
};

/**
 * Represents the `TransactionController:transactionNewSwapApproval` event.
 */
export type TransactionControllerTransactionNewSwapApprovalEvent = {
  type: `${typeof controllerName}:transactionNewSwapApproval`;
  payload: [{ transactionMeta: TransactionMeta }];
};

/**
 * Represents the `TransactionController:transactionNewSwap` event.
 */
export type TransactionControllerTransactionNewSwapEvent = {
  type: `${typeof controllerName}:transactionNewSwap`;
  payload: [{ transactionMeta: TransactionMeta }];
};

/**
 * Represents the `TransactionController:transactionNewSwapApproval` event.
 */
export type TransactionControllerTransactionNewSwapAndSendEvent = {
  type: `${typeof controllerName}:transactionNewSwapAndSend`;
  payload: [{ transactionMeta: TransactionMeta }];
};

/**
 * Represents the `TransactionController:transactionPublishingSkipped` event.
 */
export type TransactionControllerTransactionPublishingSkipped = {
  type: `${typeof controllerName}:transactionPublishingSkipped`;
  payload: [transactionMeta: TransactionMeta];
};

/**
 * Represents the `TransactionController:transactionRejected` event.
 */
export type TransactionControllerTransactionRejectedEvent = {
  type: `${typeof controllerName}:transactionRejected`;
  payload: [
    {
      transactionMeta: TransactionMeta;
      actionId?: string;
    },
  ];
};

/**
 * Represents the `TransactionController:transactionStatusUpdated` event.
 */
export type TransactionControllerTransactionStatusUpdatedEvent = {
  type: `${typeof controllerName}:transactionStatusUpdated`;
  payload: [
    {
      transactionMeta: TransactionMeta;
    },
  ];
};

/**
 * Represents the `TransactionController:transactionSubmitted` event.
 */
export type TransactionControllerTransactionSubmittedEvent = {
  type: `${typeof controllerName}:transactionSubmitted`;
  payload: [
    {
      transactionMeta: TransactionMeta;
      actionId?: string;
    },
  ];
};

/**
 * Represents the `TransactionController:unapprovedTransactionAdded` event.
 */
export type TransactionControllerUnapprovedTransactionAddedEvent = {
  type: `${typeof controllerName}:unapprovedTransactionAdded`;
  payload: [transactionMeta: TransactionMeta];
};

/**
 * The internal events available to the {@link TransactionController}.
 */
export type TransactionControllerEvents =
  | TransactionControllerIncomingTransactionBlockReceivedEvent
  | TransactionControllerPostTransactionBalanceUpdatedEvent
  | TransactionControllerSpeedupTransactionAddedEvent
  | TransactionControllerStateChangeEvent
  | TransactionControllerTransactionApprovedEvent
  | TransactionControllerTransactionConfirmedEvent
  | TransactionControllerTransactionDroppedEvent
  | TransactionControllerTransactionFailedEvent
  | TransactionControllerTransactionFinishedEvent
  | TransactionControllerTransactionNewSwapApprovalEvent
  | TransactionControllerTransactionNewSwapEvent
  | TransactionControllerTransactionNewSwapAndSendEvent
  | TransactionControllerTransactionPublishingSkipped
  | TransactionControllerTransactionRejectedEvent
  | TransactionControllerTransactionStatusUpdatedEvent
  | TransactionControllerTransactionSubmittedEvent
  | TransactionControllerUnapprovedTransactionAddedEvent;

/**
 * The messenger of the {@link TransactionController}.
 */
export type TransactionControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  TransactionControllerActions | AllowedActions,
  TransactionControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Possible states of the approve transaction step.
 */
export enum ApprovalState {
  Approved = 'approved',
  NotApproved = 'not-approved',
  SkippedViaBeforePublishHook = 'skipped-via-before-publish-hook',
}

/**
 * Get the default TransactionsController state.
 *
 * @returns The default TransactionsController state.
 */
function getDefaultTransactionControllerState(): TransactionControllerState {
  return {
    methodData: {},
    transactions: [],
    lastFetchedBlockNumbers: {},
  };
}

/**
 * Controller responsible for submitting and managing transactions.
 */
export class TransactionController extends BaseController<
  typeof controllerName,
  TransactionControllerState,
  TransactionControllerMessenger
> {
  #internalEvents = new EventEmitter();

  private readonly isHistoryDisabled: boolean;

  private readonly isSwapsDisabled: boolean;

  private readonly isSendFlowHistoryDisabled: boolean;

  private readonly approvingTransactionIds: Set<string> = new Set();

  private readonly nonceTracker: NonceTracker;

  private readonly registry: MethodRegistry;

  private readonly mutex = new Mutex();

  private readonly gasFeeFlows: GasFeeFlow[];

  private readonly getSavedGasFees: (chainId: Hex) => SavedGasFees | undefined;

  private readonly getNetworkState: () => NetworkState;

  private readonly getCurrentAccountEIP1559Compatibility: () => Promise<boolean>;

  private readonly getCurrentNetworkEIP1559Compatibility: (
    networkClientId?: NetworkClientId,
  ) => Promise<boolean>;

  private readonly getGasFeeEstimates: (
    options: FetchGasFeeEstimateOptions,
  ) => Promise<GasFeeState>;

  private readonly getPermittedAccounts: (origin?: string) => Promise<string[]>;

  private readonly getExternalPendingTransactions: (
    address: string,
    chainId?: string,
  ) => NonceTrackerTransaction[];

  private readonly layer1GasFeeFlows: Layer1GasFeeFlow[];

  readonly #incomingTransactionOptions: IncomingTransactionOptions;

  private readonly incomingTransactionHelper: IncomingTransactionHelper;

  private readonly securityProviderRequest?: SecurityProviderRequest;

  readonly #pendingTransactionOptions: PendingTransactionOptions;

  private readonly pendingTransactionTracker: PendingTransactionTracker;

  private readonly signAbortCallbacks: Map<string, () => void> = new Map();

  #transactionHistoryLimit: number;

  #isSimulationEnabled: () => boolean;

  #testGasFeeFlows: boolean;

  private readonly afterSign: (
    transactionMeta: TransactionMeta,
    signedTx: TypedTransaction,
  ) => boolean;

  private readonly beforeApproveOnInit: (
    transactionMeta: TransactionMeta,
  ) => boolean;

  private readonly beforeCheckPendingTransaction: (
    transactionMeta: TransactionMeta,
  ) => boolean;

  private readonly beforePublish: (transactionMeta: TransactionMeta) => boolean;

  private readonly publish: (
    transactionMeta: TransactionMeta,
    rawTx: string,
  ) => Promise<{ transactionHash?: string }>;

  private readonly getAdditionalSignArguments: (
    transactionMeta: TransactionMeta,
  ) => (TransactionMeta | undefined)[];

  private failTransaction(
    transactionMeta: TransactionMeta,
    error: Error,
    actionId?: string,
  ) {
    const newTransactionMeta = merge({}, transactionMeta, {
      error: normalizeTxError(error),
      status: TransactionStatus.failed as const,
    });
    this.messagingSystem.publish(`${controllerName}:transactionFailed`, {
      actionId,
      error: error.message,
      transactionMeta: newTransactionMeta,
    });
    this.updateTransaction(
      newTransactionMeta,
      'TransactionController#failTransaction - Add error message and set status to failed',
    );
    this.onTransactionStatusChange(newTransactionMeta);
    this.messagingSystem.publish(
      `${controllerName}:transactionFinished`,
      newTransactionMeta,
    );
    this.#internalEvents.emit(
      `${transactionMeta.id}:finished`,
      newTransactionMeta,
    );
  }

  private async registryLookup(fourBytePrefix: string): Promise<MethodData> {
    const registryMethod = await this.registry.lookup(fourBytePrefix);
    if (!registryMethod) {
      return {
        registryMethod: '',
        parsedRegistryMethod: { name: undefined, args: undefined },
      };
    }
    const parsedRegistryMethod = this.registry.parse(registryMethod);
    return { registryMethod, parsedRegistryMethod };
  }

  #multichainTrackingHelper: MultichainTrackingHelper;

  /**
   * Method used to sign transactions
   */
  sign?: (
    transaction: TypedTransaction,
    from: string,
    transactionMeta?: TransactionMeta,
  ) => Promise<TypedTransaction>;

  /**
   * Constructs a TransactionController.
   *
   * @param options - The controller options.
   * @param options.blockTracker - The block tracker used to poll for new blocks data.
   * @param options.disableHistory - Whether to disable storing history in transaction metadata.
   * @param options.disableSendFlowHistory - Explicitly disable transaction metadata history.
   * @param options.disableSwaps - Whether to disable additional processing on swaps transactions.
   * @param options.getCurrentAccountEIP1559Compatibility - Whether or not the account supports EIP-1559.
   * @param options.getCurrentNetworkEIP1559Compatibility - Whether or not the network supports EIP-1559.
   * @param options.getExternalPendingTransactions - Callback to retrieve pending transactions from external sources.
   * @param options.getGasFeeEstimates - Callback to retrieve gas fee estimates.
   * @param options.getNetworkClientRegistry - Gets the network client registry.
   * @param options.getNetworkState - Gets the state of the network controller.
   * @param options.getPermittedAccounts - Get accounts that a given origin has permissions for.
   * @param options.getSavedGasFees - Gets the saved gas fee config.
   * @param options.incomingTransactions - Configuration options for incoming transaction support.
   * @param options.isMultichainEnabled - Enable multichain support.
   * @param options.isSimulationEnabled - Whether new transactions will be automatically simulated.
   * @param options.messenger - The controller messenger.
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
   * @param options.pendingTransactions - Configuration options for pending transaction support.
   * @param options.provider - The provider used to create the underlying EthQuery instance.
   * @param options.securityProviderRequest - A function for verifying a transaction, whether it is malicious or not.
   * @param options.sign - Function used to sign transactions.
   * @param options.state - Initial state to set on this controller.
   * @param options.testGasFeeFlows - Whether to use the test gas fee flow.
   * @param options.transactionHistoryLimit - Transaction history limit.
   * @param options.hooks - The controller hooks.
   */
  constructor({
    blockTracker,
    disableHistory,
    disableSendFlowHistory,
    disableSwaps,
    getCurrentAccountEIP1559Compatibility,
    getCurrentNetworkEIP1559Compatibility,
    getExternalPendingTransactions,
    getGasFeeEstimates,
    getNetworkClientRegistry,
    getNetworkState,
    getPermittedAccounts,
    getSavedGasFees,
    incomingTransactions = {},
    isMultichainEnabled = false,
    isSimulationEnabled,
    messenger,
    onNetworkStateChange,
    pendingTransactions = {},
    provider,
    securityProviderRequest,
    sign,
    state,
    testGasFeeFlows,
    transactionHistoryLimit = 40,
    hooks,
  }: TransactionControllerOptions) {
    super({
      name: controllerName,
      metadata,
      messenger,
      state: {
        ...getDefaultTransactionControllerState(),
        ...state,
      },
    });

    this.messagingSystem = messenger;
    this.getNetworkState = getNetworkState;
    this.isSendFlowHistoryDisabled = disableSendFlowHistory ?? false;
    this.isHistoryDisabled = disableHistory ?? false;
    this.isSwapsDisabled = disableSwaps ?? false;
    this.#isSimulationEnabled = isSimulationEnabled ?? (() => true);
    // @ts-expect-error the type in eth-method-registry is inappropriate and should be changed
    this.registry = new MethodRegistry({ provider });
    this.getSavedGasFees = getSavedGasFees ?? ((_chainId) => undefined);
    this.getCurrentAccountEIP1559Compatibility =
      getCurrentAccountEIP1559Compatibility ?? (() => Promise.resolve(true));
    this.getCurrentNetworkEIP1559Compatibility =
      getCurrentNetworkEIP1559Compatibility;
    this.getGasFeeEstimates =
      getGasFeeEstimates || (() => Promise.resolve({} as GasFeeState));
    this.getPermittedAccounts = getPermittedAccounts;
    this.getExternalPendingTransactions =
      getExternalPendingTransactions ?? (() => []);
    this.securityProviderRequest = securityProviderRequest;
    this.#incomingTransactionOptions = incomingTransactions;
    this.#pendingTransactionOptions = pendingTransactions;
    this.#transactionHistoryLimit = transactionHistoryLimit;
    this.sign = sign;
    this.#testGasFeeFlows = testGasFeeFlows === true;

    this.afterSign = hooks?.afterSign ?? (() => true);
    this.beforeApproveOnInit = hooks?.beforeApproveOnInit ?? (() => true);
    this.beforeCheckPendingTransaction =
      hooks?.beforeCheckPendingTransaction ??
      /* istanbul ignore next */
      (() => true);
    this.beforePublish = hooks?.beforePublish ?? (() => true);
    this.getAdditionalSignArguments =
      hooks?.getAdditionalSignArguments ?? (() => []);
    this.publish =
      hooks?.publish ?? (() => Promise.resolve({ transactionHash: undefined }));

    this.nonceTracker = this.#createNonceTracker({
      provider,
      blockTracker,
    });

    const findNetworkClientIdByChainId = (chainId: Hex) => {
      return this.messagingSystem.call(
        `NetworkController:findNetworkClientIdByChainId`,
        chainId,
      );
    };

    this.#multichainTrackingHelper = new MultichainTrackingHelper({
      isMultichainEnabled,
      provider,
      nonceTracker: this.nonceTracker,
      incomingTransactionOptions: incomingTransactions,
      findNetworkClientIdByChainId,
      getNetworkClientById: ((networkClientId: NetworkClientId) => {
        return this.messagingSystem.call(
          `NetworkController:getNetworkClientById`,
          networkClientId,
        );
      }) as NetworkController['getNetworkClientById'],
      getNetworkClientRegistry,
      removeIncomingTransactionHelperListeners:
        this.#removeIncomingTransactionHelperListeners.bind(this),
      removePendingTransactionTrackerListeners:
        this.#removePendingTransactionTrackerListeners.bind(this),
      createNonceTracker: this.#createNonceTracker.bind(this),
      createIncomingTransactionHelper:
        this.#createIncomingTransactionHelper.bind(this),
      createPendingTransactionTracker:
        this.#createPendingTransactionTracker.bind(this),
      onNetworkStateChange: (listener) => {
        this.messagingSystem.subscribe(
          'NetworkController:stateChange',
          listener,
        );
      },
    });
    this.#multichainTrackingHelper.initialize();

    const etherscanRemoteTransactionSource =
      new EtherscanRemoteTransactionSource({
        includeTokenTransfers: incomingTransactions.includeTokenTransfers,
      });

    this.incomingTransactionHelper = this.#createIncomingTransactionHelper({
      blockTracker,
      etherscanRemoteTransactionSource,
    });

    this.pendingTransactionTracker = this.#createPendingTransactionTracker({
      provider,
      blockTracker,
    });

    this.gasFeeFlows = this.#getGasFeeFlows();
    this.layer1GasFeeFlows = this.#getLayer1GasFeeFlows();

    const gasFeePoller = new GasFeePoller({
      findNetworkClientIdByChainId,
      gasFeeFlows: this.gasFeeFlows,
      getGasFeeControllerEstimates: this.getGasFeeEstimates,
      getProvider: (chainId, networkClientId) =>
        this.#multichainTrackingHelper.getProvider({
          networkClientId,
          chainId,
        }),
      getTransactions: () => this.state.transactions,
      layer1GasFeeFlows: this.layer1GasFeeFlows,
      onStateChange: (listener) => {
        this.messagingSystem.subscribe(
          'TransactionController:stateChange',
          listener,
        );
      },
    });

    gasFeePoller.hub.on(
      'transaction-updated',
      this.#onGasFeePollerTransactionUpdate.bind(this),
    );

    // when transactionsController state changes
    // check for pending transactions and start polling if there are any
    this.messagingSystem.subscribe(
      'TransactionController:stateChange',
      this.#checkForPendingTransactionAndStartPolling,
    );

    // TODO once v2 is merged make sure this only runs when
    // selectedNetworkClientId changes
    onNetworkStateChange(() => {
      log('Detected network change', this.getChainId());
      this.pendingTransactionTracker.startIfPendingTransactions();
      this.onBootCleanup();
    });

    this.onBootCleanup();
    this.#checkForPendingTransactionAndStartPolling();
  }

  /**
   * Stops polling and removes listeners to prepare the controller for garbage collection.
   */
  destroy() {
    this.#stopAllTracking();
  }

  /**
   * Handle new method data request.
   *
   * @param fourBytePrefix - The method prefix.
   * @returns The method data object corresponding to the given signature prefix.
   */
  async handleMethodData(fourBytePrefix: string): Promise<MethodData> {
    const releaseLock = await this.mutex.acquire();
    try {
      const { methodData } = this.state;
      const knownMethod = Object.keys(methodData).find(
        (knownFourBytePrefix) => fourBytePrefix === knownFourBytePrefix,
      );
      if (knownMethod) {
        return methodData[fourBytePrefix];
      }
      const registry = await this.registryLookup(fourBytePrefix);
      this.update((state) => {
        state.methodData[fourBytePrefix] = registry;
      });
      return registry;
    } finally {
      releaseLock();
    }
  }

  /**
   * Add a new unapproved transaction to state. Parameters will be validated, a
   * unique transaction id will be generated, and gas and gasPrice will be calculated
   * if not provided. If A `<tx.id>:unapproved` hub event will be emitted once added.
   *
   * @param txParams - Standard parameters for an Ethereum transaction.
   * @param opts - Additional options to control how the transaction is added.
   * @param opts.actionId - Unique ID to prevent duplicate requests.
   * @param opts.deviceConfirmedOn - An enum to indicate what device confirmed the transaction.
   * @param opts.method - RPC method that requested the transaction.
   * @param opts.origin - The origin of the transaction request, such as a dApp hostname.
   * @param opts.requireApproval - Whether the transaction requires approval by the user, defaults to true unless explicitly disabled.
   * @param opts.securityAlertResponse - Response from security validator.
   * @param opts.sendFlowHistory - The sendFlowHistory entries to add.
   * @param opts.type - Type of transaction to add, such as 'cancel' or 'swap'.
   * @param opts.swaps - Options for swaps transactions.
   * @param opts.swaps.hasApproveTx - Whether the transaction has an approval transaction.
   * @param opts.swaps.meta - Metadata for swap transaction.
   * @param opts.networkClientId - The id of the network client for this transaction.
   * @returns Object containing a promise resolving to the transaction hash if approved.
   */
  async addTransaction(
    txParams: TransactionParams,
    {
      actionId,
      deviceConfirmedOn,
      method,
      origin,
      requireApproval,
      securityAlertResponse,
      sendFlowHistory,
      swaps = {},
      type,
      networkClientId: requestNetworkClientId,
    }: {
      actionId?: string;
      deviceConfirmedOn?: WalletDevice;
      method?: string;
      origin?: string;
      requireApproval?: boolean | undefined;
      securityAlertResponse?: SecurityAlertResponse;
      sendFlowHistory?: SendFlowHistoryEntry[];
      swaps?: {
        hasApproveTx?: boolean;
        meta?: Partial<TransactionMeta>;
      };
      type?: TransactionType;
      networkClientId?: NetworkClientId;
    } = {},
  ): Promise<Result> {
    log('Adding transaction', txParams);

    txParams = normalizeTransactionParams(txParams);
    if (
      requestNetworkClientId &&
      !this.#multichainTrackingHelper.has(requestNetworkClientId)
    ) {
      throw new Error(
        'The networkClientId for this transaction could not be found',
      );
    }

    const networkClientId =
      requestNetworkClientId ?? this.#getGlobalNetworkClientId();

    const isEIP1559Compatible = await this.getEIP1559Compatibility(
      networkClientId,
    );

    validateTxParams(txParams, isEIP1559Compatible);

    if (origin) {
      await validateTransactionOrigin(
        await this.getPermittedAccounts(origin),
        this.#getSelectedAccount().address,
        txParams.from,
        origin,
      );
    }

    const dappSuggestedGasFees = this.generateDappSuggestedGasFees(
      txParams,
      origin,
    );

    const chainId = this.getChainId(networkClientId);
    const ethQuery = this.#multichainTrackingHelper.getEthQuery({
      networkClientId,
      chainId,
    });

    const transactionType =
      type ?? (await determineTransactionType(txParams, ethQuery)).type;

    const existingTransactionMeta = this.getTransactionWithActionId(actionId);

    // If a request to add a transaction with the same actionId is submitted again, a new transaction will not be created for it.
    let addedTransactionMeta = existingTransactionMeta
      ? cloneDeep(existingTransactionMeta)
      : {
          // Add actionId to txMeta to check if same actionId is seen again
          actionId,
          chainId,
          dappSuggestedGasFees,
          deviceConfirmedOn,
          id: random(),
          origin,
          securityAlertResponse,
          status: TransactionStatus.unapproved as const,
          time: Date.now(),
          txParams,
          userEditedGasLimit: false,
          verifiedOnBlockchain: false,
          type: transactionType,
          networkClientId,
        };

    await this.updateGasProperties(addedTransactionMeta);

    // Checks if a transaction already exists with a given actionId
    if (!existingTransactionMeta) {
      // Set security provider response
      if (method && this.securityProviderRequest) {
        const securityProviderResponse = await this.securityProviderRequest(
          addedTransactionMeta,
          method,
        );
        addedTransactionMeta.securityProviderResponse =
          securityProviderResponse;
      }

      if (!this.isSendFlowHistoryDisabled) {
        addedTransactionMeta.sendFlowHistory = sendFlowHistory ?? [];
      }
      // Initial history push
      if (!this.isHistoryDisabled) {
        addedTransactionMeta = addInitialHistorySnapshot(addedTransactionMeta);
      }

      addedTransactionMeta = updateSwapsTransaction(
        addedTransactionMeta,
        transactionType,
        swaps,
        {
          isSwapsDisabled: this.isSwapsDisabled,
          cancelTransaction: this.cancelTransaction.bind(this),
          messenger: this.messagingSystem,
        },
      );

      this.addMetadata(addedTransactionMeta);

      if (requireApproval !== false) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.#updateSimulationData(addedTransactionMeta);
      } else {
        log('Skipping simulation as approval not required');
      }

      this.messagingSystem.publish(
        `${controllerName}:unapprovedTransactionAdded`,
        addedTransactionMeta,
      );
    }

    return {
      result: this.processApproval(addedTransactionMeta, {
        isExisting: Boolean(existingTransactionMeta),
        requireApproval,
        actionId,
      }),
      transactionMeta: addedTransactionMeta,
    };
  }

  startIncomingTransactionPolling(networkClientIds: NetworkClientId[] = []) {
    if (networkClientIds.length === 0) {
      this.incomingTransactionHelper.start();
      return;
    }
    this.#multichainTrackingHelper.startIncomingTransactionPolling(
      networkClientIds,
    );
  }

  stopIncomingTransactionPolling(networkClientIds: NetworkClientId[] = []) {
    if (networkClientIds.length === 0) {
      this.incomingTransactionHelper.stop();
      return;
    }
    this.#multichainTrackingHelper.stopIncomingTransactionPolling(
      networkClientIds,
    );
  }

  stopAllIncomingTransactionPolling() {
    this.incomingTransactionHelper.stop();
    this.#multichainTrackingHelper.stopAllIncomingTransactionPolling();
  }

  async updateIncomingTransactions(networkClientIds: NetworkClientId[] = []) {
    if (networkClientIds.length === 0) {
      await this.incomingTransactionHelper.update();
      return;
    }
    await this.#multichainTrackingHelper.updateIncomingTransactions(
      networkClientIds,
    );
  }

  /**
   * Attempts to cancel a transaction based on its ID by setting its status to "rejected"
   * and emitting a `<tx.id>:finished` hub event.
   *
   * @param transactionId - The ID of the transaction to cancel.
   * @param gasValues - The gas values to use for the cancellation transaction.
   * @param options - The options for the cancellation transaction.
   * @param options.actionId - Unique ID to prevent duplicate requests.
   * @param options.estimatedBaseFee - The estimated base fee of the transaction.
   */
  async stopTransaction(
    transactionId: string,
    gasValues?: GasPriceValue | FeeMarketEIP1559Values,
    {
      estimatedBaseFee,
      actionId,
    }: { estimatedBaseFee?: string; actionId?: string } = {},
  ) {
    // If transaction is found for same action id, do not create a cancel transaction.
    if (this.getTransactionWithActionId(actionId)) {
      return;
    }

    if (gasValues) {
      // Not good practice to reassign a parameter but temporarily avoiding a larger refactor.
      gasValues = normalizeGasFeeValues(gasValues);
      validateGasValues(gasValues);
    }

    log('Creating cancel transaction', transactionId, gasValues);

    const transactionMeta = this.getTransaction(transactionId);
    if (!transactionMeta) {
      return;
    }

    if (!this.sign) {
      throw new Error('No sign method defined.');
    }

    // gasPrice (legacy non EIP1559)
    const minGasPrice = getIncreasedPriceFromExisting(
      transactionMeta.txParams.gasPrice,
      CANCEL_RATE,
    );

    const gasPriceFromValues = isGasPriceValue(gasValues) && gasValues.gasPrice;

    const newGasPrice =
      (gasPriceFromValues &&
        validateMinimumIncrease(gasPriceFromValues, minGasPrice)) ||
      minGasPrice;

    // maxFeePerGas (EIP1559)
    const existingMaxFeePerGas = transactionMeta.txParams?.maxFeePerGas;
    const minMaxFeePerGas = getIncreasedPriceFromExisting(
      existingMaxFeePerGas,
      CANCEL_RATE,
    );
    const maxFeePerGasValues =
      isFeeMarketEIP1559Values(gasValues) && gasValues.maxFeePerGas;
    const newMaxFeePerGas =
      (maxFeePerGasValues &&
        validateMinimumIncrease(maxFeePerGasValues, minMaxFeePerGas)) ||
      (existingMaxFeePerGas && minMaxFeePerGas);

    // maxPriorityFeePerGas (EIP1559)
    const existingMaxPriorityFeePerGas =
      transactionMeta.txParams?.maxPriorityFeePerGas;
    const minMaxPriorityFeePerGas = getIncreasedPriceFromExisting(
      existingMaxPriorityFeePerGas,
      CANCEL_RATE,
    );
    const maxPriorityFeePerGasValues =
      isFeeMarketEIP1559Values(gasValues) && gasValues.maxPriorityFeePerGas;
    const newMaxPriorityFeePerGas =
      (maxPriorityFeePerGasValues &&
        validateMinimumIncrease(
          maxPriorityFeePerGasValues,
          minMaxPriorityFeePerGas,
        )) ||
      (existingMaxPriorityFeePerGas && minMaxPriorityFeePerGas);

    const newTxParams: TransactionParams =
      newMaxFeePerGas && newMaxPriorityFeePerGas
        ? {
            from: transactionMeta.txParams.from,
            gasLimit: transactionMeta.txParams.gas,
            maxFeePerGas: newMaxFeePerGas,
            maxPriorityFeePerGas: newMaxPriorityFeePerGas,
            type: TransactionEnvelopeType.feeMarket,
            nonce: transactionMeta.txParams.nonce,
            to: transactionMeta.txParams.from,
            value: '0x0',
          }
        : {
            from: transactionMeta.txParams.from,
            gasLimit: transactionMeta.txParams.gas,
            gasPrice: newGasPrice,
            nonce: transactionMeta.txParams.nonce,
            to: transactionMeta.txParams.from,
            value: '0x0',
          };

    const unsignedEthTx = this.prepareUnsignedEthTx(
      transactionMeta.chainId,
      newTxParams,
    );

    const signedTx = await this.sign(
      unsignedEthTx,
      transactionMeta.txParams.from,
    );

    const rawTx = bufferToHex(signedTx.serialize());

    const newFee = newTxParams.maxFeePerGas ?? newTxParams.gasPrice;

    const oldFee = newTxParams.maxFeePerGas
      ? transactionMeta.txParams.maxFeePerGas
      : transactionMeta.txParams.gasPrice;

    log('Submitting cancel transaction', {
      oldFee,
      newFee,
      txParams: newTxParams,
    });

    const ethQuery = this.#multichainTrackingHelper.getEthQuery({
      networkClientId: transactionMeta.networkClientId,
      chainId: transactionMeta.chainId,
    });
    const hash = await this.publishTransactionForRetry(
      ethQuery,
      rawTx,
      transactionMeta,
    );

    const cancelTransactionMeta = {
      actionId,
      chainId: transactionMeta.chainId,
      networkClientId: transactionMeta.networkClientId,
      estimatedBaseFee,
      hash,
      id: random(),
      originalGasEstimate: transactionMeta.txParams.gas,
      status: TransactionStatus.submitted as const,
      time: Date.now(),
      type: TransactionType.cancel as const,
      txParams: newTxParams,
    };

    this.addMetadata(cancelTransactionMeta);

    // stopTransaction has no approval request, so we assume the user has already approved the transaction
    this.messagingSystem.publish(`${controllerName}:transactionApproved`, {
      transactionMeta: cancelTransactionMeta,
      actionId,
    });
    this.messagingSystem.publish(`${controllerName}:transactionSubmitted`, {
      transactionMeta: cancelTransactionMeta,
      actionId,
    });

    this.messagingSystem.publish(
      `${controllerName}:transactionFinished`,
      cancelTransactionMeta,
    );
    this.#internalEvents.emit(
      `${transactionMeta.id}:finished`,
      cancelTransactionMeta,
    );
  }

  /**
   * Attempts to speed up a transaction increasing transaction gasPrice by ten percent.
   *
   * @param transactionId - The ID of the transaction to speed up.
   * @param gasValues - The gas values to use for the speed up transaction.
   * @param options - The options for the speed up transaction.
   * @param options.actionId - Unique ID to prevent duplicate requests
   * @param options.estimatedBaseFee - The estimated base fee of the transaction.
   */
  async speedUpTransaction(
    transactionId: string,
    gasValues?: GasPriceValue | FeeMarketEIP1559Values,
    {
      actionId,
      estimatedBaseFee,
    }: { actionId?: string; estimatedBaseFee?: string } = {},
  ) {
    // If transaction is found for same action id, do not create a new speed up transaction.
    if (this.getTransactionWithActionId(actionId)) {
      return;
    }

    if (gasValues) {
      // Not good practice to reassign a parameter but temporarily avoiding a larger refactor.
      gasValues = normalizeGasFeeValues(gasValues);
      validateGasValues(gasValues);
    }

    log('Creating speed up transaction', transactionId, gasValues);

    const transactionMeta = this.getTransaction(transactionId);
    /* istanbul ignore next */
    if (!transactionMeta) {
      return;
    }

    /* istanbul ignore next */
    if (!this.sign) {
      throw new Error('No sign method defined.');
    }

    // gasPrice (legacy non EIP1559)
    const minGasPrice = getIncreasedPriceFromExisting(
      transactionMeta.txParams.gasPrice,
      SPEED_UP_RATE,
    );

    const gasPriceFromValues = isGasPriceValue(gasValues) && gasValues.gasPrice;

    const newGasPrice =
      (gasPriceFromValues &&
        validateMinimumIncrease(gasPriceFromValues, minGasPrice)) ||
      minGasPrice;

    // maxFeePerGas (EIP1559)
    const existingMaxFeePerGas = transactionMeta.txParams?.maxFeePerGas;
    const minMaxFeePerGas = getIncreasedPriceFromExisting(
      existingMaxFeePerGas,
      SPEED_UP_RATE,
    );
    const maxFeePerGasValues =
      isFeeMarketEIP1559Values(gasValues) && gasValues.maxFeePerGas;
    const newMaxFeePerGas =
      (maxFeePerGasValues &&
        validateMinimumIncrease(maxFeePerGasValues, minMaxFeePerGas)) ||
      (existingMaxFeePerGas && minMaxFeePerGas);

    // maxPriorityFeePerGas (EIP1559)
    const existingMaxPriorityFeePerGas =
      transactionMeta.txParams?.maxPriorityFeePerGas;
    const minMaxPriorityFeePerGas = getIncreasedPriceFromExisting(
      existingMaxPriorityFeePerGas,
      SPEED_UP_RATE,
    );
    const maxPriorityFeePerGasValues =
      isFeeMarketEIP1559Values(gasValues) && gasValues.maxPriorityFeePerGas;
    const newMaxPriorityFeePerGas =
      (maxPriorityFeePerGasValues &&
        validateMinimumIncrease(
          maxPriorityFeePerGasValues,
          minMaxPriorityFeePerGas,
        )) ||
      (existingMaxPriorityFeePerGas && minMaxPriorityFeePerGas);

    const txParams: TransactionParams =
      newMaxFeePerGas && newMaxPriorityFeePerGas
        ? {
            ...transactionMeta.txParams,
            gasLimit: transactionMeta.txParams.gas,
            maxFeePerGas: newMaxFeePerGas,
            maxPriorityFeePerGas: newMaxPriorityFeePerGas,
            type: TransactionEnvelopeType.feeMarket,
          }
        : {
            ...transactionMeta.txParams,
            gasLimit: transactionMeta.txParams.gas,
            gasPrice: newGasPrice,
          };

    const unsignedEthTx = this.prepareUnsignedEthTx(
      transactionMeta.chainId,
      txParams,
    );

    const signedTx = await this.sign(
      unsignedEthTx,
      transactionMeta.txParams.from,
    );

    const transactionMetaWithRsv = this.updateTransactionMetaRSV(
      transactionMeta,
      signedTx,
    );
    const rawTx = bufferToHex(signedTx.serialize());

    const newFee = txParams.maxFeePerGas ?? txParams.gasPrice;

    const oldFee = txParams.maxFeePerGas
      ? transactionMetaWithRsv.txParams.maxFeePerGas
      : transactionMetaWithRsv.txParams.gasPrice;

    log('Submitting speed up transaction', { oldFee, newFee, txParams });

    const ethQuery = this.#multichainTrackingHelper.getEthQuery({
      networkClientId: transactionMeta.networkClientId,
      chainId: transactionMeta.chainId,
    });
    const hash = await this.publishTransactionForRetry(
      ethQuery,
      rawTx,
      transactionMeta,
    );

    const baseTransactionMeta = {
      ...transactionMetaWithRsv,
      estimatedBaseFee,
      id: random(),
      time: Date.now(),
      hash,
      actionId,
      originalGasEstimate: transactionMeta.txParams.gas,
      type: TransactionType.retry as const,
      originalType: transactionMeta.type,
    };

    const newTransactionMeta =
      newMaxFeePerGas && newMaxPriorityFeePerGas
        ? {
            ...baseTransactionMeta,
            txParams: {
              ...transactionMeta.txParams,
              maxFeePerGas: newMaxFeePerGas,
              maxPriorityFeePerGas: newMaxPriorityFeePerGas,
            },
          }
        : {
            ...baseTransactionMeta,
            txParams: {
              ...transactionMeta.txParams,
              gasPrice: newGasPrice,
            },
          };

    this.addMetadata(newTransactionMeta);

    // speedUpTransaction has no approval request, so we assume the user has already approved the transaction
    this.messagingSystem.publish(`${controllerName}:transactionApproved`, {
      transactionMeta: newTransactionMeta,
      actionId,
    });

    this.messagingSystem.publish(`${controllerName}:transactionSubmitted`, {
      transactionMeta: newTransactionMeta,
      actionId,
    });

    this.messagingSystem.publish(
      `${controllerName}:speedupTransactionAdded`,
      newTransactionMeta,
    );
  }

  /**
   * Estimates required gas for a given transaction.
   *
   * @param transaction - The transaction to estimate gas for.
   * @param networkClientId - The network client id to use for the estimate.
   * @returns The gas and gas price.
   */
  async estimateGas(
    transaction: TransactionParams,
    networkClientId?: NetworkClientId,
  ) {
    const ethQuery = this.#multichainTrackingHelper.getEthQuery({
      networkClientId,
    });
    const { estimatedGas, simulationFails } = await estimateGas(
      transaction,
      ethQuery,
    );

    return { gas: estimatedGas, simulationFails };
  }

  /**
   * Estimates required gas for a given transaction and add additional gas buffer with the given multiplier.
   *
   * @param transaction - The transaction params to estimate gas for.
   * @param multiplier - The multiplier to use for the gas buffer.
   * @param networkClientId - The network client id to use for the estimate.
   */
  async estimateGasBuffered(
    transaction: TransactionParams,
    multiplier: number,
    networkClientId?: NetworkClientId,
  ) {
    const ethQuery = this.#multichainTrackingHelper.getEthQuery({
      networkClientId,
    });
    const { blockGasLimit, estimatedGas, simulationFails } = await estimateGas(
      transaction,
      ethQuery,
    );

    const gas = addGasBuffer(estimatedGas, blockGasLimit, multiplier);

    return {
      gas,
      simulationFails,
    };
  }

  /**
   * Updates an existing transaction in state.
   *
   * @param transactionMeta - The new transaction to store in state.
   * @param note - A note or update reason to include in the transaction history.
   */
  updateTransaction(transactionMeta: TransactionMeta, note: string) {
    const { id: transactionId } = transactionMeta;

    this.#updateTransactionInternal({ transactionId, note }, () => ({
      ...transactionMeta,
    }));
  }

  /**
   * Update the security alert response for a transaction.
   *
   * @param transactionId - ID of the transaction.
   * @param securityAlertResponse - The new security alert response for the transaction.
   */
  updateSecurityAlertResponse(
    transactionId: string,
    securityAlertResponse: SecurityAlertResponse,
  ) {
    if (!securityAlertResponse) {
      throw new Error(
        'updateSecurityAlertResponse: securityAlertResponse should not be null',
      );
    }
    const transactionMeta = this.getTransaction(transactionId);
    if (!transactionMeta) {
      throw new Error(
        `Cannot update security alert response as no transaction metadata found`,
      );
    }
    const updatedTransactionMeta = {
      ...transactionMeta,
      securityAlertResponse,
    };
    this.updateTransaction(
      updatedTransactionMeta,
      `${controllerName}:updatesecurityAlertResponse - securityAlertResponse updated`,
    );
  }

  /**
   * Removes all transactions from state, optionally based on the current network.
   *
   * @param ignoreNetwork - Determines whether to wipe all transactions, or just those on the
   * current network. If `true`, all transactions are wiped.
   * @param address - If specified, only transactions originating from this address will be
   * wiped on current network.
   */
  wipeTransactions(ignoreNetwork?: boolean, address?: string) {
    /* istanbul ignore next */
    if (ignoreNetwork && !address) {
      this.update((state) => {
        state.transactions = [];
      });
      return;
    }
    const currentChainId = this.getChainId();
    const newTransactions = this.state.transactions.filter(
      ({ chainId, txParams }) => {
        const isMatchingNetwork = ignoreNetwork || chainId === currentChainId;

        if (!isMatchingNetwork) {
          return true;
        }

        const isMatchingAddress =
          !address || txParams.from?.toLowerCase() === address.toLowerCase();

        return !isMatchingAddress;
      },
    );

    this.update((state) => {
      state.transactions = this.trimTransactionsForState(newTransactions);
    });
  }

  /**
   * Adds external provided transaction to state as confirmed transaction.
   *
   * @param transactionMeta - TransactionMeta to add transactions.
   * @param transactionReceipt - TransactionReceipt of the external transaction.
   * @param baseFeePerGas - Base fee per gas of the external transaction.
   */
  async confirmExternalTransaction(
    transactionMeta: TransactionMeta,
    transactionReceipt: TransactionReceipt,
    baseFeePerGas: Hex,
  ) {
    // Run validation and add external transaction to state.
    const newTransactionMeta = this.addExternalTransaction(transactionMeta);

    try {
      const transactionId = newTransactionMeta.id;

      // Make sure status is confirmed and define gasUsed as in receipt.
      const updatedTransactionMeta = {
        ...newTransactionMeta,
        status: TransactionStatus.confirmed as const,
        txReceipt: transactionReceipt,
      };
      if (baseFeePerGas) {
        updatedTransactionMeta.baseFeePerGas = baseFeePerGas;
      }

      // Update same nonce local transactions as dropped and define replacedBy properties.
      this.markNonceDuplicatesDropped(transactionId);

      // Update external provided transaction with updated gas values and confirmed status.
      this.updateTransaction(
        updatedTransactionMeta,
        `${controllerName}:confirmExternalTransaction - Add external transaction`,
      );
      this.onTransactionStatusChange(updatedTransactionMeta);

      // Intentional given potential duration of process.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.updatePostBalance(updatedTransactionMeta);

      this.messagingSystem.publish(
        `${controllerName}:transactionConfirmed`,
        updatedTransactionMeta,
      );
    } catch (error) {
      console.error('Failed to confirm external transaction', error);
    }
  }

  /**
   * Append new send flow history to a transaction.
   *
   * @param transactionID - The ID of the transaction to update.
   * @param currentSendFlowHistoryLength - The length of the current sendFlowHistory array.
   * @param sendFlowHistoryToAdd - The sendFlowHistory entries to add.
   * @returns The updated transactionMeta.
   */
  updateTransactionSendFlowHistory(
    transactionID: string,
    currentSendFlowHistoryLength: number,
    sendFlowHistoryToAdd: SendFlowHistoryEntry[],
  ): TransactionMeta {
    if (this.isSendFlowHistoryDisabled) {
      throw new Error(
        'Send flow history is disabled for the current transaction controller',
      );
    }

    const transactionMeta = this.getTransaction(transactionID);

    if (!transactionMeta) {
      throw new Error(
        `Cannot update send flow history as no transaction metadata found`,
      );
    }

    validateIfTransactionUnapproved(
      transactionMeta,
      'updateTransactionSendFlowHistory',
    );

    const sendFlowHistory = transactionMeta.sendFlowHistory ?? [];
    if (currentSendFlowHistoryLength === sendFlowHistory.length) {
      const updatedTransactionMeta = {
        ...transactionMeta,
        sendFlowHistory: [...sendFlowHistory, ...sendFlowHistoryToAdd],
      };
      this.updateTransaction(
        updatedTransactionMeta,
        `${controllerName}:updateTransactionSendFlowHistory - sendFlowHistory updated`,
      );
    }

    return this.getTransaction(transactionID) as TransactionMeta;
  }

  /**
   * Update the gas values of a transaction.
   *
   * @param transactionId - The ID of the transaction to update.
   * @param gasValues - Gas values to update.
   * @param gasValues.gas - Same as transaction.gasLimit.
   * @param gasValues.gasLimit - Maxmimum number of units of gas to use for this transaction.
   * @param gasValues.gasPrice - Price per gas for legacy transactions.
   * @param gasValues.maxPriorityFeePerGas - Maximum amount per gas to give to validator as incentive.
   * @param gasValues.maxFeePerGas - Maximum amount per gas to pay for the transaction, including the priority fee.
   * @param gasValues.estimateUsed - Which estimate level was used.
   * @param gasValues.estimateSuggested - Which estimate level that the API suggested.
   * @param gasValues.defaultGasEstimates - The default estimate for gas.
   * @param gasValues.originalGasEstimate - Original estimate for gas.
   * @param gasValues.userEditedGasLimit - The gas limit supplied by user.
   * @param gasValues.userFeeLevel - Estimate level user selected.
   * @returns The updated transactionMeta.
   */
  updateTransactionGasFees(
    transactionId: string,
    {
      defaultGasEstimates,
      estimateUsed,
      estimateSuggested,
      gas,
      gasLimit,
      gasPrice,
      maxPriorityFeePerGas,
      maxFeePerGas,
      originalGasEstimate,
      userEditedGasLimit,
      userFeeLevel,
    }: {
      defaultGasEstimates?: string;
      estimateUsed?: string;
      estimateSuggested?: string;
      gas?: string;
      gasLimit?: string;
      gasPrice?: string;
      maxPriorityFeePerGas?: string;
      maxFeePerGas?: string;
      originalGasEstimate?: string;
      userEditedGasLimit?: boolean;
      userFeeLevel?: string;
    },
  ): TransactionMeta {
    const transactionMeta = this.getTransaction(transactionId);

    if (!transactionMeta) {
      throw new Error(
        `Cannot update transaction as no transaction metadata found`,
      );
    }

    validateIfTransactionUnapproved(
      transactionMeta,
      'updateTransactionGasFees',
    );

    let transactionGasFees = {
      txParams: {
        gas,
        gasLimit,
        gasPrice,
        maxPriorityFeePerGas,
        maxFeePerGas,
      },
      defaultGasEstimates,
      estimateUsed,
      estimateSuggested,
      originalGasEstimate,
      userEditedGasLimit,
      userFeeLevel,
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    // only update what is defined
    transactionGasFees.txParams = pickBy(transactionGasFees.txParams);
    transactionGasFees = pickBy(transactionGasFees);

    // merge updated gas values with existing transaction meta
    const updatedMeta = merge({}, transactionMeta, transactionGasFees);

    this.updateTransaction(
      updatedMeta,
      `${controllerName}:updateTransactionGasFees - gas values updated`,
    );

    return this.getTransaction(transactionId) as TransactionMeta;
  }

  /**
   * Update the previous gas values of a transaction.
   *
   * @param transactionId - The ID of the transaction to update.
   * @param previousGas - Previous gas values to update.
   * @param previousGas.gasLimit - Maxmimum number of units of gas to use for this transaction.
   * @param previousGas.maxFeePerGas - Maximum amount per gas to pay for the transaction, including the priority fee.
   * @param previousGas.maxPriorityFeePerGas - Maximum amount per gas to give to validator as incentive.
   * @returns The updated transactionMeta.
   */
  updatePreviousGasParams(
    transactionId: string,
    {
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
    }: {
      gasLimit?: string;
      maxFeePerGas?: string;
      maxPriorityFeePerGas?: string;
    },
  ): TransactionMeta {
    const transactionMeta = this.getTransaction(transactionId);

    if (!transactionMeta) {
      throw new Error(
        `Cannot update transaction as no transaction metadata found`,
      );
    }

    validateIfTransactionUnapproved(transactionMeta, 'updatePreviousGasParams');

    const transactionPreviousGas = {
      previousGas: {
        gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas,
      },
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    // only update what is defined
    transactionPreviousGas.previousGas = pickBy(
      transactionPreviousGas.previousGas,
    );

    // merge updated previous gas values with existing transaction meta
    const updatedMeta = merge({}, transactionMeta, transactionPreviousGas);

    this.updateTransaction(
      updatedMeta,
      `${controllerName}:updatePreviousGasParams - Previous gas values updated`,
    );

    return this.getTransaction(transactionId) as TransactionMeta;
  }

  async getNonceLock(
    address: string,
    networkClientId?: NetworkClientId,
  ): Promise<NonceLock> {
    return this.#multichainTrackingHelper.getNonceLock(
      address,
      networkClientId,
    );
  }

  /**
   * Updates the editable parameters of a transaction.
   *
   * @param txId - The ID of the transaction to update.
   * @param params - The editable parameters to update.
   * @param params.data - Data to pass with the transaction.
   * @param params.gas - Maximum number of units of gas to use for the transaction.
   * @param params.gasPrice - Price per gas for legacy transactions.
   * @param params.from - Address to send the transaction from.
   * @param params.to - Address to send the transaction to.
   * @param params.value - Value associated with the transaction.
   * @returns The updated transaction metadata.
   */
  async updateEditableParams(
    txId: string,
    {
      data,
      gas,
      gasPrice,
      from,
      to,
      value,
    }: {
      data?: string;
      gas?: string;
      gasPrice?: string;
      from?: string;
      to?: string;
      value?: string;
    },
  ) {
    const transactionMeta = this.getTransaction(txId);
    if (!transactionMeta) {
      throw new Error(
        `Cannot update editable params as no transaction metadata found`,
      );
    }

    validateIfTransactionUnapproved(transactionMeta, 'updateEditableParams');

    const editableParams = {
      txParams: {
        data,
        from,
        to,
        value,
        gas,
        gasPrice,
      },
    } as Partial<TransactionMeta>;

    editableParams.txParams = pickBy(
      editableParams.txParams,
    ) as TransactionParams;

    const updatedTransaction = merge({}, transactionMeta, editableParams);
    const provider = this.#multichainTrackingHelper.getProvider({
      chainId: transactionMeta.chainId,
      networkClientId: transactionMeta.networkClientId,
    });
    const ethQuery = new EthQuery(provider);
    const { type } = await determineTransactionType(
      updatedTransaction.txParams,
      ethQuery,
    );
    updatedTransaction.type = type;

    await updateTransactionLayer1GasFee({
      layer1GasFeeFlows: this.layer1GasFeeFlows,
      provider,
      transactionMeta: updatedTransaction,
    });

    this.updateTransaction(
      updatedTransaction,
      `Update Editable Params for ${txId}`,
    );
    return this.getTransaction(txId);
  }

  /**
   * Signs and returns the raw transaction data for provided transaction params list.
   *
   * @param listOfTxParams - The list of transaction params to approve.
   * @param opts - Options bag.
   * @param opts.hasNonce - Whether the transactions already have a nonce.
   * @returns The raw transactions.
   */
  async approveTransactionsWithSameNonce(
    listOfTxParams: (TransactionParams & { chainId: Hex })[] = [],
    { hasNonce }: { hasNonce?: boolean } = {},
  ): Promise<string | string[]> {
    log('Approving transactions with same nonce', {
      transactions: listOfTxParams,
    });

    if (listOfTxParams.length === 0) {
      return '';
    }

    const initialTx = listOfTxParams[0];
    const common = this.getCommonConfiguration(initialTx.chainId);

    // We need to ensure we get the nonce using the the NonceTracker on the chain matching
    // the txParams. In this context we only have chainId available to us, but the
    // NonceTrackers are keyed by networkClientId. To workaround this, we attempt to find
    // a networkClientId that matches the chainId. As a fallback, the globally selected
    // network's NonceTracker will be used instead.
    let networkClientId: NetworkClientId | undefined;
    try {
      networkClientId = this.messagingSystem.call(
        `NetworkController:findNetworkClientIdByChainId`,
        initialTx.chainId,
      );
    } catch (err) {
      log('failed to find networkClientId from chainId', err);
    }

    const initialTxAsEthTx = TransactionFactory.fromTxData(initialTx, {
      common,
    });
    const initialTxAsSerializedHex = bufferToHex(initialTxAsEthTx.serialize());

    if (this.approvingTransactionIds.has(initialTxAsSerializedHex)) {
      return '';
    }
    this.approvingTransactionIds.add(initialTxAsSerializedHex);

    let rawTransactions, nonceLock;
    try {
      // TODO: we should add a check to verify that all transactions have the same from address
      const fromAddress = initialTx.from;
      const requiresNonce = hasNonce !== true;

      nonceLock = requiresNonce
        ? await this.getNonceLock(fromAddress, networkClientId)
        : undefined;

      const nonce = nonceLock
        ? add0x(nonceLock.nextNonce.toString(16))
        : initialTx.nonce;

      if (nonceLock) {
        log('Using nonce from nonce tracker', nonce, nonceLock.nonceDetails);
      }

      rawTransactions = await Promise.all(
        listOfTxParams.map((txParams) => {
          txParams.nonce = nonce;
          return this.signExternalTransaction(txParams.chainId, txParams);
        }),
      );
    } catch (err) {
      log('Error while signing transactions with same nonce', err);
      // Must set transaction to submitted/failed before releasing lock
      // continue with error chain
      throw err;
    } finally {
      nonceLock?.releaseLock();
      this.approvingTransactionIds.delete(initialTxAsSerializedHex);
    }
    return rawTransactions;
  }

  /**
   * Update a custodial transaction.
   *
   * @param transactionId - The ID of the transaction to update.
   * @param options - The custodial transaction options to update.
   * @param options.errorMessage - The error message to be assigned in case transaction status update to failed.
   * @param options.hash - The new hash value to be assigned.
   * @param options.status - The new status value to be assigned.
   */
  updateCustodialTransaction(
    transactionId: string,
    {
      errorMessage,
      hash,
      status,
    }: {
      errorMessage?: string;
      hash?: string;
      status?: TransactionStatus;
    },
  ) {
    const transactionMeta = this.getTransaction(transactionId);

    if (!transactionMeta) {
      throw new Error(
        `Cannot update custodial transaction as no transaction metadata found`,
      );
    }

    if (!transactionMeta.custodyId) {
      throw new Error('Transaction must be a custodian transaction');
    }

    if (
      status &&
      ![
        TransactionStatus.submitted,
        TransactionStatus.signed,
        TransactionStatus.failed,
      ].includes(status)
    ) {
      throw new Error(
        `Cannot update custodial transaction with status: ${status}`,
      );
    }

    const updatedTransactionMeta = merge(
      {},
      transactionMeta,
      pickBy({ hash, status }),
    ) as TransactionMeta;

    if (updatedTransactionMeta.status === TransactionStatus.submitted) {
      updatedTransactionMeta.submittedTime = new Date().getTime();
    }

    if (updatedTransactionMeta.status === TransactionStatus.failed) {
      updatedTransactionMeta.error = normalizeTxError(new Error(errorMessage));
    }

    this.updateTransaction(
      updatedTransactionMeta,
      `${controllerName}:updateCustodialTransaction - Custodial transaction updated`,
    );

    if (
      [TransactionStatus.submitted, TransactionStatus.failed].includes(
        status as TransactionStatus,
      )
    ) {
      this.messagingSystem.publish(
        `${controllerName}:transactionFinished`,
        updatedTransactionMeta,
      );
      this.#internalEvents.emit(
        `${updatedTransactionMeta.id}:finished`,
        updatedTransactionMeta,
      );
    }
  }

  /**
   * Creates approvals for all unapproved transactions persisted.
   */
  initApprovals() {
    const chainId = this.getChainId();
    const unapprovedTxs = this.state.transactions.filter(
      (transaction) =>
        transaction.status === TransactionStatus.unapproved &&
        transaction.chainId === chainId &&
        !transaction.isUserOperation,
    );

    for (const txMeta of unapprovedTxs) {
      this.processApproval(txMeta, {
        shouldShowRequest: false,
      }).catch((error) => {
        if (error?.code === errorCodes.provider.userRejectedRequest) {
          return;
        }
        console.error('Error during persisted transaction approval', error);
      });
    }
  }

  /**
   * Search transaction metadata for matching entries.
   *
   * @param opts - Options bag.
   * @param opts.searchCriteria - An object containing values or functions for transaction properties to filter transactions with.
   * @param opts.initialList - The transactions to search. Defaults to the current state.
   * @param opts.filterToCurrentNetwork - Whether to filter the results to the current network. Defaults to true.
   * @param opts.limit - The maximum number of transactions to return. No limit by default.
   * @returns An array of transactions matching the provided options.
   */
  getTransactions({
    searchCriteria = {},
    initialList,
    filterToCurrentNetwork = true,
    limit,
  }: {
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    searchCriteria?: any;
    initialList?: TransactionMeta[];
    filterToCurrentNetwork?: boolean;
    limit?: number;
  } = {}): TransactionMeta[] {
    const chainId = this.getChainId();
    // searchCriteria is an object that might have values that aren't predicate
    // methods. When providing any other value type (string, number, etc), we
    // consider this shorthand for "check the value at key for strict equality
    // with the provided value". To conform this object to be only methods, we
    // mapValues (lodash) such that every value on the object is a method that
    // returns a boolean.
    const predicateMethods = mapValues(searchCriteria, (predicate) => {
      return typeof predicate === 'function'
        ? predicate
        : // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (v: any) => v === predicate;
    });

    const transactionsToFilter = initialList ?? this.state.transactions;

    // Combine sortBy and pickBy to transform our state object into an array of
    // matching transactions that are sorted by time.
    const filteredTransactions = sortBy(
      pickBy(transactionsToFilter, (transaction) => {
        if (filterToCurrentNetwork && transaction.chainId !== chainId) {
          return false;
        }
        // iterate over the predicateMethods keys to check if the transaction
        // matches the searchCriteria
        for (const [key, predicate] of Object.entries(predicateMethods)) {
          // We return false early as soon as we know that one of the specified
          // search criteria do not match the transaction. This prevents
          // needlessly checking all criteria when we already know the criteria
          // are not fully satisfied. We check both txParams and the base
          // object as predicate keys can be either.
          if (key in transaction.txParams) {
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (predicate((transaction.txParams as any)[key]) === false) {
              return false;
            }
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } else if (predicate((transaction as any)[key]) === false) {
            return false;
          }
        }

        return true;
      }),
      'time',
    );
    if (limit !== undefined) {
      // We need to have all transactions of a given nonce in order to display
      // necessary details in the UI. We use the size of this set to determine
      // whether we have reached the limit provided, thus ensuring that all
      // transactions of nonces we include will be sent to the UI.
      const nonces = new Set();
      const txs = [];
      // By default, the transaction list we filter from is sorted by time ASC.
      // To ensure that filtered results prefers the newest transactions we
      // iterate from right to left, inserting transactions into front of a new
      // array. The original order is preserved, but we ensure that newest txs
      // are preferred.
      for (let i = filteredTransactions.length - 1; i > -1; i--) {
        const txMeta = filteredTransactions[i];
        const { nonce } = txMeta.txParams;
        if (!nonces.has(nonce)) {
          if (nonces.size < limit) {
            nonces.add(nonce);
          } else {
            continue;
          }
        }
        // Push transaction into the beginning of our array to ensure the
        // original order is preserved.
        txs.unshift(txMeta);
      }
      return txs;
    }
    return filteredTransactions;
  }

  async estimateGasFee({
    transactionParams,
    chainId,
    networkClientId: requestNetworkClientId,
  }: {
    transactionParams: TransactionParams;
    chainId?: Hex;
    networkClientId?: NetworkClientId;
  }): Promise<GasFeeFlowResponse> {
    const networkClientId = this.#getNetworkClientId({
      networkClientId: requestNetworkClientId,
      chainId,
    });

    const transactionMeta = {
      txParams: transactionParams,
      chainId,
      networkClientId,
    } as TransactionMeta;

    // Guaranteed as the default gas fee flow matches all transactions.
    const gasFeeFlow = getGasFeeFlow(
      transactionMeta,
      this.gasFeeFlows,
    ) as GasFeeFlow;

    const ethQuery = this.#multichainTrackingHelper.getEthQuery({
      networkClientId,
      chainId,
    });

    const gasFeeControllerData = await this.getGasFeeEstimates({
      networkClientId,
    });

    return gasFeeFlow.getGasFees({
      ethQuery,
      gasFeeControllerData,
      transactionMeta,
    });
  }

  /**
   * Determine the layer 1 gas fee for the given transaction parameters.
   *
   * @param request - The request object.
   * @param request.transactionParams - The transaction parameters to estimate the layer 1 gas fee for.
   * @param request.chainId - The ID of the chain where the transaction will be executed.
   * @param request.networkClientId - The ID of a specific network client to process the transaction.
   */
  async getLayer1GasFee({
    transactionParams,
    chainId,
    networkClientId,
  }: {
    transactionParams: TransactionParams;
    chainId?: Hex;
    networkClientId?: NetworkClientId;
  }): Promise<Hex | undefined> {
    const provider = this.#multichainTrackingHelper.getProvider({
      networkClientId,
      chainId,
    });

    return await getTransactionLayer1GasFee({
      layer1GasFeeFlows: this.layer1GasFeeFlows,
      provider,
      transactionMeta: {
        txParams: transactionParams,
        chainId,
      } as TransactionMeta,
    });
  }

  private async signExternalTransaction(
    chainId: Hex,
    transactionParams: TransactionParams,
  ): Promise<string> {
    if (!this.sign) {
      throw new Error('No sign method defined.');
    }

    const normalizedTransactionParams =
      normalizeTransactionParams(transactionParams);
    const type = isEIP1559Transaction(normalizedTransactionParams)
      ? TransactionEnvelopeType.feeMarket
      : TransactionEnvelopeType.legacy;
    const updatedTransactionParams = {
      ...normalizedTransactionParams,
      type,
      gasLimit: normalizedTransactionParams.gas,
      chainId,
    };

    const { from } = updatedTransactionParams;
    const common = this.getCommonConfiguration(chainId);
    const unsignedTransaction = TransactionFactory.fromTxData(
      updatedTransactionParams,
      { common },
    );
    const signedTransaction = await this.sign(unsignedTransaction, from);

    const rawTransaction = bufferToHex(signedTransaction.serialize());
    return rawTransaction;
  }

  /**
   * Removes unapproved transactions from state.
   */
  clearUnapprovedTransactions() {
    const transactions = this.state.transactions.filter(
      ({ status }) => status !== TransactionStatus.unapproved,
    );
    this.update((state) => {
      state.transactions = this.trimTransactionsForState(transactions);
    });
  }

  /**
   * Stop the signing process for a specific transaction.
   * Throws an error causing the transaction status to be set to failed.
   * @param transactionId - The ID of the transaction to stop signing.
   */
  abortTransactionSigning(transactionId: string) {
    const transactionMeta = this.getTransaction(transactionId);

    if (!transactionMeta) {
      throw new Error(`Cannot abort signing as no transaction metadata found`);
    }

    const abortCallback = this.signAbortCallbacks.get(transactionId);

    if (!abortCallback) {
      throw new Error(
        `Cannot abort signing as transaction is not waiting for signing`,
      );
    }

    abortCallback();

    this.signAbortCallbacks.delete(transactionId);
  }

  private addMetadata(transactionMeta: TransactionMeta) {
    this.update((state) => {
      state.transactions = this.trimTransactionsForState([
        ...state.transactions,
        transactionMeta,
      ]);
    });
  }

  private async updateGasProperties(transactionMeta: TransactionMeta) {
    const isEIP1559Compatible =
      (await this.getEIP1559Compatibility(transactionMeta.networkClientId)) &&
      transactionMeta.txParams.type !== TransactionEnvelopeType.legacy;

    const { networkClientId, chainId } = transactionMeta;

    const isCustomNetwork = this.#isCustomNetwork(networkClientId);

    const ethQuery = this.#multichainTrackingHelper.getEthQuery({
      networkClientId,
      chainId,
    });

    const provider = this.#multichainTrackingHelper.getProvider({
      networkClientId,
      chainId,
    });

    await updateGas({
      ethQuery,
      chainId,
      isCustomNetwork,
      txMeta: transactionMeta,
    });

    await updateGasFees({
      eip1559: isEIP1559Compatible,
      ethQuery,
      gasFeeFlows: this.gasFeeFlows,
      getGasFeeEstimates: this.getGasFeeEstimates,
      getSavedGasFees: this.getSavedGasFees.bind(this),
      txMeta: transactionMeta,
    });

    await updateTransactionLayer1GasFee({
      layer1GasFeeFlows: this.layer1GasFeeFlows,
      provider,
      transactionMeta,
    });
  }

  private onBootCleanup() {
    this.submitApprovedTransactions();
  }

  /**
   * Force submit approved transactions for all chains.
   */
  private submitApprovedTransactions() {
    const approvedTransactions = this.state.transactions.filter(
      (transaction) => transaction.status === TransactionStatus.approved,
    );

    for (const transactionMeta of approvedTransactions) {
      if (this.beforeApproveOnInit(transactionMeta)) {
        this.approveTransaction(transactionMeta.id).catch((error) => {
          /* istanbul ignore next */
          console.error('Error while submitting persisted transaction', error);
        });
      }
    }
  }

  private async processApproval(
    transactionMeta: TransactionMeta,
    {
      isExisting = false,
      requireApproval,
      shouldShowRequest = true,
      actionId,
    }: {
      isExisting?: boolean;
      requireApproval?: boolean | undefined;
      shouldShowRequest?: boolean;
      actionId?: string;
    },
  ): Promise<string> {
    const transactionId = transactionMeta.id;
    let resultCallbacks: AcceptResultCallbacks | undefined;
    const { meta, isCompleted } = this.isTransactionCompleted(transactionId);
    const finishedPromise = isCompleted
      ? Promise.resolve(meta)
      : this.waitForTransactionFinished(transactionId);

    if (meta && !isExisting && !isCompleted) {
      try {
        if (requireApproval !== false) {
          const acceptResult = await this.requestApproval(transactionMeta, {
            shouldShowRequest,
          });
          resultCallbacks = acceptResult.resultCallbacks;

          const approvalValue = acceptResult.value as
            | {
                txMeta?: TransactionMeta;
              }
            | undefined;

          const updatedTransaction = approvalValue?.txMeta;

          if (updatedTransaction) {
            log('Updating transaction with approval data', {
              customNonce: updatedTransaction.customNonceValue,
              params: updatedTransaction.txParams,
            });

            this.updateTransaction(
              updatedTransaction,
              'TransactionController#processApproval - Updated with approval data',
            );
          }
        }

        const { isCompleted: isTxCompleted } =
          this.isTransactionCompleted(transactionId);

        if (!isTxCompleted) {
          const approvalResult = await this.approveTransaction(transactionId);
          if (
            approvalResult === ApprovalState.SkippedViaBeforePublishHook &&
            resultCallbacks
          ) {
            resultCallbacks.success();
          }
          const updatedTransactionMeta = this.getTransaction(
            transactionId,
          ) as TransactionMeta;
          this.messagingSystem.publish(
            `${controllerName}:transactionApproved`,
            {
              transactionMeta: updatedTransactionMeta,
              actionId,
            },
          );
        }
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        const { isCompleted: isTxCompleted } =
          this.isTransactionCompleted(transactionId);
        if (!isTxCompleted) {
          if (error?.code === errorCodes.provider.userRejectedRequest) {
            this.cancelTransaction(transactionId, actionId);

            throw providerErrors.userRejectedRequest(
              'MetaMask Tx Signature: User denied transaction signature.',
            );
          } else {
            this.failTransaction(meta, error, actionId);
          }
        }
      }
    }

    const finalMeta = await finishedPromise;

    switch (finalMeta?.status) {
      case TransactionStatus.failed:
        resultCallbacks?.error(finalMeta.error);
        throw rpcErrors.internal(finalMeta.error.message);

      case TransactionStatus.submitted:
        resultCallbacks?.success();
        return finalMeta.hash as string;

      default:
        const internalError = rpcErrors.internal(
          `MetaMask Tx Signature: Unknown problem: ${JSON.stringify(
            finalMeta || transactionId,
          )}`,
        );

        resultCallbacks?.error(internalError);
        throw internalError;
    }
  }

  /**
   * Approves a transaction and updates it's status in state. If this is not a
   * retry transaction, a nonce will be generated. The transaction is signed
   * using the sign configuration property, then published to the blockchain.
   * A `<tx.id>:finished` hub event is fired after success or failure.
   *
   * @param transactionId - The ID of the transaction to approve.
   */
  private async approveTransaction(transactionId: string) {
    const cleanupTasks = new Array<() => void>();
    cleanupTasks.push(await this.mutex.acquire());

    let transactionMeta = this.getTransactionOrThrow(transactionId);

    try {
      if (!this.sign) {
        this.failTransaction(
          transactionMeta,
          new Error('No sign method defined.'),
        );
        return ApprovalState.NotApproved;
      } else if (!transactionMeta.chainId) {
        this.failTransaction(transactionMeta, new Error('No chainId defined.'));
        return ApprovalState.NotApproved;
      }

      if (this.approvingTransactionIds.has(transactionId)) {
        log('Skipping approval as signing in progress', transactionId);
        return ApprovalState.NotApproved;
      }
      this.approvingTransactionIds.add(transactionId);
      cleanupTasks.push(() =>
        this.approvingTransactionIds.delete(transactionId),
      );

      const [nonce, releaseNonce] = await getNextNonce(
        transactionMeta,
        (address: string) =>
          this.#multichainTrackingHelper.getNonceLock(
            address,
            transactionMeta.networkClientId,
          ),
      );

      // must set transaction to submitted/failed before releasing lock
      releaseNonce && cleanupTasks.push(releaseNonce);

      transactionMeta = this.#updateTransactionInternal(
        {
          transactionId,
          note: 'TransactionController#approveTransaction - Transaction approved',
        },
        (draftTxMeta) => {
          const { txParams, chainId } = draftTxMeta;

          draftTxMeta.status = TransactionStatus.approved;
          draftTxMeta.txParams = {
            ...txParams,
            nonce,
            chainId,
            gasLimit: txParams.gas,
            ...(isEIP1559Transaction(txParams) && {
              type: TransactionEnvelopeType.feeMarket,
            }),
          };
        },
      );

      this.onTransactionStatusChange(transactionMeta);

      const rawTx = await this.signTransaction(
        transactionMeta,
        transactionMeta.txParams,
      );

      if (!this.beforePublish(transactionMeta)) {
        log('Skipping publishing transaction based on hook');
        this.messagingSystem.publish(
          `${controllerName}:transactionPublishingSkipped`,
          transactionMeta,
        );
        return ApprovalState.SkippedViaBeforePublishHook;
      }

      if (!rawTx) {
        return ApprovalState.NotApproved;
      }

      const ethQuery = this.#multichainTrackingHelper.getEthQuery({
        networkClientId: transactionMeta.networkClientId,
        chainId: transactionMeta.chainId,
      });

      let preTxBalance: string | undefined;
      const shouldUpdatePreTxBalance =
        transactionMeta.type === TransactionType.swap;

      if (shouldUpdatePreTxBalance) {
        log('Determining pre-transaction balance');

        preTxBalance = await query(ethQuery, 'getBalance', [
          transactionMeta.txParams.from,
        ]);
      }

      log('Publishing transaction', transactionMeta.txParams);

      let { transactionHash: hash } = await this.publish(
        transactionMeta,
        rawTx,
      );

      if (hash === undefined) {
        hash = await this.publishTransaction(ethQuery, rawTx);
      }

      log('Publish successful', hash);

      transactionMeta = this.#updateTransactionInternal(
        {
          transactionId,
          note: 'TransactionController#approveTransaction - Transaction submitted',
        },
        (draftTxMeta) => {
          draftTxMeta.hash = hash;
          draftTxMeta.status = TransactionStatus.submitted;
          draftTxMeta.submittedTime = new Date().getTime();
          if (shouldUpdatePreTxBalance) {
            draftTxMeta.preTxBalance = preTxBalance;
            log('Updated pre-transaction balance', preTxBalance);
          }
        },
      );

      this.messagingSystem.publish(`${controllerName}:transactionSubmitted`, {
        transactionMeta,
      });

      this.messagingSystem.publish(
        `${controllerName}:transactionFinished`,
        transactionMeta,
      );
      this.#internalEvents.emit(`${transactionId}:finished`, transactionMeta);

      this.onTransactionStatusChange(transactionMeta);
      return ApprovalState.Approved;
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      this.failTransaction(transactionMeta, error);
      return ApprovalState.NotApproved;
    } finally {
      cleanupTasks.forEach((task) => task());
    }
  }

  private async publishTransaction(
    ethQuery: EthQuery,
    rawTransaction: string,
  ): Promise<string> {
    return await query(ethQuery, 'sendRawTransaction', [rawTransaction]);
  }

  /**
   * Cancels a transaction based on its ID by setting its status to "rejected"
   * and emitting a `<tx.id>:finished` hub event.
   *
   * @param transactionId - The ID of the transaction to cancel.
   * @param actionId - The actionId passed from UI
   */
  private cancelTransaction(transactionId: string, actionId?: string) {
    const transactionMeta = this.state.transactions.find(
      ({ id }) => id === transactionId,
    );
    if (!transactionMeta) {
      return;
    }
    this.update((state) => {
      const transactions = state.transactions.filter(
        ({ id }) => id !== transactionId,
      );
      state.transactions = this.trimTransactionsForState(transactions);
    });
    const updatedTransactionMeta = {
      ...transactionMeta,
      status: TransactionStatus.rejected as const,
    };
    this.messagingSystem.publish(
      `${controllerName}:transactionFinished`,
      updatedTransactionMeta,
    );
    this.#internalEvents.emit(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${transactionMeta.id}:finished`,
      updatedTransactionMeta,
    );
    this.messagingSystem.publish(`${controllerName}:transactionRejected`, {
      transactionMeta: updatedTransactionMeta,
      actionId,
    });
    this.onTransactionStatusChange(updatedTransactionMeta);
  }

  /**
   * Trim the amount of transactions that are set on the state. Checks
   * if the length of the tx history is longer then desired persistence
   * limit and then if it is removes the oldest confirmed or rejected tx.
   * Pending or unapproved transactions will not be removed by this
   * operation. For safety of presenting a fully functional transaction UI
   * representation, this function will not break apart transactions with the
   * same nonce, created on the same day, per network. Not accounting for
   * transactions of the same nonce, same day and network combo can result in
   * confusing or broken experiences in the UI.
   *
   * @param transactions - The transactions to be applied to the state.
   * @returns The trimmed list of transactions.
   */
  private trimTransactionsForState(
    transactions: TransactionMeta[],
  ): TransactionMeta[] {
    const nonceNetworkSet = new Set();

    const txsToKeep = [...transactions]
      .sort((a, b) => (a.time > b.time ? -1 : 1)) // Descending time order
      .filter((tx) => {
        const { chainId, status, txParams, time } = tx;

        if (txParams) {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          const key = `${String(txParams.nonce)}-${convertHexToDecimal(
            chainId,
          )}-${new Date(time).toDateString()}`;

          if (nonceNetworkSet.has(key)) {
            return true;
          } else if (
            nonceNetworkSet.size < this.#transactionHistoryLimit ||
            !this.isFinalState(status)
          ) {
            nonceNetworkSet.add(key);
            return true;
          }
        }

        return false;
      });

    txsToKeep.reverse(); // Ascending time order
    return txsToKeep;
  }

  /**
   * Determines if the transaction is in a final state.
   *
   * @param status - The transaction status.
   * @returns Whether the transaction is in a final state.
   */
  private isFinalState(status: TransactionStatus): boolean {
    return (
      status === TransactionStatus.rejected ||
      status === TransactionStatus.confirmed ||
      status === TransactionStatus.failed
    );
  }

  /**
   * Whether the transaction has at least completed all local processing.
   *
   * @param status - The transaction status.
   * @returns Whether the transaction is in a final state.
   */
  private isLocalFinalState(status: TransactionStatus): boolean {
    return [
      TransactionStatus.confirmed,
      TransactionStatus.failed,
      TransactionStatus.rejected,
      TransactionStatus.submitted,
    ].includes(status);
  }

  private async requestApproval(
    txMeta: TransactionMeta,
    { shouldShowRequest }: { shouldShowRequest: boolean },
  ): Promise<AddResult> {
    const id = this.getApprovalId(txMeta);
    const { origin } = txMeta;
    const type = ApprovalType.Transaction;
    const requestData = { txId: txMeta.id };

    return (await this.messagingSystem.call(
      'ApprovalController:addRequest',
      {
        id,
        origin: origin || ORIGIN_METAMASK,
        type,
        requestData,
        expectsResult: true,
      },
      shouldShowRequest,
    )) as Promise<AddResult>;
  }

  private getTransaction(
    transactionId: string,
  ): Readonly<TransactionMeta> | undefined {
    const { transactions } = this.state;
    return transactions.find(({ id }) => id === transactionId);
  }

  private getTransactionOrThrow(
    transactionId: string,
    errorMessagePrefix = 'TransactionController',
  ): Readonly<TransactionMeta> {
    const txMeta = this.getTransaction(transactionId);
    if (!txMeta) {
      throw new Error(
        `${errorMessagePrefix}: No transaction found with id ${transactionId}`,
      );
    }
    return txMeta;
  }

  private getApprovalId(txMeta: TransactionMeta) {
    return String(txMeta.id);
  }

  private isTransactionCompleted(transactionId: string): {
    meta?: TransactionMeta;
    isCompleted: boolean;
  } {
    const transaction = this.getTransaction(transactionId);

    if (!transaction) {
      return { meta: undefined, isCompleted: false };
    }

    const isCompleted = this.isLocalFinalState(transaction.status);

    return { meta: transaction, isCompleted };
  }

  private getChainId(networkClientId?: NetworkClientId): Hex {
    const globalChainId = this.#getGlobalChainId();
    const globalNetworkClientId = this.#getGlobalNetworkClientId();

    if (!networkClientId || networkClientId === globalNetworkClientId) {
      return globalChainId;
    }

    return this.messagingSystem.call(
      `NetworkController:getNetworkClientById`,
      networkClientId,
    ).configuration.chainId;
  }

  private prepareUnsignedEthTx(
    chainId: Hex,
    txParams: TransactionParams,
  ): TypedTransaction {
    return TransactionFactory.fromTxData(txParams, {
      freeze: false,
      common: this.getCommonConfiguration(chainId),
    });
  }

  /**
   * `@ethereumjs/tx` uses `@ethereumjs/common` as a configuration tool for
   * specifying which chain, network, hardfork and EIPs to support for
   * a transaction. By referencing this configuration, and analyzing the fields
   * specified in txParams, @ethereumjs/tx is able to determine which EIP-2718
   * transaction type to use.
   *
   * @param chainId - The chainId to use for the configuration.
   * @returns common configuration object
   */
  private getCommonConfiguration(chainId: Hex): Common {
    const customChainParams: Partial<ChainConfig> = {
      chainId: parseInt(chainId, 16),
      defaultHardfork: HARDFORK,
    };

    return Common.custom(customChainParams);
  }

  private onIncomingTransactions({
    added,
    updated,
  }: {
    added: TransactionMeta[];
    updated: TransactionMeta[];
  }) {
    this.update((state) => {
      const { transactions: currentTransactions } = state;
      const updatedTransactions = [
        ...added,
        ...currentTransactions.map((originalTransaction) => {
          const updatedTransaction = updated.find(
            ({ hash }) => hash === originalTransaction.hash,
          );

          return updatedTransaction ?? originalTransaction;
        }),
      ];

      state.transactions = this.trimTransactionsForState(updatedTransactions);
    });
  }

  private onUpdatedLastFetchedBlockNumbers({
    lastFetchedBlockNumbers,
    blockNumber,
  }: {
    lastFetchedBlockNumbers: {
      [key: string]: number;
    };
    blockNumber: number;
  }) {
    this.update((state) => {
      state.lastFetchedBlockNumbers = lastFetchedBlockNumbers;
    });
    this.messagingSystem.publish(
      `${controllerName}:incomingTransactionBlockReceived`,
      blockNumber,
    );
  }

  private generateDappSuggestedGasFees(
    txParams: TransactionParams,
    origin?: string,
  ): DappSuggestedGasFees | undefined {
    if (!origin || origin === ORIGIN_METAMASK) {
      return undefined;
    }

    const { gasPrice, maxFeePerGas, maxPriorityFeePerGas, gas } = txParams;

    if (
      gasPrice === undefined &&
      maxFeePerGas === undefined &&
      maxPriorityFeePerGas === undefined &&
      gas === undefined
    ) {
      return undefined;
    }

    const dappSuggestedGasFees: DappSuggestedGasFees = {};

    if (gasPrice !== undefined) {
      dappSuggestedGasFees.gasPrice = gasPrice;
    } else if (
      maxFeePerGas !== undefined ||
      maxPriorityFeePerGas !== undefined
    ) {
      dappSuggestedGasFees.maxFeePerGas = maxFeePerGas;
      dappSuggestedGasFees.maxPriorityFeePerGas = maxPriorityFeePerGas;
    }

    if (gas !== undefined) {
      dappSuggestedGasFees.gas = gas;
    }

    return dappSuggestedGasFees;
  }

  /**
   * Validates and adds external provided transaction to state.
   *
   * @param transactionMeta - Nominated external transaction to be added to state.
   * @returns The new transaction.
   */
  private addExternalTransaction(transactionMeta: TransactionMeta) {
    const { chainId } = transactionMeta;
    const { transactions } = this.state;
    const fromAddress = transactionMeta?.txParams?.from;
    const sameFromAndNetworkTransactions = transactions.filter(
      (transaction) =>
        transaction.txParams.from === fromAddress &&
        transaction.chainId === chainId,
    );
    const confirmedTxs = sameFromAndNetworkTransactions.filter(
      (transaction) => transaction.status === TransactionStatus.confirmed,
    );
    const pendingTxs = sameFromAndNetworkTransactions.filter(
      (transaction) => transaction.status === TransactionStatus.submitted,
    );

    validateConfirmedExternalTransaction(
      transactionMeta,
      confirmedTxs,
      pendingTxs,
    );

    // Make sure provided external transaction has non empty history array
    const newTransactionMeta =
      (transactionMeta.history ?? []).length === 0 && !this.isHistoryDisabled
        ? addInitialHistorySnapshot(transactionMeta)
        : transactionMeta;

    this.update((state) => {
      state.transactions = this.trimTransactionsForState([
        ...state.transactions,
        newTransactionMeta,
      ]);
    });

    return newTransactionMeta;
  }

  /**
   * Sets other txMeta statuses to dropped if the txMeta that has been confirmed has other transactions
   * in the transactions have the same nonce.
   *
   * @param transactionId - Used to identify original transaction.
   */
  private markNonceDuplicatesDropped(transactionId: string) {
    const transactionMeta = this.getTransaction(transactionId);
    if (!transactionMeta) {
      return;
    }
    const nonce = transactionMeta.txParams?.nonce;
    const from = transactionMeta.txParams?.from;
    const { chainId } = transactionMeta;

    const sameNonceTransactions = this.state.transactions.filter(
      (transaction) =>
        transaction.id !== transactionId &&
        transaction.txParams.from === from &&
        transaction.txParams.nonce === nonce &&
        transaction.chainId === chainId &&
        transaction.type !== TransactionType.incoming,
    );
    const sameNonceTransactionIds = sameNonceTransactions.map(
      (transaction) => transaction.id,
    );

    if (sameNonceTransactions.length === 0) {
      return;
    }

    this.update((state) => {
      for (const transaction of state.transactions) {
        if (sameNonceTransactionIds.includes(transaction.id)) {
          transaction.replacedBy = transactionMeta?.hash;
          transaction.replacedById = transactionMeta?.id;
        }
      }
    });

    for (const transaction of this.state.transactions) {
      if (
        sameNonceTransactionIds.includes(transaction.id) &&
        transaction.status !== TransactionStatus.failed
      ) {
        this.setTransactionStatusDropped(transaction);
      }
    }
  }

  /**
   * Method to set transaction status to dropped.
   *
   * @param transactionMeta - TransactionMeta of transaction to be marked as dropped.
   */
  private setTransactionStatusDropped(transactionMeta: TransactionMeta) {
    const updatedTransactionMeta = {
      ...transactionMeta,
      status: TransactionStatus.dropped as const,
    };
    this.messagingSystem.publish(`${controllerName}:transactionDropped`, {
      transactionMeta: updatedTransactionMeta,
    });
    this.updateTransaction(
      updatedTransactionMeta,
      'TransactionController#setTransactionStatusDropped - Transaction dropped',
    );
    this.onTransactionStatusChange(updatedTransactionMeta);
  }

  /**
   * Get transaction with provided actionId.
   *
   * @param actionId - Unique ID to prevent duplicate requests
   * @returns the filtered transaction
   */
  private getTransactionWithActionId(actionId?: string) {
    return this.state.transactions.find(
      (transaction) => actionId && transaction.actionId === actionId,
    );
  }

  private async waitForTransactionFinished(
    transactionId: string,
  ): Promise<TransactionMeta> {
    return new Promise((resolve) => {
      this.#internalEvents.once(`${transactionId}:finished`, (txMeta) => {
        resolve(txMeta);
      });
    });
  }

  /**
   * Updates the r, s, and v properties of a TransactionMeta object
   * with values from a signed transaction.
   *
   * @param transactionMeta - The TransactionMeta object to update.
   * @param signedTx - The encompassing type for all transaction types containing r, s, and v values.
   * @returns The updated TransactionMeta object.
   */
  private updateTransactionMetaRSV(
    transactionMeta: TransactionMeta,
    signedTx: TypedTransaction,
  ): TransactionMeta {
    const transactionMetaWithRsv = cloneDeep(transactionMeta);

    for (const key of ['r', 's', 'v'] as const) {
      const value = signedTx[key];

      if (value === undefined || value === null) {
        continue;
      }

      transactionMetaWithRsv[key] = add0x(value.toString(16));
    }

    return transactionMetaWithRsv;
  }

  private async getEIP1559Compatibility(networkClientId?: NetworkClientId) {
    const currentNetworkIsEIP1559Compatible =
      await this.getCurrentNetworkEIP1559Compatibility(networkClientId);

    const currentAccountIsEIP1559Compatible =
      await this.getCurrentAccountEIP1559Compatibility();

    return (
      currentNetworkIsEIP1559Compatible && currentAccountIsEIP1559Compatible
    );
  }

  private async signTransaction(
    transactionMeta: TransactionMeta,
    txParams: TransactionParams,
  ): Promise<string | undefined> {
    log('Signing transaction', txParams);

    const unsignedEthTx = this.prepareUnsignedEthTx(
      transactionMeta.chainId,
      txParams,
    );

    this.approvingTransactionIds.add(transactionMeta.id);

    const signedTx = await new Promise<TypedTransaction>((resolve, reject) => {
      this.sign?.(
        unsignedEthTx,
        txParams.from,
        ...this.getAdditionalSignArguments(transactionMeta),
      ).then(resolve, reject);

      this.signAbortCallbacks.set(transactionMeta.id, () =>
        reject(new Error('Signing aborted by user')),
      );
    });

    this.signAbortCallbacks.delete(transactionMeta.id);

    if (!signedTx) {
      log('Skipping signed status as no signed transaction');
      return undefined;
    }

    const transactionMetaFromHook = cloneDeep(transactionMeta);
    if (!this.afterSign(transactionMetaFromHook, signedTx)) {
      this.updateTransaction(
        transactionMetaFromHook,
        'TransactionController#signTransaction - Update after sign',
      );

      log('Skipping signed status based on hook');

      return undefined;
    }

    const transactionMetaWithRsv = {
      ...this.updateTransactionMetaRSV(transactionMetaFromHook, signedTx),
      status: TransactionStatus.signed as const,
    };

    this.updateTransaction(
      transactionMetaWithRsv,
      'TransactionController#approveTransaction - Transaction signed',
    );

    this.onTransactionStatusChange(transactionMetaWithRsv);

    const rawTx = bufferToHex(signedTx.serialize());

    const transactionMetaWithRawTx = merge({}, transactionMetaWithRsv, {
      rawTx,
    });

    this.updateTransaction(
      transactionMetaWithRawTx,
      'TransactionController#approveTransaction - RawTransaction added',
    );

    return rawTx;
  }

  private onTransactionStatusChange(transactionMeta: TransactionMeta) {
    this.messagingSystem.publish(`${controllerName}:transactionStatusUpdated`, {
      transactionMeta,
    });
  }

  private getNonceTrackerTransactions(
    status: TransactionStatus,
    address: string,
    chainId: string = this.getChainId(),
  ) {
    return getAndFormatTransactionsForNonceTracker(
      chainId,
      address,
      status,
      this.state.transactions,
    );
  }

  private onConfirmedTransaction(transactionMeta: TransactionMeta) {
    log('Processing confirmed transaction', transactionMeta.id);

    this.markNonceDuplicatesDropped(transactionMeta.id);

    this.messagingSystem.publish(
      `${controllerName}:transactionConfirmed`,
      transactionMeta,
    );

    this.onTransactionStatusChange(transactionMeta);

    // Intentional given potential duration of process.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.updatePostBalance(transactionMeta);
  }

  private async updatePostBalance(transactionMeta: TransactionMeta) {
    try {
      if (transactionMeta.type !== TransactionType.swap) {
        return;
      }

      const ethQuery = this.#multichainTrackingHelper.getEthQuery({
        networkClientId: transactionMeta.networkClientId,
        chainId: transactionMeta.chainId,
      });
      const { updatedTransactionMeta, approvalTransactionMeta } =
        await updatePostTransactionBalance(transactionMeta, {
          ethQuery,
          getTransaction: this.getTransaction.bind(this),
          updateTransaction: this.updateTransaction.bind(this),
        });

      this.messagingSystem.publish(
        `${controllerName}:postTransactionBalanceUpdated`,
        {
          transactionMeta: updatedTransactionMeta,
          approvalTransactionMeta,
        },
      );
    } catch (error) {
      /* istanbul ignore next */
      log('Error while updating post transaction balance', error);
    }
  }

  #createNonceTracker({
    provider,
    blockTracker,
    chainId,
  }: {
    provider: Provider;
    blockTracker: BlockTracker;
    chainId?: Hex;
  }): NonceTracker {
    return new NonceTracker({
      // TODO: Fix types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider: provider as any,
      // @ts-expect-error TODO: Fix types
      blockTracker,
      getPendingTransactions: this.#getNonceTrackerPendingTransactions.bind(
        this,
        chainId,
      ),
      getConfirmedTransactions: this.getNonceTrackerTransactions.bind(
        this,
        TransactionStatus.confirmed,
      ),
    });
  }

  #createIncomingTransactionHelper({
    blockTracker,
    etherscanRemoteTransactionSource,
    chainId,
  }: {
    blockTracker: BlockTracker;
    etherscanRemoteTransactionSource: EtherscanRemoteTransactionSource;
    chainId?: Hex;
  }): IncomingTransactionHelper {
    const incomingTransactionHelper = new IncomingTransactionHelper({
      blockTracker,
      getCurrentAccount: () => this.#getSelectedAccount(),
      getLastFetchedBlockNumbers: () => this.state.lastFetchedBlockNumbers,
      getChainId: chainId ? () => chainId : this.getChainId.bind(this),
      isEnabled: this.#incomingTransactionOptions.isEnabled,
      queryEntireHistory: this.#incomingTransactionOptions.queryEntireHistory,
      remoteTransactionSource: etherscanRemoteTransactionSource,
      transactionLimit: this.#transactionHistoryLimit,
      updateTransactions: this.#incomingTransactionOptions.updateTransactions,
    });

    this.#addIncomingTransactionHelperListeners(incomingTransactionHelper);

    return incomingTransactionHelper;
  }

  #createPendingTransactionTracker({
    provider,
    blockTracker,
    chainId,
  }: {
    provider: Provider;
    blockTracker: BlockTracker;
    chainId?: Hex;
  }): PendingTransactionTracker {
    const ethQuery = new EthQuery(provider);
    const getChainId = chainId ? () => chainId : this.getChainId.bind(this);

    const pendingTransactionTracker = new PendingTransactionTracker({
      approveTransaction: async (transactionId: string) => {
        await this.approveTransaction(transactionId);
      },
      blockTracker,
      getChainId,
      getEthQuery: () => ethQuery,
      getTransactions: () => this.state.transactions,
      isResubmitEnabled: this.#pendingTransactionOptions.isResubmitEnabled,
      getGlobalLock: () =>
        this.#multichainTrackingHelper.acquireNonceLockForChainIdKey({
          chainId: getChainId(),
        }),
      publishTransaction: this.publishTransaction.bind(this),
      hooks: {
        beforeCheckPendingTransaction:
          this.beforeCheckPendingTransaction.bind(this),
        beforePublish: this.beforePublish.bind(this),
      },
    });

    this.#addPendingTransactionTrackerListeners(pendingTransactionTracker);

    return pendingTransactionTracker;
  }

  #checkForPendingTransactionAndStartPolling = () => {
    // PendingTransactionTracker reads state through its getTransactions hook
    this.pendingTransactionTracker.startIfPendingTransactions();
    this.#multichainTrackingHelper.checkForPendingTransactionAndStartPolling();
  };

  #stopAllTracking() {
    this.pendingTransactionTracker.stop();
    this.#removePendingTransactionTrackerListeners(
      this.pendingTransactionTracker,
    );
    this.incomingTransactionHelper.stop();
    this.#removeIncomingTransactionHelperListeners(
      this.incomingTransactionHelper,
    );

    this.#multichainTrackingHelper.stopAllTracking();
  }

  #removeIncomingTransactionHelperListeners(
    incomingTransactionHelper: IncomingTransactionHelper,
  ) {
    incomingTransactionHelper.hub.removeAllListeners('transactions');
    incomingTransactionHelper.hub.removeAllListeners(
      'updatedLastFetchedBlockNumbers',
    );
  }

  #addIncomingTransactionHelperListeners(
    incomingTransactionHelper: IncomingTransactionHelper,
  ) {
    incomingTransactionHelper.hub.on(
      'transactions',
      this.onIncomingTransactions.bind(this),
    );
    incomingTransactionHelper.hub.on(
      'updatedLastFetchedBlockNumbers',
      this.onUpdatedLastFetchedBlockNumbers.bind(this),
    );
  }

  #removePendingTransactionTrackerListeners(
    pendingTransactionTracker: PendingTransactionTracker,
  ) {
    pendingTransactionTracker.hub.removeAllListeners('transaction-confirmed');
    pendingTransactionTracker.hub.removeAllListeners('transaction-dropped');
    pendingTransactionTracker.hub.removeAllListeners('transaction-failed');
    pendingTransactionTracker.hub.removeAllListeners('transaction-updated');
  }

  #addPendingTransactionTrackerListeners(
    pendingTransactionTracker: PendingTransactionTracker,
  ) {
    pendingTransactionTracker.hub.on(
      'transaction-confirmed',
      this.onConfirmedTransaction.bind(this),
    );

    pendingTransactionTracker.hub.on(
      'transaction-dropped',
      this.setTransactionStatusDropped.bind(this),
    );

    pendingTransactionTracker.hub.on(
      'transaction-failed',
      this.failTransaction.bind(this),
    );

    pendingTransactionTracker.hub.on(
      'transaction-updated',
      this.updateTransaction.bind(this),
    );
  }

  #getNonceTrackerPendingTransactions(
    chainId: string | undefined,
    address: string,
  ) {
    const standardPendingTransactions = this.getNonceTrackerTransactions(
      TransactionStatus.submitted,
      address,
      chainId,
    );

    const externalPendingTransactions = this.getExternalPendingTransactions(
      address,
      chainId,
    );
    return [...standardPendingTransactions, ...externalPendingTransactions];
  }

  private async publishTransactionForRetry(
    ethQuery: EthQuery,
    rawTx: string,
    transactionMeta: TransactionMeta,
  ): Promise<string> {
    try {
      const hash = await this.publishTransaction(ethQuery, rawTx);
      return hash;
    } catch (error: unknown) {
      if (this.isTransactionAlreadyConfirmedError(error as Error)) {
        await this.pendingTransactionTracker.forceCheckTransaction(
          transactionMeta,
        );
        throw new Error('Previous transaction is already confirmed');
      }
      throw error;
    }
  }

  /**
   * Ensures that error is a nonce issue
   *
   * @param error - The error to check
   * @returns Whether or not the error is a nonce issue
   */
  // TODO: Replace `any` with type
  // Some networks are returning original error in the data field
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private isTransactionAlreadyConfirmedError(error: any): boolean {
    return (
      error?.message?.includes('nonce too low') ||
      error?.data?.message?.includes('nonce too low')
    );
  }

  #getGasFeeFlows(): GasFeeFlow[] {
    if (this.#testGasFeeFlows) {
      return [new TestGasFeeFlow()];
    }

    return [new LineaGasFeeFlow(), new DefaultGasFeeFlow()];
  }

  #getLayer1GasFeeFlows(): Layer1GasFeeFlow[] {
    return [new OptimismLayer1GasFeeFlow(), new ScrollLayer1GasFeeFlow()];
  }

  #updateTransactionInternal(
    {
      transactionId,
      note,
      skipHistory,
    }: { transactionId: string; note?: string; skipHistory?: boolean },
    callback: (transactionMeta: TransactionMeta) => TransactionMeta | void,
  ): Readonly<TransactionMeta> {
    let updatedTransactionParams: (keyof TransactionParams)[] = [];

    this.update((state) => {
      const index = state.transactions.findIndex(
        ({ id }) => id === transactionId,
      );

      let transactionMeta = state.transactions[index];

      // eslint-disable-next-line n/callback-return
      transactionMeta = callback(transactionMeta) ?? transactionMeta;

      transactionMeta.txParams = normalizeTransactionParams(
        transactionMeta.txParams,
      );

      validateTxParams(transactionMeta.txParams);

      updatedTransactionParams =
        this.#checkIfTransactionParamsUpdated(transactionMeta);

      const shouldSkipHistory = this.isHistoryDisabled || skipHistory;

      if (!shouldSkipHistory) {
        transactionMeta = updateTransactionHistory(
          transactionMeta,
          note ?? 'Transaction updated',
        );
      }
      state.transactions[index] = transactionMeta;
    });

    const transactionMeta = this.getTransaction(
      transactionId,
    ) as TransactionMeta;

    if (updatedTransactionParams.length > 0) {
      this.#onTransactionParamsUpdated(
        transactionMeta,
        updatedTransactionParams,
      );
    }

    return transactionMeta;
  }

  #checkIfTransactionParamsUpdated(newTransactionMeta: TransactionMeta) {
    const { id: transactionId, txParams: newParams } = newTransactionMeta;

    const originalParams = this.getTransaction(transactionId)?.txParams;

    if (!originalParams || isEqual(originalParams, newParams)) {
      return [];
    }

    const params = Object.keys(newParams) as (keyof TransactionParams)[];

    const updatedProperties = params.filter(
      (param) => newParams[param] !== originalParams[param],
    );

    log(
      'Transaction parameters have been updated',
      transactionId,
      updatedProperties,
      originalParams,
      newParams,
    );

    return updatedProperties;
  }

  #onTransactionParamsUpdated(
    transactionMeta: TransactionMeta,
    updatedParams: (keyof TransactionParams)[],
  ) {
    if (
      (['to', 'value', 'data'] as const).some((param) =>
        updatedParams.includes(param),
      )
    ) {
      log('Updating simulation data due to transaction parameter update');
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#updateSimulationData(transactionMeta);
    }
  }

  async #updateSimulationData(transactionMeta: TransactionMeta) {
    const { id: transactionId, chainId, txParams } = transactionMeta;
    const { from, to, value, data } = txParams;

    let simulationData: SimulationData = {
      error: {
        code: SimulationErrorCode.Disabled,
        message: 'Simulation disabled',
      },
      tokenBalanceChanges: [],
    };

    if (this.#isSimulationEnabled()) {
      this.#updateTransactionInternal(
        { transactionId, skipHistory: true },
        (txMeta) => {
          txMeta.simulationData = undefined;
        },
      );

      simulationData = await getSimulationData({
        chainId,
        from: from as Hex,
        to: to as Hex,
        value: value as Hex,
        data: data as Hex,
      });
    }

    const finalTransactionMeta = this.getTransaction(transactionId);

    /* istanbul ignore if */
    if (!finalTransactionMeta) {
      log(
        'Cannot update simulation data as transaction not found',
        transactionId,
        simulationData,
      );

      return;
    }

    this.#updateTransactionInternal(
      {
        transactionId,
        note: 'TransactionController#updateSimulationData - Update simulation data',
      },
      (txMeta) => {
        txMeta.simulationData = simulationData;
      },
    );

    log('Updated simulation data', transactionId, simulationData);
  }

  #onGasFeePollerTransactionUpdate({
    transactionId,
    gasFeeEstimates,
    gasFeeEstimatesLoaded,
    layer1GasFee,
  }: {
    transactionId: string;
    gasFeeEstimates?: GasFeeEstimates;
    gasFeeEstimatesLoaded?: boolean;
    layer1GasFee?: Hex;
  }) {
    this.#updateTransactionInternal(
      { transactionId, skipHistory: true },
      (txMeta) => {
        if (gasFeeEstimates) {
          txMeta.gasFeeEstimates = gasFeeEstimates;
        }

        if (gasFeeEstimatesLoaded !== undefined) {
          txMeta.gasFeeEstimatesLoaded = gasFeeEstimatesLoaded;
        }

        if (layer1GasFee) {
          txMeta.layer1GasFee = layer1GasFee;
        }
      },
    );
  }

  #getNetworkClientId({
    networkClientId: requestNetworkClientId,
    chainId,
  }: {
    networkClientId?: NetworkClientId;
    chainId?: Hex;
  }) {
    const globalChainId = this.#getGlobalChainId();
    const globalNetworkClientId = this.#getGlobalNetworkClientId();

    if (requestNetworkClientId) {
      return requestNetworkClientId;
    }

    if (!chainId || chainId === globalChainId) {
      return globalNetworkClientId;
    }

    return this.messagingSystem.call(
      `NetworkController:findNetworkClientIdByChainId`,
      chainId,
    );
  }

  #getGlobalNetworkClientId() {
    return this.getNetworkState().selectedNetworkClientId;
  }

  #getGlobalChainId() {
    return this.messagingSystem.call(
      `NetworkController:getNetworkClientById`,
      this.getNetworkState().selectedNetworkClientId,
    ).configuration.chainId;
  }

  #isCustomNetwork(networkClientId?: NetworkClientId) {
    const globalNetworkClientId = this.#getGlobalNetworkClientId();

    if (!networkClientId || networkClientId === globalNetworkClientId) {
      return !isInfuraNetworkType(
        this.getNetworkState().selectedNetworkClientId,
      );
    }

    return (
      this.messagingSystem.call(
        `NetworkController:getNetworkClientById`,
        networkClientId,
      ).configuration.type === NetworkClientType.Custom
    );
  }

  #getSelectedAccount() {
    return this.messagingSystem.call('AccountsController:getSelectedAccount');
  }
}
