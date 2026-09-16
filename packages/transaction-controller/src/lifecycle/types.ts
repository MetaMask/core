import type { TraceCallback, TraceContext } from '@metamask/controller-utils';
import type { NetworkClientId } from '@metamask/network-controller';
import type { NonceLock } from '@metamask/nonce-tracker';
// This package purposefully relies on Node's EventEmitter module.
// eslint-disable-next-line import-x/no-nodejs-modules
import type { EventEmitter } from 'events';
import type {
  TransactionController,
  TransactionControllerOptions,
} from '../TransactionController.js';
import type {
  AddTransactionOptions,
  GasFeeFlow,
  Layer1GasFeeFlow,
  TransactionMeta,
  TransactionParams,
} from '../types.js';
import type { TransactionStateAccess } from '../utils/state.js';

/** Original input to the addTransaction action. */
export type AddTransactionInput = {
  options: AddTransactionOptions;
  txParams: TransactionParams;
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
    'afterAdd' | 'beforePublish' | 'publish'
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
 * Each stage selects only the dependencies it needs. Shared controller helpers
 * are bound once; mutable collections retain their identity and state is read
 * on demand. Helpers specific to adding a transaction live in the stages.
 */
export type TransactionStageDependencies = TransactionStateAccess & {
  addTransactionBatch: TransactionController['addTransactionBatch'];
  approvingTransactionIds: Set<string>;
  failTransaction: (
    transactionMeta: TransactionMeta,
    error: Error,
    actionId?: string,
  ) => void;
  gasFeeFlows: GasFeeFlow[];
  getNonceLock: (
    address: string,
    networkClientId: NetworkClientId,
  ) => Promise<NonceLock>;
  hasNetworkClient: (networkClientId: NetworkClientId) => boolean;
  internalEvents: EventEmitter;
  layer1GasFeeFlows: Layer1GasFeeFlow[];
  publishTransaction: (
    transactionMeta: TransactionMeta,
    options?: { skipSubmitHistory?: boolean },
  ) => Promise<string>;
  signTransaction: (
    transactionMeta: TransactionMeta,
  ) => Promise<string | undefined>;
  skipSimulationTransactionIds: Set<string>;
  updateGasEstimate: (transactionMeta: TransactionMeta) => Promise<void>;
  updateSimulationData: (
    transactionMeta: TransactionMeta,
    options?: { blockTime?: number; traceContext?: TraceContext },
  ) => Promise<void>;
  updateTransaction: (transactionMeta: TransactionMeta, note: string) => void;
  updateTransactionInternal: UpdateTransactionInternal;
};
