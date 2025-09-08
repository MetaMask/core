import {
  BaseController,
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
} from '@metamask/base-controller/next';
import type { Messenger } from '@metamask/messenger';
import {
  SignatureRequestStatus,
  SignatureRequestType,
  type SignatureRequest,
  type SignatureStateChange,
} from '@metamask/signature-controller';
import {
  TransactionStatus,
  type TransactionControllerStateChangeEvent,
  type TransactionMeta,
} from '@metamask/transaction-controller';

import { controllerName } from './constants';
import { projectLogger, createModuleLogger } from './logger';
import type { CoverageResult, ShieldBackend } from './types';

const log = createModuleLogger(projectLogger, 'ShieldController');

export type CoverageResultRecordEntry = {
  /**
   * History of coverage results, latest first.
   */
  results: CoverageResult[];
};

export type ShieldControllerState = {
  /**
   * Coverage results by transaction ID.
   */
  coverageResults: Record<
    string, // txId
    CoverageResultRecordEntry
  >;
  /**
   * List of txIds ordered by time, latest first.
   */
  orderedTransactionHistory: string[];
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

export type ShieldControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  ShieldControllerState
>;

export type ShieldControllerCheckCoverageAction = {
  type: `${typeof controllerName}:checkCoverage`;
  handler: ShieldController['checkCoverage'];
};

/**
 * The internal actions available to the ShieldController.
 */
export type ShieldControllerActions =
  | ShieldControllerGetStateAction
  | ShieldControllerCheckCoverageAction;

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
 * The external events available to the ShieldController.
 */
type AllowedEvents =
  | SignatureStateChange
  | TransactionControllerStateChangeEvent;

/**
 * The messenger of the {@link ShieldController}.
 */
export type ShieldControllerMessenger = Messenger<
  typeof controllerName,
  ShieldControllerActions,
  ShieldControllerEvents | AllowedEvents
>;

/**
 * Metadata for the ShieldController state, describing how to "anonymize"
 * the state and which parts should be persisted.
 */
const metadata = {
  coverageResults: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  orderedTransactionHistory: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: false,
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

  readonly #signatureControllerStateChangeHandler: (
    signatureRequests: Record<string, SignatureRequest>,
    previousSignatureRequests: Record<string, SignatureRequest> | undefined,
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
    this.#signatureControllerStateChangeHandler =
      this.#handleSignatureControllerStateChange.bind(this);
  }

  start() {
    this.messenger.subscribe(
      'TransactionController:stateChange',
      this.#transactionControllerStateChangeHandler,
      (state) => state.transactions,
    );

    this.messenger.subscribe(
      'SignatureController:stateChange',
      this.#signatureControllerStateChangeHandler,
      (state) => state.signatureRequests,
    );
  }

  stop() {
    this.messenger.unsubscribe(
      'TransactionController:stateChange',
      this.#transactionControllerStateChangeHandler,
    );

    this.messenger.unsubscribe(
      'SignatureController:stateChange',
      this.#signatureControllerStateChangeHandler,
    );
  }

  #handleSignatureControllerStateChange(
    signatureRequests: Record<string, SignatureRequest>,
    previousSignatureRequests: Record<string, SignatureRequest> | undefined,
  ) {
    const signatureRequestsArray = Object.values(signatureRequests);
    const previousSignatureRequestsArray = Object.values(
      previousSignatureRequests ?? {},
    );
    const previousSignatureRequestsById = new Map<string, SignatureRequest>(
      previousSignatureRequestsArray.map((request) => [request.id, request]),
    );
    for (const signatureRequest of signatureRequestsArray) {
      const previousSignatureRequest = previousSignatureRequestsById.get(
        signatureRequest.id,
      );

      // Check coverage if the signature request is new and has type
      // `personal_sign`.
      if (
        !previousSignatureRequest &&
        signatureRequest.type === SignatureRequestType.PersonalSign
      ) {
        this.checkSignatureCoverage(signatureRequest).catch(
          // istanbul ignore next
          (error) => log('Error checking coverage:', error),
        );
      }

      // Log signature once the signature request has been fulfilled.
      if (
        signatureRequest.status === SignatureRequestStatus.Signed &&
        signatureRequest.status !== previousSignatureRequest?.status
      ) {
        this.#logSignature(signatureRequest).catch(
          // istanbul ignore next
          (error) => log('Error logging signature:', error),
        );
      }
    }
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

      // Log transaction once it has been submitted.
      if (
        transaction.status === TransactionStatus.submitted &&
        transaction.status !== previousTransaction?.status
      ) {
        this.#logTransaction(transaction).catch(
          // istanbul ignore next
          (error) => log('Error logging transaction:', error),
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
    const coverageResult = await this.#backend.checkCoverage(txMeta);

    // Publish coverage result
    this.messenger.publish(
      `${controllerName}:coverageResultReceived`,
      coverageResult,
    );

    // Update state
    this.#addCoverageResult(txMeta.id, coverageResult);

    return coverageResult;
  }

  /**
   * Checks the coverage of a signature request.
   *
   * @param signatureRequest - The signature request to check coverage for.
   * @returns The coverage result.
   */
  async checkSignatureCoverage(
    signatureRequest: SignatureRequest,
  ): Promise<CoverageResult> {
    // Check coverage
    const coverageResult =
      await this.#backend.checkSignatureCoverage(signatureRequest);

    // Publish coverage result
    this.messenger.publish(
      `${controllerName}:coverageResultReceived`,
      coverageResult,
    );

    // Update state
    this.#addCoverageResult(signatureRequest.id, coverageResult);

    return coverageResult;
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

  async #logSignature(signatureRequest: SignatureRequest) {
    const coverageId = this.#getLatestCoverageId(signatureRequest.id);
    if (!coverageId) {
      throw new Error('Coverage ID not found');
    }

    const sig = signatureRequest.rawSig;
    if (!sig) {
      throw new Error('Signature not found');
    }

    await this.#backend.logSignature({
      coverageId,
      signature: sig,
      // Status is 'shown' because the coverageId can only be retrieved after
      // the result is in the state. If the result is in the state, we assume
      // that it has been shown.
      status: 'shown',
    });
  }

  async #logTransaction(txMeta: TransactionMeta) {
    const coverageId = this.#getLatestCoverageId(txMeta.id);
    if (!coverageId) {
      throw new Error('Coverage ID not found');
    }

    const txHash = txMeta.hash;
    if (!txHash) {
      throw new Error('Transaction hash not found');
    }
    await this.#backend.logTransaction({
      coverageId,
      transactionHash: txHash,
      // Status is 'shown' because the coverageId can only be retrieved after
      // the result is in the state. If the result is in the state, we assume
      // that it has been shown.
      status: 'shown',
    });
  }

  #getLatestCoverageId(itemId: string) {
    return this.state.coverageResults[itemId]?.results[0]?.coverageId;
  }
}
