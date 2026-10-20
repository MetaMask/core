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
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type { AuthenticationController } from '@metamask/profile-sync-controller';

import type { MarketingConsentControllerMethodActions } from './MarketingConsentController-method-action-types.js';

// === GENERAL ===

/**
 * The name of the {@link MarketingConsentController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
const controllerName = 'MarketingConsentController';

/**
 * One signed-in period. A new session starts whenever the signed-in status
 * changes, so work started for one profile is never applied to another.
 */
type ConsentSyncSession = {
  /** The consent value AUS last confirmed in this session. */
  lastSynced?: boolean;
  /**
   * A refresh was requested (e.g. on unlock, since AUS may have changed on
   * another device), so AUS should be read again.
   */
  refreshRequested?: boolean;
};

/**
 * The marketing consent held by AnalyticsController.
 */
type LocalConsent = {
  /** Whether the user opted in to marketing. */
  optedIn: boolean;
  /** Whether the user made a marketing consent decision. */
  decided: boolean;
};

/**
 * Picks the marketing consent fields from AnalyticsController state.
 *
 * @param state - The AnalyticsController state.
 * @returns The local marketing consent.
 */
function toLocalConsent(
  state: Pick<
    AnalyticsControllerState,
    'optedInToMarketing' | 'marketingConsentDecisionMade'
  >,
): LocalConsent {
  return {
    optedIn: state.optedInToMarketing === true,
    decided: state.marketingConsentDecisionMade === true,
  };
}

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

/**
 * The metadata for each property in {@link MarketingConsentControllerState}.
 */
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

/**
 * The controller methods exposed as messenger actions.
 */
const MESSENGER_EXPOSED_METHODS = ['setMarketingConsent', 'refresh'] as const;

/**
 * Retrieves the state of the {@link MarketingConsentController}.
 */
export type MarketingConsentControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  MarketingConsentControllerState
>;

/**
 * Actions that {@link MarketingConsentControllerMessenger} exposes to other
 * consumers.
 */
export type MarketingConsentControllerActions =
  | MarketingConsentControllerGetStateAction
  | MarketingConsentControllerMethodActions;

/**
 * Published when the state of {@link MarketingConsentController} changes.
 */
export type MarketingConsentControllerStateChangedEvent =
  ControllerStateChangedEvent<
    typeof controllerName,
    MarketingConsentControllerState
  >;

/**
 * Events that {@link MarketingConsentControllerMessenger} exposes to other
 * consumers.
 */
export type MarketingConsentControllerEvents =
  MarketingConsentControllerStateChangedEvent;

type AuthenticationControllerState =
  AuthenticationController.AuthenticationControllerState;

/**
 * Actions from other messengers that {@link MarketingConsentControllerMessenger}
 * calls.
 */
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

/**
 * Events from other messengers that {@link MarketingConsentControllerMessenger}
 * subscribes to.
 */
type AllowedEvents =
  | ControllerStateChangedEvent<'AnalyticsController', AnalyticsControllerState>
  | ControllerStateChangedEvent<
      'AuthenticationController',
      AuthenticationControllerState
    >
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent;

/**
 * The messenger restricted to actions and events accessed by
 * {@link MarketingConsentController}.
 */
export type MarketingConsentControllerMessenger = Messenger<
  typeof controllerName,
  MarketingConsentControllerActions | AllowedActions,
  MarketingConsentControllerEvents | AllowedEvents
>;

// === CONTROLLER DEFINITION ===

/**
 * Keeps the user's marketing consent (held locally by `AnalyticsController`)
 * in sync with their Authenticated User Storage (AUS) profile. AUS is the
 * source of truth.
 *
 * - Clients change consent with
 * {@link MarketingConsentController.setMarketingConsent}, which resolves once
 * AUS has saved the change.
 * - On sign-in, unlock or {@link MarketingConsentController.refresh}, consent
 * is read from AUS and applied locally. A client with no local decision (e.g. a
 * social-login restore on a new device) adopts the decision saved in AUS, or
 * stays undecided when there is none.
 * - A local change not yet saved (e.g. made during onboarding, before sign-in
 * finishes) wins at the next sync and is written to AUS. If AUS has no record, the local value is
 * written to it.
 * - Whenever consent is off, the AUS "marketing" notification channels are
 * turned off too, including when another client revoked consent.
 */
export class MarketingConsentController extends BaseController<
  typeof controllerName,
  MarketingConsentControllerState,
  MarketingConsentControllerMessenger
> {
  /**
   * The client sent with every AUS write.
   */
  readonly #clientType: ClientType;

  /**
   * Whether {@link MarketingConsentController.initialize} has run.
   */
  #initialized = false;

  /**
   * Whether the wallet is unlocked, kept in step with the KeyringController
   * lock and unlock events. Starts `false`, so nothing syncs before `initialize`.
   */
  #isUnlocked = false;

  /**
   * The last signed-in status seen, so a sign-in or sign-out can be told apart
   * from other AuthenticationController changes.
   */
  #isSignedIn = false;

  /**
   * The last local consent seen, so the AnalyticsController listener can tell
   * a first decision from a changed one. Read local consent with
   * {@link MarketingConsentController.#getLocalConsent} instead.
   */
  #lastSeenConsent: LocalConsent = { optedIn: false, decided: false };

  /**
   * The current signed-in session.
   */
  #session: ConsentSyncSession = {};

  /**
   * The AUS value being applied locally, so its state change is not taken for
   * a local change.
   */
  #applyingRemoteValue: boolean | undefined;

  /**
   * The sync run in progress, if any. Only one runs at a time.
   */
  #inFlight: Promise<void> | undefined;

  /**
   * Counts {@link MarketingConsentController.setMarketingConsent} calls, so a
   * call overtaken by a newer one can tell.
   */
  #latestConsentRequest = 0;

  /**
   * Creates a new MarketingConsentController. It doesn't read other
   * controllers or sync until {@link MarketingConsentController.initialize} is
   * called.
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

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Reads the lock, sign-in and consent state, subscribes to their changes
   * and starts the first sync. Call it once every controller this one depends
   * on is registered. Calling it again does nothing.
   *
   * It isn't named `init` because `Wallet` from `@metamask/wallet` calls
   * `init` on its instances before `AnalyticsController` is registered. Once
   * `AnalyticsController` is part of `@metamask/wallet`, `init` can call this.
   */
  initialize(): void {
    if (this.#initialized) {
      return;
    }
    this.#initialized = true;

    this.#isUnlocked = this.messenger.call(
      'KeyringController:getState',
    ).isUnlocked;
    this.#isSignedIn = this.messenger.call(
      'AuthenticationController:getState',
    ).isSignedIn;
    this.#lastSeenConsent = this.#getLocalConsent();

    this.#subscribe();
    this.#startSync();
  }

  /**
   * Sets the user's marketing consent and saves it to AUS.
   *
   * Turning consent off also turns off the AUS marketing notification
   * channels, before consent is saved.
   *
   * Before sign-in finishes (e.g. during onboarding), the change is applied
   * locally and saved to AUS once the wallet is unlocked and signed in; the
   * call resolves without waiting for that.
   *
   * A call overtaken by a newer choice (a newer call, or other code changing
   * consent in AnalyticsController) resolves without waiting; the newer
   * choice is saved on its own.
   *
   * @param enabled - Whether the user consents to marketing.
   * @throws If AUS did not save the change. AUS is the source of truth, so
   * the change is then dropped and local consent is re-read from AUS.
   */
  async setMarketingConsent(enabled: boolean): Promise<void> {
    this.#latestConsentRequest += 1;
    const request = this.#latestConsentRequest;

    const applied = this.#applyLocalConsent(enabled);

    // Checked after applying: the change applies locally either way, and a
    // first decision is what makes syncing possible. Before sign-in finishes,
    // the change stays pending until the wallet is unlocked and signed in.
    if (!this.#isReady()) {
      await applied;
      return;
    }

    try {
      // Wait for the sync run started above alongside AnalyticsController's
      // follow-up work (e.g. resolving geolocation), not after it: if that
      // work outlasts the write, waiting afterwards starts an extra AUS read.
      await Promise.all([applied, this.#waitForSync(enabled)]);
    } catch (error) {
      // Overtaken by a newer choice, from a newer call or from other code
      // changing AnalyticsController; that choice is saved on its own.
      if (
        request !== this.#latestConsentRequest ||
        this.#getLocalConsent().optedIn !== enabled
      ) {
        return;
      }
      await this.#revertToAus();
      throw error;
    }
  }

  /**
   * Drops a consent change AUS did not save and re-applies the AUS value
   * locally, without writing anything to AUS.
   *
   */
  async #revertToAus(): Promise<void> {
    // Locked or signed out mid-save: like a change made before sign-in, it
    // stays pending and is saved after the next unlock and sign-in.
    if (!this.#isReady()) {
      return;
    }
    // Any pending change is this call's: a newer choice returns before the
    // revert (see setMarketingConsent).
    this.#setPendingConsent(null);
    this.#session.refreshRequested = true;
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
    // AnalyticsController updates consent before its first await. Queue the
    // change before awaiting its follow-up work, so an older call resuming
    // later cannot override a newer one.
    const applied = enabled
      ? this.messenger.call('AnalyticsController:optInToMarketing')
      : this.messenger.call('AnalyticsController:optOutOfMarketing');
    // An explicit choice is written to AUS even when it matches local consent,
    // so it wins over a different value AUS may hold.
    this.#setPendingConsent(enabled);
    this.#startSync();
    await applied;
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
      this.#getLocalConsent().optedIn !== expectedConsent
    ) {
      throw new Error('Marketing consent was not saved to AUS');
    }
  }

  /**
   * Re-reads consent from AUS, e.g. when the wallet UI opens or the app
   * returns to the foreground.
   */
  refresh(): void {
    this.#session.refreshRequested = true;
    this.#startSync();
  }

  /**
   * Subscribes to the lock, sign-in and consent changes that drive syncing.
   */
  #subscribe(): void {
    this.messenger.subscribe('KeyringController:unlock', () => {
      this.#isUnlocked = true;
      // AUS may have changed on another device while locked.
      this.refresh();
    });

    this.messenger.subscribe('KeyringController:lock', () => {
      this.#isUnlocked = false;
    });

    this.messenger.subscribe(
      'AuthenticationController:stateChanged',
      (state) => {
        const changed = this.#isSignedIn !== state.isSignedIn;
        this.#isSignedIn = state.isSignedIn;

        if (changed) {
          this.#session = {};
          this.#startSync();
        }
      },
    );

    this.messenger.subscribe('AnalyticsController:stateChanged', (state) => {
      const prior = this.#lastSeenConsent;
      const now = toLocalConsent(state);
      this.#lastSeenConsent = now;

      const localConsentChanged =
        prior.optedIn !== now.optedIn &&
        prior.decided &&
        now.decided &&
        this.#applyingRemoteValue !== now.optedIn;
      const decisionJustMade =
        !prior.decided &&
        now.decided &&
        this.#applyingRemoteValue !== now.optedIn;

      if (!localConsentChanged && !decisionJustMade) {
        return;
      }

      this.#setPendingConsent(now.optedIn);
      this.#startSync();
    });
  }

  /**
   * Reads local consent from AnalyticsController.
   *
   * @returns Whether the user opted in to marketing and whether they decided.
   */
  #getLocalConsent(): LocalConsent {
    return toLocalConsent(this.messenger.call('AnalyticsController:getState'));
  }

  /**
   * Whether AUS can be read: it needs a bearer token, which is only obtainable
   * while unlocked and signed in.
   *
   * @returns True when unlocked and signed in.
   */
  #canReachAus(): boolean {
    return this.#isUnlocked && this.#isSignedIn;
  }

  /**
   * Whether consent can be written to AUS: AUS must be reachable, and only a
   * decided consent is written.
   *
   * @returns True when unlocked, signed in and consent is decided.
   */
  #isReady(): boolean {
    return this.#canReachAus() && this.#getLocalConsent().decided;
  }

  /**
   * Sets the consent change waiting to be written to AUS.
   *
   * @param value - The consent to write, or `null` when nothing is pending.
   */
  #setPendingConsent(value: boolean | null): void {
    this.update((state) => {
      state.pendingMarketingConsent = value;
    });
  }

  /**
   * Throws if the session changed or the controller stopped being ready, so a
   * multi-step write stops before writing to a profile that signed in since.
   *
   * @param session - The session the write belongs to.
   */
  #assertCurrentSession(session: ConsentSyncSession): void {
    if (session !== this.#session || !this.#isReady()) {
      throw new Error('Marketing consent sync session ended');
    }
  }

  /**
   * Turns off the AUS marketing notification channels (push and in-app), which
   * rely on marketing consent. Writes nothing when they are already off.
   *
   * @param session - The session the write belongs to.
   */
  async #turnOffMarketingNotifications(
    session: ConsentSyncSession,
  ): Promise<void> {
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

    this.#assertCurrentSession(session);
    await this.messenger.call(
      'AuthenticatedUserStorageService:putNotificationPreferences',
      {
        ...preferences,
        marketing: {
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

  /**
   * Writes consent to AUS. For an opt-out, the marketing notification channels
   * go off first, so AUS never has consent off with a channel on; a failure
   * leaves both to retry.
   *
   * @param value - The consent to write.
   * @param session - The session the write belongs to.
   */
  async #writeConsent(
    value: boolean,
    session: ConsentSyncSession,
  ): Promise<void> {
    if (!value) {
      await this.#turnOffMarketingNotifications(session);
    }
    this.#assertCurrentSession(session);
    await this.messenger.call(
      'AuthenticatedUserStorageService:putMarketingConsent',
      { marketingConsentEnabled: value },
      this.#clientType,
    );
  }

  /**
   * Reads consent from AUS and applies it locally, or writes the local value
   * when AUS has none. Results are dropped if the session ended or a local
   * change arrived during the read.
   *
   * @param session - The session the read belongs to.
   */
  async #reconcileWithAus(session: ConsentSyncSession): Promise<void> {
    // Read fresh: AUS caches this query for a minute, and another device may
    // have changed consent since.
    await this.messenger.call(
      'AuthenticatedUserStorageService:invalidateQueries',
      { queryKey: ['AuthenticatedUserStorageService:getMarketingConsent'] },
    );

    const remote = await this.messenger.call(
      'AuthenticatedUserStorageService:getMarketingConsent',
    );

    if (session !== this.#session || !this.#canReachAus()) {
      return;
    }

    // A local change during the read takes precedence over AUS.
    if (this.state.pendingMarketingConsent !== null) {
      return;
    }

    // Read after the checks, so it reflects any change made during the read.
    const { optedIn: localValue, decided } = this.#getLocalConsent();

    if (remote === null) {
      // Without a local decision there is nothing to write; the user is asked,
      // and that decision is written as a local change.
      if (decided) {
        await this.#writeConsent(localValue, session);
        session.lastSynced = localValue;
      }
      return;
    }

    // An undecided client adopts the decision saved in AUS.
    if (!decided || remote.marketingConsentEnabled !== localValue) {
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
      await this.#turnOffMarketingNotifications(session);
    }

    session.lastSynced = remote.marketingConsentEnabled;
  }

  /**
   * Writes the pending change to AUS, then any newer change made during the
   * write. On failure the pending change stays in state.
   *
   * @param session - The session the write belongs to.
   */
  async #flushPendingConsent(session: ConsentSyncSession): Promise<void> {
    const value = this.state.pendingMarketingConsent;
    if (value === null || !this.#isReady()) {
      return;
    }

    // On failure the pending change stays in state and is retried.
    await this.#writeConsent(value, session);

    session.lastSynced = value;
    // A newer local change made during the write is flushed next.
    if (this.state.pendingMarketingConsent === value) {
      this.#setPendingConsent(null);
      return;
    }

    await this.#flushPendingConsent(session);
  }

  /**
   * One sync run: reads AUS when nothing is pending, then writes any pending
   * change.
   *
   * @param session - The session the run belongs to.
   */
  async #run(session: ConsentSyncSession): Promise<void> {
    // Claim any refresh requests: this run's AUS read satisfies them. A
    // request made during the run sets the flag again and starts another run.
    // Every run starts from a pending local change, a new session or a
    // refresh, so without a pending change AUS is always read.
    session.refreshRequested = false;
    if (this.state.pendingMarketingConsent === null) {
      await this.#reconcileWithAus(session);
    }

    await this.#flushPendingConsent(session);
  }

  /**
   * Starts a sync run when ready, or returns the one in progress. When a run
   * ends, another starts if the session changed, a refresh was requested, or a
   * change was queued after the run's last write.
   *
   * @returns The sync run in progress.
   */
  #sync(): Promise<void> {
    if (this.#inFlight) {
      return this.#inFlight;
    }

    if (!this.#canReachAus()) {
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
        this.#canReachAus() &&
        (sessionChanged ||
          this.#session.refreshRequested === true ||
          changedAfterFlush)
      ) {
        this.#startSync();
      }
    };

    this.#inFlight = this.#run(startedFor).then(
      () => afterRun(true),
      (error: unknown) => {
        const handedOff = this.#session !== startedFor;
        afterRun(false);
        // A run whose session ended hands off to the next session's run, so
        // its error says nothing about whether the change will be saved.
        if (!handedOff) {
          throw error;
        }
      },
    );

    return this.#inFlight;
  }

  /**
   * Starts a sync run without waiting for it, logging any failure.
   */
  #startSync(): void {
    this.#sync().catch((error) => {
      console.error('Failed to synchronize marketing consent with AUS:', error);
    });
  }

  /**
   * Waits until no sync run is in progress, including runs started when an
   * older one hands off to a new session.
   */
  async #settleSync(): Promise<void> {
    await this.#sync();
    if (this.#inFlight) {
      await this.#settleSync();
    }
  }
}
