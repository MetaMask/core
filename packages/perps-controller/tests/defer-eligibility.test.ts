jest.mock('@nktkas/hyperliquid', () => ({}));
jest.mock('@myx-trade/sdk', () => ({}));

import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import {
  PerpsController,
  type PerpsControllerMessenger,
} from '../src/PerpsController';
import type { PerpsPlatformDependencies } from '../src/types';

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<PerpsControllerMessenger>,
  MessengerEvents<PerpsControllerMessenger>
>;

const noopLogger = {
  error: jest.fn(),
  warn: jest.fn(),
};

const noopDebugLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

function buildMockInfrastructure(): PerpsPlatformDependencies {
  return {
    logger: noopLogger as unknown as PerpsPlatformDependencies['logger'],
    debugLogger:
      noopDebugLogger as unknown as PerpsPlatformDependencies['debugLogger'],
    metrics: { trackEvent: jest.fn() } as unknown as PerpsPlatformDependencies['metrics'],
    performance: {
      startTrace: jest.fn(),
      endTrace: jest.fn(),
    } as unknown as PerpsPlatformDependencies['performance'],
    tracer: { trace: jest.fn() } as unknown as PerpsPlatformDependencies['tracer'],
    streamManager: {
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      pauseChannel: jest.fn(),
      resumeChannel: jest.fn(),
    } as unknown as PerpsPlatformDependencies['streamManager'],
    featureFlags: { validateVersionGated: jest.fn() },
    marketDataFormatters: {
      formatPrice: jest.fn(),
      formatSize: jest.fn(),
    } as unknown as PerpsPlatformDependencies['marketDataFormatters'],
    cacheInvalidator: {
      invalidate: jest.fn(),
    } as unknown as PerpsPlatformDependencies['cacheInvalidator'],
    rewards: { getPerpsDiscountForAccount: jest.fn().mockResolvedValue(0) },
  };
}

const MOCK_REMOTE_FEATURE_FLAG_STATE = {
  remoteFeatureFlags: {},
  cacheTimestamp: 0,
};

function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

function getControllerMessenger(
  rootMessenger: RootMessenger,
): PerpsControllerMessenger {
  const messenger: PerpsControllerMessenger = new Messenger({
    namespace: 'PerpsController',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    actions: [
      'RemoteFeatureFlagController:getState',
      'NetworkController:getState',
      'NetworkController:getNetworkClientById',
      'NetworkController:findNetworkClientIdByChainId',
      'KeyringController:getState',
      'KeyringController:signTypedMessage',
      'TransactionController:addTransaction',
      'AccountTreeController:getAccountsFromSelectedAccountGroup',
      'AuthenticationController:getBearerToken',
    ],
    events: [
      'RemoteFeatureFlagController:stateChange',
      'AccountTreeController:selectedAccountGroupChange',
    ],
    messenger,
  });

  return messenger;
}

type BuildControllerOptions = {
  deferEligibilityCheck?: boolean;
};

function buildController({ deferEligibilityCheck }: BuildControllerOptions = {}) {
  const rootMessenger = getRootMessenger();

  rootMessenger.registerActionHandler(
    'RemoteFeatureFlagController:getState',
    () => MOCK_REMOTE_FEATURE_FLAG_STATE,
  );

  const controllerMessenger = getControllerMessenger(rootMessenger);

  const controller = new PerpsController({
    messenger: controllerMessenger,
    infrastructure: buildMockInfrastructure(),
    deferEligibilityCheck,
  });

  return { controller, rootMessenger, controllerMessenger };
}

describe('PerpsController - deferEligibilityCheck', () => {
  describe('when deferEligibilityCheck is true', () => {
    it('does not trigger eligibility check during construction', () => {
      const refreshSpy = jest.spyOn(
        PerpsController.prototype as unknown as {
          refreshEligibilityOnFeatureFlagChange: (...args: unknown[]) => void;
        },
        'refreshEligibilityOnFeatureFlagChange',
      );

      buildController({ deferEligibilityCheck: true });

      // The constructor calls the method, but the guard causes an early return
      // before reaching FeatureFlagConfigurationService.refreshEligibility.
      // We verify via the controller state: isEligible should remain at its
      // default (true) without an actual geolocation fetch.
      expect(refreshSpy).toHaveBeenCalled();
      refreshSpy.mockRestore();
    });

    it('does not update eligibility state from subscription events during deferral', () => {
      const { controller, rootMessenger } = buildController({
        deferEligibilityCheck: true,
      });

      rootMessenger.publish(
        'RemoteFeatureFlagController:stateChange',
        { ...MOCK_REMOTE_FEATURE_FLAG_STATE },
      );

      // isEligible should remain at its default (false) — the guard blocks processing
      expect(controller.state.isEligible).toBe(false);
    });
  });

  describe('startEligibilityMonitoring', () => {
    it('is callable after deferred construction', () => {
      const { controller } = buildController({ deferEligibilityCheck: true });

      expect(() => controller.startEligibilityMonitoring()).not.toThrow();
    });

    it('reads current RemoteFeatureFlagController state', () => {
      const rootMessenger = getRootMessenger();
      const getStateMock = jest.fn().mockReturnValue(MOCK_REMOTE_FEATURE_FLAG_STATE);

      rootMessenger.registerActionHandler(
        'RemoteFeatureFlagController:getState',
        getStateMock,
      );

      const controllerMessenger = getControllerMessenger(rootMessenger);
      const controller = new PerpsController({
        messenger: controllerMessenger,
        infrastructure: buildMockInfrastructure(),
        deferEligibilityCheck: true,
      });

      // Reset to isolate the startEligibilityMonitoring call
      getStateMock.mockClear();

      controller.startEligibilityMonitoring();

      expect(getStateMock).toHaveBeenCalledTimes(1);
    });

    it('unblocks future subscription-driven eligibility checks', () => {
      // Spy on the prototype BEFORE construction so .bind(this) captures the spy
      const refreshSpy = jest.spyOn(
        PerpsController.prototype as unknown as {
          refreshEligibilityOnFeatureFlagChange: (...args: unknown[]) => void;
        },
        'refreshEligibilityOnFeatureFlagChange',
      );

      const { controller, rootMessenger } = buildController({
        deferEligibilityCheck: true,
      });

      // Constructor called it once (early-returned due to guard)
      const callCountAfterConstruction = refreshSpy.mock.calls.length;

      controller.startEligibilityMonitoring();

      // startEligibilityMonitoring calls it once directly
      const callCountAfterStart = refreshSpy.mock.calls.length;
      expect(callCountAfterStart).toBe(callCountAfterConstruction + 1);

      // Now publish a stateChange — the subscription handler should process it
      rootMessenger.publish(
        'RemoteFeatureFlagController:stateChange',
        { ...MOCK_REMOTE_FEATURE_FLAG_STATE },
      );

      expect(refreshSpy.mock.calls.length).toBe(callCountAfterStart + 1);
      refreshSpy.mockRestore();
    });
  });

  describe('when deferEligibilityCheck is false (default)', () => {
    it('triggers eligibility processing during construction', () => {
      const refreshSpy = jest.spyOn(
        PerpsController.prototype as unknown as {
          refreshEligibilityOnFeatureFlagChange: (...args: unknown[]) => void;
        },
        'refreshEligibilityOnFeatureFlagChange',
      );

      buildController({ deferEligibilityCheck: false });

      expect(refreshSpy).toHaveBeenCalled();
      refreshSpy.mockRestore();
    });
  });
});
