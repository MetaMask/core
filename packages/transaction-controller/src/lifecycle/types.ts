import type { TraceCallback } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';

import type { TransactionControllerMessenger } from '../TransactionController';
import type {
  AddTransactionOptions,
  DappSuggestedGasFees,
  PublishHook,
  SecurityProviderRequest,
  TransactionMeta,
  TransactionParams,
} from '../types';

/** Lifecycle callbacks registered by pipeline stages, invoked after approval succeeds or fails. */
export type PipelineCallbacks = {
  onSuccess: (() => void)[];
  onError: ((error: Error) => void)[];
};

/**
 * Dependency injection surface for the transaction pipeline.
 *
 * Provides all controller methods and state accessors that pipeline stages
 * need without coupling them to `TransactionController` directly.
 */
export type TransactionContext = {
  addMetadata: (transactionMeta: TransactionMeta) => void;

  afterAdd: (opts: {
    transactionMeta: TransactionMeta;
  }) => Promise<{ updateTransaction?: (tx: TransactionMeta) => void }>;

  cancelTransaction: (id: string) => void;
  existingTransactions: TransactionMeta[];

  failTransaction: (transactionMeta: TransactionMeta, error: Error) => void;

  generateDappSuggestedGasFees: (
    txParams: TransactionParams,
    origin?: string,
  ) => DappSuggestedGasFees | undefined;

  getChainId: (networkClientId: string) => Hex;
  getEIP1559Compatibility: (networkClientId: string) => Promise<boolean>;
  getInternalAccounts: () => Hex[];
  getPermittedAccounts?: (origin?: string) => Promise<string[]>;
  getTransaction: (id: string) => TransactionMeta | undefined;

  getTransactionWithActionId: (
    actionId?: string,
  ) => TransactionMeta | undefined;

  hasNetworkClient: (networkClientId: string) => boolean;
  isFirstTimeInteractionEnabled: () => boolean;
  isSwapsDisabled: boolean;
  messenger: TransactionControllerMessenger;

  processApproval: (
    transactionMeta: TransactionMeta,
    opts: {
      actionId?: string;
      isExisting?: boolean;
      publishHook?: PublishHook;
      requireApproval?: boolean;
      shouldShowRequest?: boolean;
      traceContext?: unknown;
    },
  ) => Promise<string>;

  publishEvent: (transactionMeta: TransactionMeta) => void;

  requestApproval: (
    transactionMeta: TransactionMeta,
    opts: { shouldShowRequest: boolean; traceContext?: unknown },
  ) => Promise<unknown>;

  securityProviderRequest?: SecurityProviderRequest;
  trace: TraceCallback;

  updateGasProperties: (
    transactionMeta: TransactionMeta,
    opts?: { traceContext?: unknown },
  ) => Promise<void>;

  updateSimulationData: (
    transactionMeta: TransactionMeta,
    opts: { traceContext?: unknown },
  ) => Promise<void>;

  updateTransactionInternal: (
    opts: {
      transactionId: string;
      note?: string;
      skipResimulateCheck?: boolean;
      skipValidation?: boolean;
    },
    mutate: (tx: TransactionMeta) => void,
  ) => void;
};

/** A single stage in the transaction pipeline (e.g. `data`). */
export type TransactionStage = (
  transactionMeta: TransactionMeta,
  options: AddTransactionOptions,
  callbacks: PipelineCallbacks,
  context: TransactionContext,
) => Promise<void>;

/** Return value of {@link startTransaction} — the metadata and a deferred hash promise. */
export type StartTransactionResult = {
  transactionMeta: TransactionMeta;
  result: Promise<string>;
};
