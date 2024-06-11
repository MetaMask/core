import { ControllerMessenger } from '@metamask/base-controller';
import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '@metamask/base-controller/tests/helpers';
import { query, toChecksumHexAddress } from '@metamask/controller-utils';
import HttpProvider from '@metamask/ethjs-provider-http';
import type { InternalAccount } from '@metamask/keyring-api';
import type {
  NetworkClientId,
  NetworkClientConfiguration,
} from '@metamask/network-controller';
import {
  buildCustomNetworkClientConfiguration,
  buildMockGetNetworkClientById,
} from '@metamask/network-controller/tests/helpers';
import * as sinon from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import { createMockInternalAccount } from '../../accounts-controller/src/tests/mocks';
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

const mockedQuery = query as jest.Mock<
  ReturnType<typeof query>,
  Parameters<typeof query>
>;

const provider = new HttpProvider(
  'https://goerli.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);

const setupController = ({
  options = {},
  mocks = {
    selectedAccount: ACCOUNT_1,
    listAccounts: [],
    networkClientConfigurationsByNetworkClientId: {},
  },
}: {
  options?: Partial<ConstructorParameters<typeof AccountTrackerController>[0]>;
  mocks?: {
    selectedAccount: InternalAccount;
    listAccounts: InternalAccount[];
    networkClientConfigurationsByNetworkClientId?: Record<
      NetworkClientId,
      NetworkClientConfiguration
    >;
  };
} = {}) => {
  const messenger = new ControllerMessenger<
    ExtractAvailableAction<AccountTrackerControllerMessenger> | AllowedActions,
    ExtractAvailableEvent<AccountTrackerControllerMessenger> | AllowedEvents
  >();

  const mockGetSelectedAccount = jest
    .fn()
    .mockReturnValue(mocks.selectedAccount);
  const mockListAccounts = jest.fn().mockReturnValue(mocks.listAccounts);

  messenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    mockGetSelectedAccount,
  );

  messenger.registerActionHandler(
    'AccountsController:listAccounts',
    mockListAccounts,
  );

  const getNetworkClientById = buildMockGetNetworkClientById(
    mocks.networkClientConfigurationsByNetworkClientId,
  );
  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    getNetworkClientById,
  );

  const accountTrackerMessenger = messenger.getRestricted({
    name: 'AccountTrackerController',
    allowedActions: [
      'NetworkController:getNetworkClientById',
      'AccountsController:getSelectedAccount',
      'AccountsController:listAccounts',
    ],
    allowedEvents: ['AccountsController:selectedEvmAccountChange'],
  });

  const triggerSelectedAccountChange = (account: InternalAccount) => {
    messenger.publish('AccountsController:selectedEvmAccountChange', account);
  };

  const accountTrackerController = new AccountTrackerController({
    messenger: accountTrackerMessenger,
    getMultiAccountBalancesEnabled: jest.fn(),

    getCurrentChainId: jest.fn(),
    ...options,
  });

  return {
    controller: accountTrackerController,
    triggerSelectedAccountChange,
  };
};

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

  it('should set default state', () => {
    const { controller } = setupController({
      options: {
        getMultiAccountBalancesEnabled: () => true,
        getCurrentChainId: () => '0x1',
      },
    });
    expect(controller.state).toStrictEqual({
      accounts: {},
      accountsByChainId: {
        '0x1': {},
      },
    });
  });

  it('should refresh when selectedAccount changes', async () => {
    const { controller, triggerSelectedAccountChange } = setupController({
      options: {
        provider,
        getMultiAccountBalancesEnabled: () => true,
        getCurrentChainId: () => '0x1',
      },
    });
    controller.refresh = sinon.stub();

    triggerSelectedAccountChange(ACCOUNT_1);

    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((controller.refresh as any).called).toBe(true);
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
        const { controller } = setupController({
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
            provider,
            getMultiAccountBalancesEnabled: () => true,
            getCurrentChainId: () => '0x1',
          },
          mocks: {
            selectedAccount: mockAccount1,
            listAccounts: [mockAccount1, mockAccount2],
          },
        });
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
      });

      it('should get real balance', async () => {
        mockedQuery.mockReturnValueOnce(Promise.resolve('0x10'));

        const { controller } = setupController({
          options: {
            provider,
            getMultiAccountBalancesEnabled: () => true,
            getCurrentChainId: () => '0x1',
          },
          mocks: {
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1],
          },
        });

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
      });

      it('should update only selected address balance when multi-account is disabled', async () => {
        mockedQuery
          .mockReturnValueOnce(Promise.resolve('0x10'))
          .mockReturnValueOnce(Promise.resolve('0x11'));

        const { controller } = setupController({
          options: {
            provider,
            getMultiAccountBalancesEnabled: () => false,
            getCurrentChainId: () => '0x1',
          },
          mocks: {
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
          },
        });

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
      });

      it('should update all address balances when multi-account is enabled', async () => {
        mockedQuery
          .mockReturnValueOnce(Promise.resolve('0x11'))
          .mockReturnValueOnce(Promise.resolve('0x12'));

        const { controller } = setupController({
          options: {
            provider,
            getMultiAccountBalancesEnabled: () => true,
            getCurrentChainId: () => '0x1',
          },
          mocks: {
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
          },
        });
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
        const { controller } = setupController({
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
            getMultiAccountBalancesEnabled: () => true,
            getCurrentChainId: () => '0x1',
          },
          mocks: {
            selectedAccount: mockAccount1,
            listAccounts: [mockAccount1, mockAccount2],
            networkClientConfigurationsByNetworkClientId: {
              [networkClientId]: buildCustomNetworkClientConfiguration({
                chainId: '0x5',
              }),
              provider,
            },
          },
        });

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
      });

      it('should get real balance', async () => {
        mockedQuery.mockReturnValueOnce(Promise.resolve('0x10'));
        const networkClientId = 'networkClientId1';

        const { controller } = setupController({
          options: {
            getMultiAccountBalancesEnabled: () => true,
            getCurrentChainId: () => '0x1',
          },
          mocks: {
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1],
            networkClientConfigurationsByNetworkClientId: {
              [networkClientId]: buildCustomNetworkClientConfiguration({
                chainId: '0x5',
              }),
              provider,
            },
          },
        });
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
      });

      it('should update only selected address balance when multi-account is disabled', async () => {
        mockedQuery
          .mockReturnValueOnce(Promise.resolve('0x10'))
          .mockReturnValueOnce(Promise.resolve('0x11'));
        const networkClientId = 'networkClientId1';

        const { controller } = setupController({
          options: {
            getMultiAccountBalancesEnabled: () => false,
            getCurrentChainId: () => '0x1',
          },
          mocks: {
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
            networkClientConfigurationsByNetworkClientId: {
              [networkClientId]: buildCustomNetworkClientConfiguration({
                chainId: '0x5',
              }),
              provider,
            },
          },
        });

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
      });

      it('should update all address balances when multi-account is enabled', async () => {
        mockedQuery
          .mockReturnValueOnce(Promise.resolve('0x11'))
          .mockReturnValueOnce(Promise.resolve('0x12'));
        const networkClientId = 'networkClientId1';

        const { controller } = setupController({
          options: {
            getMultiAccountBalancesEnabled: () => true,
            getCurrentChainId: () => '0x1',
          },
          mocks: {
            selectedAccount: ACCOUNT_1,
            listAccounts: [ACCOUNT_1, ACCOUNT_2],
            networkClientConfigurationsByNetworkClientId: {
              [networkClientId]: buildCustomNetworkClientConfiguration({
                chainId: '0x5',
              }),
              provider,
            },
          },
        });

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
      });
    });
  });

  describe('syncBalanceWithAddresses', () => {
    it('should sync balance with addresses', async () => {
      const { controller } = setupController({
        options: {
          provider,
          getMultiAccountBalancesEnabled: () => true,
          getCurrentChainId: () => '0x1',
        },
        mocks: {
          selectedAccount: ACCOUNT_1,
          listAccounts: [],
        },
      });
      mockedQuery
        .mockReturnValueOnce(Promise.resolve('0x10'))
        .mockReturnValueOnce(Promise.resolve('0x20'));
      const result = await controller.syncBalanceWithAddresses([
        ADDRESS_1,
        ADDRESS_2,
      ]);
      expect(result[ADDRESS_1].balance).toBe('0x10');
      expect(result[ADDRESS_2].balance).toBe('0x20');
    });
  });

  it('should call refresh every interval on legacy polling', async () => {
    const poll = sinon.spy(AccountTrackerController.prototype, 'poll');

    const { controller } = setupController({
      options: {
        provider,
        interval: 100,
        getMultiAccountBalancesEnabled: () => true,
        getCurrentChainId: () => '0x1',
      },
      mocks: {
        selectedAccount: EMPTY_ACCOUNT,
        listAccounts: [],
      },
    });
    sinon.stub(controller, 'refresh');

    expect(poll.called).toBe(true);
    await advanceTime({ clock, duration: 50 });
    expect(poll.calledTwice).toBe(false);
    await advanceTime({ clock, duration: 50 });
    expect(poll.calledTwice).toBe(true);
  });

  it('should call refresh every interval for each networkClientId being polled', async () => {
    sinon.stub(AccountTrackerController.prototype, 'poll');
    const networkClientId1 = 'networkClientId1';
    const networkClientId2 = 'networkClientId2';
    const { controller } = setupController({
      options: {
        provider,
        interval: 100,
        getMultiAccountBalancesEnabled: () => true,
        getCurrentChainId: () => '0x1',
      },
      mocks: {
        selectedAccount: EMPTY_ACCOUNT,
        listAccounts: [],
      },
    });

    const refreshSpy = jest.spyOn(controller, 'refresh').mockResolvedValue();

    controller.startPollingByNetworkClientId(networkClientId1);

    await advanceTime({ clock, duration: 0 });
    expect(refreshSpy).toHaveBeenNthCalledWith(1, networkClientId1);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    await advanceTime({ clock, duration: 50 });
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    await advanceTime({ clock, duration: 50 });
    expect(refreshSpy).toHaveBeenNthCalledWith(2, networkClientId1);
    expect(refreshSpy).toHaveBeenCalledTimes(2);

    const pollToken =
      controller.startPollingByNetworkClientId(networkClientId2);

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
  });
});
