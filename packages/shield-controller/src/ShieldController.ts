import {
  BaseController,
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
} from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import {
  SignatureRequestStatus,
  type SignatureRequest,
  type SignatureStateChange,
} from '@metamask/signature-controller';
import type {
  SubscriptionControllerGetSubscriptionsAction,
  SubscriptionControllerStartSubscriptionWithCryptoAction,
  SubscriptionControllerGetStateAction,
  SubscriptionControllerGetCryptoApproveTransactionParamsAction,
  TokenPaymentInfo,
  ProductPrice,
} from '@metamask/subscription-controller';
import {
  PAYMENT_TYPES,
  PRODUCT_TYPES,
  RECURRING_INTERVALS,
} from '@metamask/subscription-controller';
import {
  TransactionStatus,
  type TransactionControllerStateChangeEvent,
  type TransactionMeta,
} from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { TransactionControllerTransactionSubmittedEvent } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { cloneDeep, isEqual } from 'lodash';

import { controllerName } from './constants';
import { projectLogger, createModuleLogger } from './logger';
import type {
  CoverageResult,
  DecodeTransactionDataHandler,
  NormalizeSignatureRequestFn,
  ShieldBackend,
} from './types';

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
  | TransactionControllerStateChangeEvent
  | TransactionControllerTransactionSubmittedEvent;

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
  /**
   * Normalize the signature request before sending it to the backend.
   * Please note that the reason this is not being done internally is to
   * align the request body (data & params) with the security-alerts API.
   * The same normalization function which is used to normalize security-alerts request should be used here.
   *
   * @param signatureRequest - The signature request to normalize.
   * @returns The normalized signature request.
   */
  normalizeSignatureRequest?: NormalizeSignatureRequestFn;
  /**
   * Handler to decode transaction data.
   * Depend on client provider, not being handled internally
   */
  decodeTransactionDataHandler: DecodeTransactionDataHandler;
};

export class ShieldController extends BaseController<
  typeof controllerName,
  ShieldControllerState,
  ShieldControllerMessenger
> {
  readonly #backend: ShieldBackend;

  readonly #coverageHistoryLimit: number;

  readonly #transactionHistoryLimit: number;

  readonly #normalizeSignatureRequest?: NormalizeSignatureRequestFn;

  readonly #transactionControllerStateChangeHandler: (
    transactions: TransactionMeta[],
    previousTransactions: TransactionMeta[] | undefined,
  ) => void;

  readonly #signatureControllerStateChangeHandler: (
    signatureRequests: Record<string, SignatureRequest>,
    previousSignatureRequests: Record<string, SignatureRequest> | undefined,
  ) => void;

  readonly #decodeTransactionDataHandler: DecodeTransactionDataHandler;

  #started: boolean;

  constructor(options: ShieldControllerOptions) {
    const {
      messenger,
      state,
      backend,
      transactionHistoryLimit = 100,
      coverageHistoryLimit = 10,
      normalizeSignatureRequest,
      decodeTransactionDataHandler,
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
    this.#started = false;
    this.#normalizeSignatureRequest = normalizeSignatureRequest;
    this.#decodeTransactionDataHandler = decodeTransactionDataHandler;
  }

  start() {
    if (this.#started) {
      return;
    }
    this.#started = true;

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
    if (!this.#started) {
      return;
    }
    this.#started = false;

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

      // Check coverage if the signature request is new.
      if (!previousSignatureRequest) {
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

      // Check if the simulation data has changed.
      const simulationDataNotChanged = isEqual(
        transaction.simulationData,
        previousTransaction?.simulationData,
      );

      // Check coverage if the transaction is new or if the simulation data has
      // changed.
      if (!previousTransaction || !simulationDataNotChanged) {
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
    const coverageId = this.#getLatestCoverageId(txMeta.id);
    const coverageResult = await this.#backend.checkCoverage({
      txMeta,
      coverageId,
    });

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
    const coverageId = this.#getLatestCoverageId(signatureRequest.id);

    // Normalize the signature request before sending it to the backend.
    // This is to ensure that the signature data is normalized and consistent as the security alerts api calls.
    const clonedSignatureRequest = cloneDeep(signatureRequest);
    const normalizedSignatureRequest =
      this.#normalizeSignatureRequest?.(clonedSignatureRequest) ??
      clonedSignatureRequest;
    const coverageResult = await this.#backend.checkSignatureCoverage({
      signatureRequest: normalizedSignatureRequest,
      coverageId,
    });

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
    // Assert the coverageId hasn't changed.
    const latestCoverageId = this.#getLatestCoverageId(txId);
    if (latestCoverageId && coverageResult.coverageId !== latestCoverageId) {
      throw new Error('Coverage ID has changed');
    }

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
    const signature = signatureRequest.rawSig;
    if (!signature) {
      throw new Error('Signature not found');
    }

    const { status } = this.#getCoverageStatus(signatureRequest.id);

    await this.#backend.logSignature({
      signatureRequest,
      signature,
      status,
    });
  }

  async #logTransaction(txMeta: TransactionMeta) {
    const transactionHash = txMeta.hash;
    if (!transactionHash) {
      throw new Error('Transaction hash not found');
    }

    const { status } = this.#getCoverageStatus(txMeta.id);

    await this.#backend.logTransaction({
      txMeta,
      transactionHash,
      status,
    });
  }

  #getCoverageStatus(itemId: string) {
    // The status is assigned as follows:
    // - 'shown' if we have a result
    // - 'not_shown' if we don't have a result
    const coverageId = this.#getLatestCoverageId(itemId);
    let status = 'shown';
    if (!coverageId) {
      log('Coverage ID not found for', itemId);
      status = 'not_shown';
    }
    return { status };
  }

  #getLatestCoverageId(itemId: string): string | undefined {
    return this.state.coverageResults[itemId]?.results[0]?.coverageId;
  }
}
