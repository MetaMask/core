import type { AccountGroupId } from '@metamask/account-api';
import { SNAP_KEYRING_TYPE } from '@metamask/eth-snap-keyring';
import type { SnapMessage } from '@metamask/eth-snap-keyring';
import type { SnapKeyring as SnapKeyringV2 } from '@metamask/eth-snap-keyring/v2';
import { KeyringEvent } from '@metamask/keyring-api';
import { KeyringType } from '@metamask/keyring-api/v2';
import {
  KeyringControllerError,
  KeyringControllerErrorMessage,
} from '@metamask/keyring-controller';
import type {
  KeyringEntry,
  KeyringMetadata,
  KeyringSelectorV2,
  RestrictedController,
} from '@metamask/keyring-controller';
import { SnapManageAccountsMethod } from '@metamask/keyring-snap-sdk';
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

/** Mock truncated snap type for tests. */
type MockTruncatedSnap = Pick<
  TruncatedSnap,
  'id' | 'initialPermissions' | 'enabled' | 'blocked'
>;

/** Mock account group type for tests. */
type MockAccountGroup = Pick<AccountGroupObject, 'id' | 'accounts'>;

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
    withKeyringV2: jest.Mock;
    withKeyringV2Unsafe: jest.Mock;
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
      'KeyringController:withKeyringV2',
      'KeyringController:withKeyringV2Unsafe',
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
 * @param hasKeyring - Whether the Snap declares the `endowment:keyring` initial permission (default: `true`).
 * @returns A minimal `TruncatedSnap`.
 */
function buildSnap(id: string, hasKeyring = true): TruncatedSnap {
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
 * Configures `mocks.KeyringController.withKeyringV2Unsafe` so that the
 * operation receives a Snap keyring v2 matching the given selector, or
 * throws `KeyringNotFound` when none matches.
 *
 * @param mocks - The mocks object from {@link setup}.
 * @param keyrings - The available v2 Snap keyrings, keyed by snap ID.
 */
function mockWithKeyringV2Unsafe(
  mocks: Mocks,
  keyrings: Record<
    string,
    {
      setSelectedAccounts?: jest.Mock;
      hasAccount?: (id: string) => boolean;
      handleKeyringSnapMessage?: jest.Mock;
    }
  >,
): void {
  mocks.KeyringController.withKeyringV2Unsafe.mockImplementation(
    async (
      selector: KeyringSelectorV2,
      operation: (args: {
        keyring: SnapKeyringV2;
        metadata: KeyringMetadata;
      }) => Promise<unknown>,
    ) => {
      const entry = Object.entries(keyrings).find(([snapId, kr]) =>
        selector.filter?.(
          {
            type: KeyringType.Snap,
            snapId,
            ...kr,
          } as unknown,
          { id: `id-${snapId}`, name: 'snap' } as KeyringMetadata,
        ),
      );
      if (!entry) {
        throw new KeyringControllerError(
          KeyringControllerErrorMessage.KeyringNotFound,
        );
      }
      const [snapId, kr] = entry;
      return operation({
        keyring: {
          type: KeyringType.Snap,
          snapId,
          hasAccount: () => true,
          ...kr,
        } as unknown as SnapKeyringV2,
        metadata: { id: `id-${snapId}`, name: 'snap' } as KeyringMetadata,
      });
    },
  );
}

/**
 * Constructs the service under test with sensible defaults. Calls
 * `service.init()` before returning unless `init: false` is passed.
 *
 * @param args - The arguments to this function.
 * @param args.snapIsReady - Initial value of `SnapController.isReady`.
 * @param args.runnableSnaps - Snaps returned by `SnapController:getRunnableSnaps`.
 * @param args.config - Optional service config.
 * @param args.init - Whether to call `service.init()` before returning (default: `true`).
 * @returns The new service, root messenger, service messenger, and mocks.
 */
async function setup({
  snapIsReady = true,
  runnableSnaps = [],
  config,
  init = true,
}: {
  snapIsReady?: boolean;
  runnableSnaps?: TruncatedSnap[];
  config?: SnapAccountServiceOptions['config'];
  init?: boolean;
} = {}): Promise<{
  service: SnapAccountService;
  rootMessenger: RootMessenger;
  messenger: SnapAccountServiceMessenger;
  mocks: Mocks;
}> {
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
      getState: jest.fn().mockReturnValue({ keyrings: [] }),
      withController: jest.fn(),
      withKeyringV2: jest.fn(),
      withKeyringV2Unsafe: jest.fn(),
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
    'KeyringController:withKeyringV2',
    mocks.KeyringController.withKeyringV2,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:withKeyringV2Unsafe',
    mocks.KeyringController.withKeyringV2Unsafe,
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

  if (init) {
    await service.init();
  }

  return { service, rootMessenger, messenger, mocks };
}

const MOCK_SNAP_ID = 'npm:@metamask/mock-snap' as SnapId;
const MOCK_OTHER_SNAP_ID = 'npm:@metamask/other-snap' as SnapId;

describe('SnapAccountService', () => {
  describe('init', () => {
    it('resolves without throwing', async () => {
      const { service } = await setup({ init: false });

      expect(await service.init()).toBeUndefined();
    });
  });

  describe('getSnaps', () => {
    it('exposes tracked Snaps seeded by init', async () => {
      const { service } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
      });

      expect(service.getSnaps()).toStrictEqual([MOCK_SNAP_ID]);
    });
  });

  describe('migrate', () => {
    it('runs the migration only once when called concurrently', async () => {
      const { service, mocks } = await setup();
      mocks.KeyringController.withController.mockResolvedValue(undefined);

      await Promise.all([service.migrate(), service.migrate()]);

      expect(mocks.KeyringController.withController).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when no legacy Snap keyring is present', async () => {
      const addNewKeyring = jest.fn().mockResolvedValue(undefined);
      const removeKeyring = jest.fn().mockResolvedValue(undefined);
      const { service, mocks } = await setup();
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
      const { service, mocks } = await setup();
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

    it('does not re-run after a successful migration', async () => {
      const { service, mocks } = await setup();
      mocks.KeyringController.withController.mockResolvedValue(undefined);

      await service.migrate();
      await service.migrate();

      expect(mocks.KeyringController.withController).toHaveBeenCalledTimes(1);
    });

    it('retries on a subsequent call after a failed migration', async () => {
      const { service, mocks } = await setup();
      const error = new Error('migration boom');
      mocks.KeyringController.withController
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(undefined);

      await expect(service.migrate()).rejects.toThrow(error);
      expect(await service.migrate()).toBeUndefined();

      expect(mocks.KeyringController.withController).toHaveBeenCalledTimes(2);
    });

    it('shares the rejection across concurrent callers but allows a later retry', async () => {
      const { service, mocks } = await setup();
      const error = new Error('migration boom');
      mocks.KeyringController.withController
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(undefined);

      const [first, second] = await Promise.allSettled([
        service.migrate(),
        service.migrate(),
      ]);
      expect(first).toStrictEqual({ status: 'rejected', reason: error });
      expect(second).toStrictEqual({ status: 'rejected', reason: error });
      expect(mocks.KeyringController.withController).toHaveBeenCalledTimes(1);

      expect(await service.migrate()).toBeUndefined();
      expect(mocks.KeyringController.withController).toHaveBeenCalledTimes(2);
    });
  });

  describe('ensureReady', () => {
    it('throws when the Snap is not tracked', async () => {
      const { service } = await setup();

      await expect(service.ensureReady(MOCK_SNAP_ID)).rejects.toThrow(
        `Unknown snap: "${MOCK_SNAP_ID}"`,
      );
    });

    it('throws before init even for runnable Snaps', async () => {
      const { service } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
        init: false,
      });

      await expect(service.ensureReady(MOCK_SNAP_ID)).rejects.toThrow(
        `Unknown snap: "${MOCK_SNAP_ID}"`,
      );
    });

    it('resolves when platform is already ready', async () => {
      const { service } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
      });

      expect(await service.ensureReady(MOCK_SNAP_ID)).toBeUndefined();
    });

    it('runs the migration before checking platform readiness', async () => {
      const { service, mocks } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
      });
      mocks.KeyringController.withController.mockResolvedValue(undefined);

      // `migrate` is invoked once + `#createKeyringForSnap` is invoked once
      // (the cached migrate call is a no-op on subsequent calls).
      await service.ensureReady(MOCK_SNAP_ID);

      expect(mocks.KeyringController.withController).toHaveBeenCalledTimes(2);
    });

    it('creates a v2 keyring for the Snap when one does not exist yet', async () => {
      const addNewKeyring = jest.fn().mockResolvedValue(undefined);
      const removeKeyring = jest.fn().mockResolvedValue(undefined);
      const { service, mocks } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
      });
      mocks.KeyringController.withController.mockImplementation(
        async (operation) =>
          operation({ keyrings: [], addNewKeyring, removeKeyring }),
      );

      await service.ensureReady(MOCK_SNAP_ID);

      expect(addNewKeyring).toHaveBeenCalledWith(KeyringType.Snap, {
        snapId: MOCK_SNAP_ID,
        accounts: {},
      });
    });

    it('does not create a v2 keyring when one already exists for the Snap', async () => {
      const addNewKeyring = jest.fn().mockResolvedValue(undefined);
      const removeKeyring = jest.fn().mockResolvedValue(undefined);
      const { service, mocks } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
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

      await service.ensureReady(MOCK_SNAP_ID);

      expect(addNewKeyring).not.toHaveBeenCalled();
    });

    it('waits for the Snap platform to become ready', async () => {
      const { service, rootMessenger } = await setup({
        snapIsReady: false,
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
      });

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

    it('awaits config.snapPlatformWatcher.ensureOnboardingComplete before resolving', async () => {
      let resolveOnboarding: (() => void) | undefined;
      const ensureOnboardingComplete = jest.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveOnboarding = resolve;
          }),
      );

      const { service } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
        config: { snapPlatformWatcher: { ensureOnboardingComplete } },
      });

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

  describe('handleKeyringSnapMessage', () => {
    const MOCK_MESSAGE = {
      method: KeyringEvent.AccountUpdated,
      params: {},
    } as unknown as SnapMessage;
    const MOCK_ACCOUNT_CREATED_MESSAGE = {
      method: KeyringEvent.AccountCreated,
      params: {},
    } as unknown as SnapMessage;
    const MOCK_GROUP_ID = 'keyring:01JABC/group-1' as AccountGroupId;
    const MOCK_ACCOUNTS = [
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
    ];

    it('forwards the message to the matching v2 Snap keyring and returns its result', async () => {
      const { service, mocks } = await setup();
      const handleKeyringSnapMessage = jest
        .fn()
        .mockResolvedValue({ ok: true });
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: { handleKeyringSnapMessage },
      });

      const result = await service.handleKeyringSnapMessage(
        MOCK_SNAP_ID,
        MOCK_MESSAGE,
      );

      expect(handleKeyringSnapMessage).toHaveBeenCalledWith(MOCK_MESSAGE);
      expect(result).toStrictEqual({ ok: true });
    });

    it('short-circuits GetSelectedAccounts by returning only the selected group accounts the Snap actually owns', async () => {
      const { service, mocks } = await setup();
      mocks.AccountTreeController.getSelectedAccountGroup.mockReturnValue(
        MOCK_GROUP_ID,
      );
      mocks.AccountTreeController.getAccountGroupObject.mockReturnValue(
        buildGroup(MOCK_GROUP_ID, MOCK_ACCOUNTS),
      );
      // The Snap only owns the first account of the selected group.
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: {
          hasAccount: (id) => id === MOCK_ACCOUNTS[0],
        },
      });

      const result = await service.handleKeyringSnapMessage(MOCK_SNAP_ID, {
        method: SnapManageAccountsMethod.GetSelectedAccounts,
        params: {},
      } as unknown as SnapMessage);

      expect(result).toStrictEqual([MOCK_ACCOUNTS[0]]);
      expect(mocks.KeyringController.withKeyringV2).not.toHaveBeenCalled();
    });

    it('returns an empty array for GetSelectedAccounts when no account group is selected', async () => {
      const { service, mocks } = await setup();
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: { hasAccount: () => true },
      });

      const result = await service.handleKeyringSnapMessage(MOCK_SNAP_ID, {
        method: SnapManageAccountsMethod.GetSelectedAccounts,
        params: {},
      } as unknown as SnapMessage);

      expect(result).toStrictEqual([]);
    });

    it('throws a dedicated error when no v2 Snap keyring exists for the given Snap', async () => {
      const { service, mocks } = await setup();
      mockWithKeyringV2Unsafe(mocks, {});

      await expect(
        service.handleKeyringSnapMessage(MOCK_SNAP_ID, MOCK_MESSAGE),
      ).rejects.toThrow(
        `Cannot delegate keyring Snap message, keyring does not exist yet for Snap "${MOCK_SNAP_ID}".`,
      );
    });

    it('propagates non-KeyringNotFound errors thrown by the Snap keyring', async () => {
      const { service, mocks } = await setup();
      const error = new Error('snap boom');
      const handleKeyringSnapMessage = jest.fn().mockRejectedValue(error);
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: { handleKeyringSnapMessage },
      });

      await expect(
        service.handleKeyringSnapMessage(MOCK_SNAP_ID, MOCK_MESSAGE),
      ).rejects.toThrow(error);
    });

    it('ensures the v2 keyring exists before forwarding an AccountCreated event', async () => {
      const { service, mocks } = await setup();
      // `#ensureKeyringIsReady` uses `withController` — start with no keyring
      // so it must create one.
      const { addNewKeyring } = mockWithController(mocks, []);
      const handleKeyringSnapMessage = jest.fn().mockResolvedValue(null);
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: { handleKeyringSnapMessage },
      });

      await service.handleKeyringSnapMessage(
        MOCK_SNAP_ID,
        MOCK_ACCOUNT_CREATED_MESSAGE,
      );

      expect(addNewKeyring).toHaveBeenCalledWith(KeyringType.Snap, {
        snapId: MOCK_SNAP_ID,
        accounts: {},
      });
      expect(handleKeyringSnapMessage).toHaveBeenCalledWith(
        MOCK_ACCOUNT_CREATED_MESSAGE,
      );
    });

    it('is exposed as a messenger action', async () => {
      const { service, mocks, messenger } = await setup();
      const handleKeyringSnapMessage = jest.fn().mockResolvedValue('pong');
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: { handleKeyringSnapMessage },
      });

      // Reference `service` so it isn't flagged as unused; constructing it
      // registers the messenger action under test.
      expect(service).toBeDefined();

      const result = await messenger.call(
        'SnapAccountService:handleKeyringSnapMessage',
        MOCK_SNAP_ID,
        MOCK_MESSAGE,
      );

      expect(handleKeyringSnapMessage).toHaveBeenCalledWith(MOCK_MESSAGE);
      expect(result).toBe('pong');
    });
  });

  describe('on AccountTreeController:selectedAccountGroupChange', () => {
    const MOCK_GROUP_ID = 'keyring:01JABC/group-1' as AccountGroupId;
    const MOCK_ACCOUNTS = [
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
    ];

    it('forwards owned accounts to every tracked v2 Snap keyring in parallel', async () => {
      const { rootMessenger, mocks } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID), buildSnap(MOCK_OTHER_SNAP_ID)],
      });
      const setSelectedAccounts1 = jest.fn().mockResolvedValue(undefined);
      const setSelectedAccounts2 = jest.fn().mockResolvedValue(undefined);
      // Snap A owns the first account; Snap B owns the second.
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: {
          setSelectedAccounts: setSelectedAccounts1,
          hasAccount: (id) => id === MOCK_ACCOUNTS[0],
        },
        [MOCK_OTHER_SNAP_ID]: {
          setSelectedAccounts: setSelectedAccounts2,
          hasAccount: (id) => id === MOCK_ACCOUNTS[1],
        },
      });
      mocks.AccountTreeController.getAccountGroupObject.mockReturnValue(
        buildGroup(MOCK_GROUP_ID, MOCK_ACCOUNTS),
      );

      publishSelectedAccountGroupChange(rootMessenger, MOCK_GROUP_ID);
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).toHaveBeenCalledWith(MOCK_GROUP_ID);
      expect(setSelectedAccounts1).toHaveBeenCalledWith([MOCK_ACCOUNTS[0]]);
      expect(setSelectedAccounts2).toHaveBeenCalledWith([MOCK_ACCOUNTS[1]]);
    });

    it('forwards an empty list to a tracked Snap that owns none of the selected accounts', async () => {
      const { rootMessenger, mocks } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
      });
      const setSelectedAccounts = jest.fn().mockResolvedValue(undefined);
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: {
          setSelectedAccounts,
          hasAccount: () => false,
        },
      });
      mocks.AccountTreeController.getAccountGroupObject.mockReturnValue(
        buildGroup(MOCK_GROUP_ID, MOCK_ACCOUNTS),
      );

      publishSelectedAccountGroupChange(rootMessenger, MOCK_GROUP_ID);
      await flushMicrotasks();

      expect(setSelectedAccounts).toHaveBeenCalledWith([]);
    });

    it('does nothing when no Snap is tracked', async () => {
      const { service, rootMessenger, mocks } = await setup();
      mocks.AccountTreeController.getAccountGroupObject.mockReturnValue(
        buildGroup(MOCK_GROUP_ID, MOCK_ACCOUNTS),
      );

      publishSelectedAccountGroupChange(rootMessenger, MOCK_GROUP_ID);
      await flushMicrotasks();

      expect(
        mocks.KeyringController.withKeyringV2Unsafe,
      ).not.toHaveBeenCalled();
      expect(service).toBeDefined();
    });

    it('silently skips a tracked Snap that has no v2 keyring yet', async () => {
      const { service, rootMessenger, mocks } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
      });
      // No keyrings configured → withKeyringV2Unsafe throws KeyringNotFound.
      mockWithKeyringV2Unsafe(mocks, {});
      mocks.AccountTreeController.getAccountGroupObject.mockReturnValue(
        buildGroup(MOCK_GROUP_ID, MOCK_ACCOUNTS),
      );
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      publishSelectedAccountGroupChange(rootMessenger, MOCK_GROUP_ID);
      await flushMicrotasks();

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(service).toBeDefined();
      consoleErrorSpy.mockRestore();
    });

    it('does nothing when the new group ID is empty', async () => {
      const { service, rootMessenger, mocks } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
      });
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: { setSelectedAccounts: jest.fn() },
      });

      publishSelectedAccountGroupChange(rootMessenger, '');
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).not.toHaveBeenCalled();
      expect(
        mocks.KeyringController.withKeyringV2Unsafe,
      ).not.toHaveBeenCalled();
      expect(service).toBeDefined();
    });

    it('does nothing when the account group is not found', async () => {
      const { service, rootMessenger, mocks } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
      });
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: { setSelectedAccounts: jest.fn() },
      });
      mocks.AccountTreeController.getAccountGroupObject.mockReturnValue(
        undefined,
      );

      publishSelectedAccountGroupChange(rootMessenger, MOCK_GROUP_ID);
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).toHaveBeenCalledWith(MOCK_GROUP_ID);
      expect(
        mocks.KeyringController.withKeyringV2Unsafe,
      ).not.toHaveBeenCalled();
      expect(service).toBeDefined();
    });

    it('logs an error when forwarding to a v2 Snap keyring fails, but still forwards to the others', async () => {
      const { service, rootMessenger, mocks } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID), buildSnap(MOCK_OTHER_SNAP_ID)],
      });
      const error = new Error('forward boom');
      const setSelectedAccounts1 = jest.fn().mockRejectedValue(error);
      const setSelectedAccounts2 = jest.fn().mockResolvedValue(undefined);
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: { setSelectedAccounts: setSelectedAccounts1 },
        [MOCK_OTHER_SNAP_ID]: { setSelectedAccounts: setSelectedAccounts2 },
      });
      mocks.AccountTreeController.getAccountGroupObject.mockReturnValue(
        buildGroup(MOCK_GROUP_ID, MOCK_ACCOUNTS),
      );
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      publishSelectedAccountGroupChange(rootMessenger, MOCK_GROUP_ID);
      await flushMicrotasks();

      expect(setSelectedAccounts1).toHaveBeenCalled();
      expect(setSelectedAccounts2).toHaveBeenCalledWith(MOCK_ACCOUNTS);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Error forwarding selected accounts to Snap "${MOCK_SNAP_ID}":`,
        error,
      );
      expect(service).toBeDefined();
      consoleErrorSpy.mockRestore();
    });

    it('logs a top-level error if forwarding itself rejects unexpectedly', async () => {
      const { service, rootMessenger, mocks } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
      });
      const innerError = new Error('inner boom');
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: {
          setSelectedAccounts: jest.fn().mockRejectedValue(innerError),
        },
      });
      mocks.AccountTreeController.getAccountGroupObject.mockReturnValue(
        buildGroup(MOCK_GROUP_ID, MOCK_ACCOUNTS),
      );
      // Force the per-Snap error handler itself to throw on its first
      // invocation, so the rejection escapes the inner try/catch and reaches
      // the outer `.catch` (the top-level fallback). Subsequent calls
      // (including the top-level one) no-op.
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      consoleErrorSpy.mockImplementationOnce(() => {
        throw new Error('logger boom');
      });

      publishSelectedAccountGroupChange(rootMessenger, MOCK_GROUP_ID);
      await flushMicrotasks();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error forwarding selected accounts:',
        expect.any(Error),
      );
      expect(service).toBeDefined();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('on KeyringController:unlock', () => {
    const MOCK_GROUP_ID = 'keyring:01JABC/group-1' as AccountGroupId;
    const MOCK_ACCOUNTS = [
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
    ];

    it('forwards the currently selected account group to every tracked v2 Snap keyring', async () => {
      const { service, rootMessenger, mocks } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
      });
      const setSelectedAccounts = jest.fn().mockResolvedValue(undefined);
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: { setSelectedAccounts },
      });
      mocks.AccountTreeController.getSelectedAccountGroup.mockReturnValue(
        MOCK_GROUP_ID,
      );
      mocks.AccountTreeController.getAccountGroupObject.mockReturnValue(
        buildGroup(MOCK_GROUP_ID, MOCK_ACCOUNTS),
      );

      publishUnlock(rootMessenger);
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getSelectedAccountGroup,
      ).toHaveBeenCalledTimes(1);
      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).toHaveBeenCalledWith(MOCK_GROUP_ID);
      expect(setSelectedAccounts).toHaveBeenCalledWith(MOCK_ACCOUNTS);
      expect(service).toBeDefined();
    });

    it('does nothing when no account group is selected', async () => {
      const { service, rootMessenger, mocks } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
      });
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: { setSelectedAccounts: jest.fn() },
      });
      mocks.AccountTreeController.getSelectedAccountGroup.mockReturnValue('');

      publishUnlock(rootMessenger);
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).not.toHaveBeenCalled();
      expect(
        mocks.KeyringController.withKeyringV2Unsafe,
      ).not.toHaveBeenCalled();
      expect(service).toBeDefined();
    });

    it('logs an error when forwarding to a v2 Snap keyring fails', async () => {
      const { service, rootMessenger, mocks } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
      });
      const error = new Error('forward boom');
      const setSelectedAccounts = jest.fn().mockRejectedValue(error);
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: { setSelectedAccounts },
      });
      mocks.AccountTreeController.getSelectedAccountGroup.mockReturnValue(
        MOCK_GROUP_ID,
      );
      mocks.AccountTreeController.getAccountGroupObject.mockReturnValue(
        buildGroup(MOCK_GROUP_ID, MOCK_ACCOUNTS),
      );
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      publishUnlock(rootMessenger);
      await flushMicrotasks();

      expect(setSelectedAccounts).toHaveBeenCalledWith(MOCK_ACCOUNTS);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Error forwarding selected accounts to Snap "${MOCK_SNAP_ID}":`,
        error,
      );
      expect(service).toBeDefined();
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
      const { service, rootMessenger, mocks } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
      });
      const setSelectedAccounts = jest.fn().mockResolvedValue(undefined);
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: { setSelectedAccounts },
      });
      mocks.AccountTreeController.getSelectedAccountGroup.mockReturnValue(
        MOCK_GROUP_ID,
      );

      publishEvent(rootMessenger, buildGroup(MOCK_GROUP_ID, MOCK_ACCOUNTS));
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).not.toHaveBeenCalled();
      expect(setSelectedAccounts).toHaveBeenCalledWith(MOCK_ACCOUNTS);
      expect(service).toBeDefined();
    });

    it('does nothing when the affected group is not the selected one', async () => {
      const { service, rootMessenger, mocks } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
      });
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: { setSelectedAccounts: jest.fn() },
      });
      mocks.AccountTreeController.getSelectedAccountGroup.mockReturnValue(
        OTHER_GROUP_ID,
      );

      publishEvent(rootMessenger, buildGroup(MOCK_GROUP_ID, MOCK_ACCOUNTS));
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).not.toHaveBeenCalled();
      expect(
        mocks.KeyringController.withKeyringV2Unsafe,
      ).not.toHaveBeenCalled();
      expect(service).toBeDefined();
    });

    it('does nothing when no account group is selected', async () => {
      const { service, rootMessenger, mocks } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
      });
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: { setSelectedAccounts: jest.fn() },
      });
      mocks.AccountTreeController.getSelectedAccountGroup.mockReturnValue('');

      publishEvent(rootMessenger, buildGroup(MOCK_GROUP_ID, MOCK_ACCOUNTS));
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).not.toHaveBeenCalled();
      expect(
        mocks.KeyringController.withKeyringV2Unsafe,
      ).not.toHaveBeenCalled();
      expect(service).toBeDefined();
    });
  });

  describe('on AccountTreeController:accountGroupRemoved', () => {
    const MOCK_GROUP_ID = 'keyring:01JABC/group-1' as AccountGroupId;
    const OTHER_GROUP_ID = 'keyring:01JABC/group-2' as AccountGroupId;

    it('clears the selected accounts on every tracked v2 Snap keyring when the removed group is the selected one', async () => {
      const { service, rootMessenger, mocks } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
      });
      const setSelectedAccounts = jest.fn().mockResolvedValue(undefined);
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: { setSelectedAccounts },
      });
      mocks.AccountTreeController.getSelectedAccountGroup.mockReturnValue(
        MOCK_GROUP_ID,
      );

      publishAccountGroupRemoved(rootMessenger, MOCK_GROUP_ID);
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).not.toHaveBeenCalled();
      expect(setSelectedAccounts).toHaveBeenCalledWith([]);
      expect(service).toBeDefined();
    });

    it('does nothing when the removed group is not the selected one', async () => {
      const { service, rootMessenger, mocks } = await setup({
        runnableSnaps: [buildSnap(MOCK_SNAP_ID)],
      });
      mockWithKeyringV2Unsafe(mocks, {
        [MOCK_SNAP_ID]: { setSelectedAccounts: jest.fn() },
      });
      mocks.AccountTreeController.getSelectedAccountGroup.mockReturnValue(
        OTHER_GROUP_ID,
      );

      publishAccountGroupRemoved(rootMessenger, MOCK_GROUP_ID);
      await flushMicrotasks();

      expect(
        mocks.AccountTreeController.getAccountGroupObject,
      ).not.toHaveBeenCalled();
      expect(
        mocks.KeyringController.withKeyringV2Unsafe,
      ).not.toHaveBeenCalled();
      expect(service).toBeDefined();
    });
  });
});
