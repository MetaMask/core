import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
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
import type {
  FeatureFlags,
  RemoteFeatureFlagControllerGetStateAction,
  RemoteFeatureFlagControllerStateChangeEvent,
} from '@metamask/remote-feature-flag-controller';
import deepEqual from 'fast-deep-equal';

import type {
  ChompApiServiceGetDerivedIdentitiesAction,
  DerivedIdentity,
} from './chomp-api-service-derived-identities.js';
import type { MoneyAccountControllerUseMpcKeyringAction } from './money-account-controller-mpc-keyring.js';
import type { MoneyAccountLifecycleControllerMethodActions } from './money-account-lifecycle-controller-method-action-types.js';
import type { MoneyAccountUpgradeControllerGetRegistrationStatusAction } from './money-account-upgrade-controller-registration-status.js';

const CONTROLLER_NAME = 'MoneyAccountLifecycleController';

export type MoneyAccountLifecycle =
  | { type: 'notInIdentity' }
  | { type: 'sfa' | 'mfa'; identity: DerivedIdentity };

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

const MESSENGER_EXPOSED_METHODS = ['init'] as const;

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
   * whether that account is not in an identity, a valid SFA, or a valid MFA,
   * along with its identity. After each fetch, or when the recorded lifecycle
   * changes, looks up whether the Money Account address, and the identity's
   * current address for a valid MFA, are registered with CHOMP, and switches
   * `MoneyAccountController` to the MPC keyring for a valid MFA.
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

      this.#fetchRegistrationStatus(moneyAccount.address);
      if (lifecycle.type === 'mfa') {
        this.#fetchRegistrationStatus(lifecycle.identity.currentAddress);
      }
    } catch (error) {
      this.#reportError(error);
    }
  }

  #fetchRegistrationStatus(address: string): void {
    this.messenger
      .call('MoneyAccountUpgradeController:getRegistrationStatus', address)
      .then(({ isRegistered }) => {
        this.update((state) => {
          state.addressRegistrations[address.toLowerCase()] = { isRegistered };
        });
      })
      .catch((error: unknown) => this.#reportError(error));
  }

  #reportError(error: unknown): void {
    this.messenger.captureException?.(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

function getMoneyAccountLifecycle(
  moneyAccountAddress: string,
  identities: DerivedIdentity[],
): MoneyAccountLifecycle {
  const normalizedAddress = moneyAccountAddress.toLowerCase();
  const isMoneyAccountAddress = (address: string): boolean =>
    address.toLowerCase() === normalizedAddress;

  const sfaIdentity = identities.find(({ currentAddress }) =>
    isMoneyAccountAddress(currentAddress),
  );
  if (sfaIdentity) {
    return { type: 'sfa', identity: sfaIdentity };
  }

  const successor = identities.find(({ previousAddresses }) =>
    previousAddresses.some(isMoneyAccountAddress),
  );
  if (!successor) {
    return { type: 'notInIdentity' };
  }

  if (successor.status !== 'DONE') {
    throw new Error(
      `Money account ${moneyAccountAddress} is a previous address of a derived identity with status '${successor.status}'`,
    );
  }

  return { type: 'mfa', identity: successor };
}

function isWalletReady({
  isUnlocked,
  keyrings,
}: KeyringControllerState): boolean {
  return (
    isUnlocked && keyrings.some((keyring) => keyring.type === KeyringTypes.hd)
  );
}
