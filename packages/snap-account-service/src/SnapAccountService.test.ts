import type { AccountGroupId } from '@metamask/account-api';
import { SNAP_KEYRING_TYPE } from '@metamask/eth-snap-keyring';
import type { SnapKeyring, SnapMessage } from '@metamask/eth-snap-keyring';
import { KeyringType } from '@metamask/keyring-api/v2';
import {
  KeyringControllerState,
  KeyringTypes,
} from '@metamask/keyring-controller';
import type {
  KeyringEntry,
  RestrictedController,
} from '@metamask/keyring-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { SnapControllerState } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import type { TruncatedSnap } from '@metamask/snaps-utils';

import type {
  SnapAccountServiceMessenger,
  SnapAccountServiceOptions,
} from './SnapAccountService';
import { SnapAccountService } from './SnapAccountService';
import type { AccountGroupObject } from './types';

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<SnapAccountServiceMessenger>,
  MessengerEvents<SnapAccountServiceMessenger>
>;

/** Mock keyring controller state type for tests. */
type MockKeyringControllerState = Pick<KeyringControllerState, 'keyrings'>;

/** Mock truncated snap type for tests. */
type MockTruncatedSnap = Pick<
  TruncatedSnap,
  'id' | 'initialPermissions' | 'enabled' | 'blocked'
>;

/** Mock account group type for tests. */
type MockAccountGroup = Pick<AccountGroupObject, 'id' | 'accounts'>;

/** Mock Snap keyring type for tests. */
type MockSnapKeyring = {
  type: KeyringTypes.snap;
  handleKeyringSnapMessage?: jest.MockedFunction<
    SnapKeyring['handleKeyringSnapMessage']
  >;
  setSelectedAccounts?: jest.MockedFunction<SnapKeyring['setSelectedAccounts']>;
};

type Mocks = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  SnapController: {
    getState: jest.MockedFunction<() => SnapControllerState>;
    getRunnableSnaps: jest.MockedFunction<() => TruncatedSnap[]>;
  };
  // eslint-disable-next-line @typescript-eslint/naming-convention
  KeyringController: {
    getState: jest.MockedFunction<() => { keyrings: { type: string }[] }>;
    withController: jest.Mock;
  };
  // eslint-disable-next-line @typescript-eslint/naming-convention
  AccountTreeController: {
    getAccountGroupObject: jest.MockedFunction<
      (groupId: AccountGroupId) => AccountGroupObject | undefined
    >;
    getSelectedAccountGroup: jest.MockedFunction<() => AccountGroupId | ''>;
  };
};

/**
 * Constructs the root messenger for the service under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the service under test, and delegates all
 * required external actions and events from the root messenger to it.
 *
 * @param rootMessenger - The root messenger.
 * @returns The service-specific messenger.
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
    actions: [
      'SnapController:getState',
      'SnapController:getSnap',
      'SnapController:getRunnableSnaps',
      'KeyringController:getState',
      'KeyringController:withController',
      'AccountTreeController:getAccountGroupObject',
      'AccountTreeController:getSelectedAccountGroup',
    ],
    events: [
      'SnapController:stateChange',
      'SnapController:snapInstalled',
      'SnapController:snapEnabled',
      'SnapController:snapDisabled',
      'SnapController:snapBlocked',
      'SnapController:snapUnblocked',
      'SnapController:snapUninstalled',
      'KeyringController:stateChange',
      'KeyringController:unlock',
      'AccountTreeController:selectedAccountGroupChange',
      'AccountTreeController:accountGroupCreated',
      'AccountTreeController:accountGroupUpdated',
      'AccountTreeController:accountGroupRemoved',
    ],
  });
  return messenger;
}

/**
 * Publishes a SnapController stateChange event on the root messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param isReady - Whether the Snap platform is ready.
 */
function publishSnapIsReady(
  rootMessenger: RootMessenger,
  isReady: boolean,
): void {
  rootMessenger.publish(
    'SnapController:stateChange',
    { isReady } as SnapControllerState,
    [],
  );
}

/**
 * Publishes a KeyringController stateChange event on the root messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param keyrings - The keyrings to publish.
 */
function publishKeyrings(
  rootMessenger: RootMessenger,
  keyrings: { type: string }[],
): void {
  rootMessenger.publish(
    'KeyringController:stateChange',
    { keyrings } as MockKeyringControllerState as KeyringControllerState,
    [],
  );
}

/**
 * Flushes pending microtasks so that chained `await`s in fire-and-forget
 * handlers resolve before assertions run.
 *
 * @returns A promise that resolves once the event loop has drained.
 */
async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

/**
 * Publishes an AccountTreeController selectedAccountGroupChange event on the
 * root messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param next - The newly selected account group ID (or '').
 * @param previous - The previously selected account group ID (or '').
 */
function publishSelectedAccountGroupChange(
  rootMessenger: RootMessenger,
  next: AccountGroupId | '',
  previous: AccountGroupId | '' = '',
): void {
  rootMessenger.publish(
    'AccountTreeController:selectedAccountGroupChange',
    next,
    previous,
  );
}

/**
 * Publishes a KeyringController unlock event on the root messenger.
 *
 * @param rootMessenger - The root messenger.
 */
function publishUnlock(rootMessenger: RootMessenger): void {
  rootMessenger.publish('KeyringController:unlock');
}

/**
 * Builds a minimal `TruncatedSnap` for tests.
 *
 * @param id - The Snap ID.
 * @param hasKeyring - Whether the Snap declares the `endowment:keyring` initial permission.
 * @returns A minimal `TruncatedSnap`.
 */
function buildSnap(id: string, hasKeyring: boolean): TruncatedSnap {
  return {
    id: id as SnapId,
    initialPermissions: hasKeyring ? { 'endowment:keyring': {} } : {},
    enabled: true,
    blocked: false,
  } as MockTruncatedSnap as TruncatedSnap;
}

/**
 * Builds a minimal `AccountGroupObject` for tests.
 *
 * @param id - The group ID.
 * @param accounts - The list of account IDs in the group.
 * @returns A minimal `AccountGroupObject`.
 */
function buildGroup(
  id: AccountGroupId,
  accounts: string[],
): AccountGroupObject {
  return { id, accounts } as MockAccountGroup as AccountGroupObject;
}

/**
 * Publishes an AccountTreeController accountGroupCreated event on the root
 * messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param group - The created account group.
 */
function publishAccountGroupCreated(
  rootMessenger: RootMessenger,
  group: AccountGroupObject,
): void {
  rootMessenger.publish('AccountTreeController:accountGroupCreated', group);
}

/**
 * Publishes an AccountTreeController accountGroupUpdated event on the root
 * messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param group - The updated account group.
 */
function publishAccountGroupUpdated(
  rootMessenger: RootMessenger,
  group: AccountGroupObject,
): void {
  rootMessenger.publish('AccountTreeController:accountGroupUpdated', group);
}

/**
 * Publishes an AccountTreeController accountGroupRemoved event on the root
 * messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param groupId - The removed account group ID.
 */
function publishAccountGroupRemoved(
  rootMessenger: RootMessenger,
  groupId: AccountGroupId,
): void {
  rootMessenger.publish('AccountTreeController:accountGroupRemoved', groupId);
}

/**
 * Builds a fake {@link KeyringEntry} with the given type.
 *
 * @param type - The keyring type.
 * @returns A minimal KeyringEntry for tests.
 */
function buildKeyringEntry(type: string): KeyringEntry {
  return {
    keyring: { type } as KeyringEntry['keyring'],
    metadata: { id: `id-${type}`, name: type },
  };
}

/**
 * Configures `mocks.KeyringController.withController` to invoke the
 * operation with a controllable {@link RestrictedController}.
 *
 * @param mocks - The mocks object from {@link setup}.
 * @param initialEntries - Entries exposed via `controller.keyrings`.
 * @returns The mocked `addNewKeyring` jest fn for assertions.
 */
function mockWithController(
  mocks: Mocks,
  initialEntries: KeyringEntry[],
): {
  addNewKeyring: jest.MockedFunction<RestrictedController['addNewKeyring']>;
} {
  const entries = [...initialEntries];
  const addNewKeyring = jest.fn(async (type: string) => {
    const entry = buildKeyringEntry(type);
    entries.push(entry);
    return entry;
  });
  mocks.KeyringController.withController.mockImplementation(async (operation) =>
    operation({
      get keyrings() {
        return Object.freeze([...entries]);
      },
      addNewKeyring,
      removeKeyring: jest.fn(),
    }),
  );
  return { addNewKeyring };
}

/**
 * Configures `mocks.KeyringController.withController` to expose a single
 * legacy Snap keyring with the provided mocked methods.
 *
 * @param mocks - The mocks object from {@link setup}.
 * @param keyring - The mocked Snap keyring methods.
 * @param keyring.handleKeyringSnapMessage - The mocked implementation.
 * @param keyring.setSelectedAccounts - The mocked implementation.
 */
function mockLegacySnapKeyring(
  mocks: Mocks,
  {
    handleKeyringSnapMessage,
    setSelectedAccounts,
  }: {
    handleKeyringSnapMessage?: jest.MockedFunction<
      SnapKeyring['handleKeyringSnapMessage']
    >;
    setSelectedAccounts?: jest.MockedFunction<
      SnapKeyring['setSelectedAccounts']
    >;
  },
): void {
  const snapKeyring: MockSnapKeyring = {
    type: KeyringTypes.snap,
    handleKeyringSnapMessage,
    setSelectedAccounts,
  };
  mocks.KeyringController.withController.mockImplementation(async (operation) =>
    operation({
      get keyrings() {
        return Object.freeze([
          {
            keyring: snapKeyring as KeyringEntry['keyring'],
            metadata: { id: 'id-snap', name: KeyringTypes.snap },
          },
        ]);
      },
      addNewKeyring: jest.fn(),
      removeKeyring: jest.fn(),
    }),
  );
}

/**
 * Constructs the service under test with sensible defaults.
 *
 * @param args - The arguments to this function.
 * @param args.snapIsReady - Initial value of `SnapController.isReady`.
 * @param args.keyrings - Initial keyrings returned by `KeyringController:getState`.
 * @param args.runnableSnaps - Snaps returned by `SnapController:getRunnableSnaps`.
 * @param args.config - Optional service config.
 * @returns The new service, root messenger, service messenger, and mocks.
 */
function setup({
  snapIsReady = true,
  keyrings = [{ type: KeyringTypes.snap }],
  runnableSnaps = [],
  config,
}: {
  snapIsReady?: boolean;
  keyrings?: { type: string }[];
  runnableSnaps?: TruncatedSnap[];
  config?: SnapAccountServiceOptions['config'];
} = {}): {
  service: SnapAccountService;
  rootMessenger: RootMessenger;
  messenger: SnapAccountServiceMessenger;
  mocks: Mocks;
} {
  const rootMessenger = getRootMessenger();
  const messenger = getMessenger(rootMessenger);

  const mocks: Mocks = {
    SnapController: {
      getState: jest
        .fn()
        .mockReturnValue({ isReady: snapIsReady } as SnapControllerState),
      getRunnableSnaps: jest.fn().mockReturnValue(runnableSnaps),
    },
    KeyringController: {
      getState: jest.fn().mockReturnValue({ keyrings }),
      withController: jest.fn(),
    },
    AccountTreeController: {
      getAccountGroupObject: jest.fn().mockReturnValue(undefined),
      getSelectedAccountGroup: jest.fn().mockReturnValue(''),
    },
  };

  rootMessenger.registerActionHandler(
    'SnapController:getState',
    mocks.SnapController.getState,
  );
  rootMessenger.registerActionHandler(
    'SnapController:getRunnableSnaps',
    mocks.SnapController.getRunnableSnaps,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:getState',
    mocks.KeyringController.getState,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:withController',
    mocks.KeyringController.withController,
  );
  rootMessenger.registerActionHandler(
    'AccountTreeController:getAccountGroupObject',
    mocks.AccountTreeController.getAccountGroupObject,
  );
  rootMessenger.registerActionHandler(
    'AccountTreeController:getSelectedAccountGroup',
    mocks.AccountTreeController.getSelectedAccountGroup,
  );

  const service = new SnapAccountService({ messenger, config });

  return { service, rootMessenger, messenger, mocks };
}

const MOCK_SNAP_ID = 'npm:@metamask/mock-snap' as SnapId;
const MOCK_OTHER_SNAP_ID = 'npm:@metamask/other-snap' as SnapId;

describe('SnapAccountService', () => {
  describe('init', () => {
    it('resolves without throwing', async () => {
      const { service } = setup();

      expect(await service.init()).toBeUndefined();
    });
  });

  describe('getSnaps', () => {
    it('exposes tracked Snaps seeded by init', async () => {
      const { service } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      await service.init();

      expect(service.getSnaps()).toStrictEqual([MOCK_SNAP_ID]);
    });
  });

  describe('migrate', () => {
    it('runs the migration only once when called concurrently', async () => {
      const { service, mocks } = setup();
      mocks.KeyringController.withController.mockResolvedValue(undefined);

      await Promise.all([service.migrate(), service.migrate()]);

      expect(mocks.KeyringController.withController).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when no legacy Snap keyring is present', async () => {
      const addNewKeyring = jest.fn().mockResolvedValue(undefined);
      const removeKeyring = jest.fn().mockResolvedValue(undefined);
      const { service, mocks } = setup();
      mocks.KeyringController.withController.mockImplementation(
        async (operation) =>
          operation({ keyrings: [], addNewKeyring, removeKeyring }),
      );

      await service.migrate();

      expect(addNewKeyring).not.toHaveBeenCalled();
      expect(removeKeyring).not.toHaveBeenCalled();
    });

    it('migrates accounts from the legacy Snap keyring to per-Snap v2 keyrings and removes the legacy entry', async () => {
      const addNewKeyring = jest.fn().mockResolvedValue(undefined);
      const removeKeyring = jest.fn().mockResolvedValue(undefined);
      const legacyKeyringId = 'legacy-keyring-id';
      const account1 = {
        id: 'account-1',
        address: '0x1',
        metadata: { snap: { id: MOCK_SNAP_ID } },
      };
      const account2 = {
        id: 'account-2',
        address: '0x2',
        metadata: { snap: { id: MOCK_SNAP_ID } },
      };
      const account3 = {
        id: 'account-3',
        address: '0x3',
        metadata: { snap: { id: MOCK_OTHER_SNAP_ID } },
      };
      const orphanAccount = {
        id: 'orphan',
        address: '0x4',
        metadata: {},
      };
      const legacyKeyring = {
        type: SNAP_KEYRING_TYPE,
        listAccounts: jest
          .fn()
          .mockReturnValue([account1, account2, account3, orphanAccount]),
      };
      const { service, mocks } = setup();
      mocks.KeyringController.withController.mockImplementation(
        async (operation) =>
          operation({
            keyrings: [
              { keyring: legacyKeyring, metadata: { id: legacyKeyringId } },
            ],
            addNewKeyring,
            removeKeyring,
          }),
      );

      await service.migrate();

      expect(addNewKeyring).toHaveBeenCalledTimes(2);
      expect(addNewKeyring).toHaveBeenCalledWith(KeyringType.Snap, {
        snapId: MOCK_SNAP_ID,
        accounts: {
          [account1.id]: { id: account1.id, address: account1.address },
          [account2.id]: { id: account2.id, address: account2.address },
        },
      });
      expect(addNewKeyring).toHaveBeenCalledWith(KeyringType.Snap, {
        snapId: MOCK_OTHER_SNAP_ID,
        accounts: {
          [account3.id]: { id: account3.id, address: account3.address },
        },
      });
      expect(removeKeyring).toHaveBeenCalledWith(legacyKeyringId);
    });
  });

  describe('ensureReady', () => {
    it('throws when the Snap is not tracked', async () => {
      const { service } = setup();

      await service.init();

      await expect(service.ensureReady(MOCK_SNAP_ID)).rejects.toThrow(
        `Unknown snap: "${MOCK_SNAP_ID}"`,
      );
    });

    it('throws before init even for runnable Snaps', async () => {
      const { service } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      await expect(service.ensureReady(MOCK_SNAP_ID)).rejects.toThrow(
        `Unknown snap: "${MOCK_SNAP_ID}"`,
      );
    });

    it('resolves when platform is already ready', async () => {
      const { service } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      await service.init();

      expect(await service.ensureReady(MOCK_SNAP_ID)).toBeUndefined();
    });

    it('runs the migration before checking platform readiness', async () => {
      const { service, mocks } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });
      mocks.KeyringController.withController.mockResolvedValue(undefined);

      await service.init();
      // `migrate` is invoked once + `#createKeyringForSnap` is invoked once
      // (the cached migrate call is a no-op on subsequent calls).
      await service.ensureReady(MOCK_SNAP_ID);

      expect(mocks.KeyringController.withController).toHaveBeenCalledTimes(2);
    });

    it('creates a v2 keyring for the Snap when one does not exist yet', async () => {
      const addNewKeyring = jest.fn().mockResolvedValue(undefined);
      const removeKeyring = jest.fn().mockResolvedValue(undefined);
      const { service, mocks } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });
      mocks.KeyringController.withController.mockImplementation(
        async (operation) =>
          operation({ keyrings: [], addNewKeyring, removeKeyring }),
      );

      await service.init();
      await service.ensureReady(MOCK_SNAP_ID);

      expect(addNewKeyring).toHaveBeenCalledWith(KeyringType.Snap, {
        snapId: MOCK_SNAP_ID,
        accounts: {},
      });
    });

    it('does not create a v2 keyring when one already exists for the Snap', async () => {
      const addNewKeyring = jest.fn().mockResolvedValue(undefined);
      const removeKeyring = jest.fn().mockResolvedValue(undefined);
      const { service, mocks } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });
      // First call: migration (no legacy snap keyring → early return).
      // Second call: ensureReady keyring check (snap keyring already exists).
      mocks.KeyringController.withController
        .mockImplementationOnce(async (operation) =>
          operation({ keyrings: [], addNewKeyring, removeKeyring }),
        )
        .mockImplementationOnce(async (operation) =>
          operation({
            keyrings: [
              {
                keyringV2: {
                  type: KeyringType.Snap,
                  snapId: MOCK_SNAP_ID,
                },
              },
            ],
            addNewKeyring,
            removeKeyring,
          }),
        );

      await service.init();
      await service.ensureReady(MOCK_SNAP_ID);

      expect(addNewKeyring).not.toHaveBeenCalled();
    });

    it('waits for the Snap platform to become ready', async () => {
      const { service, rootMessenger } = setup({
        snapIsReady: false,
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      await service.init();

      let resolved = false;
      const ensurePromise = service.ensureReady(MOCK_SNAP_ID).then(() => {
        resolved = true;
        return undefined;
      });

      expect(resolved).toBe(false);

      publishSnapIsReady(rootMessenger, true);

      await ensurePromise;
      expect(resolved).toBe(true);
    });

    it('waits for the Snap keyring to appear via KeyringController:stateChange', async () => {
      const { service, rootMessenger } = setup({
        keyrings: [],
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
      });

      await service.init();

      let resolved = false;
      const ensurePromise = service.ensureReady(MOCK_SNAP_ID).then(() => {
        resolved = true;
        return undefined;
      });

      // Flush microtasks so migration completes and #waitForSnapKeyring
      // subscribes.
      await flushMicrotasks();

      expect(resolved).toBe(false);

      publishKeyrings(rootMessenger, [{ type: KeyringTypes.snap }]);

      await ensurePromise;
      expect(resolved).toBe(true);
    });

    it('rejects if the Snap keyring does not appear within snapKeyringWaitTimeoutMs', async () => {
      const { service } = setup({
        keyrings: [],
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
        config: {
          snapPlatformWatcher: { snapKeyringWaitTimeoutMs: 1_000 },
        },
      });

      await service.init();

      jest.useFakeTimers();
      const ensurePromise = service.ensureReady(MOCK_SNAP_ID);
      // Attach rejection handler before advancing timers to avoid unhandled rejection.
      // eslint-disable-next-line jest/valid-expect -- assertion is awaited after advancing timers
      const expectRejection = expect(ensurePromise).rejects.toThrow(
        'Snap platform or keyrings still not ready. Aborting.',
      );
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(1_000 + 1);
      jest.useRealTimers();

      await expectRejection;
    });

    it('awaits config.snapPlatformWatcher.ensureOnboardingComplete before resolving', async () => {
      let resolveOnboarding: (() => void) | undefined;
      const ensureOnboardingComplete = jest.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveOnboarding = resolve;
          }),
      );

      const { service } = setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID, true)],
        config: { snapPlatformWatcher: { ensureOnboardingComplete } },
      });

      await service.init();

      let resolved = false;
      const ensurePromise = service.ensureReady(MOCK_SNAP_ID).then(() => {
        resolved = true;
        return undefined;
      });

      await flushMicrotasks();
      expect(ensureOnboardingComplete).toHaveBeenCalledTimes(1);
      expect(resolved).toBe(false);

      resolveOnboarding?.();

      await ensurePromise;
      expect(resolved).toBe(true);
    });
  });

  describe('getLegacySnapKeyring', () => {
    it('returns the existing Snap keyring when one is already present', async () => {
      const { service, mocks } = setup();
      const existing = buildKeyringEntry(KeyringTypes.snap);
      const { addNewKeyring } = mockWithController(mocks, [
        buildKeyringEntry(KeyringTypes.hd),
        existing,
      ]);

      const result = await service.getLegacySnapKeyring();

      expect(result).toBe(existing.keyring as unknown as SnapKeyring);
      expect(addNewKeyring).not.toHaveBeenCalled();
    });

    it('creates a new Snap keyring when none exists', async () => {
      const { service, mocks } = setup();
      const { addNewKeyring } = mockWithController(mocks, [
        buildKeyringEntry(KeyringTypes.hd),
      ]);

      const result = await service.getLegacySnapKeyring();

      expect(addNewKeyring).toHaveBeenCalledWith(KeyringTypes.snap);
      expect(result.type).toBe(KeyringTypes.snap);
    });

    it('propagates errors thrown by withController', async () => {
      const { service, mocks } = setup();
      mocks.KeyringController.withController.mockImplementation(async () => {
        throw new Error('boom');
      });

      await expect(service.getLegacySnapKeyring()).rejects.toThrow('boom');
    });
  });

  describe('handleKeyringSnapMessage', () => {
    const MOCK_MESSAGE = {
      method: 'keyring_listAccounts',
      params: {},
    } as unknown as SnapMessage;

    it('forwards the call to the legacy Snap keyring and returns its result', async () => {
      const { service, mocks } = setup();
      const handleKeyringSnapMessage = jest
        .fn()
        .mockResolvedValue({ ok: true });
      mockLegacySnapKeyring(mocks, { handleKeyringSnapMessage });

      const result = await service.handleKeyringSnapMessage(
        MOCK_SNAP_ID,
        MOCK_MESSAGE,
      );

      expect(handleKeyringSnapMessage).toHaveBeenCalledWith(
        MOCK_SNAP_ID,
        MOCK_MESSAGE,
      );
      expect(result).toStrictEqual({ ok: true });
    });

    it('propagates errors thrown by the Snap keyring', async () => {
      const { service, mocks } = setup();
      const error = new Error('snap boom');
      const handleKeyringSnapMessage = jest.fn().mockRejectedValue(error);
      mockLegacySnapKeyring(mocks, { handleKeyringSnapMessage });

      await expect(
        service.handleKeyringSnapMessage(MOCK_SNAP_ID, MOCK_MESSAGE),
      ).rejects.toThrow(error);
    });

    it('is exposed as a messenger action', async () => {
      const { service, mocks, messenger } = setup();
      const handleKeyringSnapMessage = jest.fn().mockResolvedValue('pong');
      mockLegacySnapKeyring(mocks, { handleKeyringSnapMessage });

      // Reference `service` so it isn't flagged as unused; constructing it
      // registers the messenger action under test.
      expect(service).toBeDefined();

      const result = await messenger.call(
        'SnapAccountService:handleKeyringSnapMessage',
        MOCK_SNAP_ID,
        MOCK_MESSAGE,
      );

      expect(handleKeyringSnapMessage).toHaveBeenCalledWith(
        MOCK_SNAP_ID,
        MOCK_MESSAGE,
      );
      expect(result).toBe('pong');
    });
  });

  describe('on AccountTreeController:selectedAccountGroupChange', () => {
    const MOCK_GROUP_ID = 'keyring:01JABC/group-1' as AccountGroupId;
    const MOCK_ACCOUNTS = [
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
    ];

    it('forwards the selected accounts to the Snap keyring', async () => {
      const { service, rootMessenger, mocks } = setup();
      const setSelectedAccounts = jest.fn().mockResolvedValue(undefined);
      mockLegacySnapKeyring(mocks, { setSelectedAccounts });
      mocks.AccountTreeController.getAccountGroupObject.mockReturnValue(
        buildGroup(MOCK_GROUP_ID, MOCK_ACCOUNTS),
      );
      expect(service).toBeDefined();

      publishSelectedAccountGroupChange(rootMessenger, MOCK_GROUP_ID);
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).toHaveBeenCalledWith(MOCK_GROUP_ID);
      expect(setSelectedAccounts).toHaveBeenCalledWith(MOCK_ACCOUNTS);
    });

    it('does nothing when the new group ID is empty', async () => {
      const { service, rootMessenger, mocks } = setup();
      const setSelectedAccounts = jest.fn().mockResolvedValue(undefined);
      mockLegacySnapKeyring(mocks, { setSelectedAccounts });
      expect(service).toBeDefined();

      publishSelectedAccountGroupChange(rootMessenger, '');
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).not.toHaveBeenCalled();
      expect(setSelectedAccounts).not.toHaveBeenCalled();
    });

    it('does nothing when the account group is not found', async () => {
      const { service, rootMessenger, mocks } = setup();
      const setSelectedAccounts = jest.fn().mockResolvedValue(undefined);
      mockLegacySnapKeyring(mocks, { setSelectedAccounts });
      mocks.AccountTreeController.getAccountGroupObject.mockReturnValue(
        undefined,
      );
      expect(service).toBeDefined();

      publishSelectedAccountGroupChange(rootMessenger, MOCK_GROUP_ID);
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).toHaveBeenCalledWith(MOCK_GROUP_ID);
      expect(setSelectedAccounts).not.toHaveBeenCalled();
    });

    it('logs an error when forwarding to the Snap keyring fails', async () => {
      const { service, rootMessenger, mocks } = setup();
      const error = new Error('forward boom');
      const setSelectedAccounts = jest.fn().mockRejectedValue(error);
      mockLegacySnapKeyring(mocks, { setSelectedAccounts });
      mocks.AccountTreeController.getAccountGroupObject.mockReturnValue(
        buildGroup(MOCK_GROUP_ID, MOCK_ACCOUNTS),
      );
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      expect(service).toBeDefined();

      publishSelectedAccountGroupChange(rootMessenger, MOCK_GROUP_ID);
      await flushMicrotasks();

      expect(setSelectedAccounts).toHaveBeenCalledWith(MOCK_ACCOUNTS);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error forwarding selected accounts:',
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('on KeyringController:unlock', () => {
    const MOCK_GROUP_ID = 'keyring:01JABC/group-1' as AccountGroupId;
    const MOCK_ACCOUNTS = [
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
    ];

    it('forwards the currently selected account group to the Snap keyring', async () => {
      const { service, rootMessenger, mocks } = setup();
      const setSelectedAccounts = jest.fn().mockResolvedValue(undefined);
      mockLegacySnapKeyring(mocks, { setSelectedAccounts });
      mocks.AccountTreeController.getSelectedAccountGroup.mockReturnValue(
        MOCK_GROUP_ID,
      );
      mocks.AccountTreeController.getAccountGroupObject.mockReturnValue(
        buildGroup(MOCK_GROUP_ID, MOCK_ACCOUNTS),
      );
      expect(service).toBeDefined();

      publishUnlock(rootMessenger);
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getSelectedAccountGroup,
      ).toHaveBeenCalledTimes(1);
      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).toHaveBeenCalledWith(MOCK_GROUP_ID);
      expect(setSelectedAccounts).toHaveBeenCalledWith(MOCK_ACCOUNTS);
    });

    it('does nothing when no account group is selected', async () => {
      const { service, rootMessenger, mocks } = setup();
      const setSelectedAccounts = jest.fn().mockResolvedValue(undefined);
      mockLegacySnapKeyring(mocks, { setSelectedAccounts });
      mocks.AccountTreeController.getSelectedAccountGroup.mockReturnValue('');
      expect(service).toBeDefined();

      publishUnlock(rootMessenger);
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).not.toHaveBeenCalled();
      expect(setSelectedAccounts).not.toHaveBeenCalled();
    });

    it('logs an error when forwarding to the Snap keyring fails', async () => {
      const { service, rootMessenger, mocks } = setup();
      const error = new Error('forward boom');
      const setSelectedAccounts = jest.fn().mockRejectedValue(error);
      mockLegacySnapKeyring(mocks, { setSelectedAccounts });
      mocks.AccountTreeController.getSelectedAccountGroup.mockReturnValue(
        MOCK_GROUP_ID,
      );
      mocks.AccountTreeController.getAccountGroupObject.mockReturnValue(
        buildGroup(MOCK_GROUP_ID, MOCK_ACCOUNTS),
      );
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      expect(service).toBeDefined();

      publishUnlock(rootMessenger);
      await flushMicrotasks();

      expect(setSelectedAccounts).toHaveBeenCalledWith(MOCK_ACCOUNTS);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error forwarding selected accounts:',
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe.each([
    ['accountGroupCreated', publishAccountGroupCreated] as const,
    ['accountGroupUpdated', publishAccountGroupUpdated] as const,
  ])('on AccountTreeController:%s', (_eventName, publishEvent) => {
    const MOCK_GROUP_ID = 'keyring:01JABC/group-1' as AccountGroupId;
    const OTHER_GROUP_ID = 'keyring:01JABC/group-2' as AccountGroupId;
    const MOCK_ACCOUNTS = [
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
    ];

    it('forwards the accounts from the event payload when the affected group is the selected one', async () => {
      const { service, rootMessenger, mocks } = setup();
      const setSelectedAccounts = jest.fn().mockResolvedValue(undefined);
      mockLegacySnapKeyring(mocks, { setSelectedAccounts });
      mocks.AccountTreeController.getSelectedAccountGroup.mockReturnValue(
        MOCK_GROUP_ID,
      );
      expect(service).toBeDefined();

      publishEvent(rootMessenger, buildGroup(MOCK_GROUP_ID, MOCK_ACCOUNTS));
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).not.toHaveBeenCalled();
      expect(setSelectedAccounts).toHaveBeenCalledWith(MOCK_ACCOUNTS);
    });

    it('does nothing when the affected group is not the selected one', async () => {
      const { service, rootMessenger, mocks } = setup();
      const setSelectedAccounts = jest.fn().mockResolvedValue(undefined);
      mockLegacySnapKeyring(mocks, { setSelectedAccounts });
      mocks.AccountTreeController.getSelectedAccountGroup.mockReturnValue(
        OTHER_GROUP_ID,
      );
      expect(service).toBeDefined();

      publishEvent(rootMessenger, buildGroup(MOCK_GROUP_ID, MOCK_ACCOUNTS));
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).not.toHaveBeenCalled();
      expect(setSelectedAccounts).not.toHaveBeenCalled();
    });

    it('does nothing when no account group is selected', async () => {
      const { service, rootMessenger, mocks } = setup();
      const setSelectedAccounts = jest.fn().mockResolvedValue(undefined);
      mockLegacySnapKeyring(mocks, { setSelectedAccounts });
      mocks.AccountTreeController.getSelectedAccountGroup.mockReturnValue('');
      expect(service).toBeDefined();

      publishEvent(rootMessenger, buildGroup(MOCK_GROUP_ID, MOCK_ACCOUNTS));
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).not.toHaveBeenCalled();
      expect(setSelectedAccounts).not.toHaveBeenCalled();
    });
  });

  describe('on AccountTreeController:accountGroupRemoved', () => {
    const MOCK_GROUP_ID = 'keyring:01JABC/group-1' as AccountGroupId;
    const OTHER_GROUP_ID = 'keyring:01JABC/group-2' as AccountGroupId;

    it('clears the selected accounts when the removed group is the selected one', async () => {
      const { service, rootMessenger, mocks } = setup();
      const setSelectedAccounts = jest.fn().mockResolvedValue(undefined);
      mockLegacySnapKeyring(mocks, { setSelectedAccounts });
      mocks.AccountTreeController.getSelectedAccountGroup.mockReturnValue(
        MOCK_GROUP_ID,
      );
      expect(service).toBeDefined();

      publishAccountGroupRemoved(rootMessenger, MOCK_GROUP_ID);
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).not.toHaveBeenCalled();
      expect(setSelectedAccounts).toHaveBeenCalledWith([]);
    });

    it('does nothing when the removed group is not the selected one', async () => {
      const { service, rootMessenger, mocks } = setup();
      const setSelectedAccounts = jest.fn().mockResolvedValue(undefined);
      mockLegacySnapKeyring(mocks, { setSelectedAccounts });
      mocks.AccountTreeController.getSelectedAccountGroup.mockReturnValue(
        OTHER_GROUP_ID,
      );
      expect(service).toBeDefined();

      publishAccountGroupRemoved(rootMessenger, MOCK_GROUP_ID);
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).not.toHaveBeenCalled();
      expect(setSelectedAccounts).not.toHaveBeenCalled();
    });
  });
});
