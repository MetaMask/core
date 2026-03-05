/* eslint-disable no-void */
import { SnapControllerState } from '@metamask/snaps-controllers';

import { SnapPlatformWatcher } from './SnapPlatformWatcher';
import {
  getMultichainAccountServiceMessenger,
  getRootMessenger,
} from '../tests';
import type { RootMessenger } from '../tests';
import { MultichainAccountServiceMessenger } from '../types';

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
  };
  watcher: SnapPlatformWatcher;
} {
  const mocks = {
    SnapController: {
      getState: jest.fn(),
    },
  };

  rootMessenger.registerActionHandler(
    'SnapController:getState',
    mocks.SnapController.getState,
  );
  mocks.SnapController.getState.mockReturnValue({ isReady: false });

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
    it('initializes with isReady as false', () => {
      const { messenger } = setup();
      const watcher = new SnapPlatformWatcher(messenger);

      expect(watcher).toBeDefined();
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

    it('waits for platform to be ready again when it becomes unavailable (e.g. after wallet reset)', async () => {
      const { rootMessenger, messenger } = setup();
      const watcher = new SnapPlatformWatcher(messenger);

      // Make platform ready first.
      publishIsReadyState(rootMessenger, true);

      // Make platform unavailable (e.g. clearState during wallet reset).
      publishIsReadyState(rootMessenger, false);

      // ensureCanUseSnapPlatform() should wait for the next ready, not throw.
      const ensurePromise = watcher.ensureCanUseSnapPlatform();
      let resolved = false;
      void ensurePromise.then(() => {
        resolved = true;
        return null;
      });

      expect(resolved).toBe(false);

      // Platform becomes ready again (e.g. Snap controller re-initialized).
      publishIsReadyState(rootMessenger, true);

      await ensurePromise;
      expect(resolved).toBe(true);
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

      // ensureCanUseSnapPlatform() now waits for the next ready (does not throw).
      const ensurePromise = watcher.ensureCanUseSnapPlatform();
      publishIsReadyState(rootMessenger, true);
      await ensurePromise;

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
  });
});
