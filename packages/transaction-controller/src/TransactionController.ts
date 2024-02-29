import { Hardfork, Common, type ChainConfig } from '@ethereumjs/common';
import type { TypedTransaction } from '@ethereumjs/tx';
import { TransactionFactory } from '@ethereumjs/tx';
import { bufferToHex } from '@ethereumjs/util';
import type {
  AcceptResultCallbacks,
  AddApprovalRequest,
  AddResult,
} from '@metamask/approval-controller';
import type {
  BaseConfig,
  BaseState,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseControllerV1 } from '@metamask/base-controller';
import {
  query,
  ApprovalType,
  ORIGIN_METAMASK,
  convertHexToDecimal,
} from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type { GasFeeState } from '@metamask/gas-fee-controller';
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
import type { AutoManagedNetworkClient } from '@metamask/network-controller/src/create-auto-managed-network-client';
import type { NetworkClientConfiguration } from '@metamask/network-controller/src/types';
import { errorCodes, rpcErrors, providerErrors } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';
import { add0x } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import { MethodRegistry } from 'eth-method-registry';
import { EventEmitter } from 'events';
import { mapValues, merge, pickBy, sortBy } from 'lodash';
import { NonceTracker } from 'nonce-tracker';
import type {
  NonceLock,
  Transaction as NonceTrackerTransaction,
} from 'nonce-tracker';
import { v1 as random } from 'uuid';

import { DefaultGasFeeFlow } from './gas-flows/DefaultGasFeeFlow';
import { LineaGasFeeFlow } from './gas-flows/LineaGasFeeFlow';
import { EtherscanRemoteTransactionSource } from './helpers/EtherscanRemoteTransactionSource';
import { GasFeePoller } from './helpers/GasFeePoller';
import type { IncomingTransactionOptions } from './helpers/IncomingTransactionHelper';
import { IncomingTransactionHelper } from './helpers/IncomingTransactionHelper';
import { MultichainTrackingHelper } from './helpers/MultichainTrackingHelper';
import { PendingTransactionTracker } from './helpers/PendingTransactionTracker';
import { projectLogger as log } from './logger';
import type {
  Events,
  DappSuggestedGasFees,
  SavedGasFees,
  SecurityProviderRequest,
  SendFlowHistoryEntry,
  TransactionParams,
  TransactionMeta,
  TransactionReceipt,
  WalletDevice,
  SecurityAlertResponse,
  GasFeeFlow,
} from './types';
import {
  TransactionEnvelopeType,
  TransactionType,
  TransactionStatus,
} from './types';
import { validateConfirmedExternalTransaction } from './utils/external-transactions';
import { addGasBuffer, estimateGas, updateGas } from './utils/gas';
import { updateGasFees } from './utils/gas-fees';
import {
  addInitialHistorySnapshot,
  updateTransactionHistory,
} from './utils/history';
import {
  getAndFormatTransactionsForNonceTracker,
  getNextNonce,
} from './utils/nonce';
import {
  updatePostTransactionBalance,
  updateSwapsTransaction,
} from './utils/swaps';
import { determineTransactionType } from './utils/transaction-type';
import {
  getIncreasedPriceFromExisting,
  normalizeTxParams,
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
 * Transaction controller configuration
 *
 * @property provider - Provider used to create a new underlying EthQuery instance
 * @property sign - Method used to sign transactions
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface TransactionConfig extends BaseConfig {
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sign?: (txParams: TransactionParams, from: string) => Promise<any>;
  txHistoryLimit: number;
}

/**
 * Method data registry object
 *
 * @property registryMethod - Registry method raw string
 * @property parsedRegistryMethod - Registry method object, containing name and method arguments
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface MethodData {
  registryMethod: string;
  parsedRegistryMethod: Record<string, unknown>;
}

/**
 * Transaction controller state
 *
 * @property transactions - A list of TransactionMeta objects
 * @property methodData - Object containing all known method data information
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface TransactionState extends BaseState {
  transactions: TransactionMeta[];
  methodData: { [key: string]: MethodData };
  lastFetchedBlockNumbers: { [key: string]: number };
}

/**
 * Multiplier used to determine a transaction's increased gas fee during cancellation
 */
export const CANCEL_RATE = 1.1;

/**
 * Multiplier used to determine a transaction's increased gas fee during speed up
 */
export const SPEED_UP_RATE = 1.1;

/**
 * Configuration options for the PendingTransactionTracker
 *
 * @property isResubmitEnabled - Whether transaction publishing is automatically retried.
 */
export type PendingTransactionOptions = {
  isResubmitEnabled?: boolean;
};

/**
 * TransactionController constructor options.
 *
 * @property blockTracker - The block tracker used to poll for new blocks data.
 * @property disableHistory - Whether to disable storing history in transaction metadata.
 * @property disableSendFlowHistory - Explicitly disable transaction metadata history.
 * @property disableSwaps - Whether to disable additional processing on swaps transactions.
 * @property isMultichainEnabled - Enable multichain support.
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
 * @property messenger - The controller messenger.
 * @property onNetworkStateChange - Allows subscribing to network controller state changes.
 * @property pendingTransactions - Configuration options for pending transaction support.
 * @property provider - The provider used to create the underlying EthQuery instance.
 * @property securityProviderRequest - A function for verifying a transaction, whether it is malicious or not.
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
  getGasFeeEstimates?: () => Promise<GasFeeState>;
  getGlobalProviderAndBlockTracker: () =>
    | { provider: Provider; blockTracker: BlockTracker }
    | undefined;
  getNetworkState: () => NetworkState;
  getPermittedAccounts: (origin?: string) => Promise<string[]>;
  getSavedGasFees?: (chainId: Hex) => SavedGasFees | undefined;
  getSelectedAddress: () => string;
  incomingTransactions?: IncomingTransactionOptions;
  messenger: TransactionControllerMessenger;
  onNetworkStateChange: (listener: (state: NetworkState) => void) => void;
  pendingTransactions?: PendingTransactionOptions;
  provider: Provider;
  securityProviderRequest?: SecurityProviderRequest;
  getNetworkClientRegistry: NetworkController['getNetworkClientRegistry'];
  isMultichainEnabled: boolean;
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
type AllowedActions =
  | AddApprovalRequest
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | NetworkControllerGetNetworkClientByIdAction;

type AllowedEvents = NetworkControllerStateChangeEvent;

/**
 * The messenger of the {@link TransactionController}.
 */
export type TransactionControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  AllowedActions,
  AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface TransactionControllerEventEmitter extends EventEmitter {
  on<T extends keyof Events>(
    eventName: T,
    listener: (...args: Events[T]) => void,
  ): this;

  emit<T extends keyof Events>(eventName: T, ...args: Events[T]): boolean;
}

/**
 * Controller responsible for submitting and managing transactions.
 */
export class TransactionController extends BaseControllerV1<
  TransactionConfig,
  TransactionState
> {
  private readonly isHistoryDisabled: boolean;

  private readonly isSwapsDisabled: boolean;

  private readonly isSendFlowHistoryDisabled: boolean;

  private readonly inProcessOfSigning: Set<string> = new Set();

  private readonly mutex = new Mutex();

  private readonly gasFeeFlows: GasFeeFlow[];

  private readonly getSavedGasFees: (chainId: Hex) => SavedGasFees | undefined;

  private readonly getCurrentAccountEIP1559Compatibility: () => Promise<boolean>;

  private readonly getCurrentNetworkEIP1559Compatibility: (
    networkClientId?: NetworkClientId,
  ) => Promise<boolean>;

  private readonly getGasFeeEstimates: () => Promise<GasFeeState>;

  private readonly getPermittedAccounts: (origin?: string) => Promise<string[]>;

  private readonly getSelectedAddress: () => string;

  private readonly getExternalPendingTransactions: (
    address: string,
    chainId?: string,
  ) => NonceTrackerTransaction[];

  private readonly messagingSystem: TransactionControllerMessenger;

  readonly #incomingTransactionOptions: IncomingTransactionOptions;

  private readonly incomingTransactionHelper: IncomingTransactionHelper;

  private readonly securityProviderRequest?: SecurityProviderRequest;

  readonly #pendingTransactionOptions: PendingTransactionOptions;

  private readonly pendingTransactionTracker: PendingTransactionTracker;

  private readonly signAbortCallbacks: Map<string, () => void> = new Map();

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
    const newTransactionMeta = {
      ...transactionMeta,
      error: normalizeTxError(error),
      status: TransactionStatus.failed,
    };
    this.hub.emit('transaction-failed', {
      actionId,
      error: error.message,
      transactionMeta: newTransactionMeta,
    });
    this.updateTransaction(
      newTransactionMeta,
      'TransactionController#failTransaction - Add error message and set status to failed',
    );
    this.onTransactionStatusChange(newTransactionMeta);
    this.hub.emit(`${transactionMeta.id}:finished`, newTransactionMeta);
  }

  private async registryLookup(fourBytePrefix: string): Promise<MethodData> {
    const selectedNetworkClient =
      this.#multichainTrackingHelper.getSelectedNetworkClient();

    if (!selectedNetworkClient) {
      throw providerErrors.disconnected();
    }

    const { provider } = selectedNetworkClient;

    // @ts-expect-error the type in eth-method-registry is inappropriate and should be changed
    const registry = new MethodRegistry({ provider });

    const registryMethod = (await registry.lookup(fourBytePrefix)) as string;
    const parsedRegistryMethod = registry.parse(registryMethod);

    return { registryMethod, parsedRegistryMethod };
  }

  #multichainTrackingHelper: MultichainTrackingHelper;

  /**
   * EventEmitter instance used to listen to specific transactional events
   */
  hub = new EventEmitter() as TransactionControllerEventEmitter;

  /**
   * Name of this controller used during composition
   */
  override name = 'TransactionController';

  /**
   * Method used to sign transactions
   */
  sign?: (
    transaction: TypedTransaction,
    from: string,
    transactionMeta?: TransactionMeta,
  ) => Promise<TypedTransaction>;

  constructor(
    {
      disableHistory,
      disableSendFlowHistory,
      disableSwaps,
      getCurrentAccountEIP1559Compatibility,
      getCurrentNetworkEIP1559Compatibility,
      getExternalPendingTransactions,
      getGasFeeEstimates,
      getGlobalProviderAndBlockTracker,
      getNetworkState,
      getPermittedAccounts,
      getSavedGasFees,
      getSelectedAddress,
      incomingTransactions = {},
      messenger,
      onNetworkStateChange,
      pendingTransactions = {},
      securityProviderRequest,
      getNetworkClientRegistry,
      isMultichainEnabled = false,
      hooks,
    }: TransactionControllerOptions,
    config?: Partial<TransactionConfig>,
    state?: Partial<TransactionState>,
  ) {
    super(config, state);

    this.defaultConfig = {
      txHistoryLimit: 40,
    };

    this.defaultState = {
      methodData: {},
      transactions: [],
      lastFetchedBlockNumbers: {},
    };
    this.initialize();
    this.messagingSystem = messenger;
    this.isSendFlowHistoryDisabled = disableSendFlowHistory ?? false;
    this.isHistoryDisabled = disableHistory ?? false;
    this.isSwapsDisabled = disableSwaps ?? false;
    this.getSavedGasFees = getSavedGasFees ?? ((_chainId) => undefined);
    this.getCurrentAccountEIP1559Compatibility =
      getCurrentAccountEIP1559Compatibility ?? (() => Promise.resolve(true));
    this.getCurrentNetworkEIP1559Compatibility =
      getCurrentNetworkEIP1559Compatibility;
    this.getGasFeeEstimates =
      getGasFeeEstimates || (() => Promise.resolve({} as GasFeeState));
    this.getPermittedAccounts = getPermittedAccounts;
    this.getSelectedAddress = getSelectedAddress;
    this.getExternalPendingTransactions =
      getExternalPendingTransactions ?? (() => []);
    this.securityProviderRequest = securityProviderRequest;
    this.#incomingTransactionOptions = incomingTransactions;
    this.#pendingTransactionOptions = pendingTransactions;

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

    this.#multichainTrackingHelper = new MultichainTrackingHelper({
      isMultichainEnabled,
      incomingTransactionOptions: incomingTransactions,
      findNetworkClientIdByChainId: (chainId: Hex) => {
        return this.messagingSystem.call(
          `NetworkController:findNetworkClientIdByChainId`,
          chainId,
        );
      },
      getGlobalProviderAndBlockTracker,
      getGlobalProviderConfig: () => getNetworkState()?.providerConfig,
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

    const getSelectedNetworkClient = () =>
      this.#multichainTrackingHelper.getSelectedNetworkClient();

    this.incomingTransactionHelper = this.#createIncomingTransactionHelper({
      getNetworkClient: getSelectedNetworkClient,
      etherscanRemoteTransactionSource,
    });

    this.pendingTransactionTracker = this.#createPendingTransactionTracker({
      getNetworkClient: getSelectedNetworkClient,
    });

    this.gasFeeFlows = this.#getGasFeeFlows();

    const gasFeePoller = new GasFeePoller({
      // Default gas fee polling is not yet supported by the clients
      gasFeeFlows: this.gasFeeFlows.slice(0, -1),
      getEthQuery: (chainId, networkClientId) =>
        this.#multichainTrackingHelper.getEthQuery({
          networkClientId,
          chainId,
        }),
      getGasFeeControllerEstimates: this.getGasFeeEstimates,
      getTransactions: () => this.state.transactions,
      onStateChange: (listener) => {
        this.subscribe(listener);
      },
    });

    gasFeePoller.hub.on('transaction-updated', (transactionMeta) =>
      this.#updateTransactionInternal(transactionMeta, { skipHistory: true }),
    );

    // when transactionsController state changes
    // check for pending transactions and start polling if there are any
    this.subscribe(this.#checkForPendingTransactionAndStartPolling);

    // TODO once v2 is merged make sure this only runs when
    // selectedNetworkClientId changes
    onNetworkStateChange(() => {
      log('Detected network change', this.getChainId());
      this.pendingTransactionTracker.startIfPendingTransactions();
      this.initApprovedTransactions();
    });
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
      this.update({
        methodData: { ...methodData, ...{ [fourBytePrefix]: registry } },
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
      networkClientId,
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

    txParams = normalizeTxParams(txParams);
    if (
      networkClientId &&
      !this.#multichainTrackingHelper.has(networkClientId)
    ) {
      throw new Error(
        'The networkClientId for this transaction could not be found',
      );
    }

    const isEIP1559Compatible = await this.getEIP1559Compatibility(
      networkClientId,
    );

    validateTxParams(txParams, isEIP1559Compatible);

    if (origin) {
      await validateTransactionOrigin(
        await this.getPermittedAccounts(origin),
        this.getSelectedAddress(),
        txParams.from,
        origin,
      );
    }

    const dappSuggestedGasFees = this.generateDappSuggestedGasFees(
      txParams,
      origin,
    );

    const chainId = this.#getChainIdOrThrow(networkClientId);

    const ethQuery = this.#getEthQueryOrThrow({
      networkClientId,
      chainId,
    });

    const transactionType =
      type ?? (await determineTransactionType(txParams, ethQuery)).type;

    const existingTransactionMeta = this.getTransactionWithActionId(actionId);

    // If a request to add a transaction with the same actionId is submitted again, a new transaction will not be created for it.
    const transactionMeta: TransactionMeta = existingTransactionMeta || {
      // Add actionId to txMeta to check if same actionId is seen again
      actionId,
      chainId,
      dappSuggestedGasFees,
      deviceConfirmedOn,
      id: random(),
      origin,
      securityAlertResponse,
      status: TransactionStatus.unapproved as TransactionStatus.unapproved,
      time: Date.now(),
      txParams,
      userEditedGasLimit: false,
      verifiedOnBlockchain: false,
      type: transactionType,
      networkClientId,
    };

    await this.updateGasProperties(transactionMeta, ethQuery);

    // Checks if a transaction already exists with a given actionId
    if (!existingTransactionMeta) {
      // Set security provider response
      if (method && this.securityProviderRequest) {
        const securityProviderResponse = await this.securityProviderRequest(
          transactionMeta,
          method,
        );
        transactionMeta.securityProviderResponse = securityProviderResponse;
      }

      if (!this.isSendFlowHistoryDisabled) {
        transactionMeta.sendFlowHistory = sendFlowHistory ?? [];
      }
      // Initial history push
      if (!this.isHistoryDisabled) {
        addInitialHistorySnapshot(transactionMeta);
      }

      await updateSwapsTransaction(transactionMeta, transactionType, swaps, {
        isSwapsDisabled: this.isSwapsDisabled,
        cancelTransaction: this.cancelTransaction.bind(this),
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        controllerHubEmitter: this.hub.emit.bind(this.hub) as any,
      });

      this.addMetadata(transactionMeta);
      this.hub.emit(`unapprovedTransaction`, transactionMeta);
    }

    return {
      result: this.processApproval(transactionMeta, {
        isExisting: Boolean(existingTransactionMeta),
        requireApproval,
        actionId,
      }),
      transactionMeta,
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

    const ethQuery = this.#getEthQueryOrThrow({
      networkClientId: transactionMeta.networkClientId,
      chainId: transactionMeta.chainId,
    });

    const hash = await this.publishTransactionForRetry(
      ethQuery,
      rawTx,
      transactionMeta,
    );

    const cancelTransactionMeta: TransactionMeta = {
      actionId,
      chainId: transactionMeta.chainId,
      networkClientId: transactionMeta.networkClientId,
      estimatedBaseFee,
      hash,
      id: random(),
      originalGasEstimate: transactionMeta.txParams.gas,
      status: TransactionStatus.submitted,
      time: Date.now(),
      type: TransactionType.cancel,
      txParams: newTxParams,
    };

    this.addMetadata(cancelTransactionMeta);

    // stopTransaction has no approval request, so we assume the user has already approved the transaction
    this.hub.emit('transaction-approved', {
      transactionMeta: cancelTransactionMeta,
      actionId,
    });
    this.hub.emit('transaction-submitted', {
      transactionMeta: cancelTransactionMeta,
      actionId,
    });

    this.hub.emit(
      `${cancelTransactionMeta.id}:finished`,
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

    const transactionMeta = this.state.transactions.find(
      ({ id }) => id === transactionId,
    );
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

    await this.updateTransactionMetaRSV(transactionMeta, signedTx);
    const rawTx = bufferToHex(signedTx.serialize());

    const newFee = txParams.maxFeePerGas ?? txParams.gasPrice;

    const oldFee = txParams.maxFeePerGas
      ? transactionMeta.txParams.maxFeePerGas
      : transactionMeta.txParams.gasPrice;

    log('Submitting speed up transaction', { oldFee, newFee, txParams });

    const ethQuery = this.#multichainTrackingHelper.getEthQuery({
      networkClientId: transactionMeta.networkClientId,
      chainId: transactionMeta.chainId,
    });

    if (!ethQuery) {
      throw providerErrors.disconnected();
    }

    const hash = await this.publishTransactionForRetry(
      ethQuery,
      rawTx,
      transactionMeta,
    );

    const baseTransactionMeta: TransactionMeta = {
      ...transactionMeta,
      estimatedBaseFee,
      id: random(),
      time: Date.now(),
      hash,
      actionId,
      originalGasEstimate: transactionMeta.txParams.gas,
      type: TransactionType.retry,
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
    this.hub.emit('transaction-approved', {
      transactionMeta: newTransactionMeta,
      actionId,
    });

    this.hub.emit('transaction-submitted', {
      transactionMeta: newTransactionMeta,
      actionId,
    });

    this.hub.emit(`${transactionMeta.id}:speedup`, newTransactionMeta);
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
    const ethQuery = this.#getEthQueryOrThrow({
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
    const ethQuery = this.#getEthQueryOrThrow({
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
    this.#updateTransactionInternal(transactionMeta, {
      note,
      skipHistory: this.isHistoryDisabled,
    });
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
    const updatedMeta = merge(transactionMeta, { securityAlertResponse });
    this.updateTransaction(
      updatedMeta,
      'TransactionController:updatesecurityAlertResponse - securityAlertResponse updated',
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
      this.update({ transactions: [] });
      return;
    }

    const currentChainId = this.#getChainIdOrThrow();

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

    this.update({
      transactions: this.trimTransactionsForState(newTransactions),
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
    this.addExternalTransaction(transactionMeta);

    try {
      const transactionId = transactionMeta.id;

      // Make sure status is confirmed and define gasUsed as in receipt.
      transactionMeta.status = TransactionStatus.confirmed;
      transactionMeta.txReceipt = transactionReceipt;
      if (baseFeePerGas) {
        transactionMeta.baseFeePerGas = baseFeePerGas;
      }

      // Update same nonce local transactions as dropped and define replacedBy properties.
      this.markNonceDuplicatesDropped(transactionId);

      // Update external provided transaction with updated gas values and confirmed status.
      this.updateTransaction(
        transactionMeta,
        'TransactionController:confirmExternalTransaction - Add external transaction',
      );
      this.onTransactionStatusChange(transactionMeta);

      // Intentional given potential duration of process.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.updatePostBalance(transactionMeta);

      this.hub.emit('transaction-confirmed', {
        transactionMeta,
      });
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

    if (
      currentSendFlowHistoryLength ===
      (transactionMeta?.sendFlowHistory?.length || 0)
    ) {
      transactionMeta.sendFlowHistory = [
        ...(transactionMeta?.sendFlowHistory ?? []),
        ...sendFlowHistoryToAdd,
      ];
      this.updateTransaction(
        transactionMeta,
        'TransactionController:updateTransactionSendFlowHistory - sendFlowHistory updated',
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
    const updatedMeta = merge(transactionMeta, transactionGasFees);

    this.updateTransaction(
      updatedMeta,
      'TransactionController:updateTransactionGasFees - gas values updated',
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
    const updatedMeta = merge(transactionMeta, transactionPreviousGas);

    this.updateTransaction(
      updatedMeta,
      'TransactionController:updatePreviousGasParams - Previous gas values updated',
    );

    return this.getTransaction(transactionId) as TransactionMeta;
  }

  async getNonceLock(
    address: string,
    networkClientId?: NetworkClientId,
  ): Promise<NonceLock> {
    const nonceLock = await this.#multichainTrackingHelper.getNonceLock(
      address,
      networkClientId,
    );

    if (!nonceLock) {
      throw providerErrors.disconnected();
    }

    return nonceLock;
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

    const updatedTransaction = merge(transactionMeta, editableParams);

    const ethQuery = this.#getEthQueryOrThrow({
      networkClientId: transactionMeta.networkClientId,
      chainId: transactionMeta.chainId,
    });

    const { type } = await determineTransactionType(
      updatedTransaction.txParams,
      ethQuery,
    );

    updatedTransaction.type = type;

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

    if (this.inProcessOfSigning.has(initialTxAsSerializedHex)) {
      return '';
    }

    this.inProcessOfSigning.add(initialTxAsSerializedHex);

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
      this.inProcessOfSigning.delete(initialTxAsSerializedHex);
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
      transactionMeta,
      pickBy({ hash, status }),
    );

    if (status === TransactionStatus.submitted) {
      updatedTransactionMeta.submittedTime = new Date().getTime();
    }

    if (status === TransactionStatus.failed) {
      updatedTransactionMeta.error = normalizeTxError(new Error(errorMessage));
    }

    this.updateTransaction(
      updatedTransactionMeta,
      `TransactionController:updateCustodialTransaction - Custodial transaction updated`,
    );

    if (
      [TransactionStatus.submitted, TransactionStatus.failed].includes(
        status as TransactionStatus,
      )
    ) {
      this.hub.emit(`${transactionMeta.id}:finished`, updatedTransactionMeta);
    }
  }

  /**
   * Creates approvals for all unapproved transactions persisted.
   */
  initApprovals() {
    const chainId = this.#getChainIdOrThrow();

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
   * Sign and submit any previously approved transactions.
   */
  initApprovedTransactions() {
    const approvedTransactions = this.state.transactions.filter(
      (transaction) => transaction.status === TransactionStatus.approved,
    );

    if (!approvedTransactions.length) {
      return;
    }

    log('Processing previously approved transactions', {
      count: approvedTransactions.length,
    });

    for (const transactionMeta of approvedTransactions) {
      if (this.beforeApproveOnInit(transactionMeta)) {
        this.approveTransaction(transactionMeta.id).catch((error) => {
          /* istanbul ignore next */
          console.error('Error while submitting persisted transaction', error);
        });
      }
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
    const chainId = this.#getChainIdOrThrow();

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

  private async signExternalTransaction(
    chainId: Hex,
    transactionParams: TransactionParams,
  ): Promise<string> {
    if (!this.sign) {
      throw new Error('No sign method defined.');
    }

    const normalizedTransactionParams = normalizeTxParams(transactionParams);
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
    this.update({ transactions: this.trimTransactionsForState(transactions) });
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
    const { transactions } = this.state;
    transactions.push(transactionMeta);
    this.update({ transactions: this.trimTransactionsForState(transactions) });
  }

  private async updateGasProperties(
    transactionMeta: TransactionMeta,
    ethQuery: EthQuery,
  ) {
    const isEIP1559Compatible =
      (await this.getEIP1559Compatibility(transactionMeta.networkClientId)) &&
      transactionMeta.txParams.type !== TransactionEnvelopeType.legacy;

    const { networkClientId, chainId } = transactionMeta;

    const networkType = networkClientId
      ? this.messagingSystem.call(
          `NetworkController:getNetworkClientById`,
          networkClientId,
        ).configuration.type === NetworkClientType.Custom
      : this.#getSelectedNetworkClientConfiguration()?.type;

    const isCustomNetwork = networkType === NetworkClientType.Custom;

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

          if (resultCallbacks) {
            this.hub.once(`${transactionId}:publish-skip`, () => {
              resultCallbacks?.success();

              // Remove the reference to prevent additional reports once submitted.
              resultCallbacks = undefined;
            });
          }

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
          await this.approveTransaction(transactionId);
          const updatedTransactionMeta = this.getTransaction(
            transactionId,
          ) as TransactionMeta;
          this.hub.emit('transaction-approved', {
            transactionMeta: updatedTransactionMeta,
            actionId,
          });
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
    const { transactions } = this.state;
    const releaseLock = await this.mutex.acquire();
    const index = transactions.findIndex(({ id }) => transactionId === id);
    const transactionMeta = transactions[index];
    const {
      txParams: { from },
      networkClientId,
    } = transactionMeta;

    let releaseNonceLock: (() => void) | undefined;

    try {
      if (!this.sign) {
        releaseLock();
        this.failTransaction(
          transactionMeta,
          new Error('No sign method defined.'),
        );
        return;
      } else if (!transactionMeta.chainId) {
        releaseLock();
        this.failTransaction(transactionMeta, new Error('No chainId defined.'));
        return;
      }

      if (this.inProcessOfSigning.has(transactionId)) {
        log('Skipping approval as signing in progress', transactionId);
        return;
      }

      const getNonceLock = (address: string) =>
        this.#multichainTrackingHelper.getNonceLock(address, networkClientId);

      const [nonce, releaseNonce] = await getNextNonce(
        transactionMeta,
        getNonceLock,
      );

      releaseNonceLock = releaseNonce;

      transactionMeta.status = TransactionStatus.approved;
      transactionMeta.txParams.nonce = nonce;
      transactionMeta.txParams.chainId = transactionMeta.chainId;

      const baseTxParams = {
        ...transactionMeta.txParams,
        gasLimit: transactionMeta.txParams.gas,
      };

      this.updateTransaction(
        transactionMeta,
        'TransactionController#approveTransaction - Transaction approved',
      );

      this.onTransactionStatusChange(transactionMeta);

      const isEIP1559 = isEIP1559Transaction(transactionMeta.txParams);

      const txParams: TransactionParams = isEIP1559
        ? {
            ...baseTxParams,
            estimatedBaseFee: transactionMeta.txParams.estimatedBaseFee,
            type: TransactionEnvelopeType.feeMarket,
          }
        : baseTxParams;

      const rawTx = await this.signTransaction(transactionMeta, txParams);

      if (!this.beforePublish(transactionMeta)) {
        log('Skipping publishing transaction based on hook');
        this.hub.emit(`${transactionMeta.id}:publish-skip`, transactionMeta);
        return;
      }

      if (!rawTx) {
        return;
      }

      const ethQuery = this.#getEthQueryOrThrow({
        networkClientId: transactionMeta.networkClientId,
        chainId: transactionMeta.chainId,
      });

      if (transactionMeta.type === TransactionType.swap) {
        log('Determining pre-transaction balance');

        const preTxBalance = await query(ethQuery, 'getBalance', [from]);

        transactionMeta.preTxBalance = preTxBalance;

        log('Updated pre-transaction balance', transactionMeta.preTxBalance);
      }

      log('Publishing transaction', txParams);

      let { transactionHash: hash } = await this.publish(
        transactionMeta,
        rawTx,
      );

      if (hash === undefined) {
        hash = await this.publishTransaction(ethQuery, rawTx);
      }

      log('Publish successful', hash);

      transactionMeta.hash = hash;
      transactionMeta.status = TransactionStatus.submitted;
      transactionMeta.submittedTime = new Date().getTime();

      this.updateTransaction(
        transactionMeta,
        'TransactionController#approveTransaction - Transaction submitted',
      );

      this.hub.emit('transaction-submitted', {
        transactionMeta,
      });

      this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);

      this.onTransactionStatusChange(transactionMeta);
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      this.failTransaction(transactionMeta, error);
    } finally {
      this.inProcessOfSigning.delete(transactionId);
      // must set transaction to submitted/failed before releasing lock
      releaseNonceLock?.();
      releaseLock();
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
    transactionMeta.status = TransactionStatus.rejected;
    const transactions = this.state.transactions.filter(
      ({ id }) => id !== transactionId,
    );
    this.update({ transactions: this.trimTransactionsForState(transactions) });
    this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
    this.hub.emit('transaction-rejected', {
      transactionMeta,
      actionId,
    });
    this.onTransactionStatusChange(transactionMeta);
  }

  /**
   * Trim the amount of transactions that are set on the state. Checks
   * if the length of the tx history is longer then desired persistence
   * limit and then if it is removes the oldest confirmed or rejected tx.
   * Pending or unapproved transactions will not be removed by this
   * operation. For safety of presenting a fully functional transaction UI
   * representation, this function will not break apart transactions with the
   * same nonce, created on the same day, per network. Not accounting for transactions of the same
   * nonce, same day and network combo can result in confusing or broken experiences
   * in the UI. The transactions are then updated using the BaseControllerV1 update.
   *
   * @param transactions - The transactions to be applied to the state.
   * @returns The trimmed list of transactions.
   */
  private trimTransactionsForState(
    transactions: TransactionMeta[],
  ): TransactionMeta[] {
    const nonceNetworkSet = new Set();

    const txsToKeep = transactions
      .sort((a, b) => (a.time > b.time ? -1 : 1)) // Descending time order
      .filter((tx) => {
        const { chainId, status, txParams, time } = tx;

        if (txParams) {
          const key = `${txParams.nonce}-${convertHexToDecimal(
            chainId,
          )}-${new Date(time).toDateString()}`;

          if (nonceNetworkSet.has(key)) {
            return true;
          } else if (
            nonceNetworkSet.size < this.config.txHistoryLimit ||
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

  private getTransaction(transactionId: string): TransactionMeta | undefined {
    const { transactions } = this.state;
    return transactions.find(({ id }) => id === transactionId);
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

  private getChainId(networkClientId?: NetworkClientId): Hex | undefined {
    if (networkClientId) {
      return this.messagingSystem.call(
        `NetworkController:getNetworkClientById`,
        networkClientId,
      ).configuration.chainId;
    }

    return this.#getSelectedNetworkClientConfiguration()?.chainId;
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
    const { transactions: currentTransactions } = this.state;

    const updatedTransactions = [
      ...added,
      ...currentTransactions.map((originalTransaction) => {
        const updatedTransaction = updated.find(
          ({ hash }) => hash === originalTransaction.hash,
        );

        return updatedTransaction ?? originalTransaction;
      }),
    ];

    this.update({
      transactions: this.trimTransactionsForState(updatedTransactions),
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
    this.update({ lastFetchedBlockNumbers });
    this.hub.emit('incomingTransactionBlock', blockNumber);
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
    if (!(transactionMeta.history ?? []).length) {
      if (!this.isHistoryDisabled) {
        addInitialHistorySnapshot(transactionMeta);
      }
    }

    const updatedTransactions = [...transactions, transactionMeta];
    this.update({
      transactions: this.trimTransactionsForState(updatedTransactions),
    });
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

    const sameNonceTxs = this.state.transactions.filter(
      (transaction) =>
        transaction.id !== transactionId &&
        transaction.txParams.from === from &&
        transaction.txParams.nonce === nonce &&
        transaction.chainId === chainId &&
        transaction.type !== TransactionType.incoming,
    );

    if (!sameNonceTxs.length) {
      return;
    }

    // Mark all same nonce transactions as dropped and give it a replacedBy hash
    for (const transaction of sameNonceTxs) {
      transaction.replacedBy = transactionMeta.hash;
      transaction.replacedById = transactionMeta.id;
      // Drop any transaction that wasn't previously failed (off chain failure)
      if (transaction.status !== TransactionStatus.failed) {
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
    transactionMeta.status = TransactionStatus.dropped;
    this.hub.emit('transaction-dropped', {
      transactionMeta,
    });
    this.updateTransaction(
      transactionMeta,
      'TransactionController#setTransactionStatusDropped - Transaction dropped',
    );
    this.onTransactionStatusChange(transactionMeta);
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
      this.hub.once(`${transactionId}:finished`, (txMeta) => {
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
   */
  private async updateTransactionMetaRSV(
    transactionMeta: TransactionMeta,
    signedTx: TypedTransaction,
  ): Promise<void> {
    for (const key of ['r', 's', 'v'] as const) {
      const value = signedTx[key];

      if (value === undefined || value === null) {
        continue;
      }

      transactionMeta[key] = add0x(value.toString(16));
    }
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

    this.inProcessOfSigning.add(transactionMeta.id);

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

    if (!this.afterSign(transactionMeta, signedTx)) {
      this.updateTransaction(
        transactionMeta,
        'TransactionController#signTransaction - Update after sign',
      );

      log('Skipping signed status based on hook');

      return undefined;
    }

    await this.updateTransactionMetaRSV(transactionMeta, signedTx);

    transactionMeta.status = TransactionStatus.signed;

    this.updateTransaction(
      transactionMeta,
      'TransactionController#approveTransaction - Transaction signed',
    );

    this.onTransactionStatusChange(transactionMeta);

    const rawTx = bufferToHex(signedTx.serialize());

    transactionMeta.rawTx = rawTx;

    this.updateTransaction(
      transactionMeta,
      'TransactionController#approveTransaction - RawTransaction added',
    );

    return rawTx;
  }

  private onTransactionStatusChange(transactionMeta: TransactionMeta) {
    this.hub.emit('transaction-status-update', { transactionMeta });
  }

  private getNonceTrackerTransactions(
    status: TransactionStatus,
    address: string,
    chainId: string,
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

    this.hub.emit('transaction-confirmed', { transactionMeta });
    this.hub.emit(`${transactionMeta.id}:confirmed`, transactionMeta);

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

      const ethQuery = this.#getEthQueryOrThrow({
        networkClientId: transactionMeta.networkClientId,
        chainId: transactionMeta.chainId,
      });

      const { updatedTransactionMeta, approvalTransactionMeta } =
        await updatePostTransactionBalance(transactionMeta, {
          ethQuery,
          getTransaction: this.getTransaction.bind(this),
          updateTransaction: this.updateTransaction.bind(this),
        });

      this.hub.emit('post-transaction-balance-updated', {
        transactionMeta: updatedTransactionMeta,
        approvalTransactionMeta,
      });
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
    chainId: Hex;
  }): NonceTracker {
    return new NonceTracker({
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider: provider as any,
      blockTracker,
      getPendingTransactions: this.#getNonceTrackerPendingTransactions.bind(
        this,
        chainId,
      ),
      getConfirmedTransactions: this.getNonceTrackerTransactions.bind(
        this,
        TransactionStatus.confirmed,
        chainId,
      ),
    });
  }

  #createIncomingTransactionHelper({
    getNetworkClient,
    etherscanRemoteTransactionSource,
  }: {
    getNetworkClient: () =>
      | AutoManagedNetworkClient<NetworkClientConfiguration>
      | undefined;
    etherscanRemoteTransactionSource: EtherscanRemoteTransactionSource;
  }): IncomingTransactionHelper {
    const incomingTransactionHelper = new IncomingTransactionHelper({
      getCurrentAccount: this.getSelectedAddress,
      getLastFetchedBlockNumbers: () => this.state.lastFetchedBlockNumbers,
      getNetworkClient,
      isEnabled: this.#incomingTransactionOptions.isEnabled,
      queryEntireHistory: this.#incomingTransactionOptions.queryEntireHistory,
      remoteTransactionSource: etherscanRemoteTransactionSource,
      transactionLimit: this.config.txHistoryLimit,
      updateTransactions: this.#incomingTransactionOptions.updateTransactions,
    });

    this.#addIncomingTransactionHelperListeners(incomingTransactionHelper);

    return incomingTransactionHelper;
  }

  #createPendingTransactionTracker({
    getNetworkClient,
  }: {
    getNetworkClient: () =>
      | AutoManagedNetworkClient<NetworkClientConfiguration>
      | undefined;
  }): PendingTransactionTracker {
    const pendingTransactionTracker = new PendingTransactionTracker({
      approveTransaction: this.approveTransaction.bind(this),
      getNetworkClient,
      getTransactions: () => this.state.transactions,
      isResubmitEnabled: this.#pendingTransactionOptions.isResubmitEnabled,
      getGlobalLock: (chainId: Hex) =>
        this.#multichainTrackingHelper.acquireNonceLockForChainIdKey({
          chainId,
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

  #getNonceTrackerPendingTransactions(chainId: string, address: string) {
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
    return [new LineaGasFeeFlow(), new DefaultGasFeeFlow()];
  }

  #updateTransactionInternal(
    transactionMeta: TransactionMeta,
    { note, skipHistory }: { note?: string; skipHistory?: boolean },
  ) {
    const { transactions } = this.state;

    transactionMeta.txParams = normalizeTxParams(transactionMeta.txParams);

    validateTxParams(transactionMeta.txParams);

    if (skipHistory !== true) {
      updateTransactionHistory(transactionMeta, note ?? 'Transaction updated');
    }

    const index = transactions.findIndex(({ id }) => transactionMeta.id === id);
    transactions[index] = transactionMeta;

    this.update({ transactions: this.trimTransactionsForState(transactions) });
  }

  #getEthQueryOrThrow({
    networkClientId,
    chainId,
  }: {
    networkClientId?: NetworkClientId;
    chainId?: Hex;
  }): EthQuery {
    const ethQuery = this.#multichainTrackingHelper.getEthQuery({
      networkClientId,
      chainId,
    });

    if (!ethQuery) {
      throw providerErrors.disconnected();
    }

    return ethQuery;
  }

  #getChainIdOrThrow(networkClientId?: NetworkClientId): Hex {
    const chainId = this.getChainId(networkClientId);

    if (!chainId) {
      throw providerErrors.disconnected();
    }

    return chainId;
  }

  #getSelectedNetworkClientConfiguration():
    | NetworkClientConfiguration
    | undefined {
    return this.#multichainTrackingHelper.getSelectedNetworkClient()
      ?.configuration;
  }
}
