import type {
  AnalyticsControllerGetStateAction,
  AnalyticsControllerOptInToMarketingAction,
  AnalyticsControllerOptOutOfMarketingAction,
  AnalyticsControllerState,
} from '@metamask/analytics-controller';
import type {
  AuthenticatedUserStorageInvalidateQueriesAction,
  AuthenticatedUserStorageServiceGetMarketingConsentAction,
  AuthenticatedUserStorageServiceGetNotificationPreferencesAction,
  AuthenticatedUserStorageServicePutMarketingConsentAction,
  AuthenticatedUserStorageServicePutNotificationPreferencesAction,
  ClientType,
} from '@metamask/authenticated-user-storage';
import { BaseController } from '@metamask/base-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerLockEvent,
  KeyringControllerState,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type { AuthenticationController } from '@metamask/profile-sync-controller';

import type { MarketingConsentControllerMethodActions } from './MarketingConsentController-method-action-types.js';

export const controllerName = 'MarketingConsentController';

// === STATE ===

/** State managed by MarketingConsentController. */
export type MarketingConsentControllerState = {
  /**
   * A local consent change not yet written to Authenticated User Storage, or
   * `null` when there is none. Persisted so the change survives a restart and
   * is written to whichever profile signs in next.
   */
  pendingMarketingConsent: boolean | null;
};

const marketingConsentControllerMetadata = {
  pendingMarketingConsent: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: false,
  },
} satisfies StateMetadata<MarketingConsentControllerState>;

/**
 * Returns the default state for MarketingConsentController.
 *
 * @returns The default state.
 */
export function getDefaultMarketingConsentControllerState(): MarketingConsentControllerState {
  return { pendingMarketingConsent: null };
}

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = ['waitForSync', 'refresh'] as const;

export type MarketingConsentControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  MarketingConsentControllerState
>;

export type MarketingConsentControllerActions =
  | MarketingConsentControllerGetStateAction
  | MarketingConsentControllerMethodActions;

export type MarketingConsentControllerStateChangedEvent =
  ControllerStateChangedEvent<
    typeof controllerName,
    MarketingConsentControllerState
  >;

export type MarketingConsentControllerEvents =
  MarketingConsentControllerStateChangedEvent;

type AuthenticationControllerState =
  AuthenticationController.AuthenticationControllerState;

type AllowedActions =
  | AuthenticatedUserStorageInvalidateQueriesAction
  | AuthenticatedUserStorageServiceGetMarketingConsentAction
  | AuthenticatedUserStorageServicePutMarketingConsentAction
  | AuthenticatedUserStorageServiceGetNotificationPreferencesAction
  | AuthenticatedUserStorageServicePutNotificationPreferencesAction
  | AnalyticsControllerGetStateAction
  | AnalyticsControllerOptInToMarketingAction
  | AnalyticsControllerOptOutOfMarketingAction
  | AuthenticationController.AuthenticationControllerGetStateAction
  | KeyringControllerGetStateAction;

type AllowedEvents =
  | ControllerStateChangedEvent<'AnalyticsController', AnalyticsControllerState>
  | ControllerStateChangedEvent<
      'AuthenticationController',
      AuthenticationControllerState
    >
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent;

export type MarketingConsentControllerMessenger = Messenger<
  typeof controllerName,
  MarketingConsentControllerActions | AllowedActions,
  MarketingConsentControllerEvents | AllowedEvents
>;

// === HELPERS ===

type ConsentSyncSession = {
  lastSynced?: boolean;
  // AUS may have changed on another device since the last read.
  remoteStale?: boolean;
};

/**
 * Whether consent can be synced with AUS.
 *
 * @param authenticationState - The authentication state.
 * @param analyticsState - The analytics state.
 * @param keyringState - The keyring state.
 * @returns True when the wallet is unlocked, signed in and consent is decided.
 */
function isConsentSyncReady(
  authenticationState: Pick<AuthenticationControllerState, 'isSignedIn'>,
  analyticsState: Pick<
    AnalyticsControllerState,
    'marketingConsentDecisionMade'
  >,
  keyringState: Pick<KeyringControllerState, 'isUnlocked'>,
): boolean {
  // AUS consent reads require a bearer token, which is only obtainable while
  // the vault is unlocked, so a sync attempted while locked always fails.
  return (
    keyringState.isUnlocked &&
    authenticationState.isSignedIn &&
    analyticsState.marketingConsentDecisionMade === true
  );
}

// === CONTROLLER ===

/**
 * Keeps the decided marketing consent in sync with the signed-in user's
 * Authenticated User Storage (AUS) profile.
 *
 * - On sign-in, unlock or {@link MarketingConsentController.refresh}, consent
 * is read from AUS and applied locally.
 * - A local change made before the AUS read wins and is written to AUS.
 * - If AUS has no record, the local value is written to it.
 * - Before every opt-out write, AUS "marketing" notification channels are
 * turned off, so AUS never has consent off with a channel on.
 */
export class MarketingConsentController extends BaseController<
  typeof controllerName,
  MarketingConsentControllerState,
  MarketingConsentControllerMessenger
> {
  readonly #clientType: ClientType;

  #analyticsState: AnalyticsControllerState;

  #authenticationState: AuthenticationControllerState;

  #keyringState: KeyringControllerState;

  #session: ConsentSyncSession = {};

  #applyingRemote: { value: boolean } | undefined;

  #inFlight: Promise<void> | undefined;

  /**
   * Creates a new MarketingConsentController.
   *
   * @param options - Constructor options.
   * @param options.messenger - The messenger scoped to this controller.
   * @param options.state - Initial state, merged with the defaults.
   * @param options.clientType - The client writing to AUS.
   */
  constructor({
    messenger,
    state,
    clientType,
  }: {
    messenger: MarketingConsentControllerMessenger;
    state?: Partial<MarketingConsentControllerState>;
    clientType: ClientType;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: marketingConsentControllerMetadata,
      state: { ...getDefaultMarketingConsentControllerState(), ...state },
    });

    this.#clientType = clientType;
    this.#analyticsState = this.messenger.call('AnalyticsController:getState');
    this.#authenticationState = this.messenger.call(
      'AuthenticationController:getState',
    );
    this.#keyringState = this.messenger.call('KeyringController:getState');

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    this.#subscribe();
    this.#startSync();
  }

  /**
   * Confirms the requested consent was saved to AUS.
   *
   * @param expectedConsent - The consent value the caller asked to save.
   */
  async waitForSync(expectedConsent: boolean): Promise<void> {
    // A skipped sync must not be reported as a successful save.
    if (!this.#isReady()) {
      throw new Error(
        'Marketing consent requires an unlocked, signed-in wallet',
      );
    }
    const expectedSession = this.#session;
    await this.#settleSync();

    if (
      expectedSession !== this.#session ||
      this.state.pendingMarketingConsent !== null ||
      this.#session.lastSynced !== expectedConsent ||
      this.#analyticsState.marketingConsentDecisionMade !== true ||
      this.#analyticsState.optedInToMarketing !== expectedConsent
    ) {
      throw new Error('Marketing consent was not saved to AUS');
    }
  }

  /**
   * Re-reads consent from AUS, e.g. when the wallet UI opens or the app
   * returns to the foreground.
   */
  refresh(): void {
    this.#session.remoteStale = true;
    this.#startSync();
  }

  #subscribe(): void {
    this.messenger.subscribe('KeyringController:unlock', () => {
      this.#keyringState = { ...this.#keyringState, isUnlocked: true };
      // AUS may have changed on another device while locked.
      this.refresh();
    });

    this.messenger.subscribe('KeyringController:lock', () => {
      this.#keyringState = { ...this.#keyringState, isUnlocked: false };
    });

    this.messenger.subscribe(
      'AuthenticationController:stateChanged',
      (state) => {
        const changed =
          this.#authenticationState.isSignedIn !== state.isSignedIn;
        this.#authenticationState = state;

        if (changed) {
          this.#session = {};
          this.#startSync();
        }
      },
    );

    this.messenger.subscribe('AnalyticsController:stateChanged', (state) => {
      const prior = this.#analyticsState;
      this.#analyticsState = state;

      const priorDecided = prior.marketingConsentDecisionMade === true;
      const nowDecided = state.marketingConsentDecisionMade === true;
      const localConsentChanged =
        prior.optedInToMarketing !== state.optedInToMarketing &&
        priorDecided &&
        nowDecided &&
        this.#applyingRemote?.value !== state.optedInToMarketing;
      const decisionJustMade = !priorDecided && nowDecided;

      if (!localConsentChanged && !decisionJustMade) {
        return;
      }

      this.#setPendingConsent(state.optedInToMarketing === true);
      this.#startSync();
    });
  }

  #isReady(): boolean {
    return isConsentSyncReady(
      this.#authenticationState,
      this.#analyticsState,
      this.#keyringState,
    );
  }

  #setPendingConsent(value: boolean | null): void {
    this.update((state) => {
      state.pendingMarketingConsent = value;
    });
  }

  // Updates and rewards notifications rely on marketing consent.
  async #turnOffMarketingNotifications(): Promise<void> {
    await this.messenger.call(
      'AuthenticatedUserStorageService:invalidateQueries',
      {
        queryKey: [
          'AuthenticatedUserStorageService:getNotificationPreferences',
        ],
      },
    );
    const preferences = await this.messenger.call(
      'AuthenticatedUserStorageService:getNotificationPreferences',
    );
    const marketing = preferences?.marketing;
    if (
      !preferences ||
      (!marketing?.pushNotificationsEnabled &&
        !marketing?.inAppNotificationsEnabled)
    ) {
      return;
    }

    await this.messenger.call(
      'AuthenticatedUserStorageService:putNotificationPreferences',
      {
        ...preferences,
        marketing: {
          ...marketing,
          pushNotificationsEnabled: false,
          inAppNotificationsEnabled: false,
        },
      },
      this.#clientType,
    );
  }

  // Channels go off before consent so AUS never has consent off with a
  // channel on; a failure leaves both to retry.
  async #writeConsent(value: boolean): Promise<void> {
    if (!value) {
      await this.#turnOffMarketingNotifications();
    }
    await this.messenger.call(
      'AuthenticatedUserStorageService:putMarketingConsent',
      { marketingConsentEnabled: value },
      this.#clientType,
    );
  }

  async #reconcileWithAus(session: ConsentSyncSession): Promise<void> {
    const localValue = this.#analyticsState.optedInToMarketing === true;

    // AUS caches this query across profiles, so fetch fresh consent per session.
    await this.messenger.call(
      'AuthenticatedUserStorageService:invalidateQueries',
      { queryKey: ['AuthenticatedUserStorageService:getMarketingConsent'] },
    );

    const remote = await this.messenger.call(
      'AuthenticatedUserStorageService:getMarketingConsent',
    );

    if (session !== this.#session || !this.#isReady()) {
      return;
    }

    // A local change during the read takes precedence over AUS.
    if (this.state.pendingMarketingConsent !== null) {
      return;
    }

    if (remote === null) {
      await this.#writeConsent(localValue);
      session.lastSynced = localValue;
      return;
    }

    if (remote.marketingConsentEnabled !== localValue) {
      this.#applyingRemote = { value: remote.marketingConsentEnabled };
      try {
        if (remote.marketingConsentEnabled) {
          await this.messenger.call('AnalyticsController:optInToMarketing');
        } else {
          this.messenger.call('AnalyticsController:optOutOfMarketing');
        }
      } finally {
        this.#applyingRemote = undefined;
      }
    }

    session.lastSynced = remote.marketingConsentEnabled;
  }

  async #flushPendingConsent(session: ConsentSyncSession): Promise<void> {
    const value = this.state.pendingMarketingConsent;
    if (value === null || !this.#isReady()) {
      return;
    }

    // On failure the pending change stays in state and is retried.
    await this.#writeConsent(value);

    session.lastSynced = value;
    // A newer local change made during the write is flushed next.
    if (this.state.pendingMarketingConsent === value) {
      this.#setPendingConsent(null);
      return;
    }

    await this.#flushPendingConsent(session);
  }

  async #run(session: ConsentSyncSession): Promise<void> {
    if (this.state.pendingMarketingConsent !== null) {
      session.remoteStale = false;
    } else if (
      session.lastSynced === undefined ||
      session.remoteStale === true
    ) {
      session.remoteStale = false;
      await this.#reconcileWithAus(session);
    }

    await this.#flushPendingConsent(session);
  }

  #sync(): Promise<void> {
    if (this.#inFlight) {
      return this.#inFlight;
    }

    if (!this.#isReady()) {
      return Promise.resolve();
    }

    const startedFor = this.#session;

    this.#inFlight = this.#run(startedFor).finally(() => {
      this.#inFlight = undefined;
      // Re-run for a new session, or for a refresh requested mid-run; a
      // refresh must not read AUS before an in-flight write has landed.
      const sessionChanged = this.#session !== startedFor;
      if (
        this.#isReady() &&
        (sessionChanged || this.#session.remoteStale === true)
      ) {
        this.#startSync();
      }
    });

    return this.#inFlight;
  }

  #startSync(): void {
    this.#sync().catch((error) => {
      console.error('Failed to synchronize marketing consent with AUS:', error);
    });
  }

  // A run for an older session hands off to a new run when it settles.
  async #settleSync(): Promise<void> {
    await this.#sync();
    if (this.#inFlight) {
      await this.#settleSync();
    }
  }
}
