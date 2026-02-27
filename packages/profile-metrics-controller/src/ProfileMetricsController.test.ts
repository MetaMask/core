import { deriveStateFromMetadata } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import {
  DEFAULT_INITIAL_DELAY_DURATION,
  ProfileMetricsController,
} from './ProfileMetricsController';
import type { ProfileMetricsControllerMessenger } from './ProfileMetricsController';
import type {
  ProfileMetricsSubmitMetricsRequest,
  AccountWithScopes,
} from './ProfileMetricsService';

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

describe('ProfileMetricsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  describe('constructor subscriptions', () => {
    describe('when KeyringController:unlock is published', () => {
      it('starts polling immediately', async () => {
        await withController(
          { options: { assertUserOptedIn: () => true } },
          async ({ controller, rootMessenger }) => {
            const pollSpy = jest.spyOn(controller, 'startPolling');

            rootMessenger.publish('KeyringController:unlock');

            expect(pollSpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('disables the initial delay if the user has opted in to profile metrics', async () => {
        await withController(
          { options: { assertUserOptedIn: () => true } },
          async ({ controller, rootMessenger }) => {
            rootMessenger.publish('KeyringController:unlock');

            expect(controller.state.initialDelayEndTimestamp).toBe(Date.now());
          },
        );
      });

      describe('when `initialEnqueueCompleted` is false', () => {
        it.each([{ assertUserOptedIn: true }, { assertUserOptedIn: false }])(
          'adds existing accounts to the queue when `assertUserOptedIn` is $assertUserOptedIn',
          async ({ assertUserOptedIn }) => {
            await withController(
              { options: { assertUserOptedIn: () => assertUserOptedIn } },
              async ({ controller, rootMessenger }) => {
                rootMessenger.registerActionHandler(
                  'AccountsController:getState',
                  () => {
                    const account1 = createMockAccount('0xAccount1');
                    const account2 = createMockAccount('0xAccount2', false);
                    return {
                      internalAccounts: {
                        accounts: {
                          [account1.id]: account1,
                          [account2.id]: account2,
                        },
                        selectedAccount: account1.id,
                      },
                      accountIdByAddress: {
                        [account1.address]: account1.id,
                        [account2.address]: account2.id,
                      },
                    };
                  },
                );

                rootMessenger.publish('KeyringController:unlock');
                // Wait for async operations to complete.
                await Promise.resolve();

                expect(controller.state.initialEnqueueCompleted).toBe(true);
                expect(controller.state.syncQueue).toStrictEqual({
                  'entropy-0xAccount1': [
                    { address: '0xAccount1', scopes: ['eip155:1'] },
                  ],
                  null: [{ address: '0xAccount2', scopes: ['eip155:1'] }],
                });
              },
            );
          },
        );
      });

      describe('when `initialEnqueueCompleted` is true', () => {
        it.each([{ assertUserOptedIn: true }, { assertUserOptedIn: false }])(
          'does not add existing accounts to the queue when `assertUserOptedIn` is $assertUserOptedIn',
          async ({ assertUserOptedIn }) => {
            await withController(
              {
                options: {
                  assertUserOptedIn: () => assertUserOptedIn,
                  state: { initialEnqueueCompleted: true },
                },
              },
              async ({ controller, rootMessenger }) => {
                rootMessenger.registerActionHandler(
                  'AccountsController:getState',
                  () => {
                    const account1 = createMockAccount('0xAccount1');
                    const account2 = createMockAccount('0xAccount2');
                    return {
                      internalAccounts: {
                        accounts: {
                          [account1.id]: account1,
                          [account2.id]: account2,
                        },
                        selectedAccount: account1.id,
                      },
                      accountIdByAddress: {
                        [account1.address]: account1.id,
                        [account2.address]: account2.id,
                      },
                    };
                  },
                );

                rootMessenger.publish('KeyringController:unlock');
                // Wait for async operations to complete.
                await Promise.resolve();

                expect(controller.state.initialEnqueueCompleted).toBe(true);
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

    describe('when TransactionController:transactionSubmitted is published', () => {
      it('sets `initialDelayEndTimestamp` to current timestamp to skip the initial delay on the next poll', async () => {
        await withController(
          {
            options: {
              state: {
                initialDelayEndTimestamp:
                  Date.now() + DEFAULT_INITIAL_DELAY_DURATION,
              },
            },
          },
          async ({ controller, rootMessenger }) => {
            rootMessenger.publish(
              'TransactionController:transactionSubmitted',
              {
                // @ts-expect-error Transaction object not needed for this test
                foo: 'bar',
              },
            );

            expect(controller.state.initialDelayEndTimestamp).toBe(Date.now());
          },
        );
      });
    });

    describe('when AccountsController:accountAdded is published', () => {
      describe.each([
        { assertUserOptedIn: true },
        { assertUserOptedIn: false },
      ])(
        'when assertUserOptedIn is $assertUserOptedIn',
        ({ assertUserOptedIn }) => {
          it('adds the new account to the sync queue if the account has an entropy source id', async () => {
            await withController(
              { options: { assertUserOptedIn: () => assertUserOptedIn } },
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

          it('adds the new account to the sync queue under `null` if the account has no entropy source id', async () => {
            await withController(
              { options: { assertUserOptedIn: () => assertUserOptedIn } },
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
        },
      );
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

  describe('skipInitialDelay', () => {
    it('sets the initial delay end timestamp to the current time', async () => {
      const pastTimestamp = Date.now() - 10000;
      await withController(
        {
          options: {
            state: { initialDelayEndTimestamp: pastTimestamp },
          },
        },
        async ({ controller }) => {
          controller.skipInitialDelay();

          expect(controller.state.initialDelayEndTimestamp).toBe(Date.now());
        },
      );
    });
  });

  describe('_executePoll', () => {
    describe('when the user has not opted in to profile metrics', () => {
      it('does not process the sync queue', async () => {
        const accounts: Record<string, AccountWithScopes[]> = {
          id1: [{ address: '0xAccount1', scopes: ['eip155:1'] }],
        };
        await withController(
          {
            options: {
              assertUserOptedIn: () => false,
              state: { syncQueue: accounts },
            },
          },
          async ({ controller, mockSubmitMetrics }) => {
            await controller._executePoll();

            expect(mockSubmitMetrics).not.toHaveBeenCalled();
            expect(controller.state.syncQueue).toStrictEqual(accounts);
          },
        );
      });
    });

    describe('when the initial delay period has not ended', () => {
      it('does not process the sync queue', async () => {
        const accounts: Record<string, AccountWithScopes[]> = {
          id1: [{ address: '0xAccount1', scopes: ['eip155:1'] }],
        };
        await withController(
          {
            options: {
              state: {
                syncQueue: accounts,
              },
            },
          },
          async ({ controller, mockSubmitMetrics }) => {
            await controller._executePoll();

            expect(mockSubmitMetrics).not.toHaveBeenCalled();
            expect(controller.state.syncQueue).toStrictEqual(accounts);
          },
        );
      });
    });

    describe('when the user has opted in to profile metrics', () => {
      it('sets the correct default initial delay end timestamp if not set yet', async () => {
        await withController(async ({ controller }) => {
          await controller._executePoll();

          expect(controller.state.initialDelayEndTimestamp).toBe(
            Date.now() + DEFAULT_INITIAL_DELAY_DURATION,
          );
        });
      });

      it('sets a custom initial delay end timestamp if provided via options', async () => {
        const customDelay = 60_000;
        await withController(
          {
            options: {
              initialDelayDuration: customDelay,
            },
          },
          async ({ controller }) => {
            await controller._executePoll();

            expect(controller.state.initialDelayEndTimestamp).toBe(
              Date.now() + customDelay,
            );
          },
        );
      });

      it('retains the existing initial delay end timestamp if already set', async () => {
        const pastTimestamp = Date.now() - 10000;
        await withController(
          {
            options: {
              state: { initialDelayEndTimestamp: pastTimestamp },
            },
          },
          async ({ controller }) => {
            await controller._executePoll();

            expect(controller.state.initialDelayEndTimestamp).toBe(
              pastTimestamp,
            );
          },
        );
      });

      describe('when the initial delay period has ended', () => {
        it('processes the sync queue on each poll', async () => {
          const accounts: Record<string, AccountWithScopes[]> = {
            id1: [{ address: '0xAccount1', scopes: ['eip155:1'] }],
          };
          await withController(
            {
              options: {
                state: { syncQueue: accounts, initialDelayEndTimestamp: 0 },
              },
            },
            async ({ controller, getMetaMetricsId, mockSubmitMetrics }) => {
              await controller._executePoll();

              expect(mockSubmitMetrics).toHaveBeenCalledTimes(1);
              expect(mockSubmitMetrics).toHaveBeenCalledWith({
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
              options: {
                state: { syncQueue: accounts, initialDelayEndTimestamp: 0 },
              },
            },
            async ({ controller, getMetaMetricsId, mockSubmitMetrics }) => {
              await controller._executePoll();

              expect(mockSubmitMetrics).toHaveBeenCalledTimes(3);
              expect(mockSubmitMetrics).toHaveBeenNthCalledWith(1, {
                metametricsId: getMetaMetricsId(),
                entropySourceId: 'id1',
                accounts: [
                  { address: '0xAccount1', scopes: ['eip155:1'] },
                  { address: '0xAccount2', scopes: ['eip155:1'] },
                ],
              });
              expect(mockSubmitMetrics).toHaveBeenNthCalledWith(2, {
                metametricsId: getMetaMetricsId(),
                entropySourceId: 'id2',
                accounts: [{ address: '0xAccount3', scopes: ['eip155:1'] }],
              });
              expect(mockSubmitMetrics).toHaveBeenNthCalledWith(3, {
                metametricsId: getMetaMetricsId(),
                entropySourceId: null,
                accounts: [{ address: '0xAccount4', scopes: ['eip155:1'] }],
              });
              expect(controller.state.syncQueue).toStrictEqual({});
            },
          );
        });

        it('skips one of the batches if the :submitMetrics call fails, but continues processing the rest', async () => {
          const accounts: Record<string, AccountWithScopes[]> = {
            id1: [{ address: '0xAccount1', scopes: ['eip155:1'] }],
            id2: [{ address: '0xAccount2', scopes: ['eip155:1'] }],
          };
          await withController(
            {
              options: {
                state: { syncQueue: accounts, initialDelayEndTimestamp: 0 },
              },
            },
            async ({ controller, getMetaMetricsId, mockSubmitMetrics }) => {
              const consoleErrorSpy = jest.spyOn(console, 'error');
              mockSubmitMetrics.mockImplementationOnce(() => {
                throw new Error('Network error');
              });

              await controller._executePoll();

              expect(mockSubmitMetrics).toHaveBeenCalledTimes(2);
              expect(mockSubmitMetrics).toHaveBeenNthCalledWith(1, {
                metametricsId: getMetaMetricsId(),
                entropySourceId: 'id1',
                accounts: [{ address: '0xAccount1', scopes: ['eip155:1'] }],
              });
              expect(mockSubmitMetrics).toHaveBeenNthCalledWith(2, {
                metametricsId: getMetaMetricsId(),
                entropySourceId: 'id2',
                accounts: [{ address: '0xAccount2', scopes: ['eip155:1'] }],
              });
              expect(controller.state.syncQueue).toStrictEqual({
                id1: [{ address: '0xAccount1', scopes: ['eip155:1'] }],
              });
              expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Failed to submit profile metrics for entropy source ID id1:',
                expect.any(Error),
              );
            },
          );
        });
      });
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(
        { options: { state: { initialDelayEndTimestamp: 10 } } },
        ({ controller }) => {
          expect(
            deriveStateFromMetadata(
              controller.state,
              controller.metadata,
              'includeInDebugSnapshot',
            ),
          ).toMatchInlineSnapshot(`
            {
              "initialDelayEndTimestamp": 10,
              "initialEnqueueCompleted": false,
            }
          `);
        },
      );
    });

    it('includes expected state in state logs', async () => {
      await withController(
        { options: { state: { initialDelayEndTimestamp: 10 } } },
        ({ controller }) => {
          expect(
            deriveStateFromMetadata(
              controller.state,
              controller.metadata,
              'includeInStateLogs',
            ),
          ).toMatchInlineSnapshot(`
            {
              "initialDelayEndTimestamp": 10,
              "initialEnqueueCompleted": false,
              "syncQueue": {},
            }
          `);
        },
      );
    });

    it('persists expected state', async () => {
      await withController(
        { options: { state: { initialDelayEndTimestamp: 10 } } },
        ({ controller }) => {
          expect(
            deriveStateFromMetadata(
              controller.state,
              controller.metadata,
              'persist',
            ),
          ).toMatchInlineSnapshot(`
            {
              "initialDelayEndTimestamp": 10,
              "initialEnqueueCompleted": false,
              "syncQueue": {},
            }
          `);
        },
      );
    });

    it('exposes expected state to UI', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'usedInUi',
          ),
        ).toMatchInlineSnapshot(`{}`);
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
  MessengerActions<ProfileMetricsControllerMessenger>,
  MessengerEvents<ProfileMetricsControllerMessenger>
>;

/**
 * The callback that `withController` calls.
 */
type WithControllerCallback<ReturnValue> = (payload: {
  controller: ProfileMetricsController;
  rootMessenger: RootMessenger;
  messenger: ProfileMetricsControllerMessenger;
  assertUserOptedIn: jest.Mock<boolean, []>;
  getMetaMetricsId: jest.Mock<string, []>;
  mockSubmitMetrics: jest.Mock<
    Promise<void>,
    [ProfileMetricsSubmitMetricsRequest]
  >;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * The options bag that `withController` takes.
 */
type WithControllerOptions = {
  options: Partial<ConstructorParameters<typeof ProfileMetricsController>[0]>;
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
): ProfileMetricsControllerMessenger {
  const messenger: ProfileMetricsControllerMessenger = new Messenger({
    namespace: 'ProfileMetricsController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    actions: [
      'AccountsController:getState',
      'ProfileMetricsService:submitMetrics',
    ],
    events: [
      'KeyringController:unlock',
      'KeyringController:lock',
      'AccountsController:accountAdded',
      'AccountsController:accountRemoved',
      'TransactionController:transactionSubmitted',
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
  const mockSubmitMetrics = jest.fn();
  const mockAssertUserOptedIn = jest.fn().mockReturnValue(true);
  const mockGetMetaMetricsId = jest.fn().mockReturnValue('test-metrics-id');

  const rootMessenger = getRootMessenger();
  rootMessenger.registerActionHandler(
    'ProfileMetricsService:submitMetrics',
    mockSubmitMetrics,
  );

  const messenger = getMessenger(rootMessenger);
  const controller = new ProfileMetricsController({
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
    mockSubmitMetrics,
  });
}
