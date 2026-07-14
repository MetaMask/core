import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import { PerpsController } from '../src/PerpsController';
import type { PerpsControllerMessenger } from '../src/PerpsController';
import type { PerpsPlatformDependencies } from '../src/types';

jest.mock('@nktkas/hyperliquid', () => ({}));
jest.mock('@myx-trade/sdk', () => ({}));

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
    metrics: {
      trackEvent: jest.fn(),
    } as unknown as PerpsPlatformDependencies['metrics'],
    performance: {
      startTrace: jest.fn(),
      endTrace: jest.fn(),
    } as unknown as PerpsPlatformDependencies['performance'],
    tracer: {
      trace: jest.fn(),
    } as unknown as PerpsPlatformDependencies['tracer'],
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
    diskCache: {
      getItem: jest.fn().mockResolvedValue(null),
      getItemSync: jest.fn().mockReturnValue(null),
      setItem: jest.fn().mockResolvedValue(undefined),
      removeItem: jest.fn().mockResolvedValue(undefined),
    },
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

function buildController({
  deferEligibilityCheck,
}: BuildControllerOptions = {}): {
  controller: PerpsController;
  rootMessenger: RootMessenger;
  controllerMessenger: PerpsControllerMessenger;
} {
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
    it('does not trigger a geolocation fetch during construction', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        text: () => Promise.resolve('US'),
      } as globalThis.Response);

      buildController({ deferEligibilityCheck: true });

      // Allow any pending microtasks to flush
      await new Promise((resolve) => process.nextTick(resolve));

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('does not trigger a geolocation fetch from subscription events', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        text: () => Promise.resolve('US'),
      } as globalThis.Response);

      const { rootMessenger } = buildController({
        deferEligibilityCheck: true,
      });

      rootMessenger.publish(
        'RemoteFeatureFlagController:stateChange',
        { ...MOCK_REMOTE_FEATURE_FLAG_STATE },
        [],
      );

      await new Promise((resolve) => process.nextTick(resolve));

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('keeps isEligible at default (false) during deferral', () => {
      const { controller } = buildController({
        deferEligibilityCheck: true,
      });

      expect(controller.state.isEligible).toBe(false);
    });
  });

  describe('startEligibilityMonitoring', () => {
    it('is callable after deferred construction', () => {
      const { controller } = buildController({
        deferEligibilityCheck: true,
      });

      expect(() => controller.startEligibilityMonitoring()).not.toThrow();
    });

    it('reads current RemoteFeatureFlagController state', () => {
      const rootMessenger = getRootMessenger();
      const getStateMock = jest
        .fn()
        .mockReturnValue(MOCK_REMOTE_FEATURE_FLAG_STATE);

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

      getStateMock.mockClear();

      controller.startEligibilityMonitoring();

      expect(getStateMock).toHaveBeenCalledTimes(1);
    });

    it('unblocks future subscription-driven eligibility checks', () => {
      const refreshSpy = jest.spyOn(
        PerpsController.prototype as unknown as {
          refreshEligibilityOnFeatureFlagChange: (...args: unknown[]) => void;
        },
        'refreshEligibilityOnFeatureFlagChange',
      );

      const { controller, rootMessenger } = buildController({
        deferEligibilityCheck: true,
      });

      const callCountAfterConstruction = refreshSpy.mock.calls.length;

      controller.startEligibilityMonitoring();

      const callCountAfterStart = refreshSpy.mock.calls.length;
      expect(callCountAfterStart).toBe(callCountAfterConstruction + 1);

      rootMessenger.publish(
        'RemoteFeatureFlagController:stateChange',
        { ...MOCK_REMOTE_FEATURE_FLAG_STATE },
        [],
      );

      expect(refreshSpy.mock.calls).toHaveLength(callCountAfterStart + 1);
      refreshSpy.mockRestore();
    });
  });

  describe('stopEligibilityMonitoring', () => {
    it('prevents geolocation calls after stop', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        text: () => Promise.resolve('US'),
      } as globalThis.Response);

      const { controller, rootMessenger } = buildController({
        deferEligibilityCheck: true,
      });

      controller.startEligibilityMonitoring();
      controller.stopEligibilityMonitoring();

      rootMessenger.publish(
        'RemoteFeatureFlagController:stateChange',
        { ...MOCK_REMOTE_FEATURE_FLAG_STATE },
        [],
      );

      await new Promise((resolve) => process.nextTick(resolve));

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('is idempotent', () => {
      const { controller } = buildController({
        deferEligibilityCheck: true,
      });

      controller.startEligibilityMonitoring();
      expect(() => {
        controller.stopEligibilityMonitoring();
        controller.stopEligibilityMonitoring();
        controller.stopEligibilityMonitoring();
      }).not.toThrow();
    });

    it('resumes monitoring when startEligibilityMonitoring is called again', () => {
      const rootMessenger = getRootMessenger();
      const getStateMock = jest
        .fn()
        .mockReturnValue(MOCK_REMOTE_FEATURE_FLAG_STATE);

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

      getStateMock.mockClear();

      controller.startEligibilityMonitoring();
      controller.stopEligibilityMonitoring();
      controller.startEligibilityMonitoring();

      expect(getStateMock).toHaveBeenCalledTimes(2);
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
