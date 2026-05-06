/* eslint-disable no-void */
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { SnapControllerState } from '@metamask/snaps-controllers';
import { createDeferredPromise } from '@metamask/utils';

import type { SnapAccountServiceMessenger } from './SnapAccountService';
import { SnapPlatformWatcher } from './SnapPlatformWatcher';

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<SnapAccountServiceMessenger>,
  MessengerEvents<SnapAccountServiceMessenger>
>;

function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

function getMessenger(
  rootMessenger: RootMessenger,
): SnapAccountServiceMessenger {
  const messenger = new Messenger({
    namespace: 'SnapAccountService',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    actions: ['SnapController:getState'],
    events: ['SnapController:stateChange'],
  });
  return messenger;
}

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
  messenger: SnapAccountServiceMessenger;
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
  mocks.SnapController.getState.mockReturnValue({
    isReady: false,
  } as SnapControllerState);

  const messenger = getMessenger(rootMessenger);
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
      expect(watcher.isReady).toBe(false);
    });
  });

  describe('ensureCanUsePlatform', () => {
    it('waits for platform to be ready at least once before resolving', async () => {
      const { rootMessenger, messenger } = setup();
      const watcher = new SnapPlatformWatcher(messenger);

      const ensurePromise = watcher.ensureCanUseSnapPlatform();

      let resolved = false;
      void ensurePromise.then(() => {
        resolved = true;
        return null;
      });

      expect(resolved).toBe(false);

      publishIsReadyState(rootMessenger, true);

      await ensurePromise;
      expect(resolved).toBe(true);
    });

    it('throws error if platform becomes unavailable after being ready once', async () => {
      const { rootMessenger, messenger } = setup();
      const watcher = new SnapPlatformWatcher(messenger);

      publishIsReadyState(rootMessenger, true);
      publishIsReadyState(rootMessenger, false);

      await expect(watcher.ensureCanUseSnapPlatform()).rejects.toThrow(
        'Snap platform cannot be used now.',
      );
    });

    it('handles multiple state changes correctly', async () => {
      const { rootMessenger, messenger } = setup();
      const watcher = new SnapPlatformWatcher(messenger);

      publishIsReadyState(rootMessenger, true);
      expect(await watcher.ensureCanUseSnapPlatform()).toBeUndefined();

      publishIsReadyState(rootMessenger, false);
      await expect(watcher.ensureCanUseSnapPlatform()).rejects.toThrow(
        'Snap platform cannot be used now.',
      );

      publishIsReadyState(rootMessenger, true);
      expect(await watcher.ensureCanUseSnapPlatform()).toBeUndefined();
    });

    it('handles concurrent calls correctly', async () => {
      const { rootMessenger, messenger } = setup();
      const watcher = new SnapPlatformWatcher(messenger);

      const promise1 = watcher.ensureCanUseSnapPlatform();
      const promise2 = watcher.ensureCanUseSnapPlatform();
      const promise3 = watcher.ensureCanUseSnapPlatform();

      publishIsReadyState(rootMessenger, true);

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

      const ensurePromise = watcher.ensureCanUseSnapPlatform();
      void ensurePromise.then(resolveSpy);

      publishIsReadyState(rootMessenger, true);
      publishIsReadyState(rootMessenger, true);

      await ensurePromise;
      expect(resolveSpy).toHaveBeenCalledTimes(1);
    });

    it('ignores state changes with isReady: false before first ready state', async () => {
      const { rootMessenger, messenger } = setup();
      const watcher = new SnapPlatformWatcher(messenger);

      const ensurePromise = watcher.ensureCanUseSnapPlatform();
      let resolved = false;
      void ensurePromise.then(() => {
        resolved = true;
        return null;
      });

      publishIsReadyState(rootMessenger, false);
      expect(resolved).toBe(false);
      expect(watcher.isReady).toBe(false);

      publishIsReadyState(rootMessenger, true);
      await ensurePromise;
      expect(resolved).toBe(true);
    });

    it('throws if platform becomes not ready again before the await continuation runs (race guard)', async () => {
      const { rootMessenger, messenger } = setup();
      const watcher = new SnapPlatformWatcher(messenger);

      const ensurePromise = watcher.ensureCanUseSnapPlatform();

      publishIsReadyState(rootMessenger, true);
      publishIsReadyState(rootMessenger, false);

      await expect(ensurePromise).rejects.toThrow(
        'Snap platform cannot be used now.',
      );
    });

    it('resolves immediately if platform is already ready', async () => {
      const { messenger, mocks } = setup();

      mocks.SnapController.getState.mockReturnValue({
        isReady: true,
      } as SnapControllerState);

      const watcher = new SnapPlatformWatcher(messenger);

      expect(watcher.isReady).toBe(true);
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
