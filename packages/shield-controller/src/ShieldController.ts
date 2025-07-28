import { BaseController } from '@metamask/base-controller';
import type { RestrictedMessenger } from '@metamask/base-controller';
import type {
  TransactionControllerUnapprovedTransactionAddedEvent,
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';

import { controllerName } from './constants';
import { projectLogger as log } from './logger';
import type { SubscriptionControllerCheckSubscriptionStatusAction } from './mock';
import type { CoverageResult, ShieldBackend } from './types';

export type ShieldControllerState = {
  coverageResults: CoverageResult[];
};

/**
 * Get the default state for the ShieldController.
 *
 * @returns The default state for the ShieldController.
 */
function getDefaultShieldControllerState(): ShieldControllerState {
  return {
    coverageResults: [],
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
export type AllowedActions =
  SubscriptionControllerCheckSubscriptionStatusAction;

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
};

export class ShieldController extends BaseController<
  typeof controllerName,
  ShieldControllerState,
  ShieldControllerMessenger
> {
  readonly #backend: ShieldBackend;

  constructor(options: ShieldControllerOptions) {
    const { messenger, state, backend } = options;
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
  }

  start() {
    this.messagingSystem.subscribe(
      'TransactionController:unapprovedTransactionAdded',
      this.#handleUnapprovedTransactionAdded.bind(this),
    );
  }

  async #handleUnapprovedTransactionAdded(transactionMeta: TransactionMeta) {
    log('Transaction added', transactionMeta);
    await this.checkCoverage(transactionMeta);
  }

  async checkCoverage(txMeta: TransactionMeta): Promise<CoverageResult> {
    // Check subscription status
    const subscriptionStatus = await this.#checkSubscriptionStatus();
    if (subscriptionStatus !== 'subscribed') {
      throw new Error('Not subscribed');
    }

    // Check coverage
    const coverageResult = await this.#fetchCoverageResult(txMeta);

    // Publish coverage result
    this.messagingSystem.publish(
      `${controllerName}:coverageResultReceived`,
      coverageResult,
    );

    // Update state
    this.update((draft) => {
      draft.coverageResults.push(coverageResult);
    });

    return coverageResult;
  }

  #checkSubscriptionStatus(): Promise<'subscribed' | 'not-subscribed'> {
    return this.messagingSystem.call(
      'SubscriptionController:checkSubscriptionStatus',
      'Shield',
    );
  }

  #fetchCoverageResult(txMeta: TransactionMeta): Promise<CoverageResult> {
    return this.#backend.checkCoverage(txMeta);
  }
}
