import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  ChompApiServiceGetDerivedIdentitiesAction,
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
import type { MoneyAccountControllerUseMpcKeyringAction } from './money-account-controller-mpc-keyring.js';
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

const MESSENGER_EXPOSED_METHODS = ['init', 'getMoneyAccountIdentity'] as const;

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
  | MoneyAccountControllerUseMpcKeyringAction
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

type DerivedIdentitiesFetch = {
  remoteFeatureFlags: FeatureFlags;
};

export class MoneyAccountLifecycleController extends BaseController<
  typeof CONTROLLER_NAME,
  MoneyAccountLifecycleControllerState,
  MoneyAccountLifecycleControllerMessenger
> {
  readonly #isEnabled: MoneyAccountLifecycleControllerHooks['isEnabled'];

  #initialized = false;

  #derivedIdentitiesFetch?: DerivedIdentitiesFetch;

  #derivedIdentities?: DerivedIdentity[];

  readonly #registrationsInFlight = new Set<string>();

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
   * registered with CHOMP, and switches `MoneyAccountController` to the MPC
   * keyring for a valid MFA. Registers the Money Account address through
   * `MoneyAccountUpgradeController` when it is not registered and is either
   * not in an identity or a valid SFA. A migrating Money Account is frozen by
   * CHOMP, so it is never registered.
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

  #sync(): void {
    try {
      const { remoteFeatureFlags } = this.messenger.call(
        'RemoteFeatureFlagController:getState',
      );

      if (
        !this.#isEnabled(remoteFeatureFlags) ||
        !isWalletReady(this.messenger.call('KeyringController:getState'))
      ) {
        this.#derivedIdentitiesFetch = undefined;
        this.#derivedIdentities = undefined;
        return;
      }

      if (
        this.#derivedIdentitiesFetch &&
        deepEqual(
          this.#derivedIdentitiesFetch.remoteFeatureFlags,
          remoteFeatureFlags,
        )
      ) {
        return;
      }

      this.#fetchDerivedIdentities(remoteFeatureFlags);
    } catch (error) {
      this.#reportError(error);
    }
  }

  #fetchDerivedIdentities(remoteFeatureFlags: FeatureFlags): void {
    const derivedIdentitiesFetch = { remoteFeatureFlags };
    this.#derivedIdentitiesFetch = derivedIdentitiesFetch;

    this.messenger
      .call('ChompApiService:getDerivedIdentities')
      .then(({ identities }) => {
        if (this.#derivedIdentitiesFetch === derivedIdentitiesFetch) {
          this.#derivedIdentities = identities;
          this.#updateMoneyAccountLifecycle({ isRehydrating: true });
        }
      })
      .catch((error: unknown) => {
        if (this.#derivedIdentitiesFetch === derivedIdentitiesFetch) {
          this.#derivedIdentitiesFetch = undefined;
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

      if (!hasChanged && !isRehydrating) {
        return;
      }

      if (lifecycle.type === 'mfa') {
        this.messenger
          .call('MoneyAccountController:useMpcKeyring', {
            moneyAccountAddress: moneyAccount.address,
            mpcAddress: lifecycle.identity.currentAddress,
          })
          .catch((error: unknown) => this.#reportError(error));
      }

      this.#fetchRegistrationStatus(moneyAccount.address, {
        shouldReconcile: true,
      });
      if (lifecycle.type === 'mfa') {
        this.#fetchRegistrationStatus(lifecycle.identity.currentAddress, {
          shouldReconcile: false,
        });
      }
    } catch (error) {
      this.#reportError(error);
    }
  }

  #fetchRegistrationStatus(
    address: string,
    { shouldReconcile }: { shouldReconcile: boolean },
  ): void {
    const addressKey = address.toLowerCase();
    this.messenger
      .call('MoneyAccountUpgradeController:getRegistrationStatus', address)
      .then(({ isRegistered }) => {
        this.update((state) => {
          state.addressRegistrations[addressKey] = { isRegistered };
        });

        const lifecycle = this.state.moneyAccounts[addressKey];
        if (
          shouldReconcile &&
          !isRegistered &&
          (lifecycle?.type === 'sfa' || lifecycle?.type === 'notInIdentity')
        ) {
          this.#registerAddress(address);
        }
      })
      .catch((error: unknown) => this.#reportError(error));
  }

  #registerAddress(address: string): void {
    const addressKey = address.toLowerCase();
    if (this.#registrationsInFlight.has(addressKey)) {
      return;
    }
    this.#registrationsInFlight.add(addressKey);

    this.messenger
      .call('MoneyAccountUpgradeController:upgradeAccount', address as Hex)
      .then(() =>
        this.#fetchRegistrationStatus(address, { shouldReconcile: false }),
      )
      .catch((error: unknown) => this.#reportError(error))
      .finally(() => this.#registrationsInFlight.delete(addressKey));
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
