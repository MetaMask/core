/* eslint-disable no-void */
import { KeyringTypes } from '@metamask/keyring-controller';
import { SnapControllerState } from '@metamask/snaps-controllers';
import { createDeferredPromise } from '@metamask/utils';

import {
  getMultichainAccountServiceMessenger,
  getRootMessenger,
} from '../tests';
import type { RootMessenger } from '../tests';
import { MultichainAccountServiceMessenger } from '../types';
import {
  DEFAULT_SNAP_KEYRING_WAIT_TIMEOUT_MS,
  SnapPlatformWatcher,
} from './SnapPlatformWatcher';

function setup(
  {
    rootMessenger,
  }: {
    rootMessenger: RootMessenger;
  } = {
    rootMessenger: getRootMessenger(),
  },
): {
  rootMessenger: RootMessenger;
  messenger: MultichainAccountServiceMessenger;
  mocks: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    SnapController: {
      getState: jest.Mock<SnapControllerState>;
    };
    // eslint-disable-next-line @typescript-eslint/naming-convention
    KeyringController: {
      getState: jest.Mock<{ keyrings: { type: string }[] }>;
    };
  };
  watcher: SnapPlatformWatcher;
} {
  const mocks = {
    SnapController: {
      getState: jest.fn(),
    },
    KeyringController: {
      getState: jest.fn(),
    },
  };

  rootMessenger.registerActionHandler(
    'SnapController:getState',
    mocks.SnapController.getState,
  );
  mocks.SnapController.getState.mockReturnValue({ isReady: false });

  rootMessenger.registerActionHandler(
    'KeyringController:getState',
    mocks.KeyringController.getState,
  );
  // By default, Snap keyring exists so ensureCanUseSnapPlatform can complete (including #waitForSnapKeyring).
  mocks.KeyringController.getState.mockReturnValue({
    keyrings: [{ type: KeyringTypes.snap }],
  });

  const messenger = getMultichainAccountServiceMessenger(rootMessenger);

  const watcher = new SnapPlatformWatcher(messenger);

  return { rootMessenger, messenger, watcher, mocks };
}

function publishIsReadyState(messenger: RootMessenger, isReady: boolean): void {
  messenger.publish(
    'SnapController:stateChange',
    { isReady } as SnapControllerState,
    [],
  );
}

describe('SnapPlatformWatcher', () => {
  describe('constructor', () => {
    it('initializes with isReady as false when not using ensureOnboardingComplete', () => {
      const { messenger } = setup();
      const watcher = new SnapPlatformWatcher(messenger);

      expect(watcher).toBeDefined();
      expect(watcher.isReady).toBe(false);
    });

    it('still tracks Snap platform state when using ensureOnboardingComplete', () => {
      const { messenger } = setup();
      const watcher = new SnapPlatformWatcher(messenger, {
        ensureOnboardingComplete: (): Promise<void> => Promise.resolve(),
      });

      expect(watcher).toBeDefined();
      // isReady reflects SnapController state, not the callback (both are required).
      expect(watcher.isReady).toBe(false);
    });
  });

  describe('ensureCanUsePlatform', () => {
    it('waits for platform to be ready at least once before resolving', async () => {
      const { rootMessenger, messenger } = setup();
      const watcher = new SnapPlatformWatcher(messenger);

      // Start the promise but don't await immediately.
      const ensurePromise = watcher.ensureCanUseSnapPlatform();

      // Should not resolve yet since platform is not ready.
      let resolved = false;
      void ensurePromise.then(() => {
        resolved = true;
        return null;
      });

      expect(resolved).toBe(false);

      // Publish state change with isReady: true.
      publishIsReadyState(rootMessenger, true);

      await ensurePromise;
      expect(resolved).toBe(true);
    });

    it('throws error if platform becomes unavailable after being ready once', async () => {
      const { rootMessenger, messenger } = setup();
      const watcher = new SnapPlatformWatcher(messenger);

      // Make platform ready first.
      publishIsReadyState(rootMessenger, true);

      // Make platform unavailable
      publishIsReadyState(rootMessenger, false);

      // Should throw error since platform is not ready now.
      await expect(watcher.ensureCanUseSnapPlatform()).rejects.toThrow(
        'Snap platform cannot be used now.',
      );
    });

    it('handles multiple state changes correctly', async () => {
      const { rootMessenger, messenger } = setup();
      const watcher = new SnapPlatformWatcher(messenger);

      // Make platform ready
      publishIsReadyState(rootMessenger, true);

      // Should work
      expect(await watcher.ensureCanUseSnapPlatform()).toBeUndefined();

      // Make platform unavailable.
      publishIsReadyState(rootMessenger, false);

      // Should fail.
      await expect(watcher.ensureCanUseSnapPlatform()).rejects.toThrow(
        'Snap platform cannot be used now.',
      );

      // Make platform ready again.
      publishIsReadyState(rootMessenger, true);

      // Should work again.
      expect(await watcher.ensureCanUseSnapPlatform()).toBeUndefined();
    });

    it('handles concurrent calls correctly', async () => {
      const { rootMessenger, messenger } = setup();
      const watcher = new SnapPlatformWatcher(messenger);

      // Start multiple concurrent calls.
      const promise1 = watcher.ensureCanUseSnapPlatform();
      const promise2 = watcher.ensureCanUseSnapPlatform();
      const promise3 = watcher.ensureCanUseSnapPlatform();

      // Make platform ready.
      publishIsReadyState(rootMessenger, true);

      // All promises should resolve.
      expect(await Promise.all([promise1, promise2, promise3])).toStrictEqual([
        undefined,
        undefined,
        undefined,
      ]);
    });

    it('resolves deferred promise only once when platform becomes ready', async () => {
      const { rootMessenger, messenger } = setup();
      const watcher = new SnapPlatformWatcher(messenger);
      const resolveSpy = jest.fn();

      // Access the private deferred promise through ensureCanUsePlatform.
      const ensurePromise = watcher.ensureCanUseSnapPlatform();
      void ensurePromise.then(resolveSpy);

      // Make platform ready multiple times.
      publishIsReadyState(rootMessenger, true);
      publishIsReadyState(rootMessenger, true);

      // Should only resolve once.
      await ensurePromise;
      expect(resolveSpy).toHaveBeenCalledTimes(1);
    });

    it('ignores state changes with isReady: false before first ready state', async () => {
      const { rootMessenger, messenger } = setup();
      const watcher = new SnapPlatformWatcher(messenger);

      // Start the promise
      const ensurePromise = watcher.ensureCanUseSnapPlatform();
      let resolved = false;
      void ensurePromise.then(() => {
        resolved = true;
        return null;
      });

      // Publish false state (should be ignored since we haven't been ready yet).
      publishIsReadyState(rootMessenger, false);
      expect(resolved).toBe(false);
      expect(watcher.isReady).toBe(false);

      // Now make it ready..
      publishIsReadyState(rootMessenger, true);
      await ensurePromise;
      expect(resolved).toBe(true);
    });

    it('throws if platform becomes not ready again before the await continuation runs (race guard)', async () => {
      const { rootMessenger, messenger } = setup();
      const watcher = new SnapPlatformWatcher(messenger);

      // Start waiting for the platform.
      const ensurePromise = watcher.ensureCanUseSnapPlatform();

      // Make platform ready (resolves the deferred; continuation is queued as microtask).
      publishIsReadyState(rootMessenger, true);
      // Before the continuation runs, make platform not ready again.
      publishIsReadyState(rootMessenger, false);

      // The continuation runs after both publishes; it sees isReady false and throws.
      await expect(ensurePromise).rejects.toThrow(
        'Snap platform cannot be used now.',
      );
    });

    it('resolves immediately if platform is already ready', async () => {
      const { messenger, mocks } = setup();

      // Make the platform ready before creating the watcher.
      mocks.SnapController.getState.mockReturnValue({
        isReady: true,
      } as SnapControllerState);

      const watcher = new SnapPlatformWatcher(messenger);

      expect(watcher.isReady).toBe(true);
    });

    it('resolves when Snap keyring is available (does not throw)', async () => {
      const { rootMessenger, watcher, mocks } = setup();

      publishIsReadyState(rootMessenger, true);

      expect(await watcher.ensureCanUseSnapPlatform()).toBeUndefined();

      // When keyring exists, getState is used to check for Snap keyring, so we return without throwing.
      expect(mocks.KeyringController.getState).toHaveBeenCalled();
    });

    it('resolves when Snap keyring appears via stateChange (listener path)', async () => {
      const rootMessenger = getRootMessenger();
      const mocks = {
        SnapController: { getState: jest.fn() },
        KeyringController: { getState: jest.fn() },
      };
      mocks.SnapController.getState.mockReturnValue({ isReady: true });
      mocks.KeyringController.getState.mockReturnValue({ keyrings: [] });
      rootMessenger.registerActionHandler(
        'SnapController:getState',
        mocks.SnapController.getState,
      );
      rootMessenger.registerActionHandler(
        'KeyringController:getState',
        mocks.KeyringController.getState,
      );
      const messenger = getMultichainAccountServiceMessenger(rootMessenger);
      const subscribeSpy = jest.spyOn(messenger, 'subscribe');
      const watcher = new SnapPlatformWatcher(messenger);

      const ensurePromise = watcher.ensureCanUseSnapPlatform();
      await Promise.resolve();
      await Promise.resolve(); // flush so #waitForSnapKeyring runs and subscribe is called

      expect(subscribeSpy.mock.calls.map((call) => call[0])).toContain(
        'KeyringController:stateChange',
      );
      const stateChangeCall = subscribeSpy.mock.calls.find(
        (call) => call[0] === 'KeyringController:stateChange',
      );
      if (stateChangeCall === undefined) {
        throw new Error(
          'KeyringController:stateChange subscribe call not found',
        );
      }
      const listener = stateChangeCall[1] as (
        keyrings: {
          type: string;
        }[],
      ) => void;
      listener([{ type: KeyringTypes.snap }]);

      expect(await ensurePromise).toBeUndefined();
    });

    it('resolves when Snap keyring appears via published stateChange (selector path)', async () => {
      const rootMessenger = getRootMessenger();
      const mocks = {
        SnapController: { getState: jest.fn() },
        KeyringController: { getState: jest.fn() },
      };
      mocks.SnapController.getState.mockReturnValue({ isReady: true });
      mocks.KeyringController.getState.mockReturnValue({ keyrings: [] });
      rootMessenger.registerActionHandler(
        'SnapController:getState',
        mocks.SnapController.getState,
      );
      rootMessenger.registerActionHandler(
        'KeyringController:getState',
        mocks.KeyringController.getState,
      );
      const messenger = getMultichainAccountServiceMessenger(rootMessenger);
      const watcher = new SnapPlatformWatcher(messenger);

      const ensurePromise = watcher.ensureCanUseSnapPlatform();
      await Promise.resolve();
      await Promise.resolve();

      rootMessenger.publish(
        'KeyringController:stateChange',
        {
          isUnlocked: true,
          keyrings: [
            {
              type: KeyringTypes.snap,
              accounts: [],
              metadata: { id: 'snap', name: 'Snap' },
            },
          ],
        },
        [],
      );

      expect(await ensurePromise).toBeUndefined();
    });

    it('resolves when getState throws but stateChange later delivers Snap keyring (covers #hasSnapKeyring catch path)', async () => {
      const rootMessenger = getRootMessenger();
      const mocks = {
        SnapController: { getState: jest.fn() },
        KeyringController: { getState: jest.fn() },
      };
      mocks.SnapController.getState.mockReturnValue({ isReady: true });
      mocks.KeyringController.getState.mockImplementation(() => {
        throw new Error('KeyringController locked');
      });
      rootMessenger.registerActionHandler(
        'SnapController:getState',
        mocks.SnapController.getState,
      );
      rootMessenger.registerActionHandler(
        'KeyringController:getState',
        mocks.KeyringController.getState,
      );
      const messenger = getMultichainAccountServiceMessenger(rootMessenger);
      const subscribeSpy = jest.spyOn(messenger, 'subscribe');
      const watcher = new SnapPlatformWatcher(messenger);

      const ensurePromise = watcher.ensureCanUseSnapPlatform();
      await Promise.resolve();
      await Promise.resolve();

      expect(subscribeSpy.mock.calls.map((call) => call[0])).toContain(
        'KeyringController:stateChange',
      );
      const stateChangeCall = subscribeSpy.mock.calls.find(
        (call) => call[0] === 'KeyringController:stateChange',
      );
      if (stateChangeCall === undefined) {
        throw new Error(
          'KeyringController:stateChange subscribe call not found',
        );
      }
      const listener = stateChangeCall[1] as (
        keyrings: {
          type: string;
        }[],
      ) => void;
      listener([{ type: KeyringTypes.snap }]);

      expect(await ensurePromise).toBeUndefined();
    });

    it('rejects with explicit error when Snap keyring does not appear within timeout', async () => {
      const { rootMessenger, watcher, mocks } = setup();

      mocks.KeyringController.getState.mockReturnValue({ keyrings: [] });
      publishIsReadyState(rootMessenger, true);

      jest.useFakeTimers();
      const ensurePromise = watcher.ensureCanUseSnapPlatform();
      // Attach rejection handler before advancing timers to avoid unhandled rejection.
      // eslint-disable-next-line jest/valid-expect -- assertion is awaited after advancing timers
      const expectRejection = expect(ensurePromise).rejects.toThrow(
        'Snap platform or keyrings still not ready. Aborting.',
      );
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(
        DEFAULT_SNAP_KEYRING_WAIT_TIMEOUT_MS + 1,
      );
      jest.useRealTimers();

      await expectRejection;
    });

    it('rejects when timeout fires (covers timeout callback path)', async () => {
      const { rootMessenger, messenger, mocks } = setup();
      mocks.KeyringController.getState.mockReturnValue({ keyrings: [] });
      const watcher = new SnapPlatformWatcher(messenger, {
        snapKeyringWaitTimeoutMs: 1,
      });
      publishIsReadyState(rootMessenger, true);

      jest.useFakeTimers();
      const ensurePromise = watcher.ensureCanUseSnapPlatform();
      await Promise.resolve();
      await Promise.resolve();
      // Attach rejection handler before advancing timers to avoid unhandled rejection.
      // eslint-disable-next-line jest/valid-expect -- assertion is awaited after advancing timers
      const rejectionAssertion = expect(ensurePromise).rejects.toThrow(
        'Snap platform or keyrings still not ready. Aborting.',
      );
      await jest.advanceTimersByTimeAsync(10);
      jest.useRealTimers();
      await rejectionAssertion;
    });

    it('uses custom snapKeyringWaitTimeoutMs when provided', async () => {
      const { rootMessenger, messenger, mocks } = setup();
      mocks.KeyringController.getState.mockReturnValue({ keyrings: [] });

      const watcher = new SnapPlatformWatcher(messenger, {
        snapKeyringWaitTimeoutMs: 100,
      });
      publishIsReadyState(rootMessenger, true);

      jest.useFakeTimers();
      const ensurePromise = watcher.ensureCanUseSnapPlatform();
      // Attach a rejection handler before advancing timers to avoid unhandled rejection.
      // eslint-disable-next-line jest/valid-expect -- assertion is awaited after advancing timers
      const expectRejection = expect(ensurePromise).rejects.toThrow(
        'Snap platform or keyrings still not ready. Aborting.',
      );
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(100);
      jest.useRealTimers();

      await expectRejection;
    });

    it('waits for ensureOnboardingComplete first when platform is already ready', async () => {
      const { rootMessenger, messenger } = setup();
      const { promise: onboardingPromise, resolve: resolveOnboarding } =
        createDeferredPromise<void>();
      const ensureOnboardingComplete = jest
        .fn()
        .mockReturnValue(onboardingPromise);
      const watcher = new SnapPlatformWatcher(messenger, {
        ensureOnboardingComplete,
      });

      publishIsReadyState(rootMessenger, true);

      const ensurePromise = watcher.ensureCanUseSnapPlatform();
      let resolved = false;
      void ensurePromise.then(() => {
        resolved = true;
        return null;
      });

      expect(ensureOnboardingComplete).toHaveBeenCalledTimes(1);
      expect(resolved).toBe(false);

      resolveOnboarding();
      await ensurePromise;
      expect(resolved).toBe(true);
    });

    it('requires both onboarding complete and Snap platform ready when ensureOnboardingComplete is provided', async () => {
      const { rootMessenger, messenger } = setup();
      const ensureOnboardingComplete = jest.fn().mockResolvedValue(undefined);
      const watcher = new SnapPlatformWatcher(messenger, {
        ensureOnboardingComplete,
      });

      const ensurePromise = watcher.ensureCanUseSnapPlatform();
      let resolved = false;
      void ensurePromise.then(() => {
        resolved = true;
        return null;
      });

      expect(ensureOnboardingComplete).toHaveBeenCalledTimes(1);
      expect(resolved).toBe(false);

      publishIsReadyState(rootMessenger, true);
      await ensurePromise;
      expect(resolved).toBe(true);
    });
  });
});
