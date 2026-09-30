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
import type { MoneyAccountLifecycleControllerMethodActions } from './money-account-lifecycle-controller-method-action-types.js';

const CONTROLLER_NAME = 'MoneyAccountLifecycleController';

export type MoneyAccountLifecycleStatus =
  | { status: 'unregistered' }
  | { status: 'sfa' }
  | { status: 'mfa'; currentAddress: string };

export type MoneyAccountLifecycleControllerState = {
  moneyAccounts: {
    [moneyAccountAddress: string]: MoneyAccountLifecycleStatus;
  };
};

const moneyAccountLifecycleControllerMetadata = {
  moneyAccounts: {
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    persist: true,
    usedInUi: false,
  },
} satisfies StateMetadata<MoneyAccountLifecycleControllerState>;

export function getDefaultMoneyAccountLifecycleControllerState(): MoneyAccountLifecycleControllerState {
  return {
    moneyAccounts: {},
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
  | RemoteFeatureFlagControllerGetStateAction;

export type MoneyAccountLifecycleControllerStateChangedEvent =
  ControllerStateChangedEvent<
    typeof CONTROLLER_NAME,
    MoneyAccountLifecycleControllerState
  >;

export type MoneyAccountLifecycleControllerMfaDetectedEvent = {
  type: `${typeof CONTROLLER_NAME}:mfaDetected`;
  payload: [{ moneyAccountAddress: string; currentAddress: string }];
};

export type MoneyAccountLifecycleControllerEvents =
  | MoneyAccountLifecycleControllerStateChangedEvent
  | MoneyAccountLifecycleControllerMfaDetectedEvent;

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

  get derivedIdentities(): DerivedIdentity[] | undefined {
    return this.#derivedIdentities;
  }

  /**
   * Fetches derived identities from CHOMP whenever the feature is enabled and
   * the wallet is unlocked with an HD keyring. Identities are cleared on lock
   * and refetched on unlock, when the remote feature flag values change, or on
   * the next trigger after a failed fetch.
   *
   * After each fetch, and whenever the primary Money Account changes, records
   * whether that account is unregistered, a valid SFA, or a valid MFA.
   * Publishes `MoneyAccountLifecycleController:mfaDetected` when it becomes a
   * valid MFA.
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
      this.#updateMoneyAccountStatus(),
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
          this.#updateMoneyAccountStatus();
        }
      })
      .catch((error: unknown) => {
        if (this.#derivedIdentitiesFetch === derivedIdentitiesFetch) {
          this.#derivedIdentitiesFetch = undefined;
        }
        this.#reportError(error);
      });
  }

  #updateMoneyAccountStatus(): void {
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

      const status = getMoneyAccountLifecycleStatus(
        moneyAccount.address,
        this.#derivedIdentities,
      );
      const moneyAccountKey = moneyAccount.address.toLowerCase();
      if (deepEqual(this.state.moneyAccounts[moneyAccountKey], status)) {
        return;
      }

      this.update((state) => {
        state.moneyAccounts[moneyAccountKey] = status;
      });

      if (status.status === 'mfa') {
        this.messenger.publish(`${CONTROLLER_NAME}:mfaDetected`, {
          moneyAccountAddress: moneyAccount.address,
          currentAddress: status.currentAddress,
        });
      }
    } catch (error) {
      this.#reportError(error);
    }
  }

  #reportError(error: unknown): void {
    this.messenger.captureException?.(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

function getMoneyAccountLifecycleStatus(
  moneyAccountAddress: string,
  identities: DerivedIdentity[],
): MoneyAccountLifecycleStatus {
  const normalizedAddress = moneyAccountAddress.toLowerCase();
  const isMoneyAccountAddress = (address: string): boolean =>
    address.toLowerCase() === normalizedAddress;

  if (
    identities.some(({ currentAddress }) =>
      isMoneyAccountAddress(currentAddress),
    )
  ) {
    return { status: 'sfa' };
  }

  const successor = identities.find(({ previousAddresses }) =>
    previousAddresses.some(isMoneyAccountAddress),
  );
  if (!successor) {
    return { status: 'unregistered' };
  }

  if (successor.status !== 'DONE') {
    throw new Error(
      `Money account ${moneyAccountAddress} is a previous address of a derived identity with status '${successor.status}'`,
    );
  }

  return { status: 'mfa', currentAddress: successor.currentAddress };
}

function isWalletReady({
  isUnlocked,
  keyrings,
}: KeyringControllerState): boolean {
  return (
    isUnlocked && keyrings.some((keyring) => keyring.type === KeyringTypes.hd)
  );
}
