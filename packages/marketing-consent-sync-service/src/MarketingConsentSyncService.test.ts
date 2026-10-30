import type { AnalyticsControllerState } from '@metamask/analytics-controller';
import type {
  ClientType,
  MarketingConsent,
  NotificationPreferences,
} from '@metamask/authenticated-user-storage';
import type { KeyringControllerState } from '@metamask/keyring-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import type { Mock, MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MarketingConsentSyncService } from './MarketingConsentSyncService.js';
import type { MarketingConsentSyncServiceMessenger } from './MarketingConsentSyncService.js';

const NOTIFICATION_PREFERENCES: NotificationPreferences = {
  walletActivity: {
    pushNotificationsEnabled: true,
    inAppNotificationsEnabled: true,
    accounts: [],
  },
  marketing: {
    pushNotificationsEnabled: true,
    inAppNotificationsEnabled: true,
  },
  perps: { pushNotificationsEnabled: true, inAppNotificationsEnabled: true },
  socialAI: {
    pushNotificationsEnabled: true,
    inAppNotificationsEnabled: true,
    mutedTraderProfileIds: [],
  },
  agenticCli: {
    pushNotificationsEnabled: true,
    inAppNotificationsEnabled: true,
  },
  priceAlerts: {
    pushNotificationsEnabled: true,
    inAppNotificationsEnabled: true,
  },
};

const OPTED_IN = {
  optedInToMarketing: true,
  marketingConsentDecisionMade: true,
  marketingConsentSyncPending: false,
};

const OPTED_OUT = {
  optedInToMarketing: false,
  marketingConsentDecisionMade: true,
  marketingConsentSyncPending: false,
};

const UNDECIDED = {
  optedInToMarketing: false,
  marketingConsentDecisionMade: false,
  marketingConsentSyncPending: false,
};

/** A local opt-in not yet saved to AUS, as set by `optInToMarketing`. */
const PENDING_OPT_IN = { ...OPTED_IN, marketingConsentSyncPending: true };

/** A local opt-out not yet saved to AUS, as set by `optOutOfMarketing`. */
const PENDING_OPT_OUT = { ...OPTED_OUT, marketingConsentSyncPending: true };

type RemoteConsent = MarketingConsent | null;

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<MarketingConsentSyncServiceMessenger>,
  MessengerEvents<MarketingConsentSyncServiceMessenger>
>;

type SetupOptions = {
  analyticsState?: Partial<AnalyticsControllerState>;
  isSignedIn?: boolean;
  isUnlocked?: boolean;
  remoteConsent?: RemoteConsent;
  getConsent?: () => Promise<RemoteConsent>;
  putConsent?: () => Promise<void>;
  getPreferences?: () => Promise<NotificationPreferences | null>;
  putPreferences?: () => Promise<void>;
  clientType?: ClientType;
  initialize?: boolean;
};

const DELEGATED_ACTIONS = [
  'AuthenticatedUserStorageService:invalidateQueries',
  'AuthenticatedUserStorageService:getMarketingConsent',
  'AuthenticatedUserStorageService:putMarketingConsent',
  'AuthenticatedUserStorageService:getNotificationPreferences',
  'AuthenticatedUserStorageService:putNotificationPreferences',
  'AnalyticsController:getState',
  'AnalyticsController:optInToMarketing',
  'AnalyticsController:optOutOfMarketing',
  'AnalyticsController:applyRemoteMarketingConsent',
  'AnalyticsController:clearPendingMarketingConsent',
  'AuthenticationController:getState',
  'KeyringController:getState',
] as const;

const DELEGATED_EVENTS = [
  'AnalyticsController:stateChanged',
  'AuthenticationController:stateChanged',
  'KeyringController:lock',
  'KeyringController:unlock',
] as const;

const flushPromises = async (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Creates a deferred promise that can be settled from the test.
 *
 * @returns The promise and its resolve/reject functions.
 */
function createDeferred<Value>(): {
  promise: Promise<Value>;
  resolve: (value: Value) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: Value) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Value>((resolveFn, rejectFn) => {
    resolve = resolveFn;
    reject = rejectFn;
  });
  return { promise, resolve, reject };
}

/**
 * Reads the local consent change waiting to be saved to AUS, the way the
 * service does.
 *
 * @param state - The AnalyticsController state.
 * @returns The consent value to save, or `null` when nothing is pending.
 */
function toPendingConsent(state: AnalyticsControllerState): boolean | null {
  return state.marketingConsentSyncPending === true
    ? state.optedInToMarketing === true
    : null;
}

/**
 * Constructs the service under test with a root messenger whose external
 * actions are backed by mock functions. The AnalyticsController marketing
 * consent actions follow the real controller's semantics.
 *
 * @param options - Setup options.
 * @param options.analyticsState - Initial AnalyticsController state.
 * @param options.isSignedIn - Initial AuthenticationController sign-in state.
 * @param options.isUnlocked - Initial KeyringController lock state.
 * @param options.remoteConsent - Consent returned by the default AUS read.
 * @param options.getConsent - Overrides the AUS consent read.
 * @param options.putConsent - Overrides the AUS consent write.
 * @param options.getPreferences - Overrides the AUS preferences read.
 * @param options.putPreferences - Overrides the AUS preferences write.
 * @param options.clientType - The client type passed to the service.
 * @param options.initialize - Whether to call `initialize` after constructing.
 * @returns The service, messengers, mocks and state helpers.
 */
function setup({
  analyticsState = UNDECIDED,
  isSignedIn = false,
  isUnlocked = true,
  remoteConsent = null,
  getConsent = async (): Promise<RemoteConsent> => remoteConsent,
  putConsent = async (): Promise<void> => undefined,
  getPreferences = async (): Promise<NotificationPreferences | null> => null,
  putPreferences = async (): Promise<void> => undefined,
  clientType = 'extension',
  initialize = true,
}: SetupOptions = {}): {
  service: MarketingConsentSyncService;
  rootMessenger: RootMessenger;
  mocks: {
    invalidateQueries: Mock<() => Promise<void>>;
    getMarketingConsent: Mock<() => Promise<RemoteConsent>>;
    putMarketingConsent: Mock<
      (consent: MarketingConsent, clientType?: ClientType) => Promise<void>
    >;
    getNotificationPreferences: Mock<
      () => Promise<NotificationPreferences | null>
    >;
    putNotificationPreferences: Mock<
      (
        preferences: NotificationPreferences,
        clientType?: ClientType,
      ) => Promise<void>
    >;
    optInToMarketing: Mock<() => Promise<void>>;
    optOutOfMarketing: Mock<() => void>;
    applyRemoteMarketingConsent: Mock<(optedIn: boolean) => Promise<void>>;
    clearPendingMarketingConsent: Mock<(optedIn: boolean) => void>;
  };
  setAnalyticsState: (newState: Partial<AnalyticsControllerState>) => void;
  getPendingConsent: () => boolean | null;
  setSignedIn: (signedIn: boolean) => void;
} {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  let currentAnalyticsState = {
    optedIn: false,
    ...analyticsState,
  } as AnalyticsControllerState;
  let currentAuthenticationState = {
    isSignedIn,
  } as AuthenticationController.AuthenticationControllerState;
  const keyringState = { isUnlocked } as KeyringControllerState;

  const setAnalyticsState = (
    newState: Partial<AnalyticsControllerState>,
  ): void => {
    currentAnalyticsState = { ...currentAnalyticsState, ...newState };
    rootMessenger.publish(
      'AnalyticsController:stateChanged',
      currentAnalyticsState,
      [],
    );
  };

  const setSignedIn = (signedIn: boolean): void => {
    currentAuthenticationState = {
      ...currentAuthenticationState,
      isSignedIn: signedIn,
    };
    rootMessenger.publish(
      'AuthenticationController:stateChanged',
      currentAuthenticationState,
      [],
    );
  };

  const mocks = {
    invalidateQueries: vi.fn(async () => undefined),
    getMarketingConsent: vi.fn(getConsent),
    putMarketingConsent: vi.fn(
      async (_body: MarketingConsent, _clientType?: ClientType) => putConsent(),
    ),
    getNotificationPreferences: vi.fn(getPreferences),
    putNotificationPreferences: vi.fn(
      async (_preferences: NotificationPreferences, _clientType?: ClientType) =>
        putPreferences(),
    ),
    optInToMarketing: vi.fn(async () => {
      setAnalyticsState(PENDING_OPT_IN);
    }),
    optOutOfMarketing: vi.fn(() => {
      setAnalyticsState(PENDING_OPT_OUT);
    }),
    applyRemoteMarketingConsent: vi.fn(async (optedIn: boolean) => {
      if (
        currentAnalyticsState.marketingConsentSyncPending === true ||
        (currentAnalyticsState.marketingConsentDecisionMade === true &&
          (currentAnalyticsState.optedInToMarketing === true) === optedIn)
      ) {
        return;
      }
      setAnalyticsState(optedIn ? OPTED_IN : OPTED_OUT);
    }),
    clearPendingMarketingConsent: vi.fn((optedIn: boolean) => {
      if (toPendingConsent(currentAnalyticsState) === optedIn) {
        setAnalyticsState({ marketingConsentSyncPending: false });
      }
    }),
  };

  const getPendingConsent = (): boolean | null =>
    toPendingConsent(currentAnalyticsState);

  rootMessenger.registerActionHandler(
    'AnalyticsController:getState',
    () => currentAnalyticsState,
  );
  rootMessenger.registerActionHandler(
    'AnalyticsController:optInToMarketing',
    mocks.optInToMarketing,
  );
  rootMessenger.registerActionHandler(
    'AnalyticsController:optOutOfMarketing',
    mocks.optOutOfMarketing,
  );
  rootMessenger.registerActionHandler(
    'AnalyticsController:applyRemoteMarketingConsent',
    mocks.applyRemoteMarketingConsent,
  );
  rootMessenger.registerActionHandler(
    'AnalyticsController:clearPendingMarketingConsent',
    mocks.clearPendingMarketingConsent,
  );
  rootMessenger.registerActionHandler(
    'AuthenticationController:getState',
    () => currentAuthenticationState,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:getState',
    () => keyringState,
  );
  rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:invalidateQueries',
    mocks.invalidateQueries,
  );
  rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:getMarketingConsent',
    mocks.getMarketingConsent,
  );
  rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:putMarketingConsent',
    mocks.putMarketingConsent,
  );
  rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:getNotificationPreferences',
    mocks.getNotificationPreferences,
  );
  rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:putNotificationPreferences',
    mocks.putNotificationPreferences,
  );

  const messenger: MarketingConsentSyncServiceMessenger = new Messenger({
    namespace: 'MarketingConsentSyncService',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    actions: [...DELEGATED_ACTIONS],
    events: [...DELEGATED_EVENTS],
  });

  const service = new MarketingConsentSyncService({ messenger, clientType });
  if (initialize) {
    service.initialize();
  }

  return {
    service,
    rootMessenger,
    mocks,
    setAnalyticsState,
    getPendingConsent,
    setSignedIn,
  };
}

/**
 * Lists the consent values written to AUS, in order.
 *
 * @param putMarketingConsent - The putMarketingConsent mock.
 * @returns The written consent values.
 */
function writtenConsents(
  putMarketingConsent: Mock<
    (consent: MarketingConsent, clientType?: ClientType) => Promise<void>
  >,
): boolean[] {
  return putMarketingConsent.mock.calls.map(
    ([body]) => body.marketingConsentEnabled,
  );
}

/**
 * Builds a state listener that runs an action once, the first time a
 * condition holds.
 *
 * @param condition - Checked against each published state.
 * @param action - Runs once, the first time the condition holds.
 * @returns The listener.
 */
function onceWhen<State>(
  condition: (state: State) => boolean,
  action: () => void,
): (state: State) => void {
  let done = false;
  return (state) => {
    if (!done && condition(state)) {
      done = true;
      action();
    }
  };
}

describe('MarketingConsentSyncService', () => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  describe('initialize', () => {
    it('can be constructed before the controllers it reads are registered', () => {
      const rootMessenger: RootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });
      const messenger: MarketingConsentSyncServiceMessenger = new Messenger({
        namespace: 'MarketingConsentSyncService',
        parent: rootMessenger,
      });
      rootMessenger.delegate({
        messenger,
        actions: [...DELEGATED_ACTIONS],
        events: [...DELEGATED_EVENTS],
      });

      expect(
        () =>
          new MarketingConsentSyncService({
            messenger,
            clientType: 'extension',
          }),
      ).not.toThrow();
    });

    it('does not sync until initialize is called', async () => {
      const { service, mocks, setSignedIn } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: true },
        initialize: false,
      });
      setSignedIn(false);
      setSignedIn(true);
      service.refresh();
      await flushPromises();
      expect(mocks.getMarketingConsent).not.toHaveBeenCalled();

      service.initialize();
      await flushPromises();

      expect(mocks.getMarketingConsent).toHaveBeenCalledTimes(1);
    });

    it('saves a choice made before initialize once it is called', async () => {
      const { getPendingConsent, service, mocks } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
        initialize: false,
      });

      expect(await service.setMarketingConsent(true)).toBeUndefined();
      expect(mocks.optInToMarketing).toHaveBeenCalled();
      expect(getPendingConsent()).toBe(true);
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();

      service.initialize();
      await flushPromises();

      expect(writtenConsents(mocks.putMarketingConsent)).toStrictEqual([true]);
      expect(getPendingConsent()).toBeNull();
    });

    it('does nothing when called again', async () => {
      const { service, mocks } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: true },
      });
      await flushPromises();

      service.initialize();
      await flushPromises();

      expect(mocks.getMarketingConsent).toHaveBeenCalledTimes(1);
    });
  });

  describe('constructor', () => {
    it('sets the service name', () => {
      const { service } = setup();

      expect(service.name).toBe('MarketingConsentSyncService');
    });

    it('writes a persisted local change instead of applying stale AUS consent', async () => {
      const { getPendingConsent, mocks } = setup({
        analyticsState: PENDING_OPT_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: true },
      });
      await flushPromises();

      expect(mocks.applyRemoteMarketingConsent).not.toHaveBeenCalled();
      expect(mocks.getMarketingConsent).not.toHaveBeenCalled();
      expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
        { marketingConsentEnabled: false },
        'extension',
      );
      expect(getPendingConsent()).toBeNull();
    });

    it('passes the client type to AUS writes', async () => {
      const { mocks } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: null,
        getPreferences: async () => NOTIFICATION_PREFERENCES,
        clientType: 'mobile',
      });
      await flushPromises();

      expect(mocks.putNotificationPreferences).toHaveBeenCalledWith(
        expect.any(Object),
        'mobile',
      );
      expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
        { marketingConsentEnabled: false },
        'mobile',
      );
    });
  });

  describe('sign-in', () => {
    it('uploads the first local decision made after sign-in', async () => {
      const { mocks, setAnalyticsState, setSignedIn } = setup();

      expect(mocks.getMarketingConsent).not.toHaveBeenCalled();

      setSignedIn(true);
      await flushPromises();
      expect(mocks.getMarketingConsent).toHaveBeenCalledTimes(1);
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();

      setAnalyticsState(PENDING_OPT_OUT);
      await flushPromises();

      expect(mocks.getMarketingConsent).toHaveBeenCalledTimes(1);
      expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
        { marketingConsentEnabled: false },
        'extension',
      );
    });

    it.each([[true], [false]])(
      'applies AUS consent %s to AnalyticsController without writing it back',
      async (marketingConsentEnabled) => {
        const { mocks, rootMessenger, getPendingConsent } = setup({
          analyticsState: {
            optedInToMarketing: !marketingConsentEnabled,
            marketingConsentDecisionMade: true,
          },
          isSignedIn: true,
          remoteConsent: { marketingConsentEnabled },
        });
        await flushPromises();

        expect(mocks.applyRemoteMarketingConsent).toHaveBeenCalledWith(
          marketingConsentEnabled,
        );
        expect(
          rootMessenger.call('AnalyticsController:getState').optedInToMarketing,
        ).toBe(marketingConsentEnabled);
        expect(getPendingConsent()).toBeNull();
        expect(mocks.optInToMarketing).not.toHaveBeenCalled();
        expect(mocks.optOutOfMarketing).not.toHaveBeenCalled();
        expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
      },
    );

    it('does not write an applied AUS value back on later syncs', async () => {
      const { service, mocks } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
      });
      await flushPromises();
      expect(mocks.applyRemoteMarketingConsent).toHaveBeenCalledWith(false);

      service.refresh();
      await flushPromises();

      expect(mocks.getMarketingConsent).toHaveBeenCalledTimes(2);
      expect(mocks.applyRemoteMarketingConsent).toHaveBeenCalledTimes(1);
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
    });

    it('writes the local value when AUS has no record', async () => {
      const { getPendingConsent, mocks } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        remoteConsent: null,
      });
      await flushPromises();

      expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
        { marketingConsentEnabled: true },
        'extension',
      );
      expect(mocks.applyRemoteMarketingConsent).not.toHaveBeenCalled();
      expect(getPendingConsent()).toBeNull();
    });

    it('leaves an undecided client undecided when AUS has no record', async () => {
      const { getPendingConsent, mocks } = setup({
        analyticsState: { optedInToMarketing: true },
        isSignedIn: true,
        remoteConsent: null,
      });
      await flushPromises();

      expect(mocks.getMarketingConsent).toHaveBeenCalledTimes(1);
      expect(mocks.applyRemoteMarketingConsent).not.toHaveBeenCalled();
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
      expect(getPendingConsent()).toBeNull();
    });

    it.each([[true], [false]])(
      'adopts AUS consent %s on an undecided client without writing it back',
      async (marketingConsentEnabled) => {
        const { getPendingConsent, mocks, rootMessenger } = setup({
          analyticsState: UNDECIDED,
          isSignedIn: true,
          remoteConsent: { marketingConsentEnabled },
        });
        await flushPromises();

        expect(mocks.applyRemoteMarketingConsent).toHaveBeenCalledTimes(1);
        expect(mocks.applyRemoteMarketingConsent).toHaveBeenCalledWith(
          marketingConsentEnabled,
        );
        expect(
          rootMessenger.call('AnalyticsController:getState'),
        ).toMatchObject({
          optedInToMarketing: marketingConsentEnabled,
          marketingConsentDecisionMade: true,
        });
        expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
        expect(getPendingConsent()).toBeNull();
      },
    );

    it('turns off marketing channels when an undecided client adopts an AUS opt-out', async () => {
      const { mocks } = setup({
        analyticsState: UNDECIDED,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
        getPreferences: async () => NOTIFICATION_PREFERENCES,
      });
      await flushPromises();

      expect(mocks.putNotificationPreferences).toHaveBeenCalledWith(
        {
          ...NOTIFICATION_PREFERENCES,
          marketing: {
            pushNotificationsEnabled: false,
            inAppNotificationsEnabled: false,
          },
        },
        'extension',
      );
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
    });

    it('does not read AUS for an undecided client while locked', async () => {
      const { mocks } = setup({
        analyticsState: UNDECIDED,
        isSignedIn: true,
        isUnlocked: false,
        remoteConsent: { marketingConsentEnabled: true },
      });
      await flushPromises();

      expect(mocks.getMarketingConsent).not.toHaveBeenCalled();
      expect(mocks.applyRemoteMarketingConsent).not.toHaveBeenCalled();
    });

    it.each([
      { localConsent: true, localChoice: PENDING_OPT_IN },
      { localConsent: false, localChoice: PENDING_OPT_OUT },
    ])(
      'uploads a first local decision $localConsent made during the AUS read instead of applying the AUS value',
      async ({ localConsent, localChoice }) => {
        const { getPendingConsent, mocks, rootMessenger, setAnalyticsState } =
          setup({
            analyticsState: UNDECIDED,
            isSignedIn: true,
            remoteConsent: { marketingConsentEnabled: !localConsent },
          });

        setAnalyticsState(localChoice);
        await flushPromises();

        expect(mocks.getMarketingConsent).toHaveBeenCalledTimes(1);
        expect(mocks.applyRemoteMarketingConsent).not.toHaveBeenCalled();
        expect(
          rootMessenger.call('AnalyticsController:getState').optedInToMarketing,
        ).toBe(localConsent);
        expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
          { marketingConsentEnabled: localConsent },
          'extension',
        );
        expect(getPendingConsent()).toBeNull();
      },
    );

    it('applies AUS consent after signing in again', async () => {
      let remoteConsent = { marketingConsentEnabled: false };
      const { mocks, setSignedIn } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        getConsent: async () => remoteConsent,
      });
      await flushPromises();
      vi.clearAllMocks();

      remoteConsent = { marketingConsentEnabled: true };
      setSignedIn(false);
      setSignedIn(false);
      setSignedIn(true);
      await flushPromises();

      expect(mocks.getMarketingConsent).toHaveBeenCalled();
      expect(mocks.applyRemoteMarketingConsent).toHaveBeenCalledWith(true);
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
    });

    it('invalidates cached AUS consent when signing in again', async () => {
      const { mocks, setSignedIn } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: true },
      });
      await flushPromises();
      vi.clearAllMocks();

      setSignedIn(false);
      setSignedIn(true);
      await flushPromises();

      expect(mocks.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['AuthenticatedUserStorageService:getMarketingConsent'],
      });
      expect(mocks.getMarketingConsent).toHaveBeenCalled();
    });

    it('does not apply AUS consent from a read started before a sign-out', async () => {
      const firstRead = createDeferred<RemoteConsent>();
      const { mocks, setSignedIn } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        getConsent: vi
          .fn<() => Promise<RemoteConsent>>()
          .mockReturnValueOnce(firstRead.promise)
          .mockResolvedValue({ marketingConsentEnabled: true }),
      });
      await flushPromises();
      expect(mocks.getMarketingConsent).toHaveBeenCalledTimes(1);

      setSignedIn(false);
      setSignedIn(true);
      firstRead.resolve({ marketingConsentEnabled: false });
      await flushPromises();
      await flushPromises();

      expect(mocks.applyRemoteMarketingConsent).not.toHaveBeenCalled();
      expect(mocks.getMarketingConsent).toHaveBeenCalledTimes(2);
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
    });

    it('leaves local state unchanged when the AUS read fails', async () => {
      const { mocks } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        getConsent: async () => {
          throw new Error('AUS unavailable');
        },
      });
      await flushPromises();

      expect(mocks.applyRemoteMarketingConsent).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to synchronize marketing consent with AUS:',
        expect.any(Error),
      );
    });
  });

  describe('local consent changes', () => {
    it('writes a change made after a run has flushed its last change', async () => {
      const { getPendingConsent, rootMessenger, mocks, setAnalyticsState } =
        setup({
          analyticsState: OPTED_OUT,
          isSignedIn: true,
          remoteConsent: { marketingConsentEnabled: false },
        });
      await flushPromises();
      vi.clearAllMocks();
      // Opt out again the moment the opt-in is confirmed (the first update
      // clearing the flag), after the run has checked for newer changes and
      // before it finishes.
      rootMessenger.subscribe(
        'AnalyticsController:stateChanged',
        onceWhen(
          (state) => state.marketingConsentSyncPending === false,
          () => queueMicrotask(() => setAnalyticsState(PENDING_OPT_OUT)),
        ),
      );

      setAnalyticsState(PENDING_OPT_IN);
      await flushPromises();

      expect(writtenConsents(mocks.putMarketingConsent)).toStrictEqual([
        true,
        false,
      ]);
      expect(getPendingConsent()).toBeNull();
    });

    it('keeps a local change pending until AUS confirms it', async () => {
      const put = createDeferred<void>();
      const { getPendingConsent, mocks, setAnalyticsState } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: true },
      });
      await flushPromises();
      mocks.putMarketingConsent.mockImplementation(async () => put.promise);

      setAnalyticsState(PENDING_OPT_OUT);
      await flushPromises();

      expect(getPendingConsent()).toBe(false);
      expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
        { marketingConsentEnabled: false },
        'extension',
      );

      put.resolve();
      await flushPromises();

      expect(getPendingConsent()).toBeNull();
    });

    it('keeps the pending change when the AUS write fails', async () => {
      const { getPendingConsent, setAnalyticsState } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: true },
        putConsent: async () => {
          throw new Error('AUS unavailable');
        },
      });
      await flushPromises();

      setAnalyticsState(PENDING_OPT_OUT);
      await flushPromises();

      expect(getPendingConsent()).toBe(false);
    });

    it('writes subsequent local consent changes to AUS', async () => {
      const { mocks, setAnalyticsState } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
      });
      await flushPromises();
      vi.clearAllMocks();

      setAnalyticsState(PENDING_OPT_IN);
      await flushPromises();

      expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
        { marketingConsentEnabled: true },
        'extension',
      );
    });

    it('ignores analytics changes that do not affect marketing consent', async () => {
      const { getPendingConsent, mocks, setAnalyticsState } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
      });
      await flushPromises();
      vi.clearAllMocks();

      setAnalyticsState({ optedIn: true });
      await flushPromises();

      expect(getPendingConsent()).toBeNull();
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
    });

    it('does not retry a failed write on unrelated analytics updates', async () => {
      const { getPendingConsent, mocks, setAnalyticsState } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: true },
      });
      await flushPromises();
      mocks.putMarketingConsent.mockRejectedValueOnce(
        new Error('AUS unavailable'),
      );
      setAnalyticsState(PENDING_OPT_OUT);
      await flushPromises();
      vi.clearAllMocks();

      // e.g. the event queue changing on every tracked event.
      setAnalyticsState({ eventQueue: {} });
      setAnalyticsState({ eventQueue: {} });
      await flushPromises();

      expect(getPendingConsent()).toBe(false);
      expect(mocks.getMarketingConsent).not.toHaveBeenCalled();
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
    });

    it('drops a pending change when the consent decision is reset', async () => {
      const { getPendingConsent, mocks, setAnalyticsState, setSignedIn } =
        setup({
          analyticsState: PENDING_OPT_OUT,
          remoteConsent: { marketingConsentEnabled: true },
        });

      // e.g. AnalyticsController:resetMarketingConsentDecision.
      setAnalyticsState(UNDECIDED);
      setSignedIn(true);
      await flushPromises();

      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
      expect(mocks.applyRemoteMarketingConsent).toHaveBeenCalledWith(true);
      expect(getPendingConsent()).toBeNull();
    });

    it('coalesces consent changes while an AUS write is pending', async () => {
      const firstWrite = createDeferred<void>();
      const { getPendingConsent, mocks, setAnalyticsState } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
      });
      await flushPromises();
      mocks.putMarketingConsent
        .mockImplementationOnce(async () => firstWrite.promise)
        .mockImplementation(async () => undefined);

      setAnalyticsState(PENDING_OPT_IN);
      await flushPromises();
      setAnalyticsState(PENDING_OPT_OUT);
      await flushPromises();
      firstWrite.resolve();
      await flushPromises();

      expect(writtenConsents(mocks.putMarketingConsent)).toStrictEqual([
        true,
        false,
      ]);
      expect(getPendingConsent()).toBeNull();
    });

    it('does not restore an older failed write over a newer opt-out', async () => {
      const firstWrite = createDeferred<void>();
      const { getPendingConsent, mocks, setAnalyticsState } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
      });
      await flushPromises();
      mocks.putMarketingConsent
        .mockImplementationOnce(async () => firstWrite.promise)
        .mockImplementation(async () => undefined);

      setAnalyticsState(PENDING_OPT_IN);
      setAnalyticsState(PENDING_OPT_OUT);
      firstWrite.reject(new Error('failed true write'));
      await flushPromises();

      expect(mocks.putMarketingConsent).toHaveBeenCalledTimes(1);
      expect(getPendingConsent()).toBe(false);
    });

    it('stops flushing a newer change when the wallet locks during a write', async () => {
      const firstWrite = createDeferred<void>();
      const { getPendingConsent, mocks, rootMessenger, setAnalyticsState } =
        setup({
          analyticsState: OPTED_OUT,
          isSignedIn: true,
          remoteConsent: { marketingConsentEnabled: false },
        });
      await flushPromises();
      mocks.putMarketingConsent
        .mockImplementationOnce(async () => firstWrite.promise)
        .mockImplementation(async () => undefined);

      setAnalyticsState(PENDING_OPT_IN);
      setAnalyticsState(PENDING_OPT_OUT);
      rootMessenger.publish('KeyringController:lock');
      firstWrite.resolve();
      await flushPromises();

      expect(writtenConsents(mocks.putMarketingConsent)).toStrictEqual([true]);
      expect(getPendingConsent()).toBe(false);

      rootMessenger.publish('KeyringController:unlock');
      await flushPromises();

      expect(writtenConsents(mocks.putMarketingConsent)).toStrictEqual([
        true,
        false,
      ]);
      expect(getPendingConsent()).toBeNull();
    });

    it('does not start a local AUS write until an in-flight initial read completes', async () => {
      const read = createDeferred<RemoteConsent>();
      const { mocks, setAnalyticsState } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        getConsent: async () => read.promise,
      });

      setAnalyticsState(PENDING_OPT_IN);
      await flushPromises();
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();

      read.resolve({ marketingConsentEnabled: false });
      await flushPromises();

      expect(mocks.applyRemoteMarketingConsent).not.toHaveBeenCalled();
      expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
        { marketingConsentEnabled: true },
        'extension',
      );
    });

    it('uploads the latest choice after a same-profile sign-out while a write fails', async () => {
      const oldWrite = createDeferred<void>();
      const { mocks, setAnalyticsState, setSignedIn } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
      });
      await flushPromises();
      mocks.putMarketingConsent
        .mockImplementationOnce(async () => oldWrite.promise)
        .mockImplementation(async () => undefined);

      setAnalyticsState(PENDING_OPT_IN);
      await flushPromises();
      setSignedIn(false);
      setAnalyticsState(PENDING_OPT_OUT);
      oldWrite.reject(new Error('old profile unavailable'));
      await flushPromises();
      setSignedIn(true);
      await flushPromises();

      expect(mocks.putMarketingConsent.mock.calls).toStrictEqual([
        [{ marketingConsentEnabled: true }, 'extension'],
        [{ marketingConsentEnabled: false }, 'extension'],
      ]);
    });

    it('uploads a local choice made while signed out to the same profile', async () => {
      let remoteConsent = { marketingConsentEnabled: true };
      const { mocks, setAnalyticsState, setSignedIn } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        getConsent: async () => remoteConsent,
        putConsent: async () => {
          remoteConsent = { marketingConsentEnabled: false };
        },
      });
      await flushPromises();

      setSignedIn(false);
      setAnalyticsState(PENDING_OPT_OUT);
      setSignedIn(true);
      await flushPromises();

      expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
        { marketingConsentEnabled: false },
        'extension',
      );
      expect(mocks.applyRemoteMarketingConsent).not.toHaveBeenCalled();
    });

    it('uploads a choice toggled off and back on while signed out', async () => {
      let remoteConsent = { marketingConsentEnabled: true };
      const { mocks, setAnalyticsState, setSignedIn } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        getConsent: async () => remoteConsent,
        putConsent: async () => {
          remoteConsent = { marketingConsentEnabled: true };
        },
      });
      await flushPromises();

      setSignedIn(false);
      setAnalyticsState(PENDING_OPT_OUT);
      setAnalyticsState(PENDING_OPT_IN);
      remoteConsent = { marketingConsentEnabled: false };
      setSignedIn(true);
      await flushPromises();

      expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
        { marketingConsentEnabled: true },
        'extension',
      );
      expect(mocks.applyRemoteMarketingConsent).not.toHaveBeenCalled();
    });

    it('uploads the latest first-decision preference made before sign-in', async () => {
      let remoteConsent = { marketingConsentEnabled: true };
      const { mocks, rootMessenger, setAnalyticsState, setSignedIn } = setup({
        analyticsState: UNDECIDED,
        isSignedIn: false,
        getConsent: async () => remoteConsent,
        putConsent: async () => {
          remoteConsent = { marketingConsentEnabled: false };
        },
      });
      await flushPromises();

      setAnalyticsState(PENDING_OPT_IN);
      setAnalyticsState(PENDING_OPT_OUT);
      await flushPromises();

      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();

      setSignedIn(true);
      await flushPromises();

      expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
        { marketingConsentEnabled: false },
        'extension',
      );
      expect(mocks.getMarketingConsent).not.toHaveBeenCalled();

      rootMessenger.publish('KeyringController:lock');
      rootMessenger.publish('KeyringController:unlock');
      await flushPromises();

      expect(mocks.applyRemoteMarketingConsent).not.toHaveBeenCalled();
    });
  });

  describe('lock and unlock', () => {
    it('does not read AUS while the vault is locked and syncs after unlock', async () => {
      // Sign-in and the consent decision persist across restarts, but the
      // vault is still locked at startup and AUS reads need a bearer token.
      const { mocks, rootMessenger } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        isUnlocked: false,
        remoteConsent: { marketingConsentEnabled: false },
      });
      await flushPromises();

      expect(mocks.getMarketingConsent).not.toHaveBeenCalled();
      expect(mocks.applyRemoteMarketingConsent).not.toHaveBeenCalled();

      rootMessenger.publish('KeyringController:unlock');
      await flushPromises();

      expect(mocks.getMarketingConsent).toHaveBeenCalled();
      expect(mocks.applyRemoteMarketingConsent).toHaveBeenCalledWith(false);
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
    });

    it('re-reads AUS on every unlock', async () => {
      let remoteConsent = { marketingConsentEnabled: true };
      const { mocks, rootMessenger } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        getConsent: async () => remoteConsent,
      });
      await flushPromises();

      rootMessenger.publish('KeyringController:lock');
      remoteConsent = { marketingConsentEnabled: false };
      vi.clearAllMocks();
      rootMessenger.publish('KeyringController:unlock');
      await flushPromises();

      expect(mocks.getMarketingConsent).toHaveBeenCalled();
      expect(mocks.applyRemoteMarketingConsent).toHaveBeenCalledWith(false);
    });

    it('does not apply AUS consent read before the wallet locked', async () => {
      const read = createDeferred<RemoteConsent>();
      const { mocks, rootMessenger } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        getConsent: async () => read.promise,
      });
      await flushPromises();

      rootMessenger.publish('KeyringController:lock');
      read.resolve({ marketingConsentEnabled: false });
      await flushPromises();

      expect(mocks.applyRemoteMarketingConsent).not.toHaveBeenCalled();
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('re-reads AUS after an earlier sync in the same session', async () => {
      let remoteConsent = { marketingConsentEnabled: true };
      const { service, mocks } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        getConsent: async () => remoteConsent,
      });
      await flushPromises();
      expect(mocks.getMarketingConsent).toHaveBeenCalled();
      expect(mocks.applyRemoteMarketingConsent).not.toHaveBeenCalled();

      // Another device opted out while this client stayed alive.
      remoteConsent = { marketingConsentEnabled: false };
      vi.clearAllMocks();
      service.refresh();
      await flushPromises();

      expect(mocks.getMarketingConsent).toHaveBeenCalled();
      expect(mocks.applyRemoteMarketingConsent).toHaveBeenCalledWith(false);
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
    });

    it('is exposed as a messenger action', async () => {
      const { mocks, rootMessenger } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: true },
      });
      await flushPromises();
      vi.clearAllMocks();

      rootMessenger.call('MarketingConsentSyncService:refresh');
      await flushPromises();

      expect(mocks.getMarketingConsent).toHaveBeenCalled();
    });

    it('defers a refresh until an in-flight AUS write lands', async () => {
      const put = createDeferred<void>();
      const { service, mocks, setAnalyticsState } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
        putConsent: async () => put.promise,
      });
      await flushPromises();

      setAnalyticsState(PENDING_OPT_IN);
      await flushPromises();
      vi.clearAllMocks();

      service.refresh();
      await flushPromises();
      expect(mocks.getMarketingConsent).not.toHaveBeenCalled();

      put.resolve();
      await flushPromises();
      expect(mocks.getMarketingConsent).toHaveBeenCalled();
    });
  });

  describe('setMarketingConsent', () => {
    it('resolves a call overtaken by a consent change from other code, without reverting', async () => {
      const put = createDeferred<void>();
      const { getPendingConsent, service, mocks, setAnalyticsState } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
      });
      await flushPromises();
      vi.clearAllMocks();
      mocks.putMarketingConsent.mockReturnValueOnce(put.promise);

      const saving = service.setMarketingConsent(true);
      await flushPromises();
      // Other code opts out through AnalyticsController while "on" is saving.
      setAnalyticsState(PENDING_OPT_OUT);
      put.resolve();

      expect(await saving).toBeUndefined();
      expect(writtenConsents(mocks.putMarketingConsent)).toStrictEqual([
        true,
        false,
      ]);
      expect(mocks.getMarketingConsent).not.toHaveBeenCalled();
      expect(getPendingConsent()).toBeNull();
    });

    it('resolves a call overtaken by a newer one, without reverting', async () => {
      const { getPendingConsent, service, mocks } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
      });
      await flushPromises();
      vi.clearAllMocks();

      const first = service.setMarketingConsent(true);
      const second = service.setMarketingConsent(false);

      expect(await first).toBeUndefined();
      expect(await second).toBeUndefined();
      expect(writtenConsents(mocks.putMarketingConsent).at(-1)).toBe(false);
      expect(mocks.getMarketingConsent).not.toHaveBeenCalled();
      expect(getPendingConsent()).toBeNull();
    });

    it('saves an opt-in to AUS', async () => {
      const { getPendingConsent, service, mocks } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
      });
      await flushPromises();
      vi.clearAllMocks();

      expect(await service.setMarketingConsent(true)).toBeUndefined();

      expect(mocks.optInToMarketing).toHaveBeenCalledTimes(1);
      expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
        { marketingConsentEnabled: true },
        'extension',
      );
      expect(mocks.getNotificationPreferences).not.toHaveBeenCalled();
      expect(getPendingConsent()).toBeNull();
    });

    it('turns off marketing channels before saving an opt-out', async () => {
      const order: string[] = [];
      const { getPendingConsent, service, mocks, setAnalyticsState } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: true },
      });
      await flushPromises();
      mocks.optOutOfMarketing.mockImplementation(() => {
        order.push('optOut');
        setAnalyticsState(PENDING_OPT_OUT);
      });
      mocks.getNotificationPreferences.mockImplementation(async () => {
        order.push('getPreferences');
        return NOTIFICATION_PREFERENCES;
      });
      mocks.putNotificationPreferences.mockImplementation(async () => {
        order.push('putPreferences');
      });
      mocks.putMarketingConsent.mockImplementation(async () => {
        order.push('putConsent');
      });

      expect(await service.setMarketingConsent(false)).toBeUndefined();

      expect(order).toStrictEqual([
        'optOut',
        'getPreferences',
        'putPreferences',
        'getPreferences',
        'putConsent',
      ]);
      expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
        { marketingConsentEnabled: false },
        'extension',
      );
      expect(getPendingConsent()).toBeNull();
    });

    it('waits for the consent write before resolving', async () => {
      const put = createDeferred<void>();
      const { service } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
        putConsent: async () => put.promise,
      });
      await flushPromises();

      const onSaved = vi.fn();
      const saving = service.setMarketingConsent(true).then(onSaved);
      await flushPromises();
      expect(onSaved).not.toHaveBeenCalled();

      put.resolve();
      await saving;
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it('resolves without re-reading AUS when opt-in follow-up work outlasts the write', async () => {
      const optInWork = createDeferred<void>();
      const { service, mocks, setAnalyticsState } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
      });
      await flushPromises();
      vi.clearAllMocks();
      // e.g. AnalyticsController resolving geolocation after updating state.
      mocks.optInToMarketing.mockImplementation(async () => {
        setAnalyticsState(PENDING_OPT_IN);
        await optInWork.promise;
      });
      mocks.getMarketingConsent.mockRejectedValue(new Error('AUS unavailable'));

      const saving = service.setMarketingConsent(true);
      await flushPromises();
      expect(writtenConsents(mocks.putMarketingConsent)).toStrictEqual([true]);

      optInWork.resolve();

      expect(await saving).toBeUndefined();
      expect(mocks.getMarketingConsent).not.toHaveBeenCalled();
    });

    it('applies the change locally and resolves without waiting when signed out', async () => {
      const { getPendingConsent, service, mocks } = setup({
        analyticsState: OPTED_IN,
      });

      expect(await service.setMarketingConsent(false)).toBeUndefined();

      expect(mocks.optOutOfMarketing).toHaveBeenCalledTimes(1);
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
      expect(getPendingConsent()).toBe(false);
    });

    it('applies the change locally and resolves without waiting when locked', async () => {
      const { getPendingConsent, service, mocks } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        isUnlocked: false,
      });

      expect(await service.setMarketingConsent(true)).toBeUndefined();

      expect(mocks.optInToMarketing).toHaveBeenCalledTimes(1);
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
      expect(getPendingConsent()).toBe(true);
    });

    it('rejects and applies the AUS value locally when the write fails', async () => {
      const { getPendingConsent, service, mocks, rootMessenger } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
      });
      await flushPromises();
      vi.clearAllMocks();
      mocks.putMarketingConsent.mockImplementation(async () => {
        throw new Error('AUS unavailable');
      });

      await expect(service.setMarketingConsent(true)).rejects.toThrow(
        'AUS unavailable',
      );

      expect(mocks.getMarketingConsent).toHaveBeenCalledTimes(1);
      expect(mocks.applyRemoteMarketingConsent).toHaveBeenCalledTimes(1);
      expect(
        rootMessenger.call('AnalyticsController:getState').optedInToMarketing,
      ).toBe(false);
      expect(getPendingConsent()).toBeNull();

      await flushPromises();
      expect(writtenConsents(mocks.putMarketingConsent)).toStrictEqual([true]);
    });

    it('saves the choice again after a failed attempt', async () => {
      const { getPendingConsent, service, mocks } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
      });
      await flushPromises();
      mocks.putMarketingConsent
        .mockImplementationOnce(async () => {
          throw new Error('AUS unavailable');
        })
        .mockImplementation(async () => undefined);

      await expect(service.setMarketingConsent(true)).rejects.toThrow(
        'AUS unavailable',
      );
      expect(await service.setMarketingConsent(true)).toBeUndefined();

      expect(writtenConsents(mocks.putMarketingConsent)).toStrictEqual([
        true,
        true,
      ]);
      expect(getPendingConsent()).toBeNull();
    });

    it('resolves a failed save overtaken by a consent change from other code, and saves the newer change on the next trigger', async () => {
      const firstWrite = createDeferred<void>();
      const { getPendingConsent, service, mocks, setAnalyticsState } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
      });
      await flushPromises();
      vi.clearAllMocks();
      mocks.putMarketingConsent
        .mockImplementationOnce(async () => firstWrite.promise)
        .mockImplementation(async () => undefined);

      const saving = service.setMarketingConsent(true);
      await flushPromises();
      setAnalyticsState(PENDING_OPT_OUT);
      expect(getPendingConsent()).toBe(false);
      firstWrite.reject(new Error('AUS unavailable'));

      expect(await saving).toBeUndefined();
      await flushPromises();

      // The failed run doesn't retry on its own; the newer change waits.
      expect(mocks.getMarketingConsent).not.toHaveBeenCalled();
      expect(writtenConsents(mocks.putMarketingConsent)).toStrictEqual([true]);
      expect(getPendingConsent()).toBe(false);

      service.refresh();
      await flushPromises();

      expect(writtenConsents(mocks.putMarketingConsent)).toStrictEqual([
        true,
        false,
      ]);
      expect(getPendingConsent()).toBeNull();
    });

    it('logs a failed AUS re-read, rethrows the save error and reconciles on the next refresh', async () => {
      const { getPendingConsent, service, mocks, rootMessenger } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
      });
      await flushPromises();
      vi.clearAllMocks();
      mocks.putMarketingConsent.mockImplementation(async () => {
        throw new Error('AUS unavailable');
      });
      mocks.getMarketingConsent.mockImplementationOnce(async () => {
        throw new Error('AUS read failed');
      });

      await expect(service.setMarketingConsent(true)).rejects.toThrow(
        'AUS unavailable',
      );

      expect(consoleError).toHaveBeenCalledWith(
        'Failed to re-read marketing consent from AUS:',
        expect.objectContaining({ message: 'AUS read failed' }),
      );
      expect(getPendingConsent()).toBeNull();
      expect(
        rootMessenger.call('AnalyticsController:getState').optedInToMarketing,
      ).toBe(true);

      service.refresh();
      await flushPromises();

      expect(mocks.applyRemoteMarketingConsent).toHaveBeenCalledTimes(1);
      expect(
        rootMessenger.call('AnalyticsController:getState').optedInToMarketing,
      ).toBe(false);
      expect(writtenConsents(mocks.putMarketingConsent)).toStrictEqual([true]);
    });

    it('rejects when the session ends during the wait, even if AUS saved the change', async () => {
      const put = createDeferred<void>();
      const { getPendingConsent, service, mocks, setSignedIn } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
        putConsent: async () => put.promise,
      });
      await flushPromises();
      vi.clearAllMocks();

      const saving = service.setMarketingConsent(true);
      await flushPromises();
      setSignedIn(false);
      put.resolve();

      await expect(saving).rejects.toThrow(
        'Marketing consent was not saved to AUS',
      );
      expect(getPendingConsent()).toBeNull();
      expect(mocks.getMarketingConsent).not.toHaveBeenCalled();
      expect(mocks.applyRemoteMarketingConsent).not.toHaveBeenCalled();
    });

    it('keeps an unsaved change pending when the session ends during the wait, and saves it at the next sign-in', async () => {
      const put = createDeferred<void>();
      const { getPendingConsent, service, mocks, setSignedIn } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
        putConsent: vi
          .fn<() => Promise<void>>()
          .mockReturnValueOnce(put.promise)
          .mockResolvedValue(undefined),
      });
      await flushPromises();
      vi.clearAllMocks();

      const saving = service.setMarketingConsent(true);
      await flushPromises();
      setSignedIn(false);
      put.reject(new Error('AUS unavailable'));

      await expect(saving).rejects.toThrow(
        'Marketing consent was not saved to AUS',
      );
      expect(getPendingConsent()).toBe(true);
      expect(mocks.applyRemoteMarketingConsent).not.toHaveBeenCalled();

      setSignedIn(true);
      await flushPromises();

      expect(writtenConsents(mocks.putMarketingConsent)).toStrictEqual([
        true,
        true,
      ]);
      expect(getPendingConsent()).toBeNull();
    });

    it('writes an unchanged value to AUS so it wins over a differing AUS value', async () => {
      const read = createDeferred<RemoteConsent>();
      const { getPendingConsent, service, mocks } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        getConsent: async () => read.promise,
      });
      await flushPromises();

      const saving = service.setMarketingConsent(true);
      read.resolve({ marketingConsentEnabled: false });

      expect(await saving).toBeUndefined();
      expect(mocks.applyRemoteMarketingConsent).not.toHaveBeenCalled();
      expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
        { marketingConsentEnabled: true },
        'extension',
      );
      expect(getPendingConsent()).toBeNull();
    });

    it('keeps waiting when an older session run hands off to a new run', async () => {
      const firstRead = createDeferred<RemoteConsent>();
      const { service, mocks, setSignedIn } = setup({
        analyticsState: OPTED_IN,
        isSignedIn: true,
        getConsent: vi
          .fn<() => Promise<RemoteConsent>>()
          .mockReturnValueOnce(firstRead.promise)
          .mockResolvedValue(null),
      });
      await flushPromises();

      setSignedIn(false);
      setSignedIn(true);
      const saving = service.setMarketingConsent(true);
      firstRead.resolve(null);

      expect(await saving).toBeUndefined();
      // The older session's run stops before writing; the new one writes the
      // pending change without reading AUS first.
      expect(mocks.getMarketingConsent).toHaveBeenCalledTimes(1);
      expect(writtenConsents(mocks.putMarketingConsent)).toStrictEqual([true]);
    });

    it('is exposed as a messenger action', async () => {
      const { getPendingConsent, mocks, rootMessenger } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
      });
      await flushPromises();

      expect(
        await rootMessenger.call(
          'MarketingConsentSyncService:setMarketingConsent',
          true,
        ),
      ).toBeUndefined();
      expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
        { marketingConsentEnabled: true },
        'extension',
      );
      expect(getPendingConsent()).toBeNull();
    });
  });

  describe('Updates and rewards notifications', () => {
    const signedInOptedIn = {
      analyticsState: OPTED_IN,
      isSignedIn: true,
      remoteConsent: { marketingConsentEnabled: true },
    };

    it('turns off both marketing channels before saving a local opt-out', async () => {
      const order: string[] = [];
      const { mocks, setAnalyticsState } = setup({
        ...signedInOptedIn,
        getPreferences: async () => NOTIFICATION_PREFERENCES,
      });
      await flushPromises();
      vi.clearAllMocks();
      mocks.invalidateQueries.mockImplementation(async () => {
        order.push('invalidate');
      });
      mocks.getNotificationPreferences.mockImplementation(async () => {
        order.push('getPreferences');
        return NOTIFICATION_PREFERENCES;
      });
      mocks.putNotificationPreferences.mockImplementation(async () => {
        order.push('putPreferences');
      });
      mocks.putMarketingConsent.mockImplementation(async () => {
        order.push('putConsent');
      });

      setAnalyticsState(PENDING_OPT_OUT);
      await flushPromises();

      expect(order).toStrictEqual([
        'invalidate',
        'getPreferences',
        'putPreferences',
        'getPreferences',
        'putConsent',
      ]);
      expect(mocks.invalidateQueries).toHaveBeenCalledWith({
        queryKey: [
          'AuthenticatedUserStorageService:getNotificationPreferences',
        ],
      });
      expect(mocks.putNotificationPreferences).toHaveBeenCalledWith(
        {
          ...NOTIFICATION_PREFERENCES,
          marketing: {
            pushNotificationsEnabled: false,
            inAppNotificationsEnabled: false,
          },
        },
        'extension',
      );
    });

    it('stops an opt-out when the session changes during the preferences read', async () => {
      const firstRead = createDeferred<NotificationPreferences>();
      const order: string[] = [];
      const { mocks, setAnalyticsState, setSignedIn } = setup({
        ...signedInOptedIn,
        getPreferences: async () => NOTIFICATION_PREFERENCES,
      });
      await flushPromises();
      vi.clearAllMocks();
      let reads = 0;
      mocks.getNotificationPreferences
        .mockImplementation(async () => {
          reads += 1;
          order.push(`getPreferences${reads}`);
          return NOTIFICATION_PREFERENCES;
        })
        .mockImplementationOnce(async () => {
          reads += 1;
          order.push(`getPreferences${reads}`);
          return firstRead.promise;
        });
      mocks.putNotificationPreferences.mockImplementation(async () => {
        order.push('putPreferences');
      });
      mocks.putMarketingConsent.mockImplementation(async () => {
        order.push('putConsent');
      });

      setAnalyticsState(PENDING_OPT_OUT);
      await flushPromises();
      setSignedIn(false);
      setSignedIn(true);
      firstRead.resolve(NOTIFICATION_PREFERENCES);
      await flushPromises();
      await flushPromises();

      expect(order).toStrictEqual([
        'getPreferences1',
        'getPreferences2',
        'putPreferences',
        'getPreferences3',
        'putConsent',
      ]);
    });

    it('stops an opt-out when the session changes during the preferences write', async () => {
      const firstWrite = createDeferred<void>();
      const order: string[] = [];
      const { mocks, setAnalyticsState, setSignedIn } = setup({
        ...signedInOptedIn,
        getPreferences: async () => NOTIFICATION_PREFERENCES,
      });
      await flushPromises();
      vi.clearAllMocks();
      let writes = 0;
      mocks.getNotificationPreferences.mockImplementation(async () => {
        order.push('getPreferences');
        return NOTIFICATION_PREFERENCES;
      });
      mocks.putNotificationPreferences
        .mockImplementation(async () => {
          writes += 1;
          order.push(`putPreferences${writes}`);
        })
        .mockImplementationOnce(async () => {
          writes += 1;
          order.push(`putPreferences${writes}`);
          return firstWrite.promise;
        });
      mocks.putMarketingConsent.mockImplementation(async () => {
        order.push('putConsent');
      });

      setAnalyticsState(PENDING_OPT_OUT);
      await flushPromises();
      setSignedIn(false);
      setSignedIn(true);
      firstWrite.resolve();
      await flushPromises();
      await flushPromises();

      expect(order).toStrictEqual([
        'getPreferences',
        'putPreferences1',
        'getPreferences',
        'getPreferences',
        'putPreferences2',
        'getPreferences',
        'putConsent',
      ]);
    });

    it('re-reads preferences after turning channels off', async () => {
      const { mocks, setAnalyticsState } = setup({
        ...signedInOptedIn,
        getPreferences: async () => NOTIFICATION_PREFERENCES,
      });
      await flushPromises();

      setAnalyticsState(PENDING_OPT_OUT);
      await flushPromises();

      expect(mocks.getNotificationPreferences).toHaveBeenCalledTimes(2);
      expect(
        mocks.getNotificationPreferences.mock.invocationCallOrder[1],
      ).toBeGreaterThan(
        mocks.putNotificationPreferences.mock.invocationCallOrder[0],
      );
    });

    it('logs a failed preferences re-read and still saves the opt-out', async () => {
      const { getPendingConsent, mocks, setAnalyticsState } = setup({
        ...signedInOptedIn,
        getPreferences: async () => NOTIFICATION_PREFERENCES,
      });
      await flushPromises();
      mocks.getNotificationPreferences
        .mockImplementationOnce(async () => NOTIFICATION_PREFERENCES)
        .mockImplementationOnce(async () => {
          throw new Error('AUS unavailable');
        });

      setAnalyticsState(PENDING_OPT_OUT);
      await flushPromises();

      expect(consoleError).toHaveBeenCalledWith(
        'Failed to refresh notification preferences:',
        expect.any(Error),
      );
      expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
        { marketingConsentEnabled: false },
        'extension',
      );
      expect(getPendingConsent()).toBeNull();
    });

    it('turns off channels when only one marketing channel is on', async () => {
      const { mocks, setAnalyticsState } = setup({
        ...signedInOptedIn,
        getPreferences: async () => ({
          ...NOTIFICATION_PREFERENCES,
          marketing: {
            pushNotificationsEnabled: false,
            inAppNotificationsEnabled: true,
          },
        }),
      });
      await flushPromises();

      setAnalyticsState(PENDING_OPT_OUT);
      await flushPromises();

      expect(mocks.putNotificationPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          marketing: {
            pushNotificationsEnabled: false,
            inAppNotificationsEnabled: false,
          },
        }),
        'extension',
      );
    });

    it('does not write preferences when both marketing channels are already off', async () => {
      const { mocks, setAnalyticsState } = setup({
        ...signedInOptedIn,
        getPreferences: async () => ({
          ...NOTIFICATION_PREFERENCES,
          marketing: {
            pushNotificationsEnabled: false,
            inAppNotificationsEnabled: false,
          },
        }),
      });
      await flushPromises();

      setAnalyticsState(PENDING_OPT_OUT);
      await flushPromises();

      expect(mocks.putNotificationPreferences).not.toHaveBeenCalled();
      expect(mocks.getNotificationPreferences).toHaveBeenCalledTimes(1);
      expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
        { marketingConsentEnabled: false },
        'extension',
      );
    });

    it('does not write preferences when the profile has none', async () => {
      const { mocks, setAnalyticsState } = setup(signedInOptedIn);
      await flushPromises();

      setAnalyticsState(PENDING_OPT_OUT);
      await flushPromises();

      expect(mocks.getNotificationPreferences).toHaveBeenCalled();
      expect(mocks.putNotificationPreferences).not.toHaveBeenCalled();
      expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
        { marketingConsentEnabled: false },
        'extension',
      );
    });

    it('does not read preferences when saving an opt-in', async () => {
      const { mocks, setAnalyticsState } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
        getPreferences: async () => NOTIFICATION_PREFERENCES,
      });
      await flushPromises();
      vi.clearAllMocks();

      setAnalyticsState(PENDING_OPT_IN);
      await flushPromises();

      expect(mocks.getNotificationPreferences).not.toHaveBeenCalled();
    });

    it('turns off channels after applying an opt-out from AUS', async () => {
      const { mocks } = setup({
        ...signedInOptedIn,
        remoteConsent: { marketingConsentEnabled: false },
        getPreferences: async () => NOTIFICATION_PREFERENCES,
      });
      await flushPromises();

      expect(mocks.applyRemoteMarketingConsent).toHaveBeenCalledWith(false);
      expect(
        mocks.putNotificationPreferences.mock.invocationCallOrder[0],
      ).toBeGreaterThan(
        mocks.applyRemoteMarketingConsent.mock.invocationCallOrder[0],
      );
      expect(mocks.putNotificationPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          marketing: {
            pushNotificationsEnabled: false,
            inAppNotificationsEnabled: false,
          },
        }),
        'extension',
      );
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
    });

    it('turns off channels when AUS consent is off and matches local consent', async () => {
      const { mocks } = setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: { marketingConsentEnabled: false },
        getPreferences: async () => NOTIFICATION_PREFERENCES,
      });
      await flushPromises();

      expect(mocks.applyRemoteMarketingConsent).not.toHaveBeenCalled();
      expect(mocks.putNotificationPreferences).toHaveBeenCalledTimes(1);
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
    });

    it('does not write preferences for an AUS opt-out when channels are already off', async () => {
      const { mocks } = setup({
        ...signedInOptedIn,
        remoteConsent: { marketingConsentEnabled: false },
        getPreferences: async () => ({
          ...NOTIFICATION_PREFERENCES,
          marketing: {
            pushNotificationsEnabled: false,
            inAppNotificationsEnabled: false,
          },
        }),
      });
      await flushPromises();

      expect(mocks.applyRemoteMarketingConsent).toHaveBeenCalledWith(false);
      expect(mocks.getNotificationPreferences).toHaveBeenCalledTimes(1);
      expect(mocks.putNotificationPreferences).not.toHaveBeenCalled();
    });

    it('retries turning channels off on the next refresh when it fails for an AUS opt-out', async () => {
      const { service, mocks } = setup({
        ...signedInOptedIn,
        remoteConsent: { marketingConsentEnabled: false },
        getPreferences: async () => NOTIFICATION_PREFERENCES,
      });
      mocks.putNotificationPreferences
        .mockImplementationOnce(async () => {
          throw new Error('AUS unavailable');
        })
        .mockImplementation(async () => undefined);
      await flushPromises();

      expect(consoleError).toHaveBeenCalledWith(
        'Failed to synchronize marketing consent with AUS:',
        expect.any(Error),
      );

      service.refresh();
      await flushPromises();

      expect(mocks.getMarketingConsent).toHaveBeenCalledTimes(2);
      expect(mocks.putNotificationPreferences).toHaveBeenCalledTimes(2);
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
    });

    it('turns off channels at the next sign-in for an opt-out made while signed out', async () => {
      const { mocks, setAnalyticsState, setSignedIn } = setup({
        ...signedInOptedIn,
        getPreferences: async () => NOTIFICATION_PREFERENCES,
      });
      await flushPromises();

      setSignedIn(false);
      setAnalyticsState(PENDING_OPT_OUT);
      await flushPromises();
      expect(mocks.getNotificationPreferences).not.toHaveBeenCalled();

      setSignedIn(true);
      await flushPromises();

      expect(mocks.putNotificationPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          marketing: {
            pushNotificationsEnabled: false,
            inAppNotificationsEnabled: false,
          },
        }),
        'extension',
      );
      expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
        { marketingConsentEnabled: false },
        'extension',
      );
    });

    it('turns off channels before seeding an opted-out profile', async () => {
      const order: string[] = [];
      setup({
        analyticsState: OPTED_OUT,
        isSignedIn: true,
        remoteConsent: null,
        getPreferences: async () => NOTIFICATION_PREFERENCES,
        putPreferences: async () => {
          order.push('putPreferences');
        },
        putConsent: async () => {
          order.push('putConsent');
        },
      });
      await flushPromises();

      expect(order).toStrictEqual(['putPreferences', 'putConsent']);
    });

    it('keeps the opt-out pending and skips the consent write when the preferences read fails', async () => {
      const { getPendingConsent, mocks, setAnalyticsState } = setup({
        ...signedInOptedIn,
        getPreferences: async () => {
          throw new Error('AUS unavailable');
        },
      });
      await flushPromises();

      setAnalyticsState(PENDING_OPT_OUT);
      await flushPromises();

      expect(consoleError).toHaveBeenCalledWith(
        'Failed to synchronize marketing consent with AUS:',
        expect.any(Error),
      );
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
      expect(getPendingConsent()).toBe(false);
    });

    it('keeps the opt-out pending and skips the consent write when the channel write fails', async () => {
      const { getPendingConsent, service, mocks, setAnalyticsState } = setup({
        ...signedInOptedIn,
        getPreferences: async () => NOTIFICATION_PREFERENCES,
      });
      await flushPromises();
      mocks.putNotificationPreferences
        .mockImplementationOnce(async () => {
          throw new Error('AUS unavailable');
        })
        .mockImplementation(async () => undefined);

      setAnalyticsState(PENDING_OPT_OUT);
      await flushPromises();
      expect(mocks.putMarketingConsent).not.toHaveBeenCalled();
      expect(getPendingConsent()).toBe(false);

      service.refresh();
      await flushPromises();

      expect(mocks.putNotificationPreferences).toHaveBeenCalledTimes(2);
      expect(mocks.putMarketingConsent).toHaveBeenCalledWith(
        { marketingConsentEnabled: false },
        'extension',
      );
      expect(getPendingConsent()).toBeNull();
    });
  });
});
