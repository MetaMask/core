import { deriveStateFromMetadata } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MockAnyNamespace,
  type MessengerActions,
  type MessengerEvents,
} from '@metamask/messenger';

import {
  UserProfileController,
  type UserProfileControllerMessenger,
} from './UserProfileController';
import type {
  UserProfileUpdateRequest,
  AccountWithScopes,
} from './UserProfileService';

/**
 * Creates a mock InternalAccount object for testing purposes.
 *
 * @param address - The address of the mock account.
 * @param withEntropy - Whether to include entropy information in the account options. Defaults to true.
 * @returns A mock InternalAccount object.
 */
function createMockAccount(
  address: string,
  withEntropy = true,
): InternalAccount {
  return {
    id: `id-${address}`,
    address,
    options: withEntropy
      ? {
          entropy: {
            id: `entropy-${address}`,
            type: 'mnemonic',
            derivationPath: '',
            groupIndex: 0,
          },
        }
      : {},
    methods: [],
    scopes: ['eip155:1'],
    type: 'any:account',
    metadata: {
      keyring: {
        type: 'Test Keyring',
      },
      name: `Account ${address}`,
      importTime: 1713153716,
    },
  };
}

describe('UserProfileController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  describe('constructor subscriptions', () => {
    describe('when KeyringController:unlock is published', () => {
      it('starts polling', async () => {
        await withController(async ({ controller, rootMessenger }) => {
          const pollSpy = jest.spyOn(controller, 'startPolling');

          rootMessenger.publish('KeyringController:unlock');

          expect(pollSpy).toHaveBeenCalledTimes(1);
        });
      });

      describe('when `firstSyncCompleted` is false', () => {
        it('adds existing accounts to the queue if the user opted in', async () => {
          await withController(
            { options: { assertUserOptedIn: () => true } },
            async ({ controller, rootMessenger }) => {
              rootMessenger.registerActionHandler(
                'AccountsController:listAccounts',
                () => {
                  return [
                    createMockAccount('0xAccount1'),
                    createMockAccount('0xAccount2', false),
                  ];
                },
              );

              rootMessenger.publish('KeyringController:unlock');
              // Wait for async operations to complete.
              await Promise.resolve();

              expect(controller.state.firstSyncCompleted).toBe(true);
              expect(controller.state.syncQueue).toStrictEqual({
                'entropy-0xAccount1': [
                  { address: '0xAccount1', scopes: ['eip155:1'] },
                ],
                null: [{ address: '0xAccount2', scopes: ['eip155:1'] }],
              });
            },
          );
        });

        it('does not add existing accounts to the queue if the user has not opted in', async () => {
          await withController(
            { options: { assertUserOptedIn: () => false } },
            async ({ controller, rootMessenger }) => {
              rootMessenger.registerActionHandler(
                'AccountsController:listAccounts',
                () => {
                  return [
                    createMockAccount('0xAccount1'),
                    createMockAccount('0xAccount2'),
                  ];
                },
              );

              rootMessenger.publish('KeyringController:unlock');
              // Wait for async operations to complete.
              await Promise.resolve();

              expect(controller.state.firstSyncCompleted).toBe(false);
              expect(controller.state.syncQueue).toStrictEqual({});
            },
          );
        });
      });

      describe('when `firstSyncCompleted` is true', () => {
        it.each([{ assertUserOptedIn: true }, { assertUserOptedIn: false }])(
          'does not add existing accounts to the queue when `assertUserOptedIn` is $assertUserOptedIn',
          async ({ assertUserOptedIn }) => {
            await withController(
              {
                options: {
                  assertUserOptedIn: () => assertUserOptedIn,
                  state: { firstSyncCompleted: true },
                },
              },
              async ({ controller, rootMessenger }) => {
                rootMessenger.registerActionHandler(
                  'AccountsController:listAccounts',
                  () => {
                    return [
                      createMockAccount('0xAccount1'),
                      createMockAccount('0xAccount2'),
                    ];
                  },
                );

                rootMessenger.publish('KeyringController:unlock');
                // Wait for async operations to complete.
                await Promise.resolve();

                expect(controller.state.firstSyncCompleted).toBe(true);
                expect(controller.state.syncQueue).toStrictEqual({});
              },
            );
          },
        );
      });
    });

    describe('when KeyringController:lock is published', () => {
      it('stops polling', async () => {
        await withController(async ({ controller, rootMessenger }) => {
          const pollSpy = jest.spyOn(controller, 'stopAllPolling');

          rootMessenger.publish('KeyringController:lock');

          expect(pollSpy).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('when AccountsController:accountAdded is published', () => {
      it('adds the new account to the sync queue if the user has opted in and the account has an entropy source id', async () => {
        await withController(
          { options: { assertUserOptedIn: () => true } },
          async ({ controller, rootMessenger }) => {
            const newAccount = createMockAccount('0xNewAccount');

            rootMessenger.publish(
              'AccountsController:accountAdded',
              newAccount,
            );
            // Wait for async operations to complete.
            await Promise.resolve();

            expect(controller.state.syncQueue).toStrictEqual({
              'entropy-0xNewAccount': [
                { address: '0xNewAccount', scopes: ['eip155:1'] },
              ],
            });
          },
        );
      });

      it('adds the new account to the sync queue under `null` if the user has opted in and the account has no entropy source id', async () => {
        await withController(
          { options: { assertUserOptedIn: () => true } },
          async ({ controller, rootMessenger }) => {
            const newAccount = createMockAccount('0xNewAccount', false);

            rootMessenger.publish(
              'AccountsController:accountAdded',
              newAccount,
            );
            // Wait for async operations to complete.
            await Promise.resolve();

            expect(controller.state.syncQueue).toStrictEqual({
              null: [{ address: '0xNewAccount', scopes: ['eip155:1'] }],
            });
          },
        );
      });

      it('does not add the new account to the sync queue if the user has not opted in', async () => {
        await withController(
          { options: { assertUserOptedIn: () => false } },
          async ({ controller, rootMessenger }) => {
            const newAccount = createMockAccount('0xNewAccount');

            rootMessenger.publish(
              'AccountsController:accountAdded',
              newAccount,
            );

            expect(controller.state.syncQueue).toStrictEqual({});
          },
        );
      });
    });

    describe('when AccountsController:accountRemoved is published', () => {
      it('removes the account from the sync queue if it exists there', async () => {
        const accounts: Record<string, AccountWithScopes[]> = {
          id1: [
            { address: '0xAccount1', scopes: ['eip155:1'] },
            { address: '0xAccount2', scopes: ['eip155:1'] },
          ],
          id2: [{ address: '0xAccount3', scopes: ['eip155:1'] }],
        };
        await withController(
          {
            options: { state: { syncQueue: accounts } },
          },
          async ({ controller, rootMessenger }) => {
            rootMessenger.publish(
              'AccountsController:accountRemoved',
              '0xAccount2',
            );
            // Wait for async operations to complete.
            await Promise.resolve();

            expect(controller.state.syncQueue).toStrictEqual({
              id1: [{ address: '0xAccount1', scopes: ['eip155:1'] }],
              id2: [{ address: '0xAccount3', scopes: ['eip155:1'] }],
            });
          },
        );
      });

      it('removes the key from the sync queue if it becomes empty after account removal', async () => {
        const accounts: Record<string, AccountWithScopes[]> = {
          id1: [{ address: '0xAccount1', scopes: ['eip155:1'] }],
          id2: [{ address: '0xAccount2', scopes: ['eip155:1'] }],
        };
        await withController(
          {
            options: { state: { syncQueue: accounts } },
          },
          async ({ controller, rootMessenger }) => {
            rootMessenger.publish(
              'AccountsController:accountRemoved',
              '0xAccount1',
            );
            // Wait for async operations to complete.
            await Promise.resolve();

            expect(controller.state.syncQueue).toStrictEqual({
              id2: [{ address: '0xAccount2', scopes: ['eip155:1'] }],
            });
          },
        );
      });

      it('does nothing if the account is not in the sync queue', async () => {
        const accounts: Record<string, AccountWithScopes[]> = {
          id1: [{ address: '0xAccount1', scopes: ['eip155:1'] }],
        };
        await withController(
          {
            options: { state: { syncQueue: accounts } },
          },
          async ({ controller, rootMessenger }) => {
            rootMessenger.publish(
              'AccountsController:accountRemoved',
              '0xAccount2',
            );

            expect(controller.state.syncQueue).toStrictEqual(accounts);
          },
        );
      });
    });
  });

  describe('_executePoll', () => {
    it('processes the sync queue on each poll', async () => {
      const accounts: Record<string, AccountWithScopes[]> = {
        id1: [{ address: '0xAccount1', scopes: ['eip155:1'] }],
      };
      await withController(
        {
          options: { state: { syncQueue: accounts } },
        },
        async ({ controller, getMetaMetricsId, mockUpdateProfile }) => {
          await controller._executePoll();

          expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
          expect(mockUpdateProfile).toHaveBeenCalledWith({
            metametricsId: getMetaMetricsId(),
            entropySourceId: 'id1',
            accounts: [{ address: '0xAccount1', scopes: ['eip155:1'] }],
          });
          expect(controller.state.syncQueue).toStrictEqual({});
        },
      );
    });

    it('processes the sync queue in batches grouped by entropySourceId', async () => {
      const accounts: Record<string, AccountWithScopes[]> = {
        id1: [
          { address: '0xAccount1', scopes: ['eip155:1'] },
          { address: '0xAccount2', scopes: ['eip155:1'] },
        ],
        id2: [{ address: '0xAccount3', scopes: ['eip155:1'] }],
        null: [{ address: '0xAccount4', scopes: ['eip155:1'] }],
      };
      await withController(
        {
          options: { state: { syncQueue: accounts } },
        },
        async ({ controller, getMetaMetricsId, mockUpdateProfile }) => {
          await controller._executePoll();

          expect(mockUpdateProfile).toHaveBeenCalledTimes(3);
          expect(mockUpdateProfile).toHaveBeenNthCalledWith(1, {
            metametricsId: getMetaMetricsId(),
            entropySourceId: 'id1',
            accounts: [
              { address: '0xAccount1', scopes: ['eip155:1'] },
              { address: '0xAccount2', scopes: ['eip155:1'] },
            ],
          });
          expect(mockUpdateProfile).toHaveBeenNthCalledWith(2, {
            metametricsId: getMetaMetricsId(),
            entropySourceId: 'id2',
            accounts: [{ address: '0xAccount3', scopes: ['eip155:1'] }],
          });
          expect(mockUpdateProfile).toHaveBeenNthCalledWith(3, {
            metametricsId: getMetaMetricsId(),
            entropySourceId: null,
            accounts: [{ address: '0xAccount4', scopes: ['eip155:1'] }],
          });
          expect(controller.state.syncQueue).toStrictEqual({});
        },
      );
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInDebugSnapshot',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "firstSyncCompleted": false,
          }
        `);
      });
    });

    it('includes expected state in state logs', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInStateLogs',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "firstSyncCompleted": false,
            "syncQueue": Object {},
          }
        `);
      });
    });

    it('persists expected state', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'persist',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "firstSyncCompleted": false,
            "syncQueue": Object {},
          }
        `);
      });
    });

    it('exposes expected state to UI', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'usedInUi',
          ),
        ).toMatchInlineSnapshot(`Object {}`);
      });
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the controller under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<UserProfileControllerMessenger>,
  MessengerEvents<UserProfileControllerMessenger>
>;

/**
 * The callback that `withController` calls.
 */
type WithControllerCallback<ReturnValue> = (payload: {
  controller: UserProfileController;
  rootMessenger: RootMessenger;
  messenger: UserProfileControllerMessenger;
  assertUserOptedIn: jest.Mock<boolean, []>;
  getMetaMetricsId: jest.Mock<string, []>;
  mockUpdateProfile: jest.Mock<Promise<void>, [UserProfileUpdateRequest]>;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * The options bag that `withController` takes.
 */
type WithControllerOptions = {
  options: Partial<ConstructorParameters<typeof UserProfileController>[0]>;
};

/**
 * Constructs the messenger populated with all external actions and events
 * required by the controller under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the controller under test.
 *
 * @param rootMessenger - The root messenger, with all external actions and
 * events required by the controller's messenger.
 * @returns The controller-specific messenger.
 */
function getMessenger(
  rootMessenger: RootMessenger,
): UserProfileControllerMessenger {
  const messenger: UserProfileControllerMessenger = new Messenger({
    namespace: 'UserProfileController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    actions: [
      'AccountsController:listAccounts',
      'UserProfileService:updateProfile',
    ],
    events: [
      'KeyringController:unlock',
      'KeyringController:lock',
      'AccountsController:accountAdded',
      'AccountsController:accountRemoved',
    ],
  });
  return messenger;
}

/**
 * Wrap tests for the controller under test by ensuring that the controller is
 * created ahead of time and then safely destroyed afterward as needed.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag contains arguments for the controller constructor. All constructor
 * arguments are optional and will be filled in with defaults in as needed
 * (including `messenger`). The function is called with the new
 * controller, root messenger, and controller messenger.
 * @returns The same return value as the given function.
 */
async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ options = {} }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];
  const mockUpdateProfile = jest.fn();
  const mockAssertUserOptedIn = jest.fn().mockReturnValue(true);
  const mockGetMetaMetricsId = jest.fn().mockReturnValue('test-metrics-id');

  const rootMessenger = getRootMessenger();
  rootMessenger.registerActionHandler(
    'UserProfileService:updateProfile',
    mockUpdateProfile,
  );

  const messenger = getMessenger(rootMessenger);
  const controller = new UserProfileController({
    messenger,
    assertUserOptedIn: mockAssertUserOptedIn,
    getMetaMetricsId: mockGetMetaMetricsId,
    ...options,
  });

  return await testFunction({
    controller,
    rootMessenger,
    messenger,
    assertUserOptedIn: mockAssertUserOptedIn,
    getMetaMetricsId: mockGetMetaMetricsId,
    mockUpdateProfile,
  });
}
