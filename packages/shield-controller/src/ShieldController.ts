import { BaseController } from '@metamask/base-controller';
import type { RestrictedMessenger } from '@metamask/base-controller';
import type {
  TransactionControllerUnapprovedTransactionAddedEvent,
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';

export type Transaction = {
  from: string;
  to: string;
  value: string;
  data: string;
  nonce: string;
};

export type CoverageStatus = 'success' | 'error';

export type CoverageResult = {
  txId: string;
  status: CoverageStatus;
};

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

/**
 * The name of the {@link ShieldController}.
 */
const controllerName = 'ShieldController';

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
export type AllowedActions = never;

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
  state?: ShieldControllerState;
};

export class ShieldController extends BaseController<
  typeof controllerName,
  ShieldControllerState,
  ShieldControllerMessenger
> {
  constructor(options: ShieldControllerOptions) {
    const { messenger, state } = options;
    super({
      name: controllerName,
      metadata,
      messenger,
      state: {
        ...getDefaultShieldControllerState(),
        ...state,
      },
    });
  }

  start() {
    this.messagingSystem.subscribe(
      'TransactionController:unapprovedTransactionAdded',
      this.handleUnapprovedTransactionAdded.bind(this),
    );
  }

  async handleUnapprovedTransactionAdded(transactionMeta: TransactionMeta) {
    await this.checkCoverage(transactionMeta.txParams);
  }

  async checkCoverage(txParams: TransactionParams): Promise<CoverageResult> {
    // Check subscription status
    const subscriptionStatus = await this.checkSubscriptionStatus();
    if (subscriptionStatus !== 'subscribed') {
      throw new Error('Not subscribed');
    }

    // Check coverage
    const coverageResult = await this.fetchCoverageResult(txParams);

    // Publish coverage result
    this.messagingSystem.publish(
      `${controllerName}:coverageResultReceived`,
      coverageResult,
    );

    return coverageResult;
  }
}
