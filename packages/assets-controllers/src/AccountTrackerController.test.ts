import { Messenger, deriveStateFromMetadata } from '@metamask/base-controller';
import { query, toChecksumHexAddress } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import {
  type NetworkClientId,
  type NetworkClientConfiguration,
  getDefaultNetworkControllerState,
} from '@metamask/network-controller';
import { getDefaultPreferencesState } from '@metamask/preferences-controller';
import {
  TransactionStatus,
  type TransactionMeta,
} from '@metamask/transaction-controller';
import BN from 'bn.js';
import { useFakeTimers, type SinonFakeTimers } from 'sinon';

import type {
  AccountTrackerControllerMessenger,
  AllowedActions,
  AllowedEvents,
} from './AccountTrackerController';
import { AccountTrackerController } from './AccountTrackerController';
import { AccountsApiBalanceFetcher } from './multi-chain-accounts-service/api-balance-fetcher';
import { getTokenBalancesForMultipleAddresses } from './multicall';
import { FakeProvider } from '../../../tests/fake-provider';
import { advanceTime } from '../../../tests/helpers';
import { createMockInternalAccount } from '../../accounts-controller/src/tests/mocks';
import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../base-controller/tests/helpers';
import {
  buildCustomNetworkClientConfiguration,
  buildMockGetNetworkClientById,
} from '../../network-controller/tests/helpers';

jest.mock('@metamask/controller-utils', () => {
  return {
    ...jest.requireActual('@metamask/controller-utils'),
    query: jest.fn(),
    safelyExecuteWithTimeout: jest.fn(),
  };
});

jest.mock('./multicall', () => ({
  ...jest.requireActual('./multicall'),
  getTokenBalancesForMultipleAddresses: jest.fn(),
}));

const mockGetStakedBalanceForChain = async (addresses: string[]) =>
  addresses.reduce<Record<string, string>>((accumulator, address) => {
    accumulator[address] = '0x1';
    return accumulator;
  }, {});

const ADDRESS_1 = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
const CHECKSUM_ADDRESS_1 = toChecksumHexAddress(ADDRESS_1);
const ACCOUNT_1 = createMockInternalAccount({ address: ADDRESS_1 });
const ADDRESS_2 = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const CHECKSUM_ADDRESS_2 = toChecksumHexAddress(ADDRESS_2);
const ACCOUNT_2 = createMockInternalAccount({ address: ADDRESS_2 });
const EMPTY_ACCOUNT = {
  address: '',
  id: '',
} as InternalAccount;
const initialChainId = '0x1';

const mockedQuery = query as jest.Mock<
  ReturnType<typeof query>,
  Parameters<typeof query>
>;

const mockedGetTokenBalancesForMultipleAddresses =
  getTokenBalancesForMultipleAddresses as jest.Mock;

const { safelyExecuteWithTimeout } = jest.requireMock(
  '@metamask/controller-utils',
);
const mockedSafelyExecuteWithTimeout = safelyExecuteWithTimeout as jest.Mock;

describe('AccountTrackerController', () => {
  let clock: SinonFakeTimers;

  beforeEach(() => {
    clock = useFakeTimers();
    mockedQuery.mockReturnValue(Promise.resolve('0x0'));

    // Set up default mock for multicall function (without staked balances)
    // Use lowercase addresses since that's what the balance fetcher actually requests
    mockedGetTokenBalancesForMultipleAddresses.mockResolvedValue({
      tokenBalances: {
        '0x0000000000000000000000000000000000000000': {
          [ADDRESS_1]: new BN('acac5457a3517e', 16), // lowercase
          [ADDRESS_2]: new BN('27548bd9e4026c918d4b', 16), // lowercase
        },
      },
      stakedBalances: {}, // Empty by default
    });

    // Mock safelyExecuteWithTimeout to execute the operation normally by default
    mockedSafelyExecuteWithTimeout.mockImplementation(
      async (operation: () => Promise<unknown>) => {
        try {
          return await operation();
        } catch {
          return undefined;
        }
      },
    );
  });

  afterEach(() => {
    clock.restore();
    mockedQuery.mockRestore();
    mockedGetTokenBalancesForMultipleAddresses.mockClear();
    mockedSafelyExecuteWithTimeout.mockRestore();
  });

  it('should set default state', async () => {
    await withController(
      {
        isMultiAccountBalancesEnabled: true,
      },
      ({ controller }) => {
        expect(controller.state).toStrictEqual({
          accountsByChainId: {
            [initialChainId]: {},
          },
        });
      },
    );
  });

  it('should refresh when selectedAccount changes', async () => {
    await withController(
      {
        isMultiAccountBalancesEnabled: true,
      },
      ({ controller, triggerSelectedAccountChange }) => {
        const refreshSpy = jest.spyOn(controller, 'refresh');

        triggerSelectedAccountChange(ACCOUNT_1);

        expect(refreshSpy).toHaveBeenCalled();
      },
    );
  });

  it('refreshes address when unapproved transaction is added', async () => {
    await withController(
      {
        selectedAccount: ACCOUNT_1,
        listAccounts: [ACCOUNT_1],
      },
      async ({ controller, messenger }) => {
        mockedGetTokenBalancesForMultipleAddresses.mockResolvedValueOnce({
          tokenBalances: {
            '0x0000000000000000000000000000000000000000': {
              [CHECKSUM_ADDRESS_1]: new BN('123456', 16),
            },
          },
          stakedBalances: {},
        });

        const transactionMeta: TransactionMeta = {
          networkClientId: 'mainnet',
          chainId: '0x1' as const,
          id: 'test-tx-1',
          status: TransactionStatus.unapproved,
          time: Date.now(),
          txParams: {
            from: ADDRESS_1,
          },
        };

        messenger.publish(
          'TransactionController:unapprovedTransactionAdded',
          transactionMeta,
        );

        await clock.tickAsync(1);

        expect(
          controller.state.accountsByChainId['0x1'][CHECKSUM_ADDRESS_1].balance,
        ).toBe('0x123456');
      },
    );
  });

  it('refreshes address when transaction is confirmed', async () => {
    await withController(
      {
        selectedAccount: ACCOUNT_1,
        listAccounts: [ACCOUNT_1],
      },
      async ({ controller, messenger }) => {
        mockedGetTokenBalancesForMultipleAddresses.mockResolvedValueOnce({
          tokenBalances: {
            '0x0000000000000000000000000000000000000000': {
              [CHECKSUM_ADDRESS_1]: new BN('abcdef', 16),
            },
          },
          stakedBalances: {},
        });

        const transactionMeta: TransactionMeta = {
          networkClientId: 'mainnet',
          chainId: '0x1' as const,
          id: 'test-tx-2',
          status: TransactionStatus.confirmed,
          time: Date.now(),
          txParams: {
            from: ADDRESS_1,
          },
        };

        messenger.publish(
          'TransactionController:transactionConfirmed',
          transactionMeta,
        );

        await clock.tickAsync(1);

        expect(
          controller.state.accountsByChainId['0x1'][CHECKSUM_ADDRESS_1].balance,
        ).toBe('0xabcdef');
      },
    );
  });

  describe('refresh', () => {
    it('does not refresh when fetching is disabled', async () => {
      const initialState = {
        accountsByChainId: {
          '0x1': {
            [CHECKSUM_ADDRESS_1]: { balance: '0x0' },
            foo: { balance: '0x0' },
          },
          '0x2': {
            [CHECKSUM_ADDRESS_1]: { balance: '0x0' },
            foo: { balance: '0x0' },
          },
        },
      };

      await withController(
        {
          options: { fetchingEnabled: () => false, state: initialState },
          selectedAccount: ACCOUNT_1,
          listAccounts: [ACCOUNT_1, ACCOUNT_2],
        },
        async ({ controller, refresh }) => {
          await refresh(clock, ['mainnet'], true);

          expect(controller.state).toStrictEqual(initialState);
        },
      );
    });

    describe('without networkClientId', () => {
      it('should sync addresses', async () => {
        await withController(
          {
            options: {
              state: {
                accountsByChainId: {
                  '0x1': {
                    [CHECKSUM_ADDRESS_1]: { balance: '0x1' },
                    foo: { balance: '0x2' },
                  },
                  '0x2': {
                    [CHECKSUM_ADDRESS_1]: { balance: '0xa' },
                    foo: { balance: '0xb' },
                  },
                },
              },
            },
            isMultiAccountBalancesEnabled: true,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['mainnet'], true);

            expect(controller.state).toStrictEqual({
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: { balance: '0xacac5457a3517e' },
                  [CHECKSUM_ADDRESS_2]: { balance: '0x27548bd9e4026c918d4b' },
                },
                '0x2': {
                  [CHECKSUM_ADDRESS_1]: { balance: '0xa' },
                  [CHECKSUM_ADDRESS_2]: { balance: '0x0' },
                },
              },
            });
          },
        );
      });

      it('should get real balance', async () => {
        // Override the multicall mock for this specific test
        // Use lowercase address since that's what the balance fetcher requests
        mockedGetTokenBalancesForMultipleAddresses.mockResolvedValueOnce({
          tokenBalances: {
            '0x0000000000000000000000000000000000000000': {
              [ADDRESS_1]: new BN('acac5457a3517e', 16), // lowercase
            },
          },
          stakedBalances: {},
        });

        await withController(
          {
            isMultiAccountBalancesEnabled: true,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1],
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['mainnet'], true);

            expect(controller.state).toStrictEqual({
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: {
                    balance: '0xacac5457a3517e',
                  },
                },
              },
            });
          },
        );
      });

      it('should update only selected address balance when multi-account is disabled', async () => {
        // Mock for single address balance update - only selected account gets balance
        // When multi-account is disabled, the fetcher requests checksum addresses
        mockedGetTokenBalancesForMultipleAddresses.mockResolvedValueOnce({
          tokenBalances: {
            '0x0000000000000000000000000000000000000000': {
              [CHECKSUM_ADDRESS_1]: new BN('acac5457a3517e', 16), // checksum format when multi-account disabled
            },
          },
          stakedBalances: {},
        });

        await withController(
          {
            isMultiAccountBalancesEnabled: false,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['mainnet'], false);

            expect(controller.state).toStrictEqual({
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: { balance: '0xacac5457a3517e' },
                  [CHECKSUM_ADDRESS_2]: { balance: '0x0' },
                },
              },
            });
          },
        );
      });

      it('should update all address balances when multi-account is enabled', async () => {
        // Mock for multi-address balance update
        // When multi-account is enabled, the fetcher requests lowercase addresses
        mockedGetTokenBalancesForMultipleAddresses.mockResolvedValueOnce({
          tokenBalances: {
            '0x0000000000000000000000000000000000000000': {
              [ADDRESS_1]: new BN('acac5457a3517e', 16), // lowercase
              [ADDRESS_2]: new BN('27548bd9e4026c918d4b', 16), // lowercase
            },
          },
          stakedBalances: {},
        });

        await withController(
          {
            isMultiAccountBalancesEnabled: true,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['mainnet'], true);

            expect(controller.state).toStrictEqual({
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: { balance: '0xacac5457a3517e' },
                  [CHECKSUM_ADDRESS_2]: { balance: '0x27548bd9e4026c918d4b' },
                },
              },
            });
          },
        );
      });

      it('should update staked balance when includeStakedAssets is enabled', async () => {
        // Mock with both native and staked balances
        mockedGetTokenBalancesForMultipleAddresses.mockResolvedValueOnce({
          tokenBalances: {
            '0x0000000000000000000000000000000000000000': {
              [CHECKSUM_ADDRESS_1]: new BN('acac5457a3517e', 16),
            },
          },
          stakedBalances: {
            [CHECKSUM_ADDRESS_1]: new BN('1', 16),
          },
        });

        await withController(
          {
            options: {
              includeStakedAssets: true,
              getStakedBalanceForChain: mockGetStakedBalanceForChain,
            },
            isMultiAccountBalancesEnabled: false,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['mainnet'], false);

            expect(controller.state).toStrictEqual({
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: {
                    balance: '0xacac5457a3517e',
                    stakedBalance: '0x1',
                  },
                  [CHECKSUM_ADDRESS_2]: {
                    balance: '0x0',
                  },
                },
              },
            });
          },
        );
      });

      it('should not update staked balance when includeStakedAssets is disabled', async () => {
        // Mock for single address balance update (no staked balances)
        // When multi-account is disabled, the fetcher requests checksum addresses
        mockedGetTokenBalancesForMultipleAddresses.mockResolvedValueOnce({
          tokenBalances: {
            '0x0000000000000000000000000000000000000000': {
              [CHECKSUM_ADDRESS_1]: new BN('acac5457a3517e', 16), // checksum format when multi-account disabled
            },
          },
          stakedBalances: {}, // No staked balances when includeStakedAssets is false
        });

        await withController(
          {
            options: {
              includeStakedAssets: false,
              getStakedBalanceForChain: mockGetStakedBalanceForChain,
            },
            isMultiAccountBalancesEnabled: false,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['mainnet'], false);

            expect(controller.state).toStrictEqual({
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: {
                    balance: '0xacac5457a3517e',
                  },
                  [CHECKSUM_ADDRESS_2]: {
                    balance: '0x0',
                  },
                },
              },
            });
          },
        );
      });

      it('should update staked balance when includeStakedAssets and multi-account is enabled', async () => {
        // Mock with both accounts having native and staked balances
        // When multi-account is enabled, the fetcher requests lowercase addresses
        mockedGetTokenBalancesForMultipleAddresses.mockResolvedValueOnce({
          tokenBalances: {
            '0x0000000000000000000000000000000000000000': {
              [ADDRESS_1]: new BN('acac5457a3517e', 16), // lowercase
              [ADDRESS_2]: new BN('27548bd9e4026c918d4b', 16), // lowercase
            },
          },
          stakedBalances: {
            [ADDRESS_1]: new BN('1', 16), // lowercase
            [ADDRESS_2]: new BN('1', 16), // lowercase
          },
        });

        await withController(
          {
            options: {
              includeStakedAssets: true,
              getStakedBalanceForChain: mockGetStakedBalanceForChain,
            },
            isMultiAccountBalancesEnabled: true,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['mainnet'], true);

            expect(controller.state).toStrictEqual({
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: {
                    balance: '0xacac5457a3517e',
                    stakedBalance: '0x1',
                  },
                  [CHECKSUM_ADDRESS_2]: {
                    balance: '0x27548bd9e4026c918d4b',
                    stakedBalance: '0x1',
                  },
                },
              },
            });
          },
        );
      });
    });

    describe('with networkClientId', () => {
      it('should sync addresses', async () => {
        // This test refreshes only 0xe705 chain and expects 0x0 balances
        // Override the default mock to not provide balances for this chain
        mockedGetTokenBalancesForMultipleAddresses.mockResolvedValueOnce({
          tokenBalances: {
            '0x0000000000000000000000000000000000000000': {},
          },
          stakedBalances: {},
        });

        const networkClientId = 'networkClientId1';
        await withController(
          {
            options: {
              state: {
                accountsByChainId: {
                  '0x1': {
                    [CHECKSUM_ADDRESS_1]: { balance: '0x1' },
                    foo: { balance: '0x2' },
                  },
                  '0x2': {
                    [CHECKSUM_ADDRESS_1]: { balance: '0xa' },
                    foo: { balance: '0xb' },
                  },
                },
              },
            },
            isMultiAccountBalancesEnabled: true,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
            networkClientById: {
              [networkClientId]: buildCustomNetworkClientConfiguration({
                chainId: '0xe705',
              }),
            },
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['networkClientId1'], true);
            expect(controller.state).toStrictEqual({
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: { balance: '0x1' },
                  [CHECKSUM_ADDRESS_2]: { balance: '0x0' },
                },
                '0x2': {
                  [CHECKSUM_ADDRESS_1]: { balance: '0xa' },
                  [CHECKSUM_ADDRESS_2]: { balance: '0x0' },
                },
                '0xe705': {
                  [CHECKSUM_ADDRESS_1]: { balance: '0x0' },
                  [CHECKSUM_ADDRESS_2]: { balance: '0x0' },
                },
              },
            });
          },
        );
      });

      it('should get real balance', async () => {
        // Override the multicall mock for this specific test
        // Use lowercase address since that's what the balance fetcher requests
        mockedGetTokenBalancesForMultipleAddresses.mockResolvedValueOnce({
          tokenBalances: {
            '0x0000000000000000000000000000000000000000': {
              [ADDRESS_1]: new BN('10', 16), // 0x10 (lowercase)
            },
          },
          stakedBalances: {},
        });
        const networkClientId = 'networkClientId1';

        await withController(
          {
            isMultiAccountBalancesEnabled: true,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1],
            networkClientById: {
              [networkClientId]: buildCustomNetworkClientConfiguration({
                chainId: '0xe705',
              }),
            },
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['networkClientId1'], true);

            expect(controller.state).toStrictEqual({
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: {
                    balance: '0x0',
                  },
                },
                '0xe705': {
                  [CHECKSUM_ADDRESS_1]: {
                    balance: '0x10',
                  },
                },
              },
            });
          },
        );
      });

      it('should update only selected address balance when multi-account is disabled', async () => {
        // Mock for single address balance update
        // When multi-account is disabled, the fetcher requests checksum addresses
        mockedGetTokenBalancesForMultipleAddresses.mockResolvedValueOnce({
          tokenBalances: {
            '0x0000000000000000000000000000000000000000': {
              [CHECKSUM_ADDRESS_1]: new BN('10', 16), // checksum format when multi-account disabled
            },
          },
          stakedBalances: {},
        });
        const networkClientId = 'networkClientId1';

        await withController(
          {
            isMultiAccountBalancesEnabled: false,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
            networkClientById: {
              [networkClientId]: buildCustomNetworkClientConfiguration({
                chainId: '0xe705',
              }),
            },
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['networkClientId1'], false);

            expect(controller.state).toStrictEqual({
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: { balance: '0x0' },
                  [CHECKSUM_ADDRESS_2]: { balance: '0x0' },
                },
                '0xe705': {
                  [CHECKSUM_ADDRESS_1]: { balance: '0x10' },
                  [CHECKSUM_ADDRESS_2]: { balance: '0x0' },
                },
              },
            });
          },
        );
      });

      it('should update all address balances when multi-account is enabled', async () => {
        // Mock for multi-address balance update
        // When multi-account is enabled, the fetcher requests lowercase addresses
        mockedGetTokenBalancesForMultipleAddresses.mockResolvedValueOnce({
          tokenBalances: {
            '0x0000000000000000000000000000000000000000': {
              [ADDRESS_1]: new BN('11', 16), // 0x11 (lowercase)
              [ADDRESS_2]: new BN('12', 16), // 0x12 (lowercase)
            },
          },
          stakedBalances: {},
        });
        const networkClientId = 'networkClientId1';

        await withController(
          {
            isMultiAccountBalancesEnabled: true,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
            networkClientById: {
              [networkClientId]: buildCustomNetworkClientConfiguration({
                chainId: '0xe705',
              }),
            },
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['networkClientId1'], true);

            expect(controller.state).toStrictEqual({
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: { balance: '0x0' },
                  [CHECKSUM_ADDRESS_2]: { balance: '0x0' },
                },
                '0xe705': {
                  [CHECKSUM_ADDRESS_1]: { balance: '0x11' },
                  [CHECKSUM_ADDRESS_2]: { balance: '0x12' },
                },
              },
            });
          },
        );
      });

      it('should update staked balance when includeStakedAssets is enabled', async () => {
        // Mock with both native and staked balances
        mockedGetTokenBalancesForMultipleAddresses.mockResolvedValueOnce({
          tokenBalances: {
            '0x0000000000000000000000000000000000000000': {
              [CHECKSUM_ADDRESS_1]: new BN('acac5457a3517e', 16),
            },
          },
          stakedBalances: {
            [CHECKSUM_ADDRESS_1]: new BN('1', 16),
          },
        });

        const networkClientId = 'holesky';

        await withController(
          {
            options: {
              includeStakedAssets: true,
              getStakedBalanceForChain: mockGetStakedBalanceForChain,
            },
            isMultiAccountBalancesEnabled: false,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
            networkClientById: {
              [networkClientId]: buildCustomNetworkClientConfiguration({
                chainId: '0x4268',
              }),
            },
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['mainnet'], false);

            expect(controller.state).toStrictEqual({
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: {
                    balance: '0xacac5457a3517e',
                    stakedBalance: '0x1',
                  },
                  [CHECKSUM_ADDRESS_2]: {
                    balance: '0x0',
                  },
                },
              },
            });
          },
        );
      });

      it('should not update staked balance when includeStakedAssets is disabled', async () => {
        // Mock for single address balance update (no staked balances)
        // When multi-account is disabled, the fetcher requests checksum addresses
        mockedGetTokenBalancesForMultipleAddresses.mockResolvedValueOnce({
          tokenBalances: {
            '0x0000000000000000000000000000000000000000': {
              [CHECKSUM_ADDRESS_1]: new BN('acac5457a3517e', 16), // checksum format when multi-account disabled
            },
          },
          stakedBalances: {}, // No staked balances when includeStakedAssets is false
        });

        const networkClientId = 'holesky';

        await withController(
          {
            options: {
              includeStakedAssets: false,
              getStakedBalanceForChain: mockGetStakedBalanceForChain,
            },
            isMultiAccountBalancesEnabled: false,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
            networkClientById: {
              [networkClientId]: buildCustomNetworkClientConfiguration({
                chainId: '0x4268',
              }),
            },
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['mainnet'], false);

            expect(controller.state).toStrictEqual({
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: {
                    balance: '0xacac5457a3517e',
                  },
                  [CHECKSUM_ADDRESS_2]: {
                    balance: '0x0',
                  },
                },
              },
            });
          },
        );
      });

      it('should update staked balance when includeStakedAssets and multi-account is enabled', async () => {
        // Mock with both accounts having native and staked balances
        // When multi-account is enabled, the fetcher requests lowercase addresses
        mockedGetTokenBalancesForMultipleAddresses.mockResolvedValueOnce({
          tokenBalances: {
            '0x0000000000000000000000000000000000000000': {
              [ADDRESS_1]: new BN('acac5457a3517e', 16), // lowercase
              [ADDRESS_2]: new BN('27548bd9e4026c918d4b', 16), // lowercase
            },
          },
          stakedBalances: {
            [ADDRESS_1]: new BN('1', 16), // lowercase
            [ADDRESS_2]: new BN('1', 16), // lowercase
          },
        });

        const networkClientId = 'holesky';

        await withController(
          {
            options: {
              includeStakedAssets: true,
              getStakedBalanceForChain: mockGetStakedBalanceForChain,
            },
            isMultiAccountBalancesEnabled: true,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
            networkClientById: {
              [networkClientId]: buildCustomNetworkClientConfiguration({
                chainId: '0x4268',
              }),
            },
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['mainnet'], true);

            expect(controller.state).toStrictEqual({
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: {
                    balance: '0xacac5457a3517e',
                    stakedBalance: '0x1',
                  },
                  [CHECKSUM_ADDRESS_2]: {
                    balance: '0x27548bd9e4026c918d4b',
                    stakedBalance: '0x1',
                  },
                },
              },
            });
          },
        );
      });

      it('should not update staked balance when includeStakedAssets and multi-account is enabled if network unsupported', async () => {
        // Mock for multi-account balance update, but no staked balances since network is unsupported
        // When multi-account is enabled, the fetcher requests lowercase addresses
        mockedGetTokenBalancesForMultipleAddresses.mockResolvedValueOnce({
          tokenBalances: {
            '0x0000000000000000000000000000000000000000': {
              [ADDRESS_1]: new BN('acac5457a3517e', 16), // lowercase
              [ADDRESS_2]: new BN('27548bd9e4026c918d4b', 16), // lowercase
            },
          },
          // No stakedBalances property at all since polygon network doesn't support staked assets
        });

        const networkClientId = 'polygon';

        await withController(
          {
            options: {
              includeStakedAssets: false,
              getStakedBalanceForChain: jest.fn().mockResolvedValue(undefined),
            },
            isMultiAccountBalancesEnabled: true,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
            networkClientById: {
              [networkClientId]: buildCustomNetworkClientConfiguration({
                chainId: '0x89',
              }),
            },
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['mainnet'], true);

            expect(controller.state).toStrictEqual({
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: {
                    balance: '0xacac5457a3517e',
                  },
                  [CHECKSUM_ADDRESS_2]: {
                    balance: '0x27548bd9e4026c918d4b',
                  },
                },
              },
            });
          },
        );
      });

      it('should handle unsupported chains gracefully', async () => {
        const networkClientId = 'networkClientId1';
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        await withController(
          {
            options: {
              state: {
                accountsByChainId: {
                  '0x1': {
                    [CHECKSUM_ADDRESS_1]: { balance: '0x1' },
                    foo: { balance: '0x2' },
                  },
                  '0x2': {
                    [CHECKSUM_ADDRESS_1]: { balance: '0xa' },
                    foo: { balance: '0xb' },
                  },
                },
              },
            },
            isMultiAccountBalancesEnabled: true,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
            networkClientById: {
              [networkClientId]: buildCustomNetworkClientConfiguration({
                chainId: '0x5', // Goerli - may not be supported by all balance fetchers
              }),
            },
          },
          async ({ controller, refresh }) => {
            // Should not throw an error, even for unsupported chains
            await refresh(clock, ['networkClientId1'], true);

            // State should still be updated with chain entry from syncAccounts
            expect(controller.state.accountsByChainId).toHaveProperty('0x5');
            expect(controller.state.accountsByChainId['0x5']).toHaveProperty(
              CHECKSUM_ADDRESS_1,
            );
            expect(controller.state.accountsByChainId['0x5']).toHaveProperty(
              CHECKSUM_ADDRESS_2,
            );

            consoleWarnSpy.mockRestore();
          },
        );
      });

      it('should handle timeout error correctly', async () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

        await withController(
          {
            options: {
              state: {
                accountsByChainId: {
                  '0x1': {
                    [CHECKSUM_ADDRESS_1]: { balance: '0x1' },
                  },
                },
              },
              accountsApiChainIds: () => [], // Disable API balance fetchers to force RPC usage
            },
            isMultiAccountBalancesEnabled: true,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
          },
          async ({ refresh, controller }) => {
            // Mock safelyExecuteWithTimeout to simulate timeout by returning undefined
            mockedSafelyExecuteWithTimeout.mockImplementation(
              async () => undefined, // Simulates timeout behavior
            );

            // Start refresh with the mocked timeout behavior
            await refresh(clock, ['mainnet'], true);

            // With safelyExecuteWithTimeout, timeouts are handled gracefully
            // The system should continue operating without throwing errors
            // No specific timeout error message should be logged
            expect(consoleWarnSpy).not.toHaveBeenCalledWith(
              expect.stringContaining('Timeout after'),
            );

            // Verify that the controller state remains intact despite the timeout
            expect(controller.state.accountsByChainId).toHaveProperty('0x1');
            expect(controller.state.accountsByChainId['0x1']).toHaveProperty(
              CHECKSUM_ADDRESS_1,
            );

            consoleWarnSpy.mockRestore();
          },
        );
      });

      it('should use default allowExternalServices when not provided (covers line 390)', async () => {
        // Mock fetch to simulate API balance fetcher behavior
        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
          ok: true,
          json: async () => ({ accounts: [] }),
        } as Response);

        await withController(
          {
            options: {
              accountsApiChainIds: () => ['0x1'],
              // allowExternalServices not provided - should default to () => true (line 390)
            },
            isMultiAccountBalancesEnabled: true,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
          },
          async ({ refresh }) => {
            // Mock RPC query to return balance
            mockedQuery.mockResolvedValue('0x0');

            // Refresh balances for mainnet (supported by API)
            await refresh(clock, ['mainnet'], true);

            // Since allowExternalServices defaults to () => true (line 390), and accountsApiChainIds includes '0x1',
            // the API fetcher should be used, which means fetch should be called
            expect(fetchSpy).toHaveBeenCalled();

            fetchSpy.mockRestore();
          },
        );
      });

      it('should respect allowExternalServices when set to true', async () => {
        // Mock fetch to simulate API balance fetcher behavior
        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
          ok: true,
          json: async () => ({ accounts: [] }),
        } as Response);

        await withController(
          {
            options: {
              accountsApiChainIds: () => ['0x1'],
              allowExternalServices: () => true, // Explicitly set to true
            },
            isMultiAccountBalancesEnabled: true,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
          },
          async ({ refresh }) => {
            // Mock RPC query to return balance
            mockedQuery.mockResolvedValue('0x0');

            // Refresh balances for mainnet (supported by API)
            await refresh(clock, ['mainnet'], true);

            // Since allowExternalServices is true and accountsApiChainIds returns ['0x1'],
            // the API fetcher should be used, which means fetch should be called
            expect(fetchSpy).toHaveBeenCalled();

            fetchSpy.mockRestore();
          },
        );
      });

      it('should respect allowExternalServices when set to false', async () => {
        // Mock fetch to simulate API balance fetcher behavior
        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
          ok: true,
          json: async () => ({ accounts: [] }),
        } as Response);

        await withController(
          {
            options: {
              accountsApiChainIds: () => ['0x1'],
              allowExternalServices: () => false, // Explicitly set to false
            },
            isMultiAccountBalancesEnabled: true,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
          },
          async ({ refresh }) => {
            // Mock RPC query to return balance
            mockedQuery.mockResolvedValue('0x0');

            // Refresh balances for mainnet
            await refresh(clock, ['mainnet'], true);

            // Since allowExternalServices is false, the API fetcher should NOT be used
            // Only RPC calls should be made, so fetch should NOT be called
            expect(fetchSpy).not.toHaveBeenCalled();
            // RPC fetcher should be used as the only balance fetcher
            // (mockedQuery may or may not be called depending on implementation details)

            fetchSpy.mockRestore();
          },
        );
      });
    });

    it('should continue to next fetcher when current fetcher supports no chains', async () => {
      // Spy on the AccountsApiBalanceFetcher's supports method to return false
      const supportsSpy = jest
        .spyOn(AccountsApiBalanceFetcher.prototype, 'supports')
        .mockReturnValue(false);

      await withController(
        {
          options: {
            accountsApiChainIds: () => ['0x1'], // Configure to use AccountsAPI for mainnet
            allowExternalServices: () => true,
          },
          isMultiAccountBalancesEnabled: true,
          selectedAccount: ACCOUNT_1,
          listAccounts: [ACCOUNT_1],
        },
        async ({ controller, refresh }) => {
          // Mock RPC query to return balance (this should be used since AccountsAPI supports nothing)
          mockedQuery.mockResolvedValue('0x123456');

          // Refresh balances for mainnet
          await refresh(clock, ['mainnet'], true);

          // Verify that the supports method was called (meaning we reached the continue logic)
          expect(supportsSpy).toHaveBeenCalledWith('0x1');

          // Verify that state was still updated via RPC fetcher fallback
          expect(
            controller.state.accountsByChainId['0x1'][CHECKSUM_ADDRESS_1]
              .balance,
          ).toBeDefined();

          supportsSpy.mockRestore();
        },
      );
    });

    it('should log warning when balance fetcher throws an error', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Mock AccountsApiBalanceFetcher to throw an error
      const fetchSpy = jest
        .spyOn(AccountsApiBalanceFetcher.prototype, 'fetch')
        .mockRejectedValue(new Error('API request failed'));

      await withController(
        {
          options: {
            accountsApiChainIds: () => ['0x1'], // Configure to use AccountsAPI for mainnet
            allowExternalServices: () => true,
          },
          isMultiAccountBalancesEnabled: true,
          selectedAccount: ACCOUNT_1,
          listAccounts: [ACCOUNT_1],
        },
        async ({ refresh }) => {
          // Mock RPC query to return balance (fallback after API fails)
          mockedQuery.mockResolvedValue('0x123456');

          // Refresh balances for mainnet
          await refresh(clock, ['mainnet'], true);

          // Verify that console.warn was called with the error message
          expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Balance fetcher failed for chains 0x1:'),
          );

          fetchSpy.mockRestore();
          consoleWarnSpy.mockRestore();
        },
      );
    });
  });

  describe('syncBalanceWithAddresses', () => {
    it('should sync balance with addresses', async () => {
      await withController(
        {
          isMultiAccountBalancesEnabled: true,
          selectedAccount: ACCOUNT_1,
          listAccounts: [],
        },
        async ({ controller }) => {
          mockedQuery
            .mockReturnValueOnce(Promise.resolve('0x10'))
            .mockReturnValueOnce(Promise.resolve('0x20'));
          const result = await controller.syncBalanceWithAddresses([
            ADDRESS_1,
            ADDRESS_2,
          ]);
          expect(result[ADDRESS_1].balance).toBe('0x10');
          expect(result[ADDRESS_2].balance).toBe('0x20');
        },
      );
    });

    it('should sync staked balance with addresses', async () => {
      await withController(
        {
          options: {
            includeStakedAssets: true,
            getStakedBalanceForChain: mockGetStakedBalanceForChain,
          },
          isMultiAccountBalancesEnabled: true,
          selectedAccount: ACCOUNT_1,
          listAccounts: [],
        },
        async ({ controller }) => {
          mockedQuery
            .mockReturnValueOnce(Promise.resolve('0x10'))
            .mockReturnValueOnce(Promise.resolve('0x20'));
          const result = await controller.syncBalanceWithAddresses([
            ADDRESS_1,
            ADDRESS_2,
          ]);
          expect(result[ADDRESS_1].balance).toBe('0x10');
          expect(result[ADDRESS_2].balance).toBe('0x20');
          expect(result[ADDRESS_1].stakedBalance).toBe('0x1');
          expect(result[ADDRESS_2].stakedBalance).toBe('0x1');
        },
      );
    });

    it('should handle timeout in syncBalanceWithAddresses gracefully', async () => {
      await withController(
        {
          isMultiAccountBalancesEnabled: true,
          selectedAccount: ACCOUNT_1,
          listAccounts: [],
        },
        async ({ controller }) => {
          // Mock safelyExecuteWithTimeout to return undefined (timeout case)
          mockedSafelyExecuteWithTimeout.mockImplementation(
            async () => undefined, // Simulates timeout behavior
          );

          const result = await controller.syncBalanceWithAddresses([
            ADDRESS_1,
            ADDRESS_2,
          ]);

          // Verify that the result is an empty object when all operations timeout
          expect(result).toStrictEqual({});

          // Restore the mock
          mockedSafelyExecuteWithTimeout.mockImplementation(
            async (operation: () => Promise<unknown>) => {
              try {
                return await operation();
              } catch {
                return undefined;
              }
            },
          );
        },
      );
    });
  });

  it('should call refresh every interval on polling', async () => {
    const pollSpy = jest.spyOn(
      AccountTrackerController.prototype,
      '_executePoll',
    );
    await withController(
      {
        options: { interval: 100 },
        isMultiAccountBalancesEnabled: true,
        selectedAccount: EMPTY_ACCOUNT,
        listAccounts: [],
      },
      async ({ controller }) => {
        jest.spyOn(controller, 'refresh').mockResolvedValue();

        controller.startPolling({
          networkClientIds: ['networkClientId1'],
          queryAllAccounts: true,
        });
        await advanceTime({ clock, duration: 1 });

        expect(pollSpy).toHaveBeenCalledTimes(1);

        await advanceTime({ clock, duration: 50 });

        expect(pollSpy).toHaveBeenCalledTimes(1);

        await advanceTime({ clock, duration: 50 });

        expect(pollSpy).toHaveBeenCalledTimes(2);
      },
    );
  });

  it('should call refresh every interval for each networkClientId being polled', async () => {
    const networkClientId1 = 'networkClientId1';
    const networkClientId2 = 'networkClientId2';
    await withController(
      {
        options: { interval: 100 },
        isMultiAccountBalancesEnabled: true,
        selectedAccount: EMPTY_ACCOUNT,
        listAccounts: [],
      },
      async ({ controller }) => {
        const refreshSpy = jest
          .spyOn(controller, 'refresh')
          .mockResolvedValue();

        controller.startPolling({
          networkClientIds: [networkClientId1],
          queryAllAccounts: true,
        });

        await advanceTime({ clock, duration: 0 });
        expect(refreshSpy).toHaveBeenNthCalledWith(1, [networkClientId1], true);
        expect(refreshSpy).toHaveBeenCalledTimes(1);
        await advanceTime({ clock, duration: 50 });
        expect(refreshSpy).toHaveBeenCalledTimes(1);
        await advanceTime({ clock, duration: 50 });
        expect(refreshSpy).toHaveBeenNthCalledWith(2, [networkClientId1], true);
        expect(refreshSpy).toHaveBeenCalledTimes(2);

        const pollToken = controller.startPolling({
          networkClientIds: [networkClientId2],
          queryAllAccounts: true,
        });

        await advanceTime({ clock, duration: 0 });
        expect(refreshSpy).toHaveBeenNthCalledWith(3, [networkClientId2], true);
        expect(refreshSpy).toHaveBeenCalledTimes(3);
        await advanceTime({ clock, duration: 100 });
        expect(refreshSpy).toHaveBeenNthCalledWith(4, [networkClientId1], true);
        expect(refreshSpy).toHaveBeenNthCalledWith(5, [networkClientId2], true);
        expect(refreshSpy).toHaveBeenCalledTimes(5);

        controller.stopPollingByPollingToken(pollToken);

        await advanceTime({ clock, duration: 100 });
        expect(refreshSpy).toHaveBeenNthCalledWith(6, [networkClientId1], true);
        expect(refreshSpy).toHaveBeenCalledTimes(6);

        controller.stopAllPolling();

        await advanceTime({ clock, duration: 100 });

        expect(refreshSpy).toHaveBeenCalledTimes(6);
      },
    );
  });

  it('should not call polling twice', async () => {
    await withController(
      {
        options: { interval: 100 },
      },
      async ({ controller }) => {
        const refreshSpy = jest
          .spyOn(controller, 'refresh')
          .mockResolvedValue();

        expect(refreshSpy).not.toHaveBeenCalled();
        controller.startPolling({
          networkClientIds: ['networkClientId1'],
          queryAllAccounts: true,
        });

        await advanceTime({ clock, duration: 1 });
        expect(refreshSpy).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'anonymous',
          ),
        ).toMatchInlineSnapshot(`Object {}`);
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
        ).toMatchInlineSnapshot(`Object {}`);
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
            "accountsByChainId": Object {
              "0x1": Object {},
            },
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
        ).toMatchInlineSnapshot(`
          Object {
            "accountsByChainId": Object {
              "0x1": Object {},
            },
          }
        `);
      });
    });
  });
});

type WithControllerCallback<ReturnValue> = ({
  controller,
}: {
  controller: AccountTrackerController;
  messenger: Messenger<
    ExtractAvailableAction<AccountTrackerControllerMessenger> | AllowedActions,
    ExtractAvailableEvent<AccountTrackerControllerMessenger> | AllowedEvents
  >;
  triggerSelectedAccountChange: (account: InternalAccount) => void;
  refresh: (
    clock: SinonFakeTimers,
    networkClientIds: NetworkClientId[],
    queryAllAccounts?: boolean,
  ) => Promise<void>;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<ConstructorParameters<typeof AccountTrackerController>[0]>;
  isMultiAccountBalancesEnabled?: boolean;
  selectedAccount?: InternalAccount;
  listAccounts?: InternalAccount[];
  networkClientById?: Record<NetworkClientId, NetworkClientConfiguration>;
};

type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [WithControllerOptions, WithControllerCallback<ReturnValue>];

/**
 * Builds a controller based on the given options, and calls the given function
 * with that controller.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag accepts controller options and config; the function
 * will be called with the built controller.
 * @returns Whatever the callback returns.
 */
async function withController<ReturnValue>(
  ...args: WithControllerArgs<ReturnValue>
): Promise<ReturnValue> {
  const [
    {
      options = {},
      isMultiAccountBalancesEnabled = false,
      selectedAccount = ACCOUNT_1,
      listAccounts = [],
      networkClientById = {},
    },
    testFunction,
  ] = args.length === 2 ? args : [{}, args[0]];

  const messenger = new Messenger<
    ExtractAvailableAction<AccountTrackerControllerMessenger> | AllowedActions,
    ExtractAvailableEvent<AccountTrackerControllerMessenger> | AllowedEvents
  >();

  const mockGetSelectedAccount = jest.fn().mockReturnValue(selectedAccount);
  messenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    mockGetSelectedAccount,
  );

  const mockListAccounts = jest.fn().mockReturnValue(listAccounts);
  messenger.registerActionHandler(
    'AccountsController:listAccounts',
    mockListAccounts,
  );

  const getNetworkClientById = buildMockGetNetworkClientById(networkClientById);
  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    (clientId) => {
      const network = getNetworkClientById(clientId);

      const provider = new FakeProvider({
        stubs: [
          {
            request: {
              method: 'eth_chainId',
            },
            response: { result: network.configuration.chainId },
          },
          // Return a balance of 0.04860317424178419 ETH for ADDRESS_1
          {
            request: {
              method: 'eth_call',
              params: [
                {
                  to: '0xb1f8e55c7f64d203c1400b9d8555d050f94adf39',
                  data: '0xf0002ea9000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000001000000000000000000000000c38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000',
                },
                'latest',
              ],
            },
            response: {
              result:
                '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000acac5457a3517e',
            },
          },
          // Return a balance of 0.04860317424178419 ETH for ADDRESS_1 and 185731.896670448046411083 ETH for ADDRESS_2
          {
            request: {
              method: 'eth_call',
              params: [
                {
                  to: '0xb1f8e55c7f64d203c1400b9d8555d050f94adf39',
                  data: '0xf0002ea9000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000002000000000000000000000000c38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d000000000000000000000000742d35cc6634c0532925a3b844bc454e4438f44e00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000',
                },
                'latest',
              ],
            },
            response: {
              result:
                '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000acac5457a3517e0000000000000000000000000000000000000000000027548bd9e4026c918d4b',
            },
          },
          // Mock balanceOf call for zero address - returns same balance data for consistency
          {
            request: {
              method: 'eth_call',
              params: [
                {
                  to: '0xcA11bde05977b3631167028862bE2a173976CA11',
                  data: '0x70a082310000000000000000000000000000000000000000000000000000000000000000',
                },
                'latest',
              ],
            },
            response: {
              result:
                '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000acac5457a3517e0000000000000000000000000000000000000000000027548bd9e4026c918d4b',
            },
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;

      return { ...network, provider };
    },
  );

  const mockGetPreferencesControllerState = jest.fn().mockReturnValue({
    ...getDefaultPreferencesState(),
    isMultiAccountBalancesEnabled,
  });
  messenger.registerActionHandler(
    'PreferencesController:getState',
    mockGetPreferencesControllerState,
  );

  const mockNetworkState = jest.fn().mockReturnValue({
    ...getDefaultNetworkControllerState(),
    chainId: initialChainId,
  });

  messenger.registerActionHandler(
    'NetworkController:getState',
    mockNetworkState,
  );

  const accountTrackerMessenger = messenger.getRestricted({
    name: 'AccountTrackerController',
    allowedActions: [
      'NetworkController:getNetworkClientById',
      'NetworkController:getState',
      'PreferencesController:getState',
      'AccountsController:getSelectedAccount',
      'AccountsController:listAccounts',
    ],
    allowedEvents: [
      'AccountsController:selectedEvmAccountChange',
      'TransactionController:unapprovedTransactionAdded',
      'TransactionController:transactionConfirmed',
    ],
  });

  const triggerSelectedAccountChange = (account: InternalAccount) => {
    messenger.publish('AccountsController:selectedEvmAccountChange', account);
  };

  const controller = new AccountTrackerController({
    messenger: accountTrackerMessenger,
    getStakedBalanceForChain: jest.fn(),
    ...options,
  });

  const refresh = async (
    clock: SinonFakeTimers,
    networkClientIds: NetworkClientId[],
    queryAllAccounts?: boolean,
  ) => {
    const promise = controller.refresh(networkClientIds, queryAllAccounts);
    await clock.tickAsync(1);
    await promise;
  };

  return await testFunction({
    controller,
    messenger,
    triggerSelectedAccountChange,
    refresh,
  });
}

describe('AccountTrackerController batch update methods', () => {
  describe('updateNativeBalances', () => {
    it('should update multiple native token balances in a single operation', async () => {
      await withController({}, async ({ controller }) => {
        const balanceUpdates = [
          {
            address: CHECKSUM_ADDRESS_1,
            chainId: '0x1' as const,
            balance: '0x1bc16d674ec80000' as const, // 2 ETH
          },
          {
            address: CHECKSUM_ADDRESS_2,
            chainId: '0x1' as const,
            balance: '0x38d7ea4c68000' as const, // 1 ETH
          },
          {
            address: CHECKSUM_ADDRESS_1,
            chainId: '0x89' as const, // Polygon
            balance: '0x56bc75e2d630eb20' as const, // 6.25 MATIC
          },
        ];

        controller.updateNativeBalances(balanceUpdates);

        expect(controller.state.accountsByChainId).toStrictEqual({
          '0x1': {
            [CHECKSUM_ADDRESS_1]: { balance: '0x1bc16d674ec80000' },
            [CHECKSUM_ADDRESS_2]: { balance: '0x38d7ea4c68000' },
          },
          '0x89': {
            [CHECKSUM_ADDRESS_1]: { balance: '0x56bc75e2d630eb20' },
          },
        });
      });
    });

    it('should create new chain entries when updating balances for new chains', async () => {
      await withController({}, async ({ controller }) => {
        const balanceUpdates = [
          {
            address: CHECKSUM_ADDRESS_1,
            chainId: '0xa4b1' as const, // Arbitrum
            balance: '0x2386f26fc10000' as const, // 0.01 ETH
          },
        ];

        controller.updateNativeBalances(balanceUpdates);

        expect(controller.state.accountsByChainId['0xa4b1']).toStrictEqual({
          [CHECKSUM_ADDRESS_1]: { balance: '0x2386f26fc10000' },
        });
      });
    });

    it('should create new account entries when updating balances for new addresses', async () => {
      await withController({}, async ({ controller }) => {
        // First set an existing balance
        controller.updateNativeBalances([
          {
            address: CHECKSUM_ADDRESS_1,
            chainId: '0x1' as const,
            balance: '0x1bc16d674ec80000',
          },
        ]);

        // Then add a new address on the same chain
        const newAddress = '0x1234567890123456789012345678901234567890';
        controller.updateNativeBalances([
          {
            address: newAddress,
            chainId: '0x1' as const,
            balance: '0x38d7ea4c68000',
          },
        ]);

        expect(controller.state.accountsByChainId['0x1']).toStrictEqual({
          [CHECKSUM_ADDRESS_1]: { balance: '0x1bc16d674ec80000' },
          [newAddress]: { balance: '0x38d7ea4c68000' },
        });
      });
    });

    it('should update existing balances without affecting other properties', async () => {
      await withController(
        {
          options: {
            state: {
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: {
                    balance: '0x0',
                    stakedBalance: '0x5',
                  },
                },
              },
            },
          },
        },
        async ({ controller }) => {
          // Update only native balance
          controller.updateNativeBalances([
            {
              address: CHECKSUM_ADDRESS_1,
              chainId: '0x1' as const,
              balance: '0x1bc16d674ec80000',
            },
          ]);

          expect(
            controller.state.accountsByChainId['0x1'][CHECKSUM_ADDRESS_1],
          ).toStrictEqual({
            balance: '0x1bc16d674ec80000',
            stakedBalance: '0x5', // Should remain unchanged
          });
        },
      );
    });

    it('should handle empty balance updates array', async () => {
      await withController({}, async ({ controller }) => {
        const initialState = controller.state.accountsByChainId;

        controller.updateNativeBalances([]);

        expect(controller.state.accountsByChainId).toStrictEqual(initialState);
      });
    });

    it('should handle zero balances', async () => {
      await withController({}, async ({ controller }) => {
        controller.updateNativeBalances([
          {
            address: CHECKSUM_ADDRESS_1,
            chainId: '0x1' as const,
            balance: '0x0',
          },
        ]);

        expect(controller.state.accountsByChainId['0x1']).toStrictEqual({
          [CHECKSUM_ADDRESS_1]: { balance: '0x0' },
        });
      });
    });
  });

  describe('updateStakedBalances', () => {
    it('should update multiple staked balances in a single operation', async () => {
      await withController({}, async ({ controller }) => {
        const stakedBalanceUpdates = [
          {
            address: CHECKSUM_ADDRESS_1,
            chainId: '0x1' as const,
            stakedBalance: '0x1bc16d674ec80000', // 2 ETH staked
          },
          {
            address: CHECKSUM_ADDRESS_2,
            chainId: '0x1' as const,
            stakedBalance: '0x38d7ea4c68000', // 1 ETH staked
          },
          {
            address: CHECKSUM_ADDRESS_1,
            chainId: '0x89' as const, // Polygon
            stakedBalance: '0x56bc75e2d630eb20', // 6.25 MATIC staked
          },
        ];

        controller.updateStakedBalances(stakedBalanceUpdates);

        expect(controller.state.accountsByChainId).toStrictEqual({
          '0x1': {
            [CHECKSUM_ADDRESS_1]: {
              balance: '0x0',
              stakedBalance: '0x1bc16d674ec80000',
            },
            [CHECKSUM_ADDRESS_2]: {
              balance: '0x0',
              stakedBalance: '0x38d7ea4c68000',
            },
          },
          '0x89': {
            [CHECKSUM_ADDRESS_1]: {
              balance: '0x0',
              stakedBalance: '0x56bc75e2d630eb20',
            },
          },
        });
      });
    });

    it('should handle undefined staked balances', async () => {
      await withController({}, async ({ controller }) => {
        controller.updateStakedBalances([
          {
            address: CHECKSUM_ADDRESS_1,
            chainId: '0x1' as const,
            stakedBalance: undefined,
          },
        ]);

        expect(controller.state.accountsByChainId['0x1']).toStrictEqual({
          [CHECKSUM_ADDRESS_1]: { balance: '0x0', stakedBalance: undefined },
        });
      });
    });

    it('should create new chain and account entries for staked balances', async () => {
      await withController({}, async ({ controller }) => {
        controller.updateStakedBalances([
          {
            address: CHECKSUM_ADDRESS_1,
            chainId: '0xa4b1' as const, // Arbitrum
            stakedBalance: '0x2386f26fc10000',
          },
        ]);

        expect(controller.state.accountsByChainId['0xa4b1']).toStrictEqual({
          [CHECKSUM_ADDRESS_1]: {
            balance: '0x0',
            stakedBalance: '0x2386f26fc10000',
          },
        });
      });
    });

    it('should update staked balances without affecting native balances', async () => {
      await withController(
        {
          options: {
            state: {
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: {
                    balance: '0x1bc16d674ec80000',
                  },
                },
              },
            },
          },
        },
        async ({ controller }) => {
          // Update only staked balance
          controller.updateStakedBalances([
            {
              address: CHECKSUM_ADDRESS_1,
              chainId: '0x1' as const,
              stakedBalance: '0x38d7ea4c68000',
            },
          ]);

          expect(
            controller.state.accountsByChainId['0x1'][CHECKSUM_ADDRESS_1],
          ).toStrictEqual({
            balance: '0x1bc16d674ec80000', // Should remain unchanged
            stakedBalance: '0x38d7ea4c68000',
          });
        },
      );
    });

    it('should handle zero staked balances', async () => {
      await withController({}, async ({ controller }) => {
        controller.updateStakedBalances([
          {
            address: CHECKSUM_ADDRESS_1,
            chainId: '0x1' as const,
            stakedBalance: '0x0',
          },
        ]);

        expect(controller.state.accountsByChainId['0x1']).toStrictEqual({
          [CHECKSUM_ADDRESS_1]: { balance: '0x0', stakedBalance: '0x0' },
        });
      });
    });

    it('should handle empty staked balance updates array', async () => {
      await withController({}, async ({ controller }) => {
        const initialState = controller.state.accountsByChainId;

        controller.updateStakedBalances([]);

        expect(controller.state.accountsByChainId).toStrictEqual(initialState);
      });
    });
  });

  describe('combined native and staked balance updates', () => {
    it('should handle both native and staked balance updates for the same account', async () => {
      await withController({}, async ({ controller }) => {
        // Update native balance first
        controller.updateNativeBalances([
          {
            address: CHECKSUM_ADDRESS_1,
            chainId: '0x1' as const,
            balance: '0x1bc16d674ec80000',
          },
        ]);

        // Then update staked balance
        controller.updateStakedBalances([
          {
            address: CHECKSUM_ADDRESS_1,
            chainId: '0x1' as const,
            stakedBalance: '0x38d7ea4c68000',
          },
        ]);

        expect(controller.state.accountsByChainId['0x1']).toStrictEqual({
          [CHECKSUM_ADDRESS_1]: {
            balance: '0x1bc16d674ec80000',
            stakedBalance: '0x38d7ea4c68000',
          },
        });
      });
    });

    it('should maintain independent state for different chains', async () => {
      await withController({}, async ({ controller }) => {
        // Update balances on mainnet
        controller.updateNativeBalances([
          {
            address: CHECKSUM_ADDRESS_1,
            chainId: '0x1' as const,
            balance: '0x1bc16d674ec80000',
          },
        ]);

        controller.updateStakedBalances([
          {
            address: CHECKSUM_ADDRESS_1,
            chainId: '0x1' as const,
            stakedBalance: '0x38d7ea4c68000',
          },
        ]);

        // Update balances on polygon
        controller.updateNativeBalances([
          {
            address: CHECKSUM_ADDRESS_1,
            chainId: '0x89' as const,
            balance: '0x56bc75e2d630eb20',
          },
        ]);

        expect(controller.state.accountsByChainId).toStrictEqual({
          '0x1': {
            [CHECKSUM_ADDRESS_1]: {
              balance: '0x1bc16d674ec80000',
              stakedBalance: '0x38d7ea4c68000',
            },
          },
          '0x89': {
            [CHECKSUM_ADDRESS_1]: {
              balance: '0x56bc75e2d630eb20',
            },
          },
        });
      });
    });
  });
});
