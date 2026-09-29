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

export type MoneyAccountLifecycleControllerState = Record<never, never>;

const moneyAccountLifecycleControllerMetadata =
  {} satisfies StateMetadata<MoneyAccountLifecycleControllerState>;

export function getDefaultMoneyAccountLifecycleControllerState(): MoneyAccountLifecycleControllerState {
  return {};
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
        }
      })
      .catch((error: unknown) => {
        if (this.#derivedIdentitiesFetch === derivedIdentitiesFetch) {
          this.#derivedIdentitiesFetch = undefined;
        }
        this.#reportError(error);
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
