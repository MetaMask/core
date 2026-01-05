/* eslint-disable no-void */
import { SnapControllerState } from '@metamask/snaps-controllers';

import { SnapPlatformWatcher } from './SnapPlatformWatcher';
import {
  getMultichainAccountServiceMessenger,
  getRootMessenger,
} from '../tests';
import type { RootMessenger } from '../tests';
import { MultichainAccountServiceMessenger } from '../types';

function setup(): {
  rootMessenger: RootMessenger;
  messenger: MultichainAccountServiceMessenger;
  watcher: SnapPlatformWatcher;
} {
  const rootMessenger = getRootMessenger();
  const messenger = getMultichainAccountServiceMessenger(rootMessenger);

  const watcher = new SnapPlatformWatcher(messenger);

  return { rootMessenger, messenger, watcher };
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
      const { watcher } = setup();

      expect(watcher).toBeDefined();
      expect(watcher.isReady).toBe(false);
    });
  });

  describe('ensureCanUsePlatform', () => {
    it('waits for platform to be ready at least once before resolving', async () => {
      const { rootMessenger, watcher } = setup();

      // Start the promise but don't await immediately.
      const ensurePromise = watcher.ensureCanUsePlatform();

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
      const { rootMessenger, watcher } = setup();

      // Make platform ready first.
      publishIsReadyState(rootMessenger, true);

      // Make platform unavailable
      publishIsReadyState(rootMessenger, false);

      // Should throw error since platform is not ready now.
      await expect(watcher.ensureCanUsePlatform()).rejects.toThrow(
        'Snap platform cannot be used now.',
      );
    });

    it('handles multiple state changes correctly', async () => {
      const { rootMessenger, watcher } = setup();

      // Make platform ready
      publishIsReadyState(rootMessenger, true);

      // Should work
      expect(await watcher.ensureCanUsePlatform()).toBeUndefined();

      // Make platform unavailable.
      publishIsReadyState(rootMessenger, false);

      // Should fail.
      await expect(watcher.ensureCanUsePlatform()).rejects.toThrow(
        'Snap platform cannot be used now.',
      );

      // Make platform ready again.
      publishIsReadyState(rootMessenger, true);

      // Should work again.
      expect(await watcher.ensureCanUsePlatform()).toBeUndefined();
    });

    it('handles concurrent calls correctly', async () => {
      const { rootMessenger, watcher } = setup();

      // Start multiple concurrent calls.
      const promise1 = watcher.ensureCanUsePlatform();
      const promise2 = watcher.ensureCanUsePlatform();
      const promise3 = watcher.ensureCanUsePlatform();

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
      const { rootMessenger, watcher } = setup();
      const resolveSpy = jest.fn();

      // Access the private deferred promise through ensureCanUsePlatform.
      const ensurePromise = watcher.ensureCanUsePlatform();
      void ensurePromise.then(resolveSpy);

      // Make platform ready multiple times.
      publishIsReadyState(rootMessenger, true);
      publishIsReadyState(rootMessenger, true);

      // Should only resolve once.
      await ensurePromise;
      expect(resolveSpy).toHaveBeenCalledTimes(1);
    });

    it('ignores state changes with isReady: false before first ready state', async () => {
      const { rootMessenger, watcher } = setup();

      // Start the promise
      const ensurePromise = watcher.ensureCanUsePlatform();
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
  });
});
