import { ControllerMessenger } from '@metamask/base-controller';
import { query, toChecksumHexAddress } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-api';
import {
  type NetworkClientId,
  type NetworkClientConfiguration,
  getDefaultNetworkControllerState,
} from '@metamask/network-controller';
import { getDefaultPreferencesState } from '@metamask/preferences-controller';
import * as sinon from 'sinon';

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
import type {
  AccountTrackerControllerMessenger,
  AllowedActions,
  AllowedEvents,
} from './AccountTrackerController';
import { AccountTrackerController } from './AccountTrackerController';

jest.mock('@metamask/controller-utils', () => {
  return {
    ...jest.requireActual('@metamask/controller-utils'),
    query: jest.fn(),
  };
});

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
          accounts: {},
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
    beforeEach(() => {
      jest
        .spyOn(AccountTrackerController.prototype, 'poll')
        .mockImplementationOnce(async () => Promise.resolve());
    });

    describe('without networkClientId', () => {
      it('should sync addresses', async () => {
        const mockAddress1 = '0xbabe9bbeab5f83a755ac92c7a09b9ab3ff527f8c';
        const checksumAddress1 = toChecksumHexAddress(mockAddress1);
        const mockAddress2 = '0xeb9b5bd1db51ce4cb6c91dc5fb5d9beca9ff99f4';
        const checksumAddress2 = toChecksumHexAddress(mockAddress2);
        const mockAccount1 = createMockInternalAccount({
          address: mockAddress1,
        });
        const mockAccount2 = createMockInternalAccount({
          address: mockAddress2,
        });
        await withController(
          {
            options: {
              state: {
                accounts: {
                  [checksumAddress1]: { balance: '0x1' },
                  foo: { balance: '0x2' },
                },
                accountsByChainId: {
                  '0x1': {
                    [checksumAddress1]: { balance: '0x1' },
                    foo: { balance: '0x2' },
                  },
                  '0x2': {
                    [checksumAddress1]: { balance: '0xa' },
                    foo: { balance: '0xb' },
                  },
                },
              },
            },
            isMultiAccountBalancesEnabled: true,
            selectedAccount: mockAccount1,
            listAccounts: [mockAccount1, mockAccount2],
          },
          async ({ controller }) => {
            await controller.refresh();
            expect(controller.state).toStrictEqual({
              accounts: {
                [checksumAddress1]: { balance: '0x0' },
                [checksumAddress2]: { balance: '0x0' },
              },
              accountsByChainId: {
                '0x1': {
                  [checksumAddress1]: { balance: '0x0' },
                  [checksumAddress2]: { balance: '0x0' },
                },
                '0x2': {
                  [checksumAddress1]: { balance: '0xa' },
                  [checksumAddress2]: { balance: '0x0' },
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
          async ({ controller }) => {
            await controller.refresh();

            expect(controller.state).toStrictEqual({
              accounts: {
                [CHECKSUM_ADDRESS_1]: {
                  balance: '0x10',
                },
              },
              accountsByChainId: {
                '0x1': {
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

        await withController(
          {
            isMultiAccountBalancesEnabled: false,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
          },
          async ({ controller }) => {
            await controller.refresh();

            expect(controller.state).toStrictEqual({
              accounts: {
                [CHECKSUM_ADDRESS_1]: { balance: '0x10' },
                [CHECKSUM_ADDRESS_2]: { balance: '0x0' },
              },
              accountsByChainId: {
                '0x1': {
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

        await withController(
          {
            isMultiAccountBalancesEnabled: true,
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
          },
          async ({ controller }) => {
            await controller.refresh();

            expect(controller.state).toStrictEqual({
              accounts: {
                [CHECKSUM_ADDRESS_1]: { balance: '0x11' },
                [CHECKSUM_ADDRESS_2]: { balance: '0x12' },
              },
              accountsByChainId: {
                '0x1': {
                  [CHECKSUM_ADDRESS_1]: { balance: '0x11' },
                  [CHECKSUM_ADDRESS_2]: { balance: '0x12' },
                },
              },
            });
          },
        );
      });
    });

    describe('with networkClientId', () => {
      it('should sync addresses', async () => {
        const mockAddress1 = '0xbabe9bbeab5f83a755ac92c7a09b9ab3ff527f8c';
        const checksumAddress1 = toChecksumHexAddress(mockAddress1);
        const mockAddress2 = '0xeb9b5bd1db51ce4cb6c91dc5fb5d9beca9ff99f4';
        const checksumAddress2 = toChecksumHexAddress(mockAddress2);
        const mockAccount1 = createMockInternalAccount({
          address: mockAddress1,
        });
        const mockAccount2 = createMockInternalAccount({
          address: mockAddress2,
        });
        const networkClientId = 'networkClientId1';
        await withController(
          {
            options: {
              state: {
                accounts: {
                  [checksumAddress1]: { balance: '0x1' },
                  foo: { balance: '0x2' },
                },
                accountsByChainId: {
                  '0x1': {
                    [checksumAddress1]: { balance: '0x1' },
                    foo: { balance: '0x2' },
                  },
                  '0x2': {
                    [checksumAddress1]: { balance: '0xa' },
                    foo: { balance: '0xb' },
                  },
                },
              },
            },
            isMultiAccountBalancesEnabled: true,
            selectedAccount: mockAccount1,
            listAccounts: [mockAccount1, mockAccount2],
            networkClientById: {
              [networkClientId]: buildCustomNetworkClientConfiguration({
                chainId: '0x5',
              }),
            },
          },
          async ({ controller }) => {
            await controller.refresh(networkClientId);
            expect(controller.state).toStrictEqual({
              accounts: {
                [checksumAddress1]: { balance: '0x1' },
                [checksumAddress2]: { balance: '0x0' },
              },
              accountsByChainId: {
                '0x1': {
                  [checksumAddress1]: { balance: '0x1' },
                  [checksumAddress2]: { balance: '0x0' },
                },
                '0x2': {
                  [checksumAddress1]: { balance: '0xa' },
                  [checksumAddress2]: { balance: '0x0' },
                },
                '0x5': {
                  [checksumAddress1]: { balance: '0x0' },
                  [checksumAddress2]: { balance: '0x0' },
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
          async ({ controller }) => {
            await controller.refresh(networkClientId);

            expect(controller.state).toStrictEqual({
              accounts: {
                [CHECKSUM_ADDRESS_1]: {
                  balance: '0x0',
                },
              },
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
          async ({ controller }) => {
            await controller.refresh(networkClientId);

            expect(controller.state).toStrictEqual({
              accounts: {
                [CHECKSUM_ADDRESS_1]: { balance: '0x0' },
                [CHECKSUM_ADDRESS_2]: { balance: '0x0' },
              },
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
          async ({ controller }) => {
            await controller.refresh(networkClientId);

            expect(controller.state).toStrictEqual({
              accounts: {
                [CHECKSUM_ADDRESS_1]: { balance: '0x0' },
                [CHECKSUM_ADDRESS_2]: { balance: '0x0' },
              },
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
  });

  it('should call refresh every interval on legacy polling', async () => {
    const pollSpy = jest.spyOn(AccountTrackerController.prototype, 'poll');
    await withController(
      {
        options: { interval: 100 },
        isMultiAccountBalancesEnabled: true,
        selectedAccount: EMPTY_ACCOUNT,
        listAccounts: [],
      },
      async ({ controller }) => {
        jest.spyOn(controller, 'refresh').mockResolvedValue();

        expect(pollSpy).toHaveBeenCalledTimes(1);

        await advanceTime({ clock, duration: 50 });

        expect(pollSpy).toHaveBeenCalledTimes(1);

        await advanceTime({ clock, duration: 50 });

        expect(pollSpy).toHaveBeenCalledTimes(2);
      },
    );
  });

  it('should call refresh every interval for each networkClientId being polled', async () => {
    jest.spyOn(AccountTrackerController.prototype, 'poll').mockResolvedValue();
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
          networkClientId: networkClientId1,
        });

        await advanceTime({ clock, duration: 0 });
        expect(refreshSpy).toHaveBeenNthCalledWith(1, networkClientId1);
        expect(refreshSpy).toHaveBeenCalledTimes(1);
        await advanceTime({ clock, duration: 50 });
        expect(refreshSpy).toHaveBeenCalledTimes(1);
        await advanceTime({ clock, duration: 50 });
        expect(refreshSpy).toHaveBeenNthCalledWith(2, networkClientId1);
        expect(refreshSpy).toHaveBeenCalledTimes(2);

        const pollToken = controller.startPolling({
          networkClientId: networkClientId2,
        });

        await advanceTime({ clock, duration: 0 });
        expect(refreshSpy).toHaveBeenNthCalledWith(3, networkClientId2);
        expect(refreshSpy).toHaveBeenCalledTimes(3);
        await advanceTime({ clock, duration: 100 });
        expect(refreshSpy).toHaveBeenNthCalledWith(4, networkClientId1);
        expect(refreshSpy).toHaveBeenNthCalledWith(5, networkClientId2);
        expect(refreshSpy).toHaveBeenCalledTimes(5);

        controller.stopPollingByPollingToken(pollToken);

        await advanceTime({ clock, duration: 100 });
        expect(refreshSpy).toHaveBeenNthCalledWith(6, networkClientId1);
        expect(refreshSpy).toHaveBeenCalledTimes(6);

        controller.stopAllPolling();

        await advanceTime({ clock, duration: 100 });

        expect(refreshSpy).toHaveBeenCalledTimes(6);
      },
    );
  });
});

type WithControllerCallback<ReturnValue> = ({
  controller,
}: {
  controller: AccountTrackerController;
  triggerSelectedAccountChange: (account: InternalAccount) => void;
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

  const messenger = new ControllerMessenger<
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
    getNetworkClientById,
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
    ...options,
  });

  return await testFunction({
    controller,
    triggerSelectedAccountChange,
  });
}
