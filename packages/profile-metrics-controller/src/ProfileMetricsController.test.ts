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
  AccountOwnershipProof,
  AccountWithScopes,
  ProfileMetricsFetchNoncesRequest,
  ProfileMetricsSubmitMetricsRequest,
} from './ProfileMetricsService';
import type { ProofOfOwnershipSignRequest } from './ProofOfOwnershipService';
import { ProofUnsupportedNamespaceError } from './utils/canonicalize';

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

      describe('when `initialEnqueueCompleted` is false (fresh install)', () => {
        it('enqueues existing accounts and flips both completion flags when the user has opted in', async () => {
          await withController(
            { options: { assertUserOptedIn: () => true } },
            async ({ controller, rootMessenger, registerAccounts }) => {
              registerAccounts([
                createMockAccount('0xAccount1'),
                createMockAccount('0xAccount2', false),
              ]);

              rootMessenger.publish('KeyringController:unlock');
              // Wait for async operations to complete.
              await Promise.resolve();

              expect(controller.state.initialEnqueueCompleted).toBe(true);
              // Fresh installs satisfy the proof backfill in the same
              // enqueue — accounts are queued with proofs in mind from
              // the very first poll.
              expect(controller.state.proofBackfillEnqueued).toBe(true);
              expect(controller.state.syncQueue).toStrictEqual({
                'entropy-0xAccount1': [
                  { address: '0xAccount1', scopes: ['eip155:1'] },
                ],
                null: [{ address: '0xAccount2', scopes: ['eip155:1'] }],
              });
            },
          );
        });

        it('does not enqueue or flip the flags when the user has not opted in', async () => {
          await withController(
            { options: { assertUserOptedIn: () => false } },
            async ({ controller, rootMessenger, registerAccounts }) => {
              registerAccounts([createMockAccount('0xAccount1')]);

              rootMessenger.publish('KeyringController:unlock');
              await Promise.resolve();

              expect(controller.state.initialEnqueueCompleted).toBe(false);
              expect(controller.state.proofBackfillEnqueued).toBe(false);
              expect(controller.state.syncQueue).toStrictEqual({});
            },
          );
        });
      });

      describe('when `initialEnqueueCompleted` is true', () => {
        it.each([{ assertUserOptedIn: true }, { assertUserOptedIn: false }])(
          'does not add existing accounts to the queue when `assertUserOptedIn` is $assertUserOptedIn',
          async ({ assertUserOptedIn }) => {
            await withController(
              {
                options: {
                  assertUserOptedIn: () => assertUserOptedIn,
                  state: {
                    initialEnqueueCompleted: true,
                    proofBackfillEnqueued: true,
                  },
                },
              },
              async ({ controller, rootMessenger, registerAccounts }) => {
                registerAccounts([
                  createMockAccount('0xAccount1'),
                  createMockAccount('0xAccount2'),
                ]);

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

      describe('when `proofBackfillEnqueued` is false (upgrade path)', () => {
        it('re-enqueues all known accounts and flips `proofBackfillEnqueued` to true when the user has opted in', async () => {
          await withController(
            {
              options: {
                assertUserOptedIn: () => true,
                // Existing user upgrading: they've already first-synced
                // (`initialEnqueueCompleted` true, persisted) but never had
                // proofs attached (`proofBackfillEnqueued` defaults to false).
                state: { initialEnqueueCompleted: true },
              },
            },
            async ({ controller, rootMessenger, registerAccounts }) => {
              registerAccounts([
                createMockAccount('0xAccount1'),
                createMockAccount('0xAccount2', false),
              ]);

              rootMessenger.publish('KeyringController:unlock');
              await Promise.resolve();

              expect(controller.state.proofBackfillEnqueued).toBe(true);
              expect(controller.state.syncQueue).toStrictEqual({
                'entropy-0xAccount1': [
                  { address: '0xAccount1', scopes: ['eip155:1'] },
                ],
                null: [{ address: '0xAccount2', scopes: ['eip155:1'] }],
              });
            },
          );
        });

        it('does not enqueue or flip the flag when the user has not opted in', async () => {
          await withController(
            {
              options: {
                assertUserOptedIn: () => false,
                state: { initialEnqueueCompleted: true },
              },
            },
            async ({ controller, rootMessenger, registerAccounts }) => {
              registerAccounts([createMockAccount('0xAccount1')]);

              rootMessenger.publish('KeyringController:unlock');
              await Promise.resolve();

              expect(controller.state.proofBackfillEnqueued).toBe(false);
              expect(controller.state.syncQueue).toStrictEqual({});
            },
          );
        });

        it('does not duplicate accounts already pending in the queue (nonces are single-use)', async () => {
          await withController(
            {
              options: {
                assertUserOptedIn: () => true,
                state: {
                  initialEnqueueCompleted: true,
                  // Simulate an `accountAdded` event having queued one of
                  // the accounts between session start and this backfill.
                  syncQueue: {
                    'entropy-0xAccount1': [
                      { address: '0xAccount1', scopes: ['eip155:1'] },
                    ],
                  },
                },
              },
            },
            async ({ controller, rootMessenger, registerAccounts }) => {
              registerAccounts([
                createMockAccount('0xAccount1'),
                createMockAccount('0xAccount2'),
              ]);

              rootMessenger.publish('KeyringController:unlock');
              await Promise.resolve();

              expect(controller.state.proofBackfillEnqueued).toBe(true);
              expect(controller.state.syncQueue).toStrictEqual({
                'entropy-0xAccount1': [
                  { address: '0xAccount1', scopes: ['eip155:1'] },
                ],
                'entropy-0xAccount2': [
                  { address: '0xAccount2', scopes: ['eip155:1'] },
                ],
              });
            },
          );
        });
      });

      describe('when `proofBackfillEnqueued` is true', () => {
        it('does not re-enqueue accounts on subsequent unlocks', async () => {
          await withController(
            {
              options: {
                assertUserOptedIn: () => true,
                state: {
                  initialEnqueueCompleted: true,
                  proofBackfillEnqueued: true,
                },
              },
            },
            async ({ controller, rootMessenger, registerAccounts }) => {
              registerAccounts([createMockAccount('0xAccount1')]);

              rootMessenger.publish('KeyringController:unlock');
              await Promise.resolve();

              expect(controller.state.syncQueue).toStrictEqual({});
            },
          );
        });
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

        describe('proof of ownership wiring', () => {
          it('fetches nonces and signs proofs for queued accounts, submitting canonical addresses', async () => {
            const checksummedAddress =
              '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
            const lowercased = checksummedAddress.toLowerCase();
            const accounts: Record<string, AccountWithScopes[]> = {
              id1: [{ address: lowercased, scopes: ['eip155:1'] }],
            };
            await withController(
              {
                options: {
                  state: { syncQueue: accounts, initialDelayEndTimestamp: 0 },
                },
              },
              async ({
                controller,
                getMetaMetricsId,
                mockSubmitMetrics,
                mockFetchNonces,
                mockSignProof,
                registerAccounts,
              }) => {
                registerAccounts([createMockAccount(lowercased)]);
                mockFetchNonces.mockResolvedValueOnce({
                  [checksummedAddress]: 'nonce-1',
                });
                mockSignProof.mockResolvedValueOnce({
                  nonce: 'nonce-1',
                  signature: '0xdeadbeef',
                });

                await controller._executePoll();

                expect(mockFetchNonces).toHaveBeenCalledWith({
                  identifiers: [checksummedAddress],
                  entropySourceId: 'id1',
                });
                expect(mockSignProof).toHaveBeenCalledWith({
                  account: expect.objectContaining({ address: lowercased }),
                  nonce: 'nonce-1',
                });
                expect(mockSubmitMetrics).toHaveBeenCalledWith({
                  metametricsId: getMetaMetricsId(),
                  entropySourceId: 'id1',
                  accounts: [
                    {
                      address: checksummedAddress,
                      scopes: ['eip155:1'],
                      proof: { nonce: 'nonce-1', signature: '0xdeadbeef' },
                    },
                  ],
                });
                expect(controller.state.syncQueue).toStrictEqual({});
              },
            );
          });

          it('skips proof-of-ownership entirely for accounts with no entropy source', async () => {
            const address = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
            const accounts: Record<string, AccountWithScopes[]> = {
              null: [{ address: address.toLowerCase(), scopes: ['eip155:1'] }],
            };
            await withController(
              {
                options: {
                  state: { syncQueue: accounts, initialDelayEndTimestamp: 0 },
                },
              },
              async ({
                controller,
                getMetaMetricsId,
                mockSubmitMetrics,
                mockFetchNonces,
                mockSignProof,
                registerAccounts,
              }) => {
                registerAccounts([
                  createMockAccount(address.toLowerCase(), false),
                ]);

                await controller._executePoll();

                expect(mockFetchNonces).not.toHaveBeenCalled();
                expect(mockSignProof).not.toHaveBeenCalled();
                expect(mockSubmitMetrics).toHaveBeenCalledWith({
                  metametricsId: getMetaMetricsId(),
                  entropySourceId: null,
                  accounts: [
                    { address: address.toLowerCase(), scopes: ['eip155:1'] },
                  ],
                });
                expect(controller.state.syncQueue).toStrictEqual({});
              },
            );
          });

          it('canonicalizes mixed-case bech32 Bitcoin addresses to lowercase before fetching the nonce', async () => {
            const mixedCase = 'BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ';
            const canonical = mixedCase.toLowerCase();
            const accounts: Record<string, AccountWithScopes[]> = {
              id1: [
                {
                  address: mixedCase,
                  scopes: ['bip122:000000000019d6689c085ae165831e93'],
                },
              ],
            };
            await withController(
              {
                options: {
                  state: { syncQueue: accounts, initialDelayEndTimestamp: 0 },
                },
              },
              async ({
                controller,
                mockSubmitMetrics,
                mockFetchNonces,
                mockSignProof,
                registerAccounts,
              }) => {
                const btcAccount: InternalAccount = {
                  ...createMockAccount(mixedCase),
                  scopes: ['bip122:000000000019d6689c085ae165831e93'],
                };
                registerAccounts([btcAccount]);
                mockFetchNonces.mockResolvedValueOnce({ [canonical]: 'n-btc' });
                mockSignProof.mockResolvedValueOnce({
                  nonce: 'n-btc',
                  signature: '0xbtcsig',
                });

                await controller._executePoll();

                expect(mockFetchNonces).toHaveBeenCalledWith({
                  identifiers: [canonical],
                  entropySourceId: 'id1',
                });
                expect(
                  mockSubmitMetrics.mock.calls[0][0].accounts[0],
                ).toStrictEqual({
                  address: canonical,
                  scopes: ['bip122:000000000019d6689c085ae165831e93'],
                  proof: { nonce: 'n-btc', signature: '0xbtcsig' },
                });
              },
            );
          });

          it('de-duplicates identifiers when the same canonical address is queued twice', async () => {
            const address = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
            const lowercased = address.toLowerCase();
            const accounts: Record<string, AccountWithScopes[]> = {
              id1: [
                { address: lowercased, scopes: ['eip155:1'] },
                { address: lowercased, scopes: ['eip155:1'] },
              ],
            };
            await withController(
              {
                options: {
                  state: { syncQueue: accounts, initialDelayEndTimestamp: 0 },
                },
              },
              async ({
                controller,
                mockFetchNonces,
                mockSignProof,
                registerAccounts,
              }) => {
                registerAccounts([createMockAccount(lowercased)]);
                mockFetchNonces.mockResolvedValueOnce({ [address]: 'n' });
                mockSignProof.mockResolvedValue({
                  nonce: 'n',
                  signature: '0xsig',
                });

                await controller._executePoll();

                expect(mockFetchNonces).toHaveBeenCalledWith({
                  identifiers: [address],
                  entropySourceId: 'id1',
                });
              },
            );
          });

          it('submits accounts whose namespace is unsupported as-is, without consulting nonce/sign', async () => {
            const cosmosAddress = 'cosmos1abc';
            const accounts: Record<string, AccountWithScopes[]> = {
              id1: [{ address: cosmosAddress, scopes: ['cosmos:cosmoshub-4'] }],
            };
            await withController(
              {
                options: {
                  state: { syncQueue: accounts, initialDelayEndTimestamp: 0 },
                },
              },
              async ({
                controller,
                getMetaMetricsId,
                mockSubmitMetrics,
                mockFetchNonces,
                mockSignProof,
                registerAccounts,
              }) => {
                registerAccounts([
                  {
                    ...createMockAccount(cosmosAddress),
                    scopes: ['cosmos:cosmoshub-4'],
                  },
                ]);

                await controller._executePoll();

                expect(mockFetchNonces).not.toHaveBeenCalled();
                expect(mockSignProof).not.toHaveBeenCalled();
                expect(mockSubmitMetrics).toHaveBeenCalledWith({
                  metametricsId: getMetaMetricsId(),
                  entropySourceId: 'id1',
                  accounts: [
                    {
                      address: cosmosAddress,
                      scopes: ['cosmos:cosmoshub-4'],
                    },
                  ],
                });
              },
            );
          });

          it('logs and submits without proof when the account scope is not a valid CAIP-2 chain ID', async () => {
            const address = '0xMalformed';
            const accounts: Record<string, AccountWithScopes[]> = {
              id1: [
                {
                  address,
                  scopes: ['garbage' as `${string}:${string}`],
                },
              ],
            };
            await withController(
              {
                options: {
                  state: { syncQueue: accounts, initialDelayEndTimestamp: 0 },
                },
              },
              async ({
                controller,
                mockSubmitMetrics,
                mockFetchNonces,
                registerAccounts,
              }) => {
                const consoleErrorSpy = jest
                  .spyOn(console, 'error')
                  .mockImplementation();
                registerAccounts([
                  {
                    ...createMockAccount(address),
                    scopes: ['garbage' as `${string}:${string}`],
                  },
                ]);

                await controller._executePoll();

                expect(mockFetchNonces).not.toHaveBeenCalled();
                expect(mockSubmitMetrics).toHaveBeenCalledWith(
                  expect.objectContaining({
                    accounts: [
                      {
                        address,
                        scopes: ['garbage'],
                      },
                    ],
                  }),
                );
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                  `Skipping proof for account id-${address}:`,
                  expect.any(Error),
                );
              },
            );
          });

          it('submits accounts that are no longer in AccountsController state as-is, without consulting nonce/sign', async () => {
            const accounts: Record<string, AccountWithScopes[]> = {
              id1: [
                {
                  address: '0xRemoved',
                  scopes: ['eip155:1'],
                },
              ],
            };
            await withController(
              {
                options: {
                  state: { syncQueue: accounts, initialDelayEndTimestamp: 0 },
                },
              },
              async ({
                controller,
                getMetaMetricsId,
                mockSubmitMetrics,
                mockFetchNonces,
                mockSignProof,
              }) => {
                // AccountsController is intentionally empty: the account
                // was removed between enqueue and poll.

                await controller._executePoll();

                expect(mockFetchNonces).not.toHaveBeenCalled();
                expect(mockSignProof).not.toHaveBeenCalled();
                expect(mockSubmitMetrics).toHaveBeenCalledWith({
                  metametricsId: getMetaMetricsId(),
                  entropySourceId: 'id1',
                  accounts: [{ address: '0xRemoved', scopes: ['eip155:1'] }],
                });
              },
            );
          });

          it('submits canonicalized accounts without proofs and logs when fetchNonces rejects', async () => {
            const address = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
            const accounts: Record<string, AccountWithScopes[]> = {
              id1: [{ address: address.toLowerCase(), scopes: ['eip155:1'] }],
            };
            await withController(
              {
                options: {
                  state: { syncQueue: accounts, initialDelayEndTimestamp: 0 },
                },
              },
              async ({
                controller,
                mockSubmitMetrics,
                mockFetchNonces,
                mockSignProof,
                registerAccounts,
              }) => {
                const consoleErrorSpy = jest
                  .spyOn(console, 'error')
                  .mockImplementation();
                registerAccounts([createMockAccount(address.toLowerCase())]);
                mockFetchNonces.mockRejectedValueOnce(
                  new Error('auth API 503'),
                );

                await controller._executePoll();

                expect(mockSignProof).not.toHaveBeenCalled();
                expect(mockSubmitMetrics).toHaveBeenCalledWith(
                  expect.objectContaining({
                    entropySourceId: 'id1',
                    accounts: [{ address, scopes: ['eip155:1'] }],
                  }),
                );
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                  'Failed to fetch proof-of-ownership nonces for entropy source ID id1:',
                  expect.any(Error),
                );
                // Batch is dropped from the queue on a successful submit.
                expect(controller.state.syncQueue).toStrictEqual({});
              },
            );
          });

          it('submits the account without proof when the nonce response omits its identifier', async () => {
            const address = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
            const accounts: Record<string, AccountWithScopes[]> = {
              id1: [{ address: address.toLowerCase(), scopes: ['eip155:1'] }],
            };
            await withController(
              {
                options: {
                  state: { syncQueue: accounts, initialDelayEndTimestamp: 0 },
                },
              },
              async ({
                controller,
                mockSubmitMetrics,
                mockFetchNonces,
                mockSignProof,
                registerAccounts,
              }) => {
                registerAccounts([createMockAccount(address.toLowerCase())]);
                mockFetchNonces.mockResolvedValueOnce({});

                await controller._executePoll();

                expect(mockSignProof).not.toHaveBeenCalled();
                expect(mockSubmitMetrics).toHaveBeenCalledWith(
                  expect.objectContaining({
                    accounts: [{ address, scopes: ['eip155:1'] }],
                  }),
                );
              },
            );
          });

          it('attaches proofs for the successful accounts and submits the rejected one without a proof when sign throws', async () => {
            const goodAddress = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
            const badAddress = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359';
            const goodLower = goodAddress.toLowerCase();
            const badLower = badAddress.toLowerCase();
            const accounts: Record<string, AccountWithScopes[]> = {
              id1: [
                { address: goodLower, scopes: ['eip155:1'] },
                { address: badLower, scopes: ['eip155:1'] },
              ],
            };
            await withController(
              {
                options: {
                  state: { syncQueue: accounts, initialDelayEndTimestamp: 0 },
                },
              },
              async ({
                controller,
                mockSubmitMetrics,
                mockFetchNonces,
                mockSignProof,
                registerAccounts,
              }) => {
                const consoleErrorSpy = jest
                  .spyOn(console, 'error')
                  .mockImplementation();
                registerAccounts([
                  createMockAccount(goodLower),
                  createMockAccount(badLower),
                ]);
                mockFetchNonces.mockResolvedValueOnce({
                  [goodAddress]: 'n-good',
                  [badAddress]: 'n-bad',
                });
                mockSignProof.mockImplementation(async ({ account }) => {
                  if (account.address === goodLower) {
                    return { nonce: 'n-good', signature: '0xgood' };
                  }
                  throw new Error('Method not found: signProofOfOwnership');
                });

                await controller._executePoll();

                expect(mockSubmitMetrics).toHaveBeenCalledWith(
                  expect.objectContaining({
                    accounts: [
                      {
                        address: goodAddress,
                        scopes: ['eip155:1'],
                        proof: { nonce: 'n-good', signature: '0xgood' },
                      },
                      { address: badAddress, scopes: ['eip155:1'] },
                    ],
                  }),
                );
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                  `Failed to sign proof of ownership for account id-${badLower}:`,
                  expect.any(Error),
                );
              },
            );
          });

          it('keeps the batch in the queue when submitMetrics fails after proofs have been signed', async () => {
            const address = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
            const accounts: Record<string, AccountWithScopes[]> = {
              id1: [{ address: address.toLowerCase(), scopes: ['eip155:1'] }],
            };
            await withController(
              {
                options: {
                  state: { syncQueue: accounts, initialDelayEndTimestamp: 0 },
                },
              },
              async ({
                controller,
                mockSubmitMetrics,
                mockFetchNonces,
                mockSignProof,
                registerAccounts,
              }) => {
                jest.spyOn(console, 'error').mockImplementation();
                registerAccounts([createMockAccount(address.toLowerCase())]);
                mockFetchNonces.mockResolvedValueOnce({ [address]: 'n' });
                mockSignProof.mockResolvedValueOnce({
                  nonce: 'n',
                  signature: '0xsig',
                });
                mockSubmitMetrics.mockRejectedValueOnce(new Error('500'));

                await controller._executePoll();

                expect(controller.state.syncQueue).toStrictEqual(accounts);
              },
            );
          });

          it('scopes each fetchNonces call to its entropy-source batch when processing multiple groups', async () => {
            const address1 = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
            const address2 = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359';
            const accounts: Record<string, AccountWithScopes[]> = {
              id1: [{ address: address1.toLowerCase(), scopes: ['eip155:1'] }],
              id2: [{ address: address2.toLowerCase(), scopes: ['eip155:1'] }],
            };
            await withController(
              {
                options: {
                  state: { syncQueue: accounts, initialDelayEndTimestamp: 0 },
                },
              },
              async ({
                controller,
                mockFetchNonces,
                mockSignProof,
                registerAccounts,
              }) => {
                registerAccounts([
                  createMockAccount(address1.toLowerCase()),
                  createMockAccount(address2.toLowerCase()),
                ]);
                mockFetchNonces.mockImplementation(async ({ identifiers }) =>
                  Object.fromEntries(identifiers.map((id) => [id, `n-${id}`])),
                );
                mockSignProof.mockImplementation(async ({ nonce }) => ({
                  nonce,
                  signature: '0xsig',
                }));

                await controller._executePoll();

                expect(mockFetchNonces).toHaveBeenCalledTimes(2);
                expect(mockFetchNonces).toHaveBeenNthCalledWith(1, {
                  identifiers: [address1],
                  entropySourceId: 'id1',
                });
                expect(mockFetchNonces).toHaveBeenNthCalledWith(2, {
                  identifiers: [address2],
                  entropySourceId: 'id2',
                });
              },
            );
          });

          it('only attaches proofs to the candidate accounts in a mixed batch, leaving the rest untouched', async () => {
            const evmAddress = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
            const cosmosAddress = 'cosmos1abc';
            const accounts: Record<string, AccountWithScopes[]> = {
              id1: [
                { address: evmAddress.toLowerCase(), scopes: ['eip155:1'] },
                { address: cosmosAddress, scopes: ['cosmos:cosmoshub-4'] },
              ],
            };
            await withController(
              {
                options: {
                  state: { syncQueue: accounts, initialDelayEndTimestamp: 0 },
                },
              },
              async ({
                controller,
                mockSubmitMetrics,
                mockFetchNonces,
                mockSignProof,
                registerAccounts,
              }) => {
                registerAccounts([
                  createMockAccount(evmAddress.toLowerCase()),
                  {
                    ...createMockAccount(cosmosAddress),
                    scopes: ['cosmos:cosmoshub-4'],
                  },
                ]);
                mockFetchNonces.mockResolvedValueOnce({ [evmAddress]: 'n' });
                mockSignProof.mockResolvedValueOnce({
                  nonce: 'n',
                  signature: '0xsig',
                });

                await controller._executePoll();

                expect(mockFetchNonces).toHaveBeenCalledWith({
                  identifiers: [evmAddress],
                  entropySourceId: 'id1',
                });
                expect(mockSignProof).toHaveBeenCalledTimes(1);
                expect(mockSubmitMetrics).toHaveBeenCalledWith(
                  expect.objectContaining({
                    accounts: [
                      {
                        address: evmAddress,
                        scopes: ['eip155:1'],
                        proof: { nonce: 'n', signature: '0xsig' },
                      },
                      {
                        address: cosmosAddress,
                        scopes: ['cosmos:cosmoshub-4'],
                      },
                    ],
                  }),
                );
              },
            );
          });

          it('submits the account as-is when its live scopes list is empty', async () => {
            const address = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
            const accounts: Record<string, AccountWithScopes[]> = {
              id1: [{ address: address.toLowerCase(), scopes: ['eip155:1'] }],
            };
            await withController(
              {
                options: {
                  state: { syncQueue: accounts, initialDelayEndTimestamp: 0 },
                },
              },
              async ({
                controller,
                mockSubmitMetrics,
                mockFetchNonces,
                registerAccounts,
              }) => {
                // Cover the defensive guard that fires when a live account
                // ends up with an empty scopes array between enqueue and poll.
                const consoleErrorSpy = jest
                  .spyOn(console, 'error')
                  .mockImplementation();
                registerAccounts([
                  {
                    ...createMockAccount(address.toLowerCase()),
                    scopes: [],
                  },
                ]);

                await controller._executePoll();

                expect(mockFetchNonces).not.toHaveBeenCalled();
                expect(mockSubmitMetrics).toHaveBeenCalledWith(
                  expect.objectContaining({
                    accounts: [
                      {
                        address: address.toLowerCase(),
                        scopes: ['eip155:1'],
                      },
                    ],
                  }),
                );
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                  `Skipping proof for account id-${address.toLowerCase()}:`,
                  new Error(
                    `Scope not found for account id-${address.toLowerCase()}`,
                  ),
                );
              },
            );
          });

          it('does not log when the unsupported namespace surfaces as ProofUnsupportedNamespaceError', async () => {
            const cosmosAddress = 'cosmos1abc';
            const accounts: Record<string, AccountWithScopes[]> = {
              id1: [{ address: cosmosAddress, scopes: ['cosmos:cosmoshub-4'] }],
            };
            await withController(
              {
                options: {
                  state: { syncQueue: accounts, initialDelayEndTimestamp: 0 },
                },
              },
              async ({ controller, registerAccounts }) => {
                const consoleErrorSpy = jest
                  .spyOn(console, 'error')
                  .mockImplementation();
                registerAccounts([
                  {
                    ...createMockAccount(cosmosAddress),
                    scopes: ['cosmos:cosmoshub-4'],
                  },
                ]);
                // Sanity check that the error class is exported alongside the
                // helper that throws it (consumers depend on it for catch
                // narrowing).
                expect(ProofUnsupportedNamespaceError.name).toBe(
                  'ProofUnsupportedNamespaceError',
                );

                await controller._executePoll();

                expect(consoleErrorSpy).not.toHaveBeenCalled();
              },
            );
          });
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
              "proofBackfillEnqueued": false,
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
              "proofBackfillEnqueued": false,
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
              "proofBackfillEnqueued": false,
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
  mockFetchNonces: jest.Mock<
    Promise<Record<string, string>>,
    [ProfileMetricsFetchNoncesRequest]
  >;
  mockSignProof: jest.Mock<
    Promise<AccountOwnershipProof>,
    [ProofOfOwnershipSignRequest]
  >;
  registerAccounts: (accounts: InternalAccount[]) => void;
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
      'ProfileMetricsService:fetchNonces',
      'ProofOfOwnershipService:sign',
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
  const mockSubmitMetrics = jest.fn().mockResolvedValue(undefined);
  const mockFetchNonces = jest.fn().mockResolvedValue({});
  const mockSignProof = jest
    .fn()
    .mockRejectedValue(new Error('mockSignProof not configured for this test'));
  const mockAssertUserOptedIn = jest.fn().mockReturnValue(true);
  const mockGetMetaMetricsId = jest.fn().mockReturnValue('test-metrics-id');

  // Default to an empty `AccountsController` state so existing tests that
  // do not exercise the proof-signing path keep the no-proof, submit-raw
  // behavior they were written against.
  const accountsByAddress = new Map<string, InternalAccount>();
  const accountsById = new Map<string, InternalAccount>();
  const registerAccounts = (accounts: InternalAccount[]): void => {
    for (const account of accounts) {
      accountsByAddress.set(account.address, account);
      accountsById.set(account.id, account);
    }
  };

  const rootMessenger = getRootMessenger();
  rootMessenger.registerActionHandler(
    'ProfileMetricsService:submitMetrics',
    mockSubmitMetrics,
  );
  rootMessenger.registerActionHandler(
    'ProfileMetricsService:fetchNonces',
    mockFetchNonces,
  );
  rootMessenger.registerActionHandler(
    'ProofOfOwnershipService:sign',
    mockSignProof,
  );
  rootMessenger.registerActionHandler('AccountsController:getState', () => ({
    internalAccounts: {
      accounts: Object.fromEntries(accountsById),
      selectedAccount: accountsById.keys().next().value ?? '',
    },
    accountIdByAddress: Object.fromEntries(
      Array.from(accountsByAddress.entries(), ([address, account]) => [
        address,
        account.id,
      ]),
    ),
  }));

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
    mockFetchNonces,
    mockSignProof,
    registerAccounts,
  });
}
