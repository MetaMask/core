import type { TraceCallback, TraceContext } from '@metamask/controller-utils';
import type { NetworkClientId } from '@metamask/network-controller';
import type { NonceLock } from '@metamask/nonce-tracker';
import type { Hex } from '@metamask/utils';
// This package purposefully relies on Node's EventEmitter module.
// eslint-disable-next-line import-x/no-nodejs-modules
import type { EventEmitter } from 'events';
import type { WritableDraft } from 'immer/dist/internal.js';

import type {
  TransactionController,
  TransactionControllerMessenger,
  TransactionControllerOptions,
  TransactionControllerState,
} from '../TransactionController.js';
import type {
  AddTransactionOptions,
  GasFeeFlow,
  GasFeeToken,
  Layer1GasFeeFlow,
  TransactionMeta,
  TransactionParams,
} from '../types.js';
import type { TransactionLifecycleState } from './state.js';

/** Original input to the addTransaction action. */
export type AddTransactionInput = {
  options: AddTransactionOptions;
  txParams: TransactionParams;
};

/** Input and controller services for adding a transaction. */
export type AddTransactionRequest = {
  addTransactionRequest: AddTransactionInput;
  constructorOptions: TransactionConstructorOptions;
  dependencies: TransactionStageDependencies;
};

/** Shared request passed through the stages after initialization. */
export type TransactionLifecycleRequest = AddTransactionRequest & {
  delegationAddressPromise: Promise<Hex | undefined>;
  lifecycle: TransactionLifecycleState;
  transactionMeta: TransactionMeta;
};

/** Constructor configuration used by the lifecycle, with the shared tracer. */
export type TransactionConstructorOptions = Pick<
  TransactionControllerOptions,
  | 'disableSwaps'
  | 'getPermittedAccounts'
  | 'getSavedGasFees'
  | 'isFirstTimeInteractionEnabled'
> & {
  hooks: Pick<
    TransactionControllerOptions['hooks'],
    'afterAdd' | 'beforePublish' | 'beforeSign' | 'publish'
  >;
  trace: TraceCallback;
};

/** Mutate a transaction in controller state via Immer. */
export type UpdateTransactionInternal = (
  options: {
    transactionId: string;
    skipResimulateCheck?: boolean;
    skipValidation?: boolean;
  },
  callback: (transactionMeta: TransactionMeta) => TransactionMeta | void,
) => Readonly<TransactionMeta>;

/**
 * Controller resources used by the addTransaction lifecycle.
 *
 * Bound once per controller. The stable object also scopes transient lifecycle
 * tracking, while controller state is read on demand.
 */
export type TransactionStageDependencies = {
  addTransactionBatch: TransactionController['addTransactionBatch'];
  failTransaction: (
    transactionMeta: TransactionMeta,
    error: Error,
    actionId?: string,
  ) => void;
  fetchGasFeeTokens: (
    transactionMeta: TransactionMeta,
  ) => Promise<GasFeeToken[]>;
  gasFeeFlows: GasFeeFlow[];
  getNonceLock: (
    address: string,
    networkClientId: NetworkClientId,
  ) => Promise<NonceLock>;
  getState: () => TransactionControllerState;
  hasNetworkClient: (networkClientId: NetworkClientId) => boolean;
  internalEvents: EventEmitter;
  layer1GasFeeFlows: Layer1GasFeeFlow[];
  messenger: TransactionControllerMessenger;
  publishTransaction: (
    transactionMeta: TransactionMeta,
    options?: { skipSubmitHistory?: boolean },
  ) => Promise<string>;
  skipSimulationTransactionIds: Set<string>;
  updateGasEstimate: (transactionMeta: TransactionMeta) => Promise<void>;
  updateSimulationData: (
    transactionMeta: TransactionMeta,
    options?: { blockTime?: number; traceContext?: TraceContext },
  ) => Promise<void>;
  updateState: (
    callback: (
      state: WritableDraft<TransactionControllerState>,
    ) => void | TransactionControllerState,
  ) => void;
  updateTransaction: (transactionMeta: TransactionMeta, note: string) => void;
  updateTransactionInternal: UpdateTransactionInternal;
};
