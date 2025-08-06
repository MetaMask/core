import { Messenger } from '@metamask/base-controller';
import { query, toChecksumHexAddress } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import {
  type NetworkClientId,
  type NetworkClientConfiguration,
  getDefaultNetworkControllerState,
} from '@metamask/network-controller';
import { getDefaultPreferencesState } from '@metamask/preferences-controller';
import * as sinon from 'sinon';

import type {
  AccountTrackerControllerMessenger,
  AllowedActions,
  AllowedEvents,
} from './AccountTrackerController';
import { AccountTrackerController } from './AccountTrackerController';
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
  };
});

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

describe('AccountTrackerController', () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    mockedQuery.mockReturnValue(Promise.resolve('0x0'));
  });

  afterEach(() => {
    sinon.restore();
    mockedQuery.mockRestore();
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

  describe('refresh', () => {
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
            await refresh(clock, ['mainnet']);
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
        mockedQuery.mockReturnValueOnce(Promise.resolve('0x10'));

        await withController(
          {
            isMultiAccountBalancesEnabled: true,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1],
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['mainnet']);

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
        await withController(
          {
            isMultiAccountBalancesEnabled: false,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['mainnet']);

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
        await withController(
          {
            isMultiAccountBalancesEnabled: true,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['mainnet']);

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
            await refresh(clock, ['mainnet']);

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
        mockedQuery
          .mockReturnValueOnce(Promise.resolve('0x13'))
          .mockReturnValueOnce(Promise.resolve('0x14'));

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
            await refresh(clock, ['mainnet']);

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
            await refresh(clock, ['mainnet']);

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
                chainId: '0x5',
              }),
            },
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['networkClientId1']);
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
                '0x5': {
                  [CHECKSUM_ADDRESS_1]: { balance: '0x0' },
                  [CHECKSUM_ADDRESS_2]: { balance: '0x0' },
                },
              },
            });
          },
        );
      });

      it('should get real balance', async () => {
        mockedQuery.mockReturnValueOnce(Promise.resolve('0x10'));
        const networkClientId = 'networkClientId1';

        await withController(
          {
            isMultiAccountBalancesEnabled: true,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1],
            networkClientById: {
              [networkClientId]: buildCustomNetworkClientConfiguration({
                chainId: '0x5',
              }),
            },
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['networkClientId1']);

            expect(controller.state).toStrictEqual({
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: {
                    balance: '0x0',
                  },
                },
                '0x5': {
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
        mockedQuery
          .mockReturnValueOnce(Promise.resolve('0x10'))
          .mockReturnValueOnce(Promise.resolve('0x11'));
        const networkClientId = 'networkClientId1';

        await withController(
          {
            isMultiAccountBalancesEnabled: false,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
            networkClientById: {
              [networkClientId]: buildCustomNetworkClientConfiguration({
                chainId: '0x5',
              }),
            },
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['networkClientId1']);

            expect(controller.state).toStrictEqual({
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: { balance: '0x0' },
                  [CHECKSUM_ADDRESS_2]: { balance: '0x0' },
                },
                '0x5': {
                  [CHECKSUM_ADDRESS_1]: { balance: '0x10' },
                  [CHECKSUM_ADDRESS_2]: { balance: '0x0' },
                },
              },
            });
          },
        );
      });

      it('should update all address balances when multi-account is enabled', async () => {
        mockedQuery
          .mockReturnValueOnce(Promise.resolve('0x11'))
          .mockReturnValueOnce(Promise.resolve('0x12'));
        const networkClientId = 'networkClientId1';

        await withController(
          {
            isMultiAccountBalancesEnabled: true,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
            networkClientById: {
              [networkClientId]: buildCustomNetworkClientConfiguration({
                chainId: '0x5',
              }),
            },
          },
          async ({ controller, refresh }) => {
            await refresh(clock, ['networkClientId1']);

            expect(controller.state).toStrictEqual({
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: { balance: '0x0' },
                  [CHECKSUM_ADDRESS_2]: { balance: '0x0' },
                },
                '0x5': {
                  [CHECKSUM_ADDRESS_1]: { balance: '0x11' },
                  [CHECKSUM_ADDRESS_2]: { balance: '0x12' },
                },
              },
            });
          },
        );
      });

      it('should update staked balance when includeStakedAssets is enabled', async () => {
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
            await refresh(clock, ['mainnet']);

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
            await refresh(clock, ['mainnet']);

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
            await refresh(clock, ['mainnet']);

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
        const networkClientId = 'polygon';

        await withController(
          {
            options: {
              includeStakedAssets: true,
              getStakedBalanceForChain: jest.fn().mockResolvedValue({}),
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
            await refresh(clock, ['mainnet']);

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

        await controller.startPolling({
          networkClientIds: ['networkClientId1'],
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
        });

        await advanceTime({ clock, duration: 0 });
        expect(refreshSpy).toHaveBeenNthCalledWith(1, [networkClientId1]);
        expect(refreshSpy).toHaveBeenCalledTimes(1);
        await advanceTime({ clock, duration: 50 });
        expect(refreshSpy).toHaveBeenCalledTimes(1);
        await advanceTime({ clock, duration: 50 });
        expect(refreshSpy).toHaveBeenNthCalledWith(2, [networkClientId1]);
        expect(refreshSpy).toHaveBeenCalledTimes(2);

        const pollToken = controller.startPolling({
          networkClientIds: [networkClientId2],
        });

        await advanceTime({ clock, duration: 0 });
        expect(refreshSpy).toHaveBeenNthCalledWith(3, [networkClientId2]);
        expect(refreshSpy).toHaveBeenCalledTimes(3);
        await advanceTime({ clock, duration: 100 });
        expect(refreshSpy).toHaveBeenNthCalledWith(4, [networkClientId1]);
        expect(refreshSpy).toHaveBeenNthCalledWith(5, [networkClientId2]);
        expect(refreshSpy).toHaveBeenCalledTimes(5);

        controller.stopPollingByPollingToken(pollToken);

        await advanceTime({ clock, duration: 100 });
        expect(refreshSpy).toHaveBeenNthCalledWith(6, [networkClientId1]);
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
        });

        await advanceTime({ clock, duration: 1 });
        expect(refreshSpy).toHaveBeenCalledTimes(1);
      },
    );
  });
});

type WithControllerCallback<ReturnValue> = ({
  controller,
}: {
  controller: AccountTrackerController;
  triggerSelectedAccountChange: (account: InternalAccount) => void;
  refresh: (
    clock: sinon.SinonFakeTimers,
    networkClientIds: NetworkClientId[],
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
    allowedEvents: ['AccountsController:selectedEvmAccountChange'],
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
    clock: sinon.SinonFakeTimers,
    networkClientIds: NetworkClientId[],
  ) => {
    const promise = controller.refresh(networkClientIds);
    await clock.tickAsync(1);
    await promise;
  };

  return await testFunction({
    controller,
    triggerSelectedAccountChange,
    refresh,
  });
}
