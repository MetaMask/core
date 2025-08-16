import { BaseController } from '@metamask/base-controller';
import type {
  ControllerStateChangeEvent,
  RestrictedMessenger,
} from '@metamask/base-controller';
import type {
  TransactionControllerStateChangeEvent,
  TransactionMeta,
} from '@metamask/transaction-controller';

import { controllerName } from './constants';
import { projectLogger, createModuleLogger } from './logger';
import type { CoverageResult, ShieldBackend } from './types';

const log = createModuleLogger(projectLogger, 'ShieldController');

export type CoverageResultRecordEntry = {
  results: CoverageResult[]; // history of coverage results, latest first
};

export type ShieldControllerState = {
  coverageResults: Record<
    string, // txId
    CoverageResultRecordEntry
  >;
  orderedTransactionHistory: string[]; // List of txIds ordered by time, latest first
};

/**
 * Get the default state for the ShieldController.
 *
 * @returns The default state for the ShieldController.
 */
export function getDefaultShieldControllerState(): ShieldControllerState {
  return {
    coverageResults: {},
    orderedTransactionHistory: [],
  };
}

export type ShieldControllerCheckCoverageAction = {
  type: `${typeof controllerName}:checkCoverage`;
  handler: ShieldController['checkCoverage'];
};

/**
 * The internal actions available to the ShieldController.
 */
export type ShieldControllerActions = ShieldControllerCheckCoverageAction;

export type ShieldControllerCoverageResultReceivedEvent = {
  type: `${typeof controllerName}:coverageResultReceived`;
  payload: [coverageResult: CoverageResult];
};

export type ShieldControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  ShieldControllerState
>;

/**
 * The internal events available to the ShieldController.
 */
export type ShieldControllerEvents =
  | ShieldControllerCoverageResultReceivedEvent
  | ShieldControllerStateChangeEvent;

/**
 * The external actions available to the ShieldController.
 */
type AllowedActions = never;

/**
 * The external events available to the ShieldController.
 */
type AllowedEvents = TransactionControllerStateChangeEvent;

/**
 * The messenger of the {@link ShieldController}.
 */
export type ShieldControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  ShieldControllerActions | AllowedActions,
  ShieldControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Metadata for the ShieldController state, describing how to "anonymize"
 * the state and which parts should be persisted.
 */
const metadata = {
  coverageResults: {
    persist: true,
    anonymous: false,
  },
  orderedTransactionHistory: {
    persist: true,
    anonymous: false,
  },
};

export type ShieldControllerOptions = {
  messenger: ShieldControllerMessenger;
  state?: Partial<ShieldControllerState>;
  backend: ShieldBackend;
  transactionHistoryLimit?: number;
  coverageHistoryLimit?: number;
};

export class ShieldController extends BaseController<
  typeof controllerName,
  ShieldControllerState,
  ShieldControllerMessenger
> {
  readonly #backend: ShieldBackend;

  readonly #coverageHistoryLimit: number;

  readonly #transactionHistoryLimit: number;

  readonly #transactionControllerStateChangeHandler: (
    transactions: TransactionMeta[],
    previousTransactions: TransactionMeta[] | undefined,
  ) => void;

  constructor(options: ShieldControllerOptions) {
    const {
      messenger,
      state,
      backend,
      transactionHistoryLimit = 100,
      coverageHistoryLimit = 10,
    } = options;
    super({
      name: controllerName,
      metadata,
      messenger,
      state: {
        ...getDefaultShieldControllerState(),
        ...state,
      },
    });

    this.#backend = backend;
    this.#coverageHistoryLimit = coverageHistoryLimit;
    this.#transactionHistoryLimit = transactionHistoryLimit;
    this.#transactionControllerStateChangeHandler =
      this.#handleTransactionControllerStateChange.bind(this);
  }

  start() {
    this.messagingSystem.subscribe(
      'TransactionController:stateChange',
      this.#transactionControllerStateChangeHandler,
      (state) => state.transactions,
    );
  }

  stop() {
    this.messagingSystem.unsubscribe(
      'TransactionController:stateChange',
      this.#transactionControllerStateChangeHandler,
    );
  }

  #handleTransactionControllerStateChange(
    transactions: TransactionMeta[],
    previousTransactions: TransactionMeta[] | undefined,
  ) {
    const previousTransactionsById = new Map<string, TransactionMeta>(
      previousTransactions?.map((tx) => [tx.id, tx]) ?? [],
    );
    for (const transaction of transactions) {
      const previousTransaction = previousTransactionsById.get(transaction.id);

      // Check coverage if the transaction is new or if the simulation data has
      // changed.
      if (
        !previousTransaction ||
        // Checking reference equality is sufficient because this object is
        // replaced if the simulation data has changed.
        previousTransaction.simulationData !== transaction.simulationData
      ) {
        this.checkCoverage(transaction).catch(
          // istanbul ignore next
          (error) => log('Error checking coverage:', error),
        );
      }
    }
  }

  /**
   * Checks the coverage of a transaction.
   *
   * @param txMeta - The transaction to check coverage for.
   * @returns The coverage result.
   */
  async checkCoverage(txMeta: TransactionMeta): Promise<CoverageResult> {
    // Check coverage
    const coverageResult = await this.#fetchCoverageResult(txMeta);

    // Publish coverage result
    this.messagingSystem.publish(
      `${controllerName}:coverageResultReceived`,
      coverageResult,
    );

    // Update state
    this.#addCoverageResult(txMeta.id, coverageResult);

    return coverageResult;
  }

  async #fetchCoverageResult(txMeta: TransactionMeta): Promise<CoverageResult> {
    return this.#backend.checkCoverage(txMeta);
  }

  #addCoverageResult(txId: string, coverageResult: CoverageResult) {
    this.update((draft) => {
      // Fetch coverage result entry.
      let newEntry = false;
      let coverageResultEntry = draft.coverageResults[txId];

      // Create new entry if necessary.
      if (!coverageResultEntry) {
        newEntry = true;
        coverageResultEntry = {
          results: [],
        };
        draft.coverageResults[txId] = coverageResultEntry;
      }

      // Trim coverage history if necessary.
      if (coverageResultEntry.results.length >= this.#coverageHistoryLimit) {
        coverageResultEntry.results.pop();
      }

      // Add new result.
      coverageResultEntry.results.unshift(coverageResult);

      // Add to history if new entry.
      const { orderedTransactionHistory } = draft;
      let removedTxId: string | undefined;
      if (newEntry) {
        // Trim transaction history if necessary.
        if (orderedTransactionHistory.length >= this.#transactionHistoryLimit) {
          removedTxId = orderedTransactionHistory.pop();
          // Delete corresponding coverage result entry.
          if (removedTxId) {
            delete draft.coverageResults[removedTxId];
          }
        }
        // Add to history.
        orderedTransactionHistory.unshift(txId);
      }
    });
  }
}
