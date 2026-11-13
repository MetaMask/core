import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import { describe, expect, it, vi } from 'vitest';

import { PerpsController } from '../src/PerpsController.js';
import type { PerpsControllerMessenger } from '../src/PerpsController.js';
import type { PerpsPlatformDependencies } from '../src/types/index.js';

vi.mock('@nktkas/hyperliquid', () => ({}));

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<PerpsControllerMessenger>,
  MessengerEvents<PerpsControllerMessenger>
>;

const noopLogger = {
  error: vi.fn(),
  warn: vi.fn(),
};

const noopDebugLogger = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function buildMockInfrastructure(): PerpsPlatformDependencies {
  return {
    logger: noopLogger,
    debugLogger: noopDebugLogger,
    metrics: {
      trackEvent: vi.fn(),
    } as unknown as PerpsPlatformDependencies['metrics'],
    performance: {
      startTrace: vi.fn(),
      endTrace: vi.fn(),
    } as unknown as PerpsPlatformDependencies['performance'],
    tracer: {
      trace: vi.fn(),
    } as unknown as PerpsPlatformDependencies['tracer'],
    streamManager: {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      pauseChannel: vi.fn(),
      resumeChannel: vi.fn(),
    } as unknown as PerpsPlatformDependencies['streamManager'],
    featureFlags: { validateVersionGated: vi.fn() },
    marketDataFormatters: {
      formatPrice: vi.fn(),
      formatSize: vi.fn(),
    } as unknown as PerpsPlatformDependencies['marketDataFormatters'],
    cacheInvalidator: {
      invalidate: vi.fn(),
    } as unknown as PerpsPlatformDependencies['cacheInvalidator'],
    diskCache: {
      getItem: vi.fn().mockResolvedValue(null),
      getItemSync: vi.fn().mockReturnValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    },
    rewards: { getPerpsDiscountForAccount: vi.fn().mockResolvedValue(0) },
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
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        text: () => Promise.resolve('US'),
      } as globalThis.Response);

      buildController({ deferEligibilityCheck: true });

      // Allow any pending microtasks to flush
      await new Promise((resolve) => process.nextTick(resolve));

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('does not trigger a geolocation fetch from subscription events', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
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
      const getStateMock = vi
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
      const refreshSpy = vi.spyOn(
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
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
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
      const getStateMock = vi
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
      const refreshSpy = vi.spyOn(
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
