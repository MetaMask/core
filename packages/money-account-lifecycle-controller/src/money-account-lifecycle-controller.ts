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
import { getErrorMessage } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import deepEqual from 'fast-deep-equal';

import {
  BINDING_MIGRATION_PHASES,
  BindingMigrationIncompleteError,
  buildBindingMigrationContext,
  getRunnableBindingMigrationPhases,
  sanitizeBindingMigrationResult,
  sanitizeBindingMigratorStatus,
} from './binding-migration.js';
import type {
  BindingMigrationContext,
  BindingMigrationPhase,
  BindingMigrationResult,
  BindingMigrationsState,
  BindingMigrator,
  BindingMigratorState,
  IncompleteBindingMigration,
} from './binding-migration.js';
import {
  getMoneyAccountLifecycle,
  isMigrating,
} from './get-money-account-lifecycle.js';
import type { MoneyAccountLifecycle } from './get-money-account-lifecycle.js';
import type { MoneyAccountLifecycleControllerMethodActions } from './money-account-lifecycle-controller-method-action-types.js';

const CONTROLLER_NAME = 'MoneyAccountLifecycleController';

const FUNDS_TRANSFER_RETRY_DELAY_MS = 2000;

const DEFAULT_BINDING_MIGRATOR_TIMEOUT_MS = 30_000;

const MAX_TIMEOUT_MS = 2 ** 31 - 1;

const TIMED_OUT = Symbol('timed out');

const MIGRATION_DONE_TIMEOUT_MS = 60_000;

const MIGRATION_DONE_FIRST_CHECK_DELAY_MS = 2000;

const MIGRATION_DONE_MAX_CHECK_DELAY_MS = 16_000;

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
  bindingMigrations: BindingMigrationsState | null;
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
  bindingMigrations: {
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    persist: false,
    usedInUi: true,
  },
} satisfies StateMetadata<MoneyAccountLifecycleControllerState>;

export function getDefaultMoneyAccountLifecycleControllerState(): MoneyAccountLifecycleControllerState {
  return {
    moneyAccounts: {},
    addressRegistrations: {},
    bindingMigrations: null,
  };
}

const MESSENGER_EXPOSED_METHODS = [
  'init',
  'getMoneyAccountIdentity',
  'refresh',
  'upgradeMoneyAccount',
  'startMigration',
  'clearState',
  'registerBindingMigrator',
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
};

export class MoneyAccountLifecycleController extends BaseController<
  typeof CONTROLLER_NAME,
  MoneyAccountLifecycleControllerState,
  MoneyAccountLifecycleControllerMessenger
> {
  readonly #isEnabled: MoneyAccountLifecycleControllerHooks['isEnabled'];

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

  #migrationInFlight?: { promise: Promise<void>; generation: number };

  readonly #bindingMigrators = new Map<string, BindingMigrator>();

  readonly #bindingMigrationResults = new Map<
    string,
    Pick<BindingMigratorState, 'lastResult' | 'lastError'> & {
      migrationId: Hex;
    }
  >();

  readonly #reconcilesInFlight = new Map<string, Promise<unknown>>();

  /**
   * Bumped by `clearState`. Upgrades and migrations capture it when they
   * start and stop once it has moved on, so nothing started before the state
   * was cleared carries on or records anything afterwards.
   */
  #generation = 0;

  #migrationGeneration = 0;

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
    if (this.#migrationInFlight || !this.#isReady()) {
      return;
    }

    const moneyAccount = this.messenger.call(
      'MoneyAccountController:getMoneyAccount',
      { type: 'mnemonic' },
    );
    if (!moneyAccount) {
      throw new Error('No Money Account to upgrade');
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
    await this.#waitForLatestDerivedIdentities();
    if (!this.#isCurrent(generation)) {
      return;
    }

    const lifecycle =
      this.state.moneyAccounts[moneyAccountAddress.toLowerCase()];
    if (lifecycle?.type !== 'sfa' && lifecycle?.type !== 'notInIdentity') {
      return;
    }

    await this.messenger.call(
      'MoneyAccountUpgradeController:upgradeAccount',
      moneyAccountAddress,
    );
    if (!this.#isCurrent(generation)) {
      return;
    }

    this.#fetchDerivedIdentities();
    await this.#waitForLatestDerivedIdentities().catch(() => undefined);
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
   * MFA address, or resumes its migration if one is already in flight. Once
   * it has migrated, only runs the `afterDone` binding migrators, which
   * requires the MPC Money Account of this wallet to be the identity's
   * current address.
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
   * Registered binding migrators run once the successor is linked
   * (`afterLink`) and before the funds transfer starts
   * (`beforeFundsTransfer`), until CHOMP has started the funds transfer:
   * from then on those phases have passed, and their migrators are never run
   * again, even when the migration resumes. When `afterDone` migrators are
   * registered, this then waits up to a minute for CHOMP to finish moving the
   * funds and runs them. If the funds have not moved by then, or their
   * transfer failed, this resolves without running them; calling this again
   * once the migration has finished runs them.
   *
   * Only one migration runs at a time. A call made while one is in flight
   * joins it instead of starting another: it gets the same promise, so it
   * resolves or rejects with that migration's outcome. A call made after it
   * settles starts a new run. After `clearState`, a call waits for the
   * migration that was in flight to stop, without taking on its outcome, and
   * then starts a new run.
   *
   * @returns A promise that resolves once the migration run, started by this
   * call or joined by it, completes.
   * @throws If a Money Account upgrade is in flight, the checks fail, the
   * wallet stops being ready part way, or linking the successor, moving the
   * subscription, registering the intents or starting the funds transfer
   * fails. A `BindingMigrationIncompleteError` once every binding migrator of
   * a phase has run, if any of them is pending or blocked.
   */
  async startMigration(): Promise<void> {
    const inFlight = this.#migrationInFlight;
    if (inFlight?.generation === this.#generation) {
      return inFlight.promise;
    }
    if (inFlight) {
      await inFlight.promise.catch(() => undefined);
      return this.startMigration();
    }

    if (this.#upgradesInFlight.size > 0) {
      throw new Error('A Money Account upgrade is in progress');
    }

    const promise = this.#startMigration().finally(() => {
      this.#migrationInFlight = undefined;
    });
    this.#migrationInFlight = { promise, generation: this.#generation };
    return promise;
  }

  /**
   * Clears all recorded lifecycles and address registrations, for example
   * when the wallet is reset. Also discards the derived identities and any
   * identity or registration status request in flight, so nothing from the
   * previous wallet is recorded afterwards, and the next sync fetches
   * identities again. An upgrade in flight stops without refetching
   * identities, and a migration in flight throws before its next step.
   */
  clearState(): void {
    this.#generation += 1;
    this.#upgradesInFlight.clear();
    this.#syncedRemoteFeatureFlags = undefined;
    this.#derivedIdentitiesRequest = undefined;
    this.#isFetchingDerivedIdentities = false;
    this.#derivedIdentities = undefined;
    this.#registrationStatusRequests.clear();
    this.#bindingMigrationResults.clear();

    this.update(() => getDefaultMoneyAccountLifecycleControllerState());
  }

  /**
   * Registers a migrator that moves an integration bound to the Money Account
   * address, such as a deposit destination, to the MPC Money Account when the
   * Money Account migrates. `startMigration` runs it in its phase, in
   * registration order. A migrator is never run once its phase has passed,
   * including when it is registered after that: owners must roll out a
   * migrator before the migrations it has to cover reach its phase.
   *
   * While the Money Account is migrating or migrated, and this wallet can
   * drive that migration, its status from `getStatus` is recorded in
   * `bindingMigrations`, now, after each identity fetch, and after each of
   * its runs. Register migrators when the client starts, before it can call
   * `startMigration`.
   *
   * @param migrator - The binding migrator. It holds functions, so it can
   * only be passed within the same process.
   * @throws If the migrator is invalid, or one with the same id is already
   * registered.
   */
  registerBindingMigrator(migrator: BindingMigrator): void {
    assertValidBindingMigrator(migrator);
    if (this.#bindingMigrators.has(migrator.id)) {
      throw new Error(
        `A binding migrator with the id '${migrator.id}' is already registered`,
      );
    }
    this.#bindingMigrators.set(migrator.id, migrator);

    try {
      const moneyAccount = this.messenger.call(
        'MoneyAccountController:getMoneyAccount',
        { type: 'mnemonic' },
      );
      if (moneyAccount && this.#isReady()) {
        this.#recordBindingMigratorStatuses(moneyAccount.address);
      }
    } catch (error) {
      this.#reportError(error);
    }
  }

  #recordBindingMigratorStatuses(moneyAccountAddress: string): void {
    const context =
      this.#bindingMigrators.size > 0
        ? this.#getBindingMigrationContext(moneyAccountAddress)
        : undefined;
    this.#setBindingMigrations(
      context ? this.#buildBindingMigrations(context) : null,
    );
  }

  #buildBindingMigrations(
    context: BindingMigrationContext,
  ): BindingMigrationsState {
    const migrators: BindingMigrationsState['migrators'] = {};
    for (const migrator of this.#bindingMigrators.values()) {
      const previous = this.#bindingMigrationResults.get(migrator.id);
      const isSameMigration = previous?.migrationId === context.migrationId;
      migrators[migrator.id] = {
        phase: migrator.phase,
        ...this.#getBindingMigratorStatus(migrator, context),
        lastResult: isSameMigration ? previous.lastResult : null,
        lastError: isSameMigration ? previous.lastError : null,
      };
    }
    return {
      migrationId: context.migrationId,
      previousAddress: context.previousAddress,
      currentAddress: context.currentAddress,
      migrators,
    };
  }

  #getBindingMigratorStatus(
    migrator: BindingMigrator,
    context: BindingMigrationContext,
  ): Pick<BindingMigratorState, 'status' | 'details'> {
    try {
      const status = sanitizeBindingMigratorStatus(migrator.getStatus(context));
      if (status) {
        return status;
      }
      this.#reportError(
        new Error(
          `Binding migrator '${migrator.id}' returned an invalid status`,
        ),
      );
    } catch (error) {
      this.#reportError(error);
    }
    return { status: 'unknown', details: null };
  }

  #setBindingMigrations(
    bindingMigrations: MoneyAccountLifecycleControllerState['bindingMigrations'],
  ): void {
    if (deepEqual(this.state.bindingMigrations, bindingMigrations)) {
      return;
    }
    this.update((state) => {
      state.bindingMigrations = bindingMigrations;
    });
  }

  /**
   * The context of the migration this wallet can drive, if any. A migrating
   * Money Account can be resumed when its MPC Money Account is missing, as
   * `startMigration` restores it, but not towards another wallet's MPC Money
   * Account. The `afterDone` migrators of a migrated Money Account only run
   * when this wallet holds the MPC Money Account it migrated to.
   *
   * @param moneyAccountAddress - The address of the Money Account.
   * @returns The context, or `undefined` when there is none.
   */
  #getBindingMigrationContext(
    moneyAccountAddress: string,
  ): BindingMigrationContext | undefined {
    const lifecycle =
      this.state.moneyAccounts[moneyAccountAddress.toLowerCase()];
    if (lifecycle?.type !== 'migrating' && lifecycle?.type !== 'mfa') {
      return undefined;
    }

    const mpcAddress = this.messenger
      .call('MoneyAccountController:getMoneyAccount', { type: 'mpc' })
      ?.address.toLowerCase();
    if (lifecycle.type === 'migrating') {
      const { migration } = lifecycle.identity;
      const migratingCount =
        this.#derivedIdentities?.filter(isMigrating).length ?? 0;
      if (
        !migration ||
        migratingCount > 1 ||
        migration.from.toLowerCase() !== moneyAccountAddress.toLowerCase() ||
        (mpcAddress !== undefined && mpcAddress !== migration.to.toLowerCase())
      ) {
        return undefined;
      }
      return buildBindingMigrationContext(
        migration.from,
        migration.to,
        'MIGRATING',
      );
    }
    if (mpcAddress !== lifecycle.identity.currentAddress.toLowerCase()) {
      return undefined;
    }
    return buildBindingMigrationContext(
      moneyAccountAddress,
      lifecycle.identity.currentAddress,
      'DONE',
    );
  }

  async #startMigration(): Promise<void> {
    this.#migrationGeneration = this.#generation;
    this.#assertReadyToMigrate();

    const moneyAccount = this.messenger.call(
      'MoneyAccountController:getMoneyAccount',
      { type: 'mnemonic' },
    );
    if (!moneyAccount) {
      throw new Error('There is no Money Account to migrate');
    }
    const moneyAccountAddress = moneyAccount.address as Hex;

    const { lifecycle, migration } =
      await this.#fetchMigratableIdentities(moneyAccountAddress);
    if (lifecycle.type === 'mfa') {
      await this.#runAfterDoneMigrators(
        moneyAccountAddress,
        lifecycle.identity,
      );
      return;
    }

    const successorAddress = migration
      ? await this.#getResumableSuccessor(moneyAccountAddress, migration)
      : await this.#createSuccessor(moneyAccountAddress);
    const context = buildBindingMigrationContext(
      moneyAccountAddress,
      successorAddress,
      'MIGRATING',
    );
    const runnablePhases = getRunnableBindingMigrationPhases(lifecycle);

    try {
      await this.messenger.call(
        'MoneyAccountUpgradeController:upgradeSuccessorAccount',
        successorAddress,
        moneyAccountAddress,
      );
      await this.#runBindingMigrationPhase(
        'afterLink',
        context,
        runnablePhases,
      );
      // TODO: move to a `money-account-plus-payer` binding migrator in
      // @metamask/subscription-controller.
      await this.#moveSubscriptionToSuccessor(
        moneyAccountAddress,
        successorAddress,
      );
      this.#assertReadyToMigrate();
      await this.messenger.call(
        'MoneyAccountUpgradeController:registerMigrationIntents',
        moneyAccountAddress,
        successorAddress,
      );
      await this.#runBindingMigrationPhase(
        'beforeFundsTransfer',
        context,
        runnablePhases,
      );
      await this.#startFundsTransfer(moneyAccountAddress);
    } finally {
      if (this.#isCurrent(this.#migrationGeneration)) {
        this.#fetchDerivedIdentities();
        await this.#waitForLatestDerivedIdentities().catch(() => undefined);
      }
    }

    if (!this.#hasBindingMigrators('afterDone')) {
      return;
    }
    const migratedIdentity =
      await this.#waitForMigrationDone(moneyAccountAddress);
    if (!migratedIdentity) {
      return;
    }

    this.#assertReadyToMigrate();
    this.#fetchDerivedIdentities();
    await this.#waitForLatestDerivedIdentities().catch(() => undefined);
    await this.#runAfterDoneMigrators(moneyAccountAddress, migratedIdentity);
  }

  /**
   * Polls CHOMP until the identity of the Money Account is `DONE`. Counts the
   * time it has waited rather than reading the clock, so a clock change
   * cannot extend the wait.
   *
   * @param moneyAccountAddress - The address of the Money Account.
   * @returns The identity once it is `DONE`, or `undefined` when it is not
   * `DONE` within the time limit or its funds transfer failed.
   */
  async #waitForMigrationDone(
    moneyAccountAddress: Hex,
  ): Promise<DerivedIdentity | undefined> {
    let waited = 0;
    let delay = MIGRATION_DONE_FIRST_CHECK_DELAY_MS;
    while (waited < MIGRATION_DONE_TIMEOUT_MS) {
      const wait = Math.min(delay, MIGRATION_DONE_TIMEOUT_MS - waited);
      await sleep(wait);
      waited += wait;
      this.#assertReadyToMigrate();
      try {
        const response = await this.messenger.call(
          'ChompApiService:getDerivedIdentityByAddress',
          moneyAccountAddress,
        );
        if (response?.identity.status === 'DONE') {
          return response.identity;
        }
        const migration = response?.identity.migration;
        if (
          migration?.transfer?.status === 'FAILED' ||
          migration?.premiumTransfer?.status === 'FAILED'
        ) {
          return undefined;
        }
      } catch (error) {
        this.#reportError(error);
      }
      delay = Math.min(delay * 2, MIGRATION_DONE_MAX_CHECK_DELAY_MS);
    }
    return undefined;
  }

  async #runAfterDoneMigrators(
    moneyAccountAddress: Hex,
    identity: DerivedIdentity,
  ): Promise<void> {
    if (!this.#hasBindingMigrators('afterDone')) {
      return;
    }

    const mpcMoneyAccount = this.messenger.call(
      'MoneyAccountController:getMoneyAccount',
      { type: 'mpc' },
    );
    if (
      mpcMoneyAccount?.address.toLowerCase() !==
      identity.currentAddress.toLowerCase()
    ) {
      throw new Error(
        `Money Account ${moneyAccountAddress} has migrated to ${identity.currentAddress}, which is not the MPC Money Account of this wallet`,
      );
    }

    await this.#runBindingMigrationPhase(
      'afterDone',
      buildBindingMigrationContext(
        moneyAccountAddress,
        identity.currentAddress,
        'DONE',
      ),
    );
  }

  #hasBindingMigrators(phase: BindingMigrationPhase): boolean {
    return [...this.#bindingMigrators.values()].some(
      (migrator) => migrator.phase === phase,
    );
  }

  async #runBindingMigrationPhase(
    phase: BindingMigrationPhase,
    context: BindingMigrationContext,
    runnablePhases: readonly BindingMigrationPhase[] = BINDING_MIGRATION_PHASES,
  ): Promise<void> {
    this.#assertReadyToMigrate();
    if (!runnablePhases.includes(phase)) {
      return;
    }

    const migrators = [...this.#bindingMigrators.values()].filter(
      (migrator) => migrator.phase === phase,
    );
    const incomplete: IncompleteBindingMigration[] = [];
    for (const migrator of migrators) {
      const { result, error } = await this.#reconcileBindingMigrator(
        migrator,
        context,
      );
      this.#assertReadyToMigrate();

      this.#bindingMigrationResults.set(migrator.id, {
        migrationId: context.migrationId,
        lastResult: result,
        lastError: error ?? null,
      });
      this.#setBindingMigrations(this.#buildBindingMigrations(context));

      if (result.status === 'pending' || result.status === 'blocked') {
        incomplete.push({ migratorId: migrator.id, result });
      }
    }

    if (incomplete.length > 0) {
      throw new BindingMigrationIncompleteError(phase, incomplete);
    }
  }

  async #reconcileBindingMigrator(
    migrator: BindingMigrator,
    context: BindingMigrationContext,
  ): Promise<{ result: BindingMigrationResult; error?: string }> {
    const timeoutMs = migrator.timeoutMs ?? DEFAULT_BINDING_MIGRATOR_TIMEOUT_MS;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        this.#reconcile(migrator, context),
        new Promise<typeof TIMED_OUT>((resolve) => {
          timeoutId = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
        }),
      ]);
      if (outcome === TIMED_OUT) {
        const reason = `Timed out after ${timeoutMs} ms`;
        this.#reportError(
          new Error(
            `Binding migrator '${migrator.id}' timed out after ${timeoutMs} ms`,
          ),
        );
        return { result: { status: 'pending', reason }, error: reason };
      }
      const result = sanitizeBindingMigrationResult(outcome);
      if (!result) {
        const reason = 'Invalid result';
        this.#reportError(
          new Error(
            `Binding migrator '${migrator.id}' returned an invalid result`,
          ),
        );
        return { result: { status: 'pending', reason }, error: reason };
      }
      if (result.status === 'blocked') {
        this.#reportError(
          new Error(
            `Binding migrator '${migrator.id}' is blocked: ${result.reason}`,
          ),
        );
      }
      return { result };
    } catch (error) {
      this.#reportError(error);
      const message = getSafeErrorMessage(error);
      return { result: { status: 'pending', reason: message }, error: message };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Calls `reconcile`, unless an earlier call for the same migration is still
   * running, for example after it timed out, in which case this waits for
   * that call rather than overlapping it.
   *
   * @param migrator - The binding migrator.
   * @param context - The migration context.
   * @returns What `reconcile` resolved with.
   */
  async #reconcile(
    migrator: BindingMigrator,
    context: BindingMigrationContext,
  ): Promise<unknown> {
    const key = `${migrator.id}:${context.migrationId}`;
    const inFlight = this.#reconcilesInFlight.get(key);
    if (inFlight) {
      return inFlight;
    }

    const reconciling = (async (): Promise<unknown> =>
      migrator.reconcile(context))();
    this.#reconcilesInFlight.set(key, reconciling);
    const forget = (): void => {
      this.#reconcilesInFlight.delete(key);
    };
    reconciling.finally(forget).catch(() => undefined);
    return reconciling;
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
      await sleep(FUNDS_TRANSFER_RETRY_DELAY_MS);
      this.#assertReadyToMigrate();
      await this.messenger.call(
        'ChompApiService:startFundsTransfer',
        moneyAccountAddress,
      );
    }
  }

  #assertReadyToMigrate(): void {
    if (this.#migrationGeneration !== this.#generation) {
      throw new Error(
        'Money Account migration was interrupted because the state was cleared',
      );
    }
    if (!this.#isReady()) {
      throw new Error('Money Account migration is not available');
    }
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

    throw new Error(
      `The premium migration of Money Account ${moneyAccountAddress} needs an active Money Account Plus subscription paid in crypto by it or by ${successorAddress}`,
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
      throw new Error(`Money Account Plus has no '${recurringInterval}' price`);
    }
    return price.minBillingCycles;
  }

  async #fetchMigratableIdentities(moneyAccountAddress: Hex): Promise<{
    identities: DerivedIdentity[];
    lifecycle: MoneyAccountLifecycle;
    migration: DerivedIdentityMigration | null;
  }> {
    this.#fetchDerivedIdentities();
    await this.#waitForLatestDerivedIdentities();
    const identities = this.#derivedIdentities;
    if (!this.#isReady() || !identities) {
      throw new Error('Money Account migration is not available');
    }

    if (countIdentityAddresses(moneyAccountAddress, identities) > 1) {
      throw new Error(
        `Money Account ${moneyAccountAddress} belongs to more than one identity`,
      );
    }

    const lifecycle = getMoneyAccountLifecycle(moneyAccountAddress, identities);
    if (lifecycle.type === 'mfa') {
      return { identities, lifecycle, migration: null };
    }

    const migratingCount = identities.filter(isMigrating).length;
    if (lifecycle.type === 'migrating' && migratingCount === 1) {
      const { migration } = lifecycle.identity;
      if (migration?.from.toLowerCase() !== moneyAccountAddress.toLowerCase()) {
        throw new Error(
          `The migration of Money Account ${moneyAccountAddress} cannot be resumed`,
        );
      }
      return { identities, lifecycle, migration };
    }

    if (migratingCount > 0) {
      throw new Error('A Money Account identity is already migrating');
    }

    if (lifecycle.type !== 'sfa') {
      throw new Error(
        `Money Account ${moneyAccountAddress} cannot be migrated while it is '${lifecycle.type}'`,
      );
    }

    return { identities, lifecycle, migration: null };
  }

  async #getResumableSuccessor(
    moneyAccountAddress: Hex,
    migration: DerivedIdentityMigration,
  ): Promise<Hex> {
    const mpcMoneyAccount = await this.messenger.call(
      'MoneyAccountController:createMoneyAccount',
      { type: 'mpc' },
    );
    this.#assertReadyToMigrate();
    if (mpcMoneyAccount.address.toLowerCase() !== migration.to.toLowerCase()) {
      throw new Error(
        `Money Account ${moneyAccountAddress} is migrating to ${migration.to}, which is not the MPC Money Account of this wallet`,
      );
    }
    return mpcMoneyAccount.address as Hex;
  }

  async #createSuccessor(moneyAccountAddress: Hex): Promise<Hex> {
    const mpcMoneyAccount = await this.messenger.call(
      'MoneyAccountController:createMoneyAccount',
      { type: 'mpc' },
    );
    const mfaAddress = mpcMoneyAccount.address as Hex;
    const { identities, lifecycle, migration } =
      await this.#fetchMigratableIdentities(moneyAccountAddress);
    if (migration) {
      throw new Error('A Money Account identity is already migrating');
    }
    if (lifecycle.type !== 'sfa') {
      throw new Error(
        `Money Account ${moneyAccountAddress} cannot be migrated while it is '${lifecycle.type}'`,
      );
    }
    this.#assertFreshForChomp(mfaAddress, identities);
    this.#assertReadyToMigrate();
    return mfaAddress;
  }

  #assertFreshForChomp(mfaAddress: Hex, identities: DerivedIdentity[]): void {
    if (countIdentityAddresses(mfaAddress, identities) > 0) {
      throw new Error(
        `MFA account ${mfaAddress} is already part of a Money Account identity`,
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
        this.#bindingMigrationResults.clear();
        this.#setBindingMigrations(null);
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
      this.#reportError(error);
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
          this.#updateMoneyAccountLifecycle({ isRehydrating: true });
        }
      })
      .catch((error: unknown) => {
        if (this.#derivedIdentitiesRequest === request) {
          this.#syncedRemoteFeatureFlags = undefined;
          this.#derivedIdentitiesRequest = undefined;
          this.#isFetchingDerivedIdentities = false;
          this.#derivedIdentities = undefined;
        }
        this.#reportError(error);
      });
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
      const hasChanged = !deepEqual(
        this.state.moneyAccounts[moneyAccountKey],
        lifecycle,
      );
      if (hasChanged) {
        this.update((state) => {
          state.moneyAccounts[moneyAccountKey] = lifecycle;
        });
      }

      if (lifecycle.type === 'mfa') {
        this.#setMpcMoneyAccountAsDefault(lifecycle.identity.currentAddress);
      }

      this.#recordBindingMigratorStatuses(moneyAccount.address);

      if (!hasChanged && !isRehydrating) {
        return;
      }

      this.#fetchRegistrationStatus(moneyAccount.address as Hex).catch(
        (error: unknown) => this.#reportError(error),
      );
      if (lifecycle.type === 'mfa') {
        this.#fetchRegistrationStatus(lifecycle.identity.currentAddress).catch(
          (error: unknown) => this.#reportError(error),
        );
      }
    } catch (error) {
      this.#reportError(error);
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
  }

  async #fetchRegistrationStatus(address: Hex): Promise<void> {
    const addressKey = address.toLowerCase();
    const request = this.messenger.call(
      'MoneyAccountUpgradeController:getRegistrationStatus',
      address,
    );
    this.#registrationStatusRequests.set(addressKey, request);

    try {
      const { isRegistered } = await request;
      if (this.#registrationStatusRequests.get(addressKey) === request) {
        this.update((state) => {
          state.addressRegistrations[addressKey] = { isRegistered };
        });
      }
    } finally {
      if (this.#registrationStatusRequests.get(addressKey) === request) {
        this.#registrationStatusRequests.delete(addressKey);
      }
    }
  }

  #reportError(error: unknown): void {
    this.messenger.captureException?.(
      error instanceof Error ? error : new Error(getSafeErrorMessage(error)),
    );
  }
}

function assertValidBindingMigrator(migrator: BindingMigrator): void {
  const { id, phase, timeoutMs } = migrator;
  if (typeof id !== 'string' || id === '' || id === '__proto__') {
    throw new Error(
      'A binding migrator needs a non-empty string id other than __proto__',
    );
  }
  if (!BINDING_MIGRATION_PHASES.includes(phase)) {
    throw new Error(
      `Binding migrator '${id}' has an unknown phase '${String(phase)}'`,
    );
  }
  if (
    typeof migrator.reconcile !== 'function' ||
    typeof migrator.getStatus !== 'function'
  ) {
    throw new Error(
      `Binding migrator '${id}' needs reconcile and getStatus functions`,
    );
  }
  if (
    timeoutMs !== undefined &&
    !(
      typeof timeoutMs === 'number' &&
      timeoutMs > 0 &&
      timeoutMs <= MAX_TIMEOUT_MS
    )
  ) {
    throw new Error(
      `The timeout of binding migrator '${id}' must be a positive number of milliseconds up to ${MAX_TIMEOUT_MS}`,
    );
  }
}

function getSafeErrorMessage(error: unknown): string {
  try {
    return getErrorMessage(error);
  } catch {
    return 'Unknown error';
  }
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
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
