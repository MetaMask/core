import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { ChompApiError } from '@metamask/chomp-api-service';
import type {
  ChompApiServiceGetDerivedIdentitiesAction,
  ChompApiServiceGetDerivedIdentityByAddressAction,
  ChompApiServiceStartFundsTransferAction,
  DerivedIdentitiesResponse,
  DerivedIdentity,
  DerivedIdentityMigration,
} from '@metamask/chomp-api-service';
import { KeyringTypes } from '@metamask/keyring-controller';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerState,
  KeyringControllerStateChangeEvent,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  MoneyAccountControllerCreateMoneyAccountAction,
  MoneyAccountControllerGetMoneyAccountAction,
  MoneyAccountControllerSetDefaultMoneyAccountAction,
  MoneyAccountControllerStateChangeEvent,
} from '@metamask/money-account-controller';
import type {
  MoneyAccountRegistrationStatus,
  MoneyAccountUpgradeControllerGetRegistrationStatusAction,
  MoneyAccountUpgradeControllerRegisterMigrationIntentsAction,
  MoneyAccountUpgradeControllerUpgradeAccountAction,
  MoneyAccountUpgradeControllerUpgradeSuccessorAccountAction,
} from '@metamask/money-account-upgrade-controller';
import type {
  FeatureFlags,
  RemoteFeatureFlagControllerGetStateAction,
  RemoteFeatureFlagControllerStateChangeEvent,
} from '@metamask/remote-feature-flag-controller';
import {
  CRYPTO_AUTH_METHODS,
  PAYMENT_TYPES,
  PRODUCT_TYPES,
  SUBSCRIPTION_STATUSES,
} from '@metamask/subscription-controller';
import type {
  RecurringInterval,
  Subscription,
  SubscriptionControllerGetPricingAction,
  SubscriptionControllerGetSubscriptionsAction,
  SubscriptionControllerUpdatePaymentMethodAction,
  SubscriptionDelegationServicePrepareDelegationAction,
} from '@metamask/subscription-controller';
import type { Hex } from '@metamask/utils';
import deepEqual from 'fast-deep-equal';

import {
  MAX_DIAGNOSTICS_HISTORY_LENGTH,
  buildLifecycleChangedEvent,
  getDefaultMoneyAccountLifecycleDiagnostics,
  isKeptInHistory,
  summarizeError,
} from './diagnostics.js';
import type {
  MoneyAccountLifecycleDiagnostics,
  MoneyAccountLifecycleErrorSummary,
  MoneyAccountLifecycleLogEntry,
  MoneyAccountLifecycleLogEvent,
  MoneyAccountMigrationStage,
  MoneyAccountOperation,
  MoneyAccountOperationDiagnostics,
  MoneyAccountRegistrationRole,
  MoneyAccountUpgradeSkipReason,
} from './diagnostics.js';
import {
  MoneyAccountLifecycleError,
  MoneyAccountLifecycleErrorCode,
} from './errors.js';
import {
  getMoneyAccountLifecycle,
  isMigrating,
} from './get-money-account-lifecycle.js';
import type { MoneyAccountLifecycle } from './get-money-account-lifecycle.js';
import { createModuleLogger, projectLogger } from './logger.js';
import type { MoneyAccountLifecycleControllerMethodActions } from './money-account-lifecycle-controller-method-action-types.js';

const log = createModuleLogger(
  projectLogger,
  'MoneyAccountLifecycleController',
);

const CONTROLLER_NAME = 'MoneyAccountLifecycleController';

const FUNDS_TRANSFER_RETRY_DELAY_MS = 2000;

const RETRYABLE_FUNDS_TRANSFER_ERROR_CODES = [
  'MIGRATION_STEPS_INCOMPLETE',
  'MIGRATION_TRANSFER_CONFLICT',
];

const ACTIVE_SUBSCRIPTION_STATUSES: string[] = [
  SUBSCRIPTION_STATUSES.active,
  SUBSCRIPTION_STATUSES.trialing,
  SUBSCRIPTION_STATUSES.provisional,
];

export type AddressRegistration = {
  isRegistered: boolean;
};

export type MoneyAccountLifecycleControllerState = {
  moneyAccounts: {
    [moneyAccountAddress: string]: MoneyAccountLifecycle;
  };
  addressRegistrations: {
    [address: string]: AddressRegistration;
  };
  diagnostics: MoneyAccountLifecycleDiagnostics;
};

const moneyAccountLifecycleControllerMetadata = {
  moneyAccounts: {
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
  addressRegistrations: {
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    persist: true,
    usedInUi: false,
  },
  diagnostics: {
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    persist: true,
    usedInUi: false,
  },
} satisfies StateMetadata<MoneyAccountLifecycleControllerState>;

export function getDefaultMoneyAccountLifecycleControllerState(): MoneyAccountLifecycleControllerState {
  return {
    moneyAccounts: {},
    addressRegistrations: {},
    diagnostics: getDefaultMoneyAccountLifecycleDiagnostics(),
  };
}

const MESSENGER_EXPOSED_METHODS = [
  'init',
  'getMoneyAccountIdentity',
  'refresh',
  'upgradeMoneyAccount',
  'startMigration',
  'clearState',
] as const;

export type MoneyAccountIdentity = Pick<
  DerivedIdentity,
  'currentAddress' | 'previousAddresses' | 'status'
>;

export type MoneyAccountLifecycleControllerGetStateAction =
  ControllerGetStateAction<
    typeof CONTROLLER_NAME,
    MoneyAccountLifecycleControllerState
  >;

export type MoneyAccountLifecycleControllerActions =
  | MoneyAccountLifecycleControllerGetStateAction
  | MoneyAccountLifecycleControllerMethodActions;

type AllowedActions =
  | ChompApiServiceGetDerivedIdentitiesAction
  | ChompApiServiceGetDerivedIdentityByAddressAction
  | ChompApiServiceStartFundsTransferAction
  | KeyringControllerGetStateAction
  | MoneyAccountControllerCreateMoneyAccountAction
  | MoneyAccountControllerGetMoneyAccountAction
  | MoneyAccountControllerSetDefaultMoneyAccountAction
  | MoneyAccountUpgradeControllerGetRegistrationStatusAction
  | MoneyAccountUpgradeControllerRegisterMigrationIntentsAction
  | MoneyAccountUpgradeControllerUpgradeAccountAction
  | MoneyAccountUpgradeControllerUpgradeSuccessorAccountAction
  | RemoteFeatureFlagControllerGetStateAction
  | SubscriptionControllerGetPricingAction
  | SubscriptionControllerGetSubscriptionsAction
  | SubscriptionControllerUpdatePaymentMethodAction
  | SubscriptionDelegationServicePrepareDelegationAction;

export type MoneyAccountLifecycleControllerStateChangedEvent =
  ControllerStateChangedEvent<
    typeof CONTROLLER_NAME,
    MoneyAccountLifecycleControllerState
  >;

export type MoneyAccountLifecycleControllerEvents =
  MoneyAccountLifecycleControllerStateChangedEvent;

type AllowedEvents =
  | KeyringControllerStateChangeEvent
  | MoneyAccountControllerStateChangeEvent
  | RemoteFeatureFlagControllerStateChangeEvent;

export type MoneyAccountLifecycleControllerMessenger = Messenger<
  typeof CONTROLLER_NAME,
  MoneyAccountLifecycleControllerActions | AllowedActions,
  MoneyAccountLifecycleControllerEvents | AllowedEvents
>;

export type MoneyAccountLifecycleControllerHooks = {
  isEnabled: (remoteFeatureFlags: FeatureFlags) => boolean;
  /**
   * Receives every log entry, including those kept out of the diagnostics
   * history, for example to forward them to error monitoring. Entries never
   * contain addresses.
   */
  log?: (entry: MoneyAccountLifecycleLogEntry) => void;
};

export class MoneyAccountLifecycleController extends BaseController<
  typeof CONTROLLER_NAME,
  MoneyAccountLifecycleControllerState,
  MoneyAccountLifecycleControllerMessenger
> {
  readonly #isEnabled: MoneyAccountLifecycleControllerHooks['isEnabled'];

  readonly #logHook: MoneyAccountLifecycleControllerHooks['log'];

  #initialized = false;

  #syncedRemoteFeatureFlags?: FeatureFlags;

  #derivedIdentitiesRequest?: Promise<DerivedIdentitiesResponse>;

  #isFetchingDerivedIdentities = false;

  #derivedIdentities?: DerivedIdentity[];

  readonly #upgradesInFlight = new Map<string, Promise<void>>();

  readonly #registrationStatusRequests = new Map<
    string,
    Promise<MoneyAccountRegistrationStatus>
  >();

  readonly #registrationStatusFailures = new Map<
    MoneyAccountRegistrationRole,
    MoneyAccountLifecycleErrorSummary
  >();

  #isMigrationInFlight = false;

  /**
   * Bumped by `clearState`. Upgrades and migrations capture it when they
   * start and stop once it has moved on, so nothing started before the state
   * was cleared carries on or records anything afterwards.
   */
  #generation = 0;

  #migrationGeneration = 0;

  #migrationStage: MoneyAccountMigrationStage = 'checkIdentities';

  constructor({
    messenger,
    state,
    hooks,
  }: {
    messenger: MoneyAccountLifecycleControllerMessenger;
    state?: Partial<MoneyAccountLifecycleControllerState>;
    hooks: MoneyAccountLifecycleControllerHooks;
  }) {
    super({
      messenger,
      metadata: moneyAccountLifecycleControllerMetadata,
      name: CONTROLLER_NAME,
      state: {
        ...getDefaultMoneyAccountLifecycleControllerState(),
        ...state,
      },
    });

    this.#isEnabled = hooks.isEnabled;
    this.#logHook = hooks.log;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Fetches derived identities from CHOMP whenever the feature is enabled and
   * the wallet is unlocked with an HD keyring. Identities are cleared on lock
   * and refetched on unlock, when the remote feature flag values change, or on
   * the next trigger after a failed fetch.
   *
   * After each fetch, and whenever the primary Money Account changes, records
   * whether that account is not in an identity, a valid SFA, migrating to a
   * successor, or a valid MFA, along with its identity. After each fetch, or
   * when the recorded lifecycle changes, looks up whether the Money Account
   * address, and the identity's current address for a valid MFA, are
   * registered with CHOMP. For a valid MFA, makes `MoneyAccountController`'s
   * MPC money account its default once that account exists and matches the
   * identity's current address; it never creates the MPC money account.
   * Never upgrades the Money Account itself; clients do so through
   * `upgradeMoneyAccount`.
   */
  init(): void {
    if (this.#initialized) {
      return;
    }
    this.#initialized = true;

    this.messenger.subscribe(
      'KeyringController:stateChange',
      () => this.#sync(),
      isWalletReady,
    );
    this.messenger.subscribe('RemoteFeatureFlagController:stateChange', () =>
      this.#sync(),
    );
    this.messenger.subscribe('MoneyAccountController:stateChange', () =>
      this.#updateMoneyAccountLifecycle({ isRehydrating: false }),
    );
    this.#sync();
  }

  /**
   * Projects the identity of the primary Money Account from the recorded
   * lifecycle, so consumers can read balances across every address in its
   * chain. `currentAddress` is authoritative: while migrating it is still the
   * old address.
   *
   * A Money Account that is not in an identity has not been registered with
   * CHOMP yet, so it is projected as its own identity with status `NONE`.
   *
   * @returns The identity's current address, previous addresses, and status,
   * or `undefined` when there is no Money Account or no lifecycle has been
   * recorded for it yet.
   */
  getMoneyAccountIdentity(): MoneyAccountIdentity | undefined {
    const moneyAccount = this.messenger.call(
      'MoneyAccountController:getMoneyAccount',
      { type: 'mnemonic' },
    );
    if (!moneyAccount) {
      return undefined;
    }

    const moneyAccountKey = moneyAccount.address.toLowerCase() as Hex;
    const lifecycle = this.state.moneyAccounts[moneyAccountKey];
    if (!lifecycle) {
      return undefined;
    }

    if (lifecycle.type === 'notInIdentity') {
      return {
        currentAddress: moneyAccountKey,
        previousAddresses: [],
        status: 'NONE',
      };
    }

    const { currentAddress, previousAddresses, status } = lifecycle.identity;
    return { currentAddress, previousAddresses, status };
  }

  /**
   * Refetches derived identities from CHOMP and re-records the Money Account
   * lifecycle and registration statuses. CHOMP cannot push updates, so clients
   * call this to pick up changes made elsewhere, such as another device
   * migrating the Money Account to MFA (for example, when a screen gains focus).
   * Joins a fetch already in flight instead of starting another.
   *
   * @returns A promise that resolves once the latest fetch has been recorded,
   * or straight away when the feature is disabled or the wallet is not ready.
   * @throws The error from fetching identities, unchanged.
   */
  async refresh(): Promise<void> {
    if (!this.#isReady()) {
      return;
    }

    if (!this.#isFetchingDerivedIdentities) {
      this.#fetchDerivedIdentities();
    }
    await this.#waitForLatestDerivedIdentities();
  }

  /**
   * Triggers the Money Account upgrade process for the primary Money Account,
   * including its EIP-7702 upgrade, through `MoneyAccountUpgradeController`.
   * Only a Money Account that is not in an identity or is a valid SFA is
   * upgraded, judged from the latest identity fetch, and never while a
   * migration is in flight. Makes a single attempt;
   * clients decide when to call it and how to retry. Concurrent calls share the
   * attempt in flight. After upgrading, refetches identities so the recorded
   * lifecycle reflects the upgrade.
   *
   * @returns A promise that resolves once the attempt completes, or straight
   * away when the feature is disabled, the wallet is not ready, a migration is
   * in flight, or the Money Account cannot be upgraded.
   * @throws When there is no Money Account, or the error from fetching
   * identities before upgrading or from the upgrade, unchanged.
   */
  async upgradeMoneyAccount(): Promise<void> {
    const { remoteFeatureFlags } = this.messenger.call(
      'RemoteFeatureFlagController:getState',
    );
    if (!this.#isEnabled(remoteFeatureFlags)) {
      return;
    }

    const generation = this.#generation;
    const startedAt = Date.now();
    if (this.#isMigrationInFlight) {
      this.#skipUpgrade(generation, startedAt, 'migrationInFlight');
      return;
    }
    if (!isWalletReady(this.messenger.call('KeyringController:getState'))) {
      this.#skipUpgrade(generation, startedAt, 'walletNotReady');
      return;
    }

    const moneyAccount = this.messenger.call(
      'MoneyAccountController:getMoneyAccount',
      { type: 'mnemonic' },
    );
    if (!moneyAccount) {
      const error = new MoneyAccountLifecycleError(
        MoneyAccountLifecycleErrorCode.NoMoneyAccount,
        'No Money Account to upgrade',
      );
      this.#failUpgrade(generation, startedAt, error);
      throw error;
    }

    const moneyAccountKey = moneyAccount.address.toLowerCase();
    const upgradeInFlight = this.#upgradesInFlight.get(moneyAccountKey);
    if (upgradeInFlight) {
      return upgradeInFlight;
    }

    const upgrade = this.#upgradeMoneyAccount(
      moneyAccount.address as Hex,
    ).finally(() => {
      if (this.#upgradesInFlight.get(moneyAccountKey) === upgrade) {
        this.#upgradesInFlight.delete(moneyAccountKey);
      }
    });
    this.#upgradesInFlight.set(moneyAccountKey, upgrade);
    return upgrade;
  }

  async #upgradeMoneyAccount(moneyAccountAddress: Hex): Promise<void> {
    const generation = this.#generation;
    const startedAt = Date.now();
    try {
      await this.#waitForLatestDerivedIdentities();
    } catch (error) {
      this.#failUpgrade(generation, startedAt, error);
      throw error;
    }
    if (!this.#isCurrent(generation)) {
      this.#skipUpgrade(generation, startedAt, 'walletNotReady');
      return;
    }

    const lifecycle =
      this.state.moneyAccounts[moneyAccountAddress.toLowerCase()];
    if (lifecycle?.type !== 'sfa' && lifecycle?.type !== 'notInIdentity') {
      this.#skipUpgrade(generation, startedAt, 'notUpgradable');
      return;
    }

    this.#log({ type: 'upgradeStarted', lifecycle: lifecycle.type });
    try {
      await this.messenger.call(
        'MoneyAccountUpgradeController:upgradeAccount',
        moneyAccountAddress,
      );
    } catch (error) {
      this.#failUpgrade(generation, startedAt, error);
      throw error;
    }

    this.#log(
      { type: 'upgradeSucceeded', durationMs: Date.now() - startedAt },
      generation,
    );
    this.#recordAttempt('upgrade', generation, {
      startedAt,
      outcome: 'succeeded',
      skipReason: null,
      error: null,
    });
    if (!this.#isCurrent(generation)) {
      return;
    }

    this.#fetchDerivedIdentities();
    await this.#waitForLatestDerivedIdentities().catch(() => undefined);
  }

  #skipUpgrade(
    generation: number,
    startedAt: number,
    reason: MoneyAccountUpgradeSkipReason,
  ): void {
    if (generation !== this.#generation) {
      return;
    }
    this.#log({ type: 'upgradeSkipped', reason });
    this.#recordAttempt('upgrade', generation, {
      startedAt,
      outcome: 'skipped',
      skipReason: reason,
      error: null,
    });
  }

  #failUpgrade(generation: number, startedAt: number, error: unknown): void {
    const summary = summarizeError(error);
    this.#log(
      {
        type: 'upgradeFailed',
        durationMs: Date.now() - startedAt,
        error: summary,
      },
      generation,
    );
    this.#recordAttempt('upgrade', generation, {
      startedAt,
      outcome: 'failed',
      skipReason: null,
      error: summary,
    });
  }

  async #waitForLatestDerivedIdentities(): Promise<void> {
    if (!this.#derivedIdentitiesRequest) {
      this.#fetchDerivedIdentities();
    }

    let request = this.#derivedIdentitiesRequest;
    while (request) {
      try {
        await request;
      } catch (error) {
        // A failed latest request clears #derivedIdentitiesRequest, which may
        // happen before this resumes, so only a newer request supersedes it.
        if (
          !this.#derivedIdentitiesRequest ||
          this.#derivedIdentitiesRequest === request
        ) {
          throw error;
        }
      }
      request =
        this.#derivedIdentitiesRequest === request
          ? undefined
          : this.#derivedIdentitiesRequest;
    }
  }

  #isReady(
    remoteFeatureFlags: FeatureFlags = this.messenger.call(
      'RemoteFeatureFlagController:getState',
    ).remoteFeatureFlags,
  ): boolean {
    return (
      this.#isEnabled(remoteFeatureFlags) &&
      isWalletReady(this.messenger.call('KeyringController:getState'))
    );
  }

  /**
   * Starts migrating the primary Money Account from its SFA address to a new
   * MFA address, or resumes its migration if one is already in flight.
   *
   * Reads the profile's identities fresh from CHOMP and records them, then
   * only proceeds when the wallet is still ready and the Money Account is in
   * no other identity. If the Money Account is migrating, and no other
   * identity is, the migration is resumed, but only towards the MPC Money
   * Account of this wallet, which has to sign the successor's steps. That
   * account is restored first when it is missing, as after a reinstall.
   *
   * Otherwise, the Money Account must be a valid SFA and no identity may be
   * migrating. Asks `MoneyAccountController` to create the MPC Money Account,
   * or returns the one an earlier attempt created. Creating it may run the
   * MPC setup, so afterwards the identities are read and checked again, and
   * the MFA address must not be part of any identity. CHOMP itself rejects
   * linking an MFA address that already has active intents.
   *
   * Then, through `MoneyAccountUpgradeController`, links the MFA address as
   * the successor of the Money Account and upgrades it, which starts the
   * migration on CHOMP and freezes the Money Account until it completes, and
   * registers the intents the Money Account signs for the migration. Both
   * only do the work CHOMP reports missing.
   *
   * Before registering those intents, an active Money Account Plus
   * subscription paid by the Money Account is moved to the MFA address,
   * because CHOMP only accepts the intents of a premium migration once the
   * successor holds the premium eligibility. The MFA address signs a new
   * subscription delegation, which also registers its subscription intent,
   * and becomes the payer of the subscription. If CHOMP still reports the
   * subscription intent of the MFA address missing once the MFA address pays,
   * its subscription delegation is prepared again to register the intent,
   * and if no active Money Account Plus subscription is paid by either
   * address, the migration cannot complete, so this throws.
   *
   * Finally, asks CHOMP to start moving the funds of the Money Account to the
   * MFA address. From then on, the migration can no longer be cancelled.
   * CHOMP refuses while a step is missing, for example while the MFA address
   * is not yet monitored, or when a concurrent request conflicts, so the
   * request is retried once after a short delay. If that fails too, calling
   * this again starts the transfer.
   *
   * Identities are then refetched, so the recorded lifecycle becomes
   * `migrating`, even when any of these steps fails.
   *
   * @throws If a migration or Money Account upgrade is already in flight, the
   * checks fail, the wallet stops being ready part way, or linking the
   * successor, moving the subscription, registering the intents or starting
   * the funds transfer fails.
   */
  async startMigration(): Promise<void> {
    if (this.#isMigrationInFlight) {
      throw new MoneyAccountLifecycleError(
        MoneyAccountLifecycleErrorCode.MigrationInProgress,
        'A Money Account migration is already in progress',
      );
    }

    if (this.#upgradesInFlight.size > 0) {
      throw new MoneyAccountLifecycleError(
        MoneyAccountLifecycleErrorCode.UpgradeInProgress,
        'A Money Account upgrade is in progress',
      );
    }

    this.#isMigrationInFlight = true;
    const generation = this.#generation;
    const startedAt = Date.now();
    this.#log({ type: 'migrationStarted' });
    try {
      await this.#startMigration();
      this.#log(
        { type: 'migrationSucceeded', durationMs: Date.now() - startedAt },
        generation,
      );
      this.#recordAttempt('migration', generation, {
        startedAt,
        outcome: 'succeeded',
        stage: this.#migrationStage,
        error: null,
      });
    } catch (error) {
      const summary = summarizeError(error);
      this.#log(
        {
          type: 'migrationFailed',
          durationMs: Date.now() - startedAt,
          stage: this.#migrationStage,
          error: summary,
        },
        generation,
      );
      this.#recordAttempt('migration', generation, {
        startedAt,
        outcome: 'failed',
        stage: this.#migrationStage,
        error: summary,
      });
      throw error;
    } finally {
      this.#isMigrationInFlight = false;
    }
  }

  /**
   * Clears all recorded lifecycles, address registrations and diagnostics,
   * for example when the wallet is reset, then records in the diagnostics
   * history that the state was cleared. Also discards the derived identities and any
   * identity or registration status request in flight, so nothing from the
   * previous wallet is recorded afterwards, and the next sync fetches
   * identities again. An upgrade in flight stops without refetching
   * identities, and a migration in flight throws before its next step.
   */
  clearState(): void {
    const upgradeWasInFlight = this.#upgradesInFlight.size > 0;
    const migrationWasInFlight = this.#isMigrationInFlight;
    this.#generation += 1;
    this.#upgradesInFlight.clear();
    this.#syncedRemoteFeatureFlags = undefined;
    this.#derivedIdentitiesRequest = undefined;
    this.#isFetchingDerivedIdentities = false;
    this.#derivedIdentities = undefined;
    this.#registrationStatusRequests.clear();
    this.#registrationStatusFailures.clear();

    this.update(() => getDefaultMoneyAccountLifecycleControllerState());
    this.#log({
      type: 'stateCleared',
      upgradeWasInFlight,
      migrationWasInFlight,
    });
  }

  async #startMigration(): Promise<void> {
    this.#migrationGeneration = this.#generation;
    this.#enterMigrationStage('checkIdentities');
    this.#assertReadyToMigrate();

    const moneyAccount = this.messenger.call(
      'MoneyAccountController:getMoneyAccount',
      { type: 'mnemonic' },
    );
    if (!moneyAccount) {
      throw new MoneyAccountLifecycleError(
        MoneyAccountLifecycleErrorCode.NoMoneyAccount,
        'There is no Money Account to migrate',
      );
    }
    const moneyAccountAddress = moneyAccount.address as Hex;

    const { migration } =
      await this.#fetchMigratableIdentities(moneyAccountAddress);
    const successorAddress = migration
      ? await this.#getResumableSuccessor(migration)
      : await this.#createSuccessor(moneyAccountAddress);

    try {
      this.#enterMigrationStage('linkSuccessor');
      await this.messenger.call(
        'MoneyAccountUpgradeController:upgradeSuccessorAccount',
        successorAddress,
        moneyAccountAddress,
      );
      this.#assertReadyToMigrate();
      this.#enterMigrationStage('moveSubscription');
      await this.#moveSubscriptionToSuccessor(
        moneyAccountAddress,
        successorAddress,
      );
      this.#assertReadyToMigrate();
      this.#enterMigrationStage('registerIntents');
      await this.messenger.call(
        'MoneyAccountUpgradeController:registerMigrationIntents',
        moneyAccountAddress,
        successorAddress,
      );
      this.#assertReadyToMigrate();
      this.#enterMigrationStage('startFundsTransfer');
      await this.#startFundsTransfer(moneyAccountAddress);
    } finally {
      if (this.#isCurrent(this.#migrationGeneration)) {
        this.#fetchDerivedIdentities();
        await this.#waitForLatestDerivedIdentities().catch(() => undefined);
      }
    }
  }

  async #startFundsTransfer(moneyAccountAddress: Hex): Promise<void> {
    try {
      await this.messenger.call(
        'ChompApiService:startFundsTransfer',
        moneyAccountAddress,
      );
    } catch (error) {
      if (
        !(error instanceof ChompApiError) ||
        !RETRYABLE_FUNDS_TRANSFER_ERROR_CODES.includes(error.code ?? '')
      ) {
        throw error;
      }
      this.#log(
        { type: 'fundsTransferRetried', error: summarizeError(error) },
        this.#migrationGeneration,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, FUNDS_TRANSFER_RETRY_DELAY_MS),
      );
      this.#assertReadyToMigrate();
      await this.messenger.call(
        'ChompApiService:startFundsTransfer',
        moneyAccountAddress,
      );
    }
  }

  #assertReadyToMigrate(): void {
    if (this.#migrationGeneration !== this.#generation) {
      throw new MoneyAccountLifecycleError(
        MoneyAccountLifecycleErrorCode.StateCleared,
        'Money Account migration was interrupted because the state was cleared',
      );
    }
    if (!this.#isReady()) {
      throw new MoneyAccountLifecycleError(
        MoneyAccountLifecycleErrorCode.MigrationNotAvailable,
        'Money Account migration is not available',
      );
    }
  }

  #enterMigrationStage(stage: MoneyAccountMigrationStage): void {
    this.#migrationStage = stage;
    this.#log(
      { type: 'migrationStageStarted', stage },
      this.#migrationGeneration,
    );
  }

  #isCurrent(generation: number): boolean {
    return generation === this.#generation && this.#isReady();
  }

  async #moveSubscriptionToSuccessor(
    moneyAccountAddress: Hex,
    successorAddress: Hex,
  ): Promise<void> {
    const subscriptions = await this.messenger.call(
      'SubscriptionController:getSubscriptions',
    );
    const subscription = subscriptions.find(
      isActiveMoneyAccountPlusSubscription,
    );
    const cryptoPayment =
      subscription?.paymentMethod.type === PAYMENT_TYPES.byCrypto
        ? subscription.paymentMethod.crypto
        : undefined;
    const payerAddress = cryptoPayment?.payerAddress.toLowerCase();

    if (
      subscription &&
      cryptoPayment &&
      payerAddress === moneyAccountAddress.toLowerCase()
    ) {
      const recurringInterval = subscription.interval;
      const billingCycles =
        await this.#getMoneyAccountPlusBillingCycles(recurringInterval);
      const delegationHash = await this.#prepareSubscriptionDelegation(
        successorAddress,
        recurringInterval,
      );
      await this.messenger.call('SubscriptionController:updatePaymentMethod', {
        paymentType: PAYMENT_TYPES.byCrypto,
        subscriptionId: subscription.id,
        chainId: cryptoPayment.chainId,
        payerAddress: successorAddress,
        tokenSymbol: cryptoPayment.tokenSymbol,
        recurringInterval,
        billingCycles,
        cryptoAuthMethod: CRYPTO_AUTH_METHODS.DELEGATION,
        delegationHash,
      });
      return;
    }

    if (!(await this.#isSubscriptionIntentMissing(moneyAccountAddress))) {
      return;
    }

    if (subscription && payerAddress === successorAddress.toLowerCase()) {
      await this.#prepareSubscriptionDelegation(
        successorAddress,
        subscription.interval,
      );
      return;
    }

    throw new MoneyAccountLifecycleError(
      MoneyAccountLifecycleErrorCode.SubscriptionMissing,
      'The premium migration of the Money Account needs an active Money Account Plus subscription paid in crypto by it or by its successor',
    );
  }

  async #prepareSubscriptionDelegation(
    payerAddress: Hex,
    recurringInterval: RecurringInterval,
  ): Promise<Hex> {
    const { delegationHash } = await this.messenger.call(
      'SubscriptionDelegationService:prepareDelegation',
      {
        product: PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
        recurringInterval,
        payerAddress,
        isTrialRequested: false,
      },
    );
    return delegationHash;
  }

  async #isSubscriptionIntentMissing(
    moneyAccountAddress: Hex,
  ): Promise<boolean> {
    const response = await this.messenger.call(
      'ChompApiService:getDerivedIdentityByAddress',
      moneyAccountAddress,
    );
    return (
      response?.identity.migration?.steps.some(
        ({ step, completed }) =>
          step === 'SUCCESSOR_SUBSCRIPTION_INTENT' && !completed,
      ) ?? false
    );
  }

  async #getMoneyAccountPlusBillingCycles(
    recurringInterval: RecurringInterval,
  ): Promise<number> {
    const pricing = await this.messenger.call(
      'SubscriptionController:getPricing',
    );
    const price = pricing.products
      .find((product) => product.name === PRODUCT_TYPES.MONEY_ACCOUNT_PLUS)
      ?.prices.find((entry) => entry.interval === recurringInterval);
    if (!price) {
      throw new MoneyAccountLifecycleError(
        MoneyAccountLifecycleErrorCode.SubscriptionPriceMissing,
        `Money Account Plus has no '${recurringInterval}' price`,
      );
    }
    return price.minBillingCycles;
  }

  async #fetchMigratableIdentities(moneyAccountAddress: Hex): Promise<{
    identities: DerivedIdentity[];
    migration: DerivedIdentityMigration | null;
  }> {
    this.#fetchDerivedIdentities();
    await this.#waitForLatestDerivedIdentities();
    const identities = this.#derivedIdentities;
    if (!this.#isReady() || !identities) {
      throw new MoneyAccountLifecycleError(
        MoneyAccountLifecycleErrorCode.MigrationNotAvailable,
        'Money Account migration is not available',
      );
    }

    if (countIdentityAddresses(moneyAccountAddress, identities) > 1) {
      throw new MoneyAccountLifecycleError(
        MoneyAccountLifecycleErrorCode.MultipleIdentities,
        'The Money Account belongs to more than one identity',
      );
    }

    const lifecycle = getMoneyAccountLifecycle(moneyAccountAddress, identities);
    const migratingCount = identities.filter(isMigrating).length;
    if (lifecycle.type === 'migrating' && migratingCount === 1) {
      const { migration } = lifecycle.identity;
      if (migration?.from.toLowerCase() !== moneyAccountAddress.toLowerCase()) {
        throw new MoneyAccountLifecycleError(
          MoneyAccountLifecycleErrorCode.MigrationNotResumable,
          'The migration of the Money Account cannot be resumed',
        );
      }
      return { identities, migration };
    }

    if (migratingCount > 0) {
      throw new MoneyAccountLifecycleError(
        MoneyAccountLifecycleErrorCode.IdentityAlreadyMigrating,
        'A Money Account identity is already migrating',
      );
    }

    if (lifecycle.type !== 'sfa') {
      throw new MoneyAccountLifecycleError(
        MoneyAccountLifecycleErrorCode.NotMigratable,
        `The Money Account cannot be migrated while it is '${lifecycle.type}'`,
      );
    }

    return { identities, migration: null };
  }

  async #getResumableSuccessor(
    migration: DerivedIdentityMigration,
  ): Promise<Hex> {
    this.#enterMigrationStage('restoreSuccessor');
    const mpcMoneyAccount = await this.messenger.call(
      'MoneyAccountController:createMoneyAccount',
      { type: 'mpc' },
    );
    this.#assertReadyToMigrate();
    if (mpcMoneyAccount.address.toLowerCase() !== migration.to.toLowerCase()) {
      throw new MoneyAccountLifecycleError(
        MoneyAccountLifecycleErrorCode.SuccessorMismatch,
        'The Money Account is migrating to an address that is not the MPC Money Account of this wallet',
      );
    }
    return mpcMoneyAccount.address as Hex;
  }

  async #createSuccessor(moneyAccountAddress: Hex): Promise<Hex> {
    this.#enterMigrationStage('createSuccessor');
    const mpcMoneyAccount = await this.messenger.call(
      'MoneyAccountController:createMoneyAccount',
      { type: 'mpc' },
    );
    const mfaAddress = mpcMoneyAccount.address as Hex;
    const { identities, migration } =
      await this.#fetchMigratableIdentities(moneyAccountAddress);
    if (migration) {
      throw new MoneyAccountLifecycleError(
        MoneyAccountLifecycleErrorCode.IdentityAlreadyMigrating,
        'A Money Account identity is already migrating',
      );
    }
    this.#assertFreshForChomp(mfaAddress, identities);
    this.#assertReadyToMigrate();
    return mfaAddress;
  }

  #assertFreshForChomp(mfaAddress: Hex, identities: DerivedIdentity[]): void {
    if (countIdentityAddresses(mfaAddress, identities) > 0) {
      throw new MoneyAccountLifecycleError(
        MoneyAccountLifecycleErrorCode.SuccessorAlreadyInIdentity,
        'The MPC Money Account is already part of a Money Account identity',
      );
    }
  }

  #sync(): void {
    try {
      const { remoteFeatureFlags } = this.messenger.call(
        'RemoteFeatureFlagController:getState',
      );

      if (!this.#isReady(remoteFeatureFlags)) {
        this.#syncedRemoteFeatureFlags = undefined;
        this.#derivedIdentitiesRequest = undefined;
        this.#isFetchingDerivedIdentities = false;
        this.#derivedIdentities = undefined;
        return;
      }

      if (
        this.#syncedRemoteFeatureFlags &&
        deepEqual(this.#syncedRemoteFeatureFlags, remoteFeatureFlags)
      ) {
        return;
      }

      this.#syncedRemoteFeatureFlags = remoteFeatureFlags;
      this.#fetchDerivedIdentities();
    } catch (error) {
      this.#reportUnexpectedError('sync', error);
    }
  }

  #fetchDerivedIdentities(): void {
    const request = this.messenger.call('ChompApiService:getDerivedIdentities');
    this.#derivedIdentitiesRequest = request;
    this.#isFetchingDerivedIdentities = true;

    request
      .then(({ identities }) => {
        if (this.#derivedIdentitiesRequest === request) {
          this.#isFetchingDerivedIdentities = false;
          this.#derivedIdentities = identities;
          this.#recordIdentitiesFetchSuccess(identities);
          this.#updateMoneyAccountLifecycle({ isRehydrating: true });
        }
      })
      .catch((error: unknown) => {
        if (this.#derivedIdentitiesRequest === request) {
          this.#syncedRemoteFeatureFlags = undefined;
          this.#derivedIdentitiesRequest = undefined;
          this.#isFetchingDerivedIdentities = false;
          this.#derivedIdentities = undefined;
          this.#recordIdentitiesFetchFailure(error);
        }
        this.#reportError(error);
      });
  }

  #recordIdentitiesFetchSuccess(identities: DerivedIdentity[]): void {
    const { succeedingSince, identityCount } =
      this.state.diagnostics.identitiesFetch;
    if (succeedingSince !== null && identityCount === identities.length) {
      return;
    }

    this.update((state) => {
      const { identitiesFetch } = state.diagnostics;
      identitiesFetch.succeedingSince ??= Date.now();
      identitiesFetch.failingSince = null;
      identitiesFetch.identityCount = identities.length;
    });
    this.#log({
      type: 'identitiesFetchSucceeding',
      identityCount: identities.length,
      statuses: identities.map(({ status }) => status),
    });
  }

  #recordIdentitiesFetchFailure(error: unknown): void {
    const summary = summarizeError(error);
    const { failingSince, lastFailure } =
      this.state.diagnostics.identitiesFetch;
    if (failingSince !== null && deepEqual(lastFailure?.error, summary)) {
      return;
    }

    this.update((state) => {
      const { identitiesFetch } = state.diagnostics;
      const now = Date.now();
      identitiesFetch.failingSince ??= now;
      identitiesFetch.succeedingSince = null;
      identitiesFetch.lastFailure = { at: now, error: summary };
    });
    this.#log({ type: 'identitiesFetchFailing', error: summary });
  }

  #updateMoneyAccountLifecycle({
    isRehydrating,
  }: {
    isRehydrating: boolean;
  }): void {
    if (!this.#derivedIdentities) {
      return;
    }

    try {
      const moneyAccount = this.messenger.call(
        'MoneyAccountController:getMoneyAccount',
        { type: 'mnemonic' },
      );
      if (!moneyAccount) {
        return;
      }

      const lifecycle = getMoneyAccountLifecycle(
        moneyAccount.address,
        this.#derivedIdentities,
      );
      const moneyAccountKey = moneyAccount.address.toLowerCase();
      const previousLifecycle = this.state.moneyAccounts[moneyAccountKey];
      const hasChanged = !deepEqual(previousLifecycle, lifecycle);
      if (hasChanged) {
        this.update((state) => {
          state.moneyAccounts[moneyAccountKey] = lifecycle;
        });
        this.#log(buildLifecycleChangedEvent(previousLifecycle, lifecycle));
      }

      if (lifecycle.type === 'mfa') {
        this.#setMpcMoneyAccountAsDefault(lifecycle.identity.currentAddress);
      }

      if (!hasChanged && !isRehydrating) {
        return;
      }

      this.#fetchRegistrationStatus(
        moneyAccount.address as Hex,
        'moneyAccount',
      );
      if (lifecycle.type === 'mfa') {
        this.#fetchRegistrationStatus(
          lifecycle.identity.currentAddress,
          'mfaAccount',
        );
      }
    } catch (error) {
      this.#reportUnexpectedError('lifecycleUpdate', error);
    }
  }

  #setMpcMoneyAccountAsDefault(mpcAddress: string): void {
    const mpcMoneyAccount = this.messenger.call(
      'MoneyAccountController:getMoneyAccount',
      { type: 'mpc' },
    );
    if (
      mpcMoneyAccount?.address.toLowerCase() !== mpcAddress.toLowerCase() ||
      this.messenger.call('MoneyAccountController:getMoneyAccount')?.id ===
        mpcMoneyAccount.id
    ) {
      return;
    }

    this.messenger.call(
      'MoneyAccountController:setDefaultMoneyAccount',
      mpcMoneyAccount.id,
    );
    this.#log({ type: 'mpcMoneyAccountSetAsDefault' });
  }

  #fetchRegistrationStatus(
    address: Hex,
    role: MoneyAccountRegistrationRole,
  ): void {
    const addressKey = address.toLowerCase();
    const request = this.messenger.call(
      'MoneyAccountUpgradeController:getRegistrationStatus',
      address,
    );
    this.#registrationStatusRequests.set(addressKey, request);

    request
      .then(({ isRegistered }) => {
        if (this.#registrationStatusRequests.get(addressKey) !== request) {
          return;
        }
        this.#registrationStatusFailures.delete(role);
        if (
          this.state.addressRegistrations[addressKey]?.isRegistered ===
          isRegistered
        ) {
          return;
        }
        this.update((state) => {
          state.addressRegistrations[addressKey] = { isRegistered };
        });
        this.#log({ type: 'registrationStatusChanged', role, isRegistered });
      })
      .catch((error: unknown) => {
        const summary = summarizeError(error);
        if (
          this.#registrationStatusRequests.get(addressKey) === request &&
          !deepEqual(this.#registrationStatusFailures.get(role), summary)
        ) {
          this.#registrationStatusFailures.set(role, summary);
          this.#log({
            type: 'registrationStatusFetchFailed',
            role,
            error: summary,
          });
        }
        this.#reportError(error);
      })
      .finally(() => {
        if (this.#registrationStatusRequests.get(addressKey) === request) {
          this.#registrationStatusRequests.delete(addressKey);
        }
      });
  }

  /**
   * Passes a log entry to the `log` hook and, unless it would crowd the
   * history, records it in the diagnostics.
   *
   * @param event - The log event.
   * @param generation - The generation the event belongs to. Nothing is
   * recorded for a generation that `clearState` has moved on from.
   */
  #log(
    event: MoneyAccountLifecycleLogEvent,
    generation: number = this.#generation,
  ): void {
    const entry: MoneyAccountLifecycleLogEntry = {
      ...event,
      timestamp: Date.now(),
    };
    log(entry.type, entry);
    try {
      this.#logHook?.(entry);
    } catch (error) {
      this.#reportError(error);
    }

    if (generation !== this.#generation || !isKeptInHistory(event)) {
      return;
    }
    this.update((state) => {
      const { history } = state.diagnostics;
      history.push(entry);
      if (history.length > MAX_DIAGNOSTICS_HISTORY_LENGTH) {
        history.splice(0, history.length - MAX_DIAGNOSTICS_HISTORY_LENGTH);
      }
    });
  }

  #recordAttempt<Operation extends MoneyAccountOperation>(
    operation: Operation,
    generation: number,
    attempt: Omit<
      NonNullable<MoneyAccountLifecycleDiagnostics[Operation]['lastAttempt']>,
      'finishedAt'
    >,
  ): void {
    if (generation !== this.#generation) {
      return;
    }
    const record = { ...attempt, finishedAt: Date.now() };
    this.update((state) => {
      const diagnostics: MoneyAccountOperationDiagnostics<unknown> =
        state.diagnostics[operation];
      diagnostics.lastAttempt = record;
      if (record.outcome === 'failed') {
        diagnostics.lastFailure = record;
        diagnostics.consecutiveFailures += 1;
      } else if (record.outcome === 'succeeded') {
        diagnostics.consecutiveFailures = 0;
      }
    });
  }

  #reportUnexpectedError(
    operation: 'sync' | 'lifecycleUpdate',
    error: unknown,
  ): void {
    this.#log({
      type: 'unexpectedError',
      operation,
      error: summarizeError(error),
    });
    this.#reportError(error);
  }

  #reportError(error: unknown): void {
    this.messenger.captureException?.(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

function countIdentityAddresses(
  address: string,
  identities: DerivedIdentity[],
): number {
  const normalizedAddress = address.toLowerCase();
  return identities
    .flatMap(({ currentAddress, previousAddresses }) => [
      currentAddress,
      ...previousAddresses,
    ])
    .filter(
      (identityAddress) => identityAddress.toLowerCase() === normalizedAddress,
    ).length;
}

function isWalletReady({
  isUnlocked,
  keyrings,
}: KeyringControllerState): boolean {
  return (
    isUnlocked && keyrings.some((keyring) => keyring.type === KeyringTypes.hd)
  );
}

function isActiveMoneyAccountPlusSubscription(
  subscription: Subscription,
): boolean {
  return (
    ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status) &&
    subscription.products.some(
      (product) => product.name === PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
    )
  );
}
