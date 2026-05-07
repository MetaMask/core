import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { SnapId } from '@metamask/snaps-sdk';
import type { TruncatedSnap } from '@metamask/snaps-utils';

import type { SnapAccountServiceMessenger } from './SnapAccountService';
import { SnapTracker } from './SnapTracker';

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<SnapAccountServiceMessenger>,
  MessengerEvents<SnapAccountServiceMessenger>
>;

type MockTruncatedSnap = Pick<TruncatedSnap, 'id' | 'initialPermissions'>;

type Mocks = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  SnapController: {
    getSnap: jest.MockedFunction<(snapId: string) => TruncatedSnap | null>;
    getRunnableSnaps: jest.MockedFunction<() => TruncatedSnap[]>;
  };
};

/**
 * Constructs the root messenger for the tracker under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the tracker under test, and delegates all
 * required external actions and events from the root messenger to it.
 *
 * @param rootMessenger - The root messenger.
 * @returns The tracker messenger.
 */
function getMessenger(
  rootMessenger: RootMessenger,
): SnapAccountServiceMessenger {
  const messenger = new Messenger({
    namespace: 'SnapAccountService',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    actions: ['SnapController:getSnap', 'SnapController:getRunnableSnaps'],
    events: [
      'SnapController:snapInstalled',
      'SnapController:snapEnabled',
      'SnapController:snapDisabled',
      'SnapController:snapBlocked',
      'SnapController:snapUnblocked',
      'SnapController:snapUninstalled',
    ],
  });
  return messenger;
}

/**
 * Builds a minimal `TruncatedSnap` for tests.
 *
 * @param id - The Snap ID.
 * @param isKeyring - Whether the Snap declares the `endowment:keyring` initial permission.
 * @returns A minimal `TruncatedSnap`.
 */
function buildSnap(id: string, isKeyring: boolean): TruncatedSnap {
  return {
    id: id as SnapId,
    initialPermissions: isKeyring ? { 'endowment:keyring': {} } : {},
  } as MockTruncatedSnap as TruncatedSnap;
}

/**
 * Publishes a `SnapController:snapInstalled` event on the root messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param snap - The Snap that was installed.
 */
function publishSnapInstalled(
  rootMessenger: RootMessenger,
  snap: TruncatedSnap,
): void {
  rootMessenger.publish('SnapController:snapInstalled', snap, 'origin', false);
}

/**
 * Publishes a `SnapController:snapEnabled` event on the root messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param snap - The Snap that was enabled.
 */
function publishSnapEnabled(
  rootMessenger: RootMessenger,
  snap: TruncatedSnap,
): void {
  rootMessenger.publish('SnapController:snapEnabled', snap);
}

/**
 * Publishes a `SnapController:snapDisabled` event on the root messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param snap - The Snap that was disabled.
 */
function publishSnapDisabled(
  rootMessenger: RootMessenger,
  snap: TruncatedSnap,
): void {
  rootMessenger.publish('SnapController:snapDisabled', snap);
}

/**
 * Publishes a `SnapController:snapBlocked` event on the root messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param snapId - The ID of the Snap that was blocked.
 */
function publishSnapBlocked(
  rootMessenger: RootMessenger,
  snapId: string,
): void {
  rootMessenger.publish('SnapController:snapBlocked', snapId);
}

/**
 * Publishes a `SnapController:snapUnblocked` event on the root messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param snapId - The ID of the Snap that was unblocked.
 */
function publishSnapUnblocked(
  rootMessenger: RootMessenger,
  snapId: string,
): void {
  rootMessenger.publish('SnapController:snapUnblocked', snapId);
}

/**
 * Publishes a `SnapController:snapUninstalled` event on the root messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param snap - The Snap that was uninstalled.
 */
function publishSnapUninstalled(
  rootMessenger: RootMessenger,
  snap: TruncatedSnap,
): void {
  rootMessenger.publish('SnapController:snapUninstalled', snap);
}

/**
 * Constructs the tracker under test with sensible defaults.
 *
 * @param args - The arguments to this function.
 * @param args.runnableSnaps - Snaps returned by `SnapController:getRunnableSnaps`.
 * @returns The new tracker, root messenger, tracker messenger, and mocks.
 */
function setup({
  runnableSnaps = [],
}: {
  runnableSnaps?: TruncatedSnap[];
} = {}): {
  tracker: SnapTracker;
  rootMessenger: RootMessenger;
  messenger: SnapAccountServiceMessenger;
  mocks: Mocks;
} {
  const rootMessenger = getRootMessenger();
  const messenger = getMessenger(rootMessenger);

  const mocks: Mocks = {
    SnapController: {
      getSnap: jest.fn().mockReturnValue(null),
      getRunnableSnaps: jest.fn().mockReturnValue(runnableSnaps),
    },
  };

  rootMessenger.registerActionHandler(
    'SnapController:getSnap',
    mocks.SnapController.getSnap as never,
  );
  rootMessenger.registerActionHandler(
    'SnapController:getRunnableSnaps',
    mocks.SnapController.getRunnableSnaps,
  );

  const tracker = new SnapTracker(messenger);

  return { tracker, rootMessenger, messenger, mocks };
}

const MOCK_SNAP_ID = 'npm:@metamask/mock-snap' as SnapId;
const MOCK_OTHER_SNAP_ID = 'npm:@metamask/other-snap' as SnapId;

describe('SnapTracker', () => {
  describe('init', () => {
    it('resolves without throwing', async () => {
      const { tracker } = setup();

      expect(await tracker.init()).toBeUndefined();
    });

    it('does not re-init if already initialized', async () => {
      const { tracker, mocks } = setup();

      expect(await tracker.init()).toBeUndefined();
      expect(mocks.SnapController.getRunnableSnaps).toHaveBeenCalledTimes(1);

      expect(await tracker.init()).toBeUndefined();
      expect(mocks.SnapController.getRunnableSnaps).toHaveBeenCalledTimes(1); // Still only called once.
    });

    it('seeds tracked Snaps from getRunnableSnaps, filtering out non-keyring Snaps', async () => {
      const { tracker } = setup({
        runnableSnaps: [
          buildSnap(MOCK_SNAP_ID, true),
          buildSnap(MOCK_OTHER_SNAP_ID, false),
        ],
      });

      await tracker.init();

      expect(tracker.getSnaps()).toStrictEqual([MOCK_SNAP_ID]);
    });
  });

  describe('getSnaps', () => {
    it('returns an empty array before init', () => {
      const { tracker } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      expect(tracker.getSnaps()).toStrictEqual([]);
    });
  });

  describe('has', () => {
    it('returns false before init', () => {
      const { tracker } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      expect(tracker.has(MOCK_SNAP_ID)).toBe(false);
    });

    it('returns true for a tracked Snap', async () => {
      const { tracker } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      await tracker.init();

      expect(tracker.has(MOCK_SNAP_ID)).toBe(true);
    });

    it('returns false for an untracked Snap', async () => {
      const { tracker } = setup();

      await tracker.init();

      expect(tracker.has(MOCK_SNAP_ID)).toBe(false);
    });
  });

  describe('lifecycle events', () => {
    it('ignores add events received before init', async () => {
      const { tracker, rootMessenger } = setup();

      publishSnapInstalled(rootMessenger, buildSnap(MOCK_SNAP_ID, true));

      await tracker.init();

      expect(tracker.getSnaps()).toStrictEqual([]);
    });

    it('ignores remove events received before init', async () => {
      const { tracker, rootMessenger } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      publishSnapUninstalled(rootMessenger, buildSnap(MOCK_SNAP_ID, true));

      await tracker.init();

      expect(tracker.getSnaps()).toStrictEqual([MOCK_SNAP_ID]);
    });

    it('adds a Snap on snapInstalled when it has the keyring endowment', async () => {
      const { tracker, rootMessenger } = setup();

      await tracker.init();
      publishSnapInstalled(rootMessenger, buildSnap(MOCK_SNAP_ID, true));

      expect(tracker.getSnaps()).toStrictEqual([MOCK_SNAP_ID]);
    });

    it('does not add a Snap on snapInstalled when it lacks the keyring endowment', async () => {
      const { tracker, rootMessenger } = setup();

      await tracker.init();
      publishSnapInstalled(rootMessenger, buildSnap(MOCK_SNAP_ID, false));

      expect(tracker.getSnaps()).toStrictEqual([]);
    });

    it('adds a Snap on snapEnabled when it has the keyring endowment', async () => {
      const { tracker, rootMessenger } = setup();

      await tracker.init();
      publishSnapEnabled(rootMessenger, buildSnap(MOCK_SNAP_ID, true));

      expect(tracker.getSnaps()).toStrictEqual([MOCK_SNAP_ID]);
    });

    it('removes a Snap on snapDisabled', async () => {
      const { tracker, rootMessenger } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      await tracker.init();
      expect(tracker.getSnaps()).toStrictEqual([MOCK_SNAP_ID]);

      publishSnapDisabled(rootMessenger, buildSnap(MOCK_SNAP_ID, true));

      expect(tracker.getSnaps()).toStrictEqual([]);
    });

    it('removes a Snap on snapBlocked', async () => {
      const { tracker, rootMessenger } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      await tracker.init();
      publishSnapBlocked(rootMessenger, MOCK_SNAP_ID);

      expect(tracker.getSnaps()).toStrictEqual([]);
    });

    it('ignores snapUnblocked received before init', async () => {
      const { tracker, rootMessenger, mocks } = setup();

      mocks.SnapController.getSnap.mockReturnValue({
        ...buildSnap(MOCK_SNAP_ID, true),
        enabled: true,
        blocked: false,
      } as TruncatedSnap);
      publishSnapUnblocked(rootMessenger, MOCK_SNAP_ID);

      await tracker.init();

      expect(tracker.getSnaps()).toStrictEqual([]);
    });

    it('re-adds a Snap on snapUnblocked when it is enabled and has the keyring endowment', async () => {
      const { tracker, rootMessenger, mocks } = setup();

      await tracker.init();
      mocks.SnapController.getSnap.mockReturnValue({
        ...buildSnap(MOCK_SNAP_ID, true),
        enabled: true,
        blocked: false,
      } as TruncatedSnap);

      publishSnapUnblocked(rootMessenger, MOCK_SNAP_ID);

      expect(tracker.getSnaps()).toStrictEqual([MOCK_SNAP_ID]);
    });

    it('does not re-add a Snap on snapUnblocked when it is disabled', async () => {
      const { tracker, rootMessenger, mocks } = setup();

      await tracker.init();
      mocks.SnapController.getSnap.mockReturnValue({
        ...buildSnap(MOCK_SNAP_ID, true),
        enabled: false,
        blocked: false,
      } as TruncatedSnap);

      publishSnapUnblocked(rootMessenger, MOCK_SNAP_ID);

      expect(tracker.getSnaps()).toStrictEqual([]);
    });

    it('does not re-add a Snap on snapUnblocked when it lacks the keyring endowment', async () => {
      const { tracker, rootMessenger, mocks } = setup();

      await tracker.init();
      mocks.SnapController.getSnap.mockReturnValue({
        ...buildSnap(MOCK_SNAP_ID, false),
        enabled: true,
        blocked: false,
      } as TruncatedSnap);

      publishSnapUnblocked(rootMessenger, MOCK_SNAP_ID);

      expect(tracker.getSnaps()).toStrictEqual([]);
    });

    it('does not re-add a Snap on snapUnblocked when getSnap returns null', async () => {
      const { tracker, rootMessenger } = setup();

      await tracker.init();
      publishSnapUnblocked(rootMessenger, MOCK_SNAP_ID);

      expect(tracker.getSnaps()).toStrictEqual([]);
    });

    it('removes a Snap on snapUninstalled', async () => {
      const { tracker, rootMessenger } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      await tracker.init();
      publishSnapUninstalled(rootMessenger, buildSnap(MOCK_SNAP_ID, true));

      expect(tracker.getSnaps()).toStrictEqual([]);
    });
  });
});
