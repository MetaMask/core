import { BaseController } from '@metamask/base-controller';
import type { RestrictedMessenger } from '@metamask/base-controller';
import type { AuthenticationControllerGetBearerToken } from '@metamask/profile-sync-controller/auth';
import type {
  TransactionControllerUnapprovedTransactionAddedEvent,
  TransactionMeta,
} from '@metamask/transaction-controller';

import { controllerName } from './constants';
import { projectLogger as log } from './logger';
import type { CoverageResult, ShieldBackend } from './types';

export type ShieldControllerState = {
  coverageResults: Record<
    string, // txId
    { results: CoverageResult[] } // history of coverage results, latest first
  >;
};

/**
 * Get the default state for the ShieldController.
 *
 * @returns The default state for the ShieldController.
 */
function getDefaultShieldControllerState(): ShieldControllerState {
  return {
    coverageResults: {},
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

/**
 * The internal events available to the ShieldController.
 */
export type ShieldControllerEvents =
  ShieldControllerCoverageResultReceivedEvent;

/**
 * The external actions available to the ShieldController.
 */
export type AllowedActions = AuthenticationControllerGetBearerToken;

/**
 * The external events available to the ShieldController.
 */
export type AllowedEvents =
  TransactionControllerUnapprovedTransactionAddedEvent;

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
};

export type ShieldControllerOptions = {
  messenger: ShieldControllerMessenger;
  state?: Partial<ShieldControllerState>;
  backend: ShieldBackend;
  coverageHistoryLimit?: number;
};

export class ShieldController extends BaseController<
  typeof controllerName,
  ShieldControllerState,
  ShieldControllerMessenger
> {
  readonly #backend: ShieldBackend;

  readonly #coverageHistoryLimit: number;

  constructor(options: ShieldControllerOptions) {
    const { messenger, state, backend, coverageHistoryLimit = 10 } = options;
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
  }

  start() {
    this.messagingSystem.subscribe(
      'TransactionController:unapprovedTransactionAdded',
      (txMeta: TransactionMeta) => {
        this.#handleUnapprovedTransactionAdded(txMeta).catch((error) => {
          log('Error in transaction handler:', error);
        });
      },
    );
  }

  async #handleUnapprovedTransactionAdded(transactionMeta: TransactionMeta) {
    log('Transaction added', transactionMeta);
    await this.checkCoverage(transactionMeta);
  }

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
    const accessToken = await this.messagingSystem.call(
      'AuthenticationController:getBearerToken',
    );
    return this.#backend.checkCoverage(accessToken, txMeta);
  }

  #addCoverageResult(txId: string, coverageResult: CoverageResult) {
    // Read state
    let coverageResultEntry = this.state.coverageResults[txId];

    // Update state
    if (!coverageResultEntry) {
      coverageResultEntry = {
        results: [],
      };
    }

    if (coverageResultEntry.results.length >= this.#coverageHistoryLimit) {
      coverageResultEntry.results.pop();
    }
    coverageResultEntry.results.unshift(coverageResult);

    // Write state
    this.update((draft) => {
      draft.coverageResults[txId] = coverageResultEntry;
    });
  }
}
