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

const controllerName = 'MarketingConsentController';

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

const MESSENGER_EXPOSED_METHODS = ['setMarketingConsent', 'refresh'] as const;

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

// === TYPES ===

type ConsentSyncSession = {
  lastSynced?: boolean;
  // AUS may have changed on another device since the last read.
  remoteStale?: boolean;
};

// === CONTROLLER ===

/**
 * Keeps the user's marketing consent (held locally by `AnalyticsController`)
 * in sync with their Authenticated User Storage (AUS) profile. AUS is the
 * source of truth.
 *
 * - Clients change consent with
 * {@link MarketingConsentController.setMarketingConsent}, which resolves once
 * AUS has saved the change.
 * - On sign-in, unlock or {@link MarketingConsentController.refresh}, consent
 * is read from AUS and applied locally.
 * - A local change not yet saved (e.g. made while signed out) wins at the next
 * sync and is written to AUS. If AUS has no record, the local value is
 * written to it.
 * - Whenever consent is off, the AUS "marketing" notification channels are
 * turned off too, including when another client revoked consent.
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

  // The AUS value being applied locally, so its state change is not taken
  // for a local change.
  #applyingRemoteValue: boolean | undefined;

  #inFlight: Promise<void> | undefined;

  #latestConsentRequest = 0;

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
   * Sets the user's marketing consent and saves it to AUS.
   *
   * Turning consent off also turns off the AUS marketing notification
   * channels, before consent is saved.
   *
   * While the wallet is locked or signed out, the change is applied locally
   * and saved to AUS on the next unlock and sign-in; the call resolves
   * without waiting for that.
   *
   * @param enabled - Whether the user consents to marketing.
   * A call overtaken by a newer one resolves without waiting; the newer call
   * reports the outcome.
   *
   * @throws If AUS did not save the change. AUS is the source of truth, so
   * the change is then dropped and local consent is re-read from AUS.
   */
  async setMarketingConsent(enabled: boolean): Promise<void> {
    this.#latestConsentRequest += 1;
    const request = this.#latestConsentRequest;

    await this.#applyLocalConsent(enabled);

    // Checked after applying: the change applies locally either way, and a
    // first decision is what makes syncing possible. When locked or signed
    // out, the change stays pending until the next unlock and sign-in.
    if (!this.#isReady()) {
      return;
    }

    try {
      await this.#waitForSync(enabled);
    } catch (error) {
      if (request !== this.#latestConsentRequest) {
        return;
      }
      await this.#revertToAus(enabled);
      throw error;
    }
  }

  /**
   * Drops a consent change AUS did not save and re-applies the AUS value
   * locally, without writing anything to AUS.
   *
   * @param failedValue - The consent value that was not saved.
   */
  async #revertToAus(failedValue: boolean): Promise<void> {
    // Signed out or locked mid-save: like a change made while signed out, it
    // stays pending and is saved at the next unlock and sign-in.
    if (!this.#isReady()) {
      return;
    }
    // A newer change made meanwhile is still the user's latest choice.
    if (this.state.pendingMarketingConsent === failedValue) {
      this.#setPendingConsent(null);
    }
    this.#session.remoteStale = true;
    try {
      await this.#settleSync();
    } catch (error) {
      // AUS is unreachable; the next unlock, refresh or sign-in re-reads it.
      console.error('Failed to re-read marketing consent from AUS:', error);
    }
  }

  /**
   * Applies a consent choice locally and queues it to be written to AUS.
   *
   * @param enabled - Whether the user consents to marketing.
   */
  async #applyLocalConsent(enabled: boolean): Promise<void> {
    if (enabled) {
      await this.messenger.call('AnalyticsController:optInToMarketing');
    } else {
      this.messenger.call('AnalyticsController:optOutOfMarketing');
    }
    // An explicit choice is written to AUS even when it matches local consent,
    // so it wins over a different value AUS may hold.
    this.#setPendingConsent(enabled);
    this.#startSync();
  }

  /**
   * Confirms the requested consent was saved to AUS.
   *
   * @param expectedConsent - The consent value the caller asked to save.
   */
  async #waitForSync(expectedConsent: boolean): Promise<void> {
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
        this.#applyingRemoteValue !== state.optedInToMarketing;
      const decisionJustMade = !priorDecided && nowDecided;

      if (!localConsentChanged && !decisionJustMade) {
        return;
      }

      this.#setPendingConsent(state.optedInToMarketing === true);
      this.#startSync();
    });
  }

  // Whether consent can be synced: AUS needs a bearer token, which is only
  // obtainable while unlocked and signed in, and only a decided consent is
  // synced.
  #isReady(): boolean {
    return (
      this.#keyringState.isUnlocked &&
      this.#authenticationState.isSignedIn &&
      this.#analyticsState.marketingConsentDecisionMade === true
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
    if (!preferences) {
      return;
    }
    const { marketing } = preferences;
    if (
      !marketing.pushNotificationsEnabled &&
      !marketing.inAppNotificationsEnabled
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

    // The write only invalidates the cached preferences; re-reading them
    // publishes the new value to UIs bound to the AUS cache. A failed re-read
    // must not block the consent write, the UI catches up on its next read.
    await this.messenger
      .call('AuthenticatedUserStorageService:getNotificationPreferences')
      .catch((error: unknown) => {
        console.error('Failed to refresh notification preferences:', error);
      });
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
      this.#applyingRemoteValue = remote.marketingConsentEnabled;
      try {
        if (remote.marketingConsentEnabled) {
          await this.messenger.call('AnalyticsController:optInToMarketing');
        } else {
          this.messenger.call('AnalyticsController:optOutOfMarketing');
        }
      } finally {
        this.#applyingRemoteValue = undefined;
      }
    }

    // Another client may have revoked consent without turning the marketing
    // channels off; a no-op when they already are.
    if (!remote.marketingConsentEnabled) {
      await this.#turnOffMarketingNotifications();
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
    // Every run starts from a pending local change, a new session or a
    // refresh, so without a pending change AUS is always read.
    session.remoteStale = false;
    if (this.state.pendingMarketingConsent === null) {
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

    const afterRun = (succeeded: boolean): void => {
      this.#inFlight = undefined;
      // Re-run for a new session, or for a refresh requested mid-run; a
      // refresh must not read AUS before an in-flight write has landed.
      // After a successful run, a pending change was made after its flush;
      // after a failed one, it is the change that failed and waits for the
      // next trigger instead of retrying in a loop.
      const sessionChanged = this.#session !== startedFor;
      const changedAfterFlush =
        succeeded && this.state.pendingMarketingConsent !== null;
      if (
        this.#isReady() &&
        (sessionChanged ||
          this.#session.remoteStale === true ||
          changedAfterFlush)
      ) {
        this.#startSync();
      }
    };

    this.#inFlight = this.#run(startedFor).then(
      () => afterRun(true),
      (error: unknown) => {
        afterRun(false);
        throw error;
      },
    );

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
