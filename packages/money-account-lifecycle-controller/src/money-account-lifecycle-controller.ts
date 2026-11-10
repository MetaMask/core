import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  ChompApiServiceGetDerivedIdentitiesAction,
  ChompApiServiceGetIntentsByAddressAction,
  DerivedIdentitiesResponse,
  DerivedIdentity,
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
import type { MoneyAccountUpgradeControllerUpgradeAccountAction } from '@metamask/money-account-upgrade-controller';
import type {
  FeatureFlags,
  RemoteFeatureFlagControllerGetStateAction,
  RemoteFeatureFlagControllerStateChangeEvent,
} from '@metamask/remote-feature-flag-controller';
import type { Hex } from '@metamask/utils';
import deepEqual from 'fast-deep-equal';

import {
  getMoneyAccountLifecycle,
  isMigrating,
} from './get-money-account-lifecycle.js';
import type { MoneyAccountLifecycle } from './get-money-account-lifecycle.js';
import type { MoneyAccountLifecycleControllerMethodActions } from './money-account-lifecycle-controller-method-action-types.js';
import type {
  MoneyAccountUpgradeControllerGetRegistrationStatusAction,
  RegistrationStatus,
} from './money-account-upgrade-controller-registration-status.js';

const CONTROLLER_NAME = 'MoneyAccountLifecycleController';

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
} satisfies StateMetadata<MoneyAccountLifecycleControllerState>;

export function getDefaultMoneyAccountLifecycleControllerState(): MoneyAccountLifecycleControllerState {
  return {
    moneyAccounts: {},
    addressRegistrations: {},
  };
}

const MESSENGER_EXPOSED_METHODS = [
  'init',
  'getMoneyAccountIdentity',
  'refresh',
  'upgradeMoneyAccount',
  'startMigration',
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
  | ChompApiServiceGetIntentsByAddressAction
  | KeyringControllerGetStateAction
  | MoneyAccountControllerCreateMoneyAccountAction
  | MoneyAccountControllerGetMoneyAccountAction
  | MoneyAccountControllerSetDefaultMoneyAccountAction
  | MoneyAccountUpgradeControllerGetRegistrationStatusAction
  | MoneyAccountUpgradeControllerUpgradeAccountAction
  | RemoteFeatureFlagControllerGetStateAction;

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
    Promise<RegistrationStatus>
  >();

  #isMigrationInFlight = false;

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
   * upgraded, judged from the latest identity fetch. Makes a single attempt;
   * clients decide when to call it and how to retry. Concurrent calls share the
   * attempt in flight. After upgrading, refetches identities so the recorded
   * lifecycle reflects the upgrade.
   *
   * @returns A promise that resolves once the attempt completes, or straight
   * away when the feature is disabled, the wallet is not ready, or the Money
   * Account cannot be upgraded.
   * @throws When there is no Money Account, or the error from fetching
   * identities before upgrading or from the upgrade, unchanged.
   */
  async upgradeMoneyAccount(): Promise<void> {
    if (!this.#isReady()) {
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

    const upgrade = this.#upgradeMoneyAccount(moneyAccount.address).finally(
      () => this.#upgradesInFlight.delete(moneyAccountKey),
    );
    this.#upgradesInFlight.set(moneyAccountKey, upgrade);
    return upgrade;
  }

  async #upgradeMoneyAccount(moneyAccountAddress: string): Promise<void> {
    await this.#waitForLatestDerivedIdentities();
    if (!this.#isReady()) {
      return;
    }

    const lifecycle =
      this.state.moneyAccounts[moneyAccountAddress.toLowerCase()];
    if (lifecycle?.type !== 'sfa' && lifecycle?.type !== 'notInIdentity') {
      return;
    }

    await this.messenger.call(
      'MoneyAccountUpgradeController:upgradeAccount',
      moneyAccountAddress as Hex,
    );
    if (!this.#isReady()) {
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
   * MFA address.
   *
   * Reads the profile's identities fresh from CHOMP and records them, then
   * only proceeds when the wallet is still ready, no identity is migrating, and
   * the Money Account is a valid SFA in no other identity. Asks
   * `MoneyAccountController` to create the MPC Money Account, or returns the
   * one an earlier attempt created, and checks that its address is fresh for
   * CHOMP: not part of any identity, and without intents.
   *
   * Linking the MFA address to the Money Account and completing the migration
   * steps are not implemented yet, so this always throws once the checks
   * pass.
   *
   * @throws If a migration is already in flight, the checks fail, or the
   * migration is reached.
   */
  async startMigration(): Promise<void> {
    if (this.#isMigrationInFlight) {
      throw new Error('A Money Account migration is already in progress');
    }

    this.#isMigrationInFlight = true;
    try {
      await this.#startMigration();
    } finally {
      this.#isMigrationInFlight = false;
    }
  }

  async #startMigration(): Promise<void> {
    if (!this.#isReady()) {
      throw new Error('Money Account migration is not available');
    }

    const moneyAccount = this.messenger.call(
      'MoneyAccountController:getMoneyAccount',
      { type: 'mnemonic' },
    );
    if (!moneyAccount) {
      throw new Error('There is no Money Account to migrate');
    }

    this.#fetchDerivedIdentities();
    await this.#waitForLatestDerivedIdentities();
    const identities = this.#derivedIdentities;
    if (!this.#isReady() || !identities) {
      throw new Error('Money Account migration is not available');
    }

    if (identities.some(isMigrating)) {
      throw new Error('A Money Account identity is already migrating');
    }

    if (countIdentityAddresses(moneyAccount.address, identities) > 1) {
      throw new Error(
        `Money Account ${moneyAccount.address} belongs to more than one identity`,
      );
    }

    const lifecycle = getMoneyAccountLifecycle(
      moneyAccount.address,
      identities,
    );
    if (lifecycle.type !== 'sfa') {
      throw new Error(
        `Money Account ${moneyAccount.address} cannot be migrated while it is '${lifecycle.type}'`,
      );
    }

    const mpcMoneyAccount = await this.messenger.call(
      'MoneyAccountController:createMoneyAccount',
      { type: 'mpc' },
    );
    const mfaAddress = mpcMoneyAccount.address as Hex;
    await this.#assertFreshForChomp(mfaAddress, identities);

    // TODO: Link the MFA address to the Money Account and drive the migration
    // steps from the incomplete entries of `migration.steps`.
    throw new Error(
      `Migrating Money Account ${moneyAccount.address} to ${mfaAddress} is not implemented yet`,
    );
  }

  async #assertFreshForChomp(
    mfaAddress: Hex,
    identities: DerivedIdentity[],
  ): Promise<void> {
    if (countIdentityAddresses(mfaAddress, identities) > 0) {
      throw new Error(
        `MFA account ${mfaAddress} is already part of a Money Account identity`,
      );
    }

    const intents = await this.messenger.call(
      'ChompApiService:getIntentsByAddress',
      mfaAddress.toLowerCase() as Hex,
    );
    if (intents.length > 0) {
      throw new Error(`MFA account ${mfaAddress} already has CHOMP intents`);
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

      if (!hasChanged && !isRehydrating) {
        return;
      }

      this.#fetchRegistrationStatus(moneyAccount.address).catch(
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

  async #fetchRegistrationStatus(address: string): Promise<void> {
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
