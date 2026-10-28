import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  ChompApiServiceGetDerivedIdentitiesAction,
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

import { getMoneyAccountLifecycle } from './get-money-account-lifecycle.js';
import type { MoneyAccountLifecycle } from './get-money-account-lifecycle.js';
import type { MoneyAccountLifecycleControllerMethodActions } from './money-account-lifecycle-controller-method-action-types.js';
import type { MoneyAccountUpgradeControllerGetRegistrationStatusAction } from './money-account-upgrade-controller-registration-status.js';

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
    usedInUi: false,
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
  'upgradeMoneyAccount',
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
  | KeyringControllerGetStateAction
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

  #derivedIdentities?: DerivedIdentity[];

  readonly #upgradesInFlight = new Map<string, Promise<void>>();

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
   * Makes one attempt to upgrade the primary Money Account through
   * `MoneyAccountUpgradeController`, then refreshes its recorded registration
   * status. Clients own when this runs and how failed attempts are retried.
   *
   * Uses the recorded lifecycle, fetching identities fresh from CHOMP when none
   * has been recorded. Only a Money Account that is not in an identity or is a
   * valid SFA is upgraded; a migrating Money Account is frozen by CHOMP, and a
   * valid MFA has already moved on. Concurrent calls share the attempt in
   * flight.
   *
   * @returns A promise that resolves once the attempt completes, or straight
   * away when the feature is unavailable, there is no Money Account, or its
   * lifecycle cannot be upgraded.
   * @throws The error from fetching identities or from the upgrade, unchanged.
   */
  async upgradeMoneyAccount(): Promise<void> {
    if (
      !this.#isEnabled(
        this.messenger.call('RemoteFeatureFlagController:getState')
          .remoteFeatureFlags,
      ) ||
      !isWalletReady(this.messenger.call('KeyringController:getState'))
    ) {
      return;
    }

    const moneyAccount = this.messenger.call(
      'MoneyAccountController:getMoneyAccount',
      { type: 'mnemonic' },
    );
    if (!moneyAccount) {
      return;
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
    const lifecycle =
      this.state.moneyAccounts[moneyAccountAddress.toLowerCase()] ??
      (await this.#fetchMoneyAccountLifecycle(moneyAccountAddress));
    if (lifecycle.type !== 'sfa' && lifecycle.type !== 'notInIdentity') {
      return;
    }

    await this.messenger.call(
      'MoneyAccountUpgradeController:upgradeAccount',
      moneyAccountAddress as Hex,
    );
    await this.#fetchRegistrationStatus(moneyAccountAddress).catch(
      (error: unknown) => this.#reportError(error),
    );
  }

  async #fetchMoneyAccountLifecycle(
    moneyAccountAddress: string,
  ): Promise<MoneyAccountLifecycle> {
    const { identities } = await this.messenger.call(
      'ChompApiService:getDerivedIdentities',
    );
    this.#derivedIdentities = identities;
    this.#updateMoneyAccountLifecycle({ isRehydrating: false });
    return getMoneyAccountLifecycle(moneyAccountAddress, identities);
  }

  #sync(): void {
    try {
      const { remoteFeatureFlags } = this.messenger.call(
        'RemoteFeatureFlagController:getState',
      );

      if (
        !this.#isEnabled(remoteFeatureFlags) ||
        !isWalletReady(this.messenger.call('KeyringController:getState'))
      ) {
        this.#syncedRemoteFeatureFlags = undefined;
        this.#derivedIdentitiesRequest = undefined;
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

    request
      .then(({ identities }) => {
        if (this.#derivedIdentitiesRequest === request) {
          this.#derivedIdentities = identities;
          this.#updateMoneyAccountLifecycle({ isRehydrating: true });
        }
      })
      .catch((error: unknown) => {
        if (this.#derivedIdentitiesRequest === request) {
          this.#syncedRemoteFeatureFlags = undefined;
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
    const { isRegistered } = await this.messenger.call(
      'MoneyAccountUpgradeController:getRegistrationStatus',
      address,
    );
    this.update((state) => {
      state.addressRegistrations[address.toLowerCase()] = { isRegistered };
    });
  }

  #reportError(error: unknown): void {
    this.messenger.captureException?.(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

function isWalletReady({
  isUnlocked,
  keyrings,
}: KeyringControllerState): boolean {
  return (
    isUnlocked && keyrings.some((keyring) => keyring.type === KeyringTypes.hd)
  );
}
