import { query } from '@metamask/controller-utils';
import HttpProvider from '@metamask/ethjs-provider-http';
import type { InternalAccount } from '@metamask/keyring-api';
import * as sinon from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import { createMockInternalAccount } from '../../accounts-controller/src/tests/mocks';
import { AccountTrackerController } from './AccountTrackerController';

jest.mock('@metamask/controller-utils', () => {
  return {
    ...jest.requireActual('@metamask/controller-utils'),
    query: jest.fn(),
  };
});

const ADDRESS_1 = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
const ACCOUNT_1 = createMockInternalAccount({ address: ADDRESS_1 });
const ADDRESS_2 = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const ACCOUNT_2 = createMockInternalAccount({ address: ADDRESS_2 });

const mockedQuery = query as jest.Mock<
  ReturnType<typeof query>,
  Parameters<typeof query>
>;

const provider = new HttpProvider(
  'https://goerli.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);

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
    const controller = new AccountTrackerController({
      onSelectedAccountChange: sinon.stub(),
      getInternalAccounts: () => [],
      getSelectedAccount: () => ACCOUNT_1,
      getMultiAccountBalancesEnabled: () => true,
      getCurrentChainId: () => '0x1',
      getNetworkClientById: jest.fn(),
    });
    expect(controller.state).toStrictEqual({
      accounts: {},
      accountsByChainId: {
        '0x1': {},
      },
    });
  });

  it('should throw when provider property is accessed', () => {
    const controller = new AccountTrackerController({
      onSelectedAccountChange: sinon.stub(),
      getInternalAccounts: () => [],
      getSelectedAccount: () => {
        return {} as InternalAccount;
      },
      getMultiAccountBalancesEnabled: () => true,
      getCurrentChainId: () => '0x1',
      getNetworkClientById: jest.fn(),
    });
    expect(() => console.log(controller.provider)).toThrow(
      'Property only used for setting',
    );
  });

  it('should refresh when selectedAccount changes', async () => {
    const selectedAccountChangeListeners: ((
      internalAccount: InternalAccount,
    ) => void)[] = [];
    const controller = new AccountTrackerController(
      {
        onSelectedAccountChange: (listener) => {
          selectedAccountChangeListeners.push(listener);
        },
        getInternalAccounts: () => [],
        getSelectedAccount: () => ACCOUNT_1,
        getMultiAccountBalancesEnabled: () => true,
        getCurrentChainId: () => '0x1',
        getNetworkClientById: jest.fn(),
      },
      { provider },
    );
    const triggerSelectedAccountChange = (internalAccount: InternalAccount) => {
      for (const listener of selectedAccountChangeListeners) {
        listener(internalAccount);
      }
    };
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
        const bazAccount = createMockInternalAccount({ address: 'baz' });
        const barAccount = createMockInternalAccount({ address: 'bar' });
        const controller = new AccountTrackerController(
          {
            onSelectedAccountChange: sinon.stub(),
            getInternalAccounts: () => [bazAccount, barAccount],
            getSelectedAccount: () => barAccount,
            getMultiAccountBalancesEnabled: () => true,
            getCurrentChainId: () => '0x1',
            getNetworkClientById: jest.fn(),
          },
          { provider },
          {
            accounts: {
              bar: { balance: '0x1' },
              foo: { balance: '0x2' },
            },
            accountsByChainId: {
              '0x1': {
                bar: { balance: '0x1' },
                foo: { balance: '0x2' },
              },
              '0x2': {
                bar: { balance: '0xa' },
                foo: { balance: '0xb' },
              },
            },
          },
        );
        await controller.refresh();
        expect(controller.state).toStrictEqual({
          accounts: {
            bar: { balance: '0x0' },
            baz: { balance: '0x0' },
          },
          accountsByChainId: {
            '0x1': {
              bar: { balance: '0x0' },
              baz: { balance: '0x0' },
            },
            '0x2': {
              bar: { balance: '0xa' },
              baz: { balance: '0x0' },
            },
          },
        });
      });

      it('should get real balance', async () => {
        mockedQuery.mockReturnValueOnce(Promise.resolve('0x10'));

        const controller = new AccountTrackerController(
          {
            onSelectedAccountChange: sinon.stub(),
            getInternalAccounts: () => [ACCOUNT_1],
            getSelectedAccount: () => ACCOUNT_1,
            getMultiAccountBalancesEnabled: () => true,
            getCurrentChainId: () => '0x1',
            getNetworkClientById: jest.fn(),
          },
          { provider },
        );

        await controller.refresh();

        expect(controller.state).toStrictEqual({
          accounts: {
            [ADDRESS_1]: {
              balance: '0x10',
            },
          },
          accountsByChainId: {
            '0x1': {
              [ADDRESS_1]: {
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

        const controller = new AccountTrackerController(
          {
            onSelectedAccountChange: sinon.stub(),
            getInternalAccounts: () => [ACCOUNT_1, ACCOUNT_2],
            getSelectedAccount: () => ACCOUNT_1,
            getMultiAccountBalancesEnabled: () => false,
            getCurrentChainId: () => '0x1',
            getNetworkClientById: jest.fn(),
          },
          { provider },
        );

        await controller.refresh();

        expect(controller.state).toStrictEqual({
          accounts: {
            [ADDRESS_1]: { balance: '0x10' },
            [ADDRESS_2]: { balance: '0x0' },
          },
          accountsByChainId: {
            '0x1': {
              [ADDRESS_1]: { balance: '0x10' },
              [ADDRESS_2]: { balance: '0x0' },
            },
          },
        });
      });

      it('should update all address balances when multi-account is enabled', async () => {
        mockedQuery
          .mockReturnValueOnce(Promise.resolve('0x11'))
          .mockReturnValueOnce(Promise.resolve('0x12'));

        const controller = new AccountTrackerController(
          {
            onSelectedAccountChange: sinon.stub(),
            getInternalAccounts: () => [ACCOUNT_1, ACCOUNT_2],
            getSelectedAccount: () => ACCOUNT_1,
            getMultiAccountBalancesEnabled: () => true,
            getCurrentChainId: () => '0x1',
            getNetworkClientById: jest.fn(),
          },
          { provider },
        );

        await controller.refresh();

        expect(controller.state).toStrictEqual({
          accounts: {
            [ADDRESS_1]: { balance: '0x11' },
            [ADDRESS_2]: { balance: '0x12' },
          },
          accountsByChainId: {
            '0x1': {
              [ADDRESS_1]: { balance: '0x11' },
              [ADDRESS_2]: { balance: '0x12' },
            },
          },
        });
      });
    });

    describe('with networkClientId', () => {
      it('should sync addresses', async () => {
        const bazAccount = createMockInternalAccount({ address: 'baz' });
        const barAccount = createMockInternalAccount({ address: 'bar' });
        const controller = new AccountTrackerController(
          {
            onSelectedAccountChange: sinon.stub(),
            getInternalAccounts: () => [bazAccount, barAccount],
            getSelectedAccount: () => bazAccount,
            getMultiAccountBalancesEnabled: () => true,
            getCurrentChainId: () => '0x1',
            getNetworkClientById: jest.fn().mockReturnValue({
              configuration: {
                chainId: '0x5',
              },
              provider,
            }),
          },
          {},
          {
            accounts: {
              bar: { balance: '0x1' },
              foo: { balance: '0x2' },
            },
            accountsByChainId: {
              '0x1': {
                bar: { balance: '0x1' },
                foo: { balance: '0x2' },
              },
              '0x2': {
                bar: { balance: '0xa' },
                foo: { balance: '0xb' },
              },
            },
          },
        );
        await controller.refresh('networkClientId1');
        expect(controller.state).toStrictEqual({
          accounts: {
            bar: { balance: '0x1' },
            baz: { balance: '0x0' },
          },
          accountsByChainId: {
            '0x1': {
              bar: { balance: '0x1' },
              baz: { balance: '0x0' },
            },
            '0x2': {
              bar: { balance: '0xa' },
              baz: { balance: '0x0' },
            },
            '0x5': {
              bar: { balance: '0x0' },
              baz: { balance: '0x0' },
            },
          },
        });
      });

      it('should get real balance', async () => {
        mockedQuery.mockReturnValueOnce(Promise.resolve('0x10'));

        const controller = new AccountTrackerController({
          onSelectedAccountChange: sinon.stub(),
          getInternalAccounts: () => [ACCOUNT_1],
          getSelectedAccount: () => ACCOUNT_1,
          getMultiAccountBalancesEnabled: () => true,
          getCurrentChainId: () => '0x1',
          getNetworkClientById: jest.fn().mockReturnValue({
            configuration: {
              chainId: '0x5',
            },
            provider,
          }),
        });

        await controller.refresh('networkClientId1');

        expect(controller.state).toStrictEqual({
          accounts: {
            [ADDRESS_1]: {
              balance: '0x0',
            },
          },
          accountsByChainId: {
            '0x1': {
              [ADDRESS_1]: {
                balance: '0x0',
              },
            },
            '0x5': {
              [ADDRESS_1]: {
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

        const controller = new AccountTrackerController({
          onSelectedAccountChange: sinon.stub(),
          getInternalAccounts: () => {
            return [ACCOUNT_1, ACCOUNT_2];
          },
          getSelectedAccount: () => ACCOUNT_1,
          getMultiAccountBalancesEnabled: () => false,
          getCurrentChainId: () => '0x1',
          getNetworkClientById: jest.fn().mockReturnValue({
            configuration: {
              chainId: '0x5',
            },
            provider,
          }),
        });

        await controller.refresh('networkClientId1');

        expect(controller.state).toStrictEqual({
          accounts: {
            [ADDRESS_1]: { balance: '0x0' },
            [ADDRESS_2]: { balance: '0x0' },
          },
          accountsByChainId: {
            '0x1': {
              [ADDRESS_1]: { balance: '0x0' },
              [ADDRESS_2]: { balance: '0x0' },
            },
            '0x5': {
              [ADDRESS_1]: { balance: '0x10' },
              [ADDRESS_2]: { balance: '0x0' },
            },
          },
        });
      });

      it('should update all address balances when multi-account is enabled', async () => {
        mockedQuery
          .mockReturnValueOnce(Promise.resolve('0x11'))
          .mockReturnValueOnce(Promise.resolve('0x12'));

        const controller = new AccountTrackerController({
          onSelectedAccountChange: sinon.stub(),
          getInternalAccounts: () => {
            return [ACCOUNT_1, ACCOUNT_2];
          },
          getSelectedAccount: () => ACCOUNT_1,
          getMultiAccountBalancesEnabled: () => true,
          getCurrentChainId: () => '0x1',
          getNetworkClientById: jest.fn().mockReturnValue({
            configuration: {
              chainId: '0x5',
            },
            provider,
          }),
        });

        await controller.refresh('networkClientId1');

        expect(controller.state).toStrictEqual({
          accounts: {
            [ADDRESS_1]: { balance: '0x0' },
            [ADDRESS_2]: { balance: '0x0' },
          },
          accountsByChainId: {
            '0x1': {
              [ADDRESS_1]: { balance: '0x0' },
              [ADDRESS_2]: { balance: '0x0' },
            },
            '0x5': {
              [ADDRESS_1]: { balance: '0x11' },
              [ADDRESS_2]: { balance: '0x12' },
            },
          },
        });
      });
    });
  });

  describe('syncBalanceWithAddresses', () => {
    it('should sync balance with addresses', async () => {
      const controller = new AccountTrackerController(
        {
          onSelectedAccountChange: sinon.stub(),
          getInternalAccounts: () => [],
          getSelectedAccount: () => ACCOUNT_1,
          getMultiAccountBalancesEnabled: () => true,
          getCurrentChainId: () => '0x1',
          getNetworkClientById: jest.fn(),
        },
        { provider },
      );
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
    const controller = new AccountTrackerController(
      {
        onSelectedAccountChange: jest.fn(),
        getInternalAccounts: () => [],
        getSelectedAccount: () => ACCOUNT_1,
        getMultiAccountBalancesEnabled: () => true,
        getCurrentChainId: () => '0x1',
        getNetworkClientById: jest.fn(),
      },
      { provider, interval: 100 },
    );
    sinon.stub(controller, 'refresh');

    expect(poll.called).toBe(true);
    await advanceTime({ clock, duration: 50 });
    expect(poll.calledTwice).toBe(false);
    await advanceTime({ clock, duration: 50 });
    expect(poll.calledTwice).toBe(true);
  });

  it('should call refresh every interval for each networkClientId being polled', async () => {
    sinon.stub(AccountTrackerController.prototype, 'poll');
    const controller = new AccountTrackerController(
      {
        onSelectedAccountChange: jest.fn(),
        getInternalAccounts: () => [],
        getSelectedAccount: () => ACCOUNT_1,
        getMultiAccountBalancesEnabled: () => true,
        getCurrentChainId: () => '0x1',
        getNetworkClientById: jest.fn(),
      },
      { provider, interval: 100 },
    );

    const refreshSpy = jest.spyOn(controller, 'refresh').mockResolvedValue();

    controller.startPollingByNetworkClientId('networkClientId1');

    await advanceTime({ clock, duration: 0 });
    expect(refreshSpy).toHaveBeenNthCalledWith(1, 'networkClientId1');
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    await advanceTime({ clock, duration: 50 });
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    await advanceTime({ clock, duration: 50 });
    expect(refreshSpy).toHaveBeenNthCalledWith(2, 'networkClientId1');
    expect(refreshSpy).toHaveBeenCalledTimes(2);

    const pollToken =
      controller.startPollingByNetworkClientId('networkClientId2');

    await advanceTime({ clock, duration: 0 });
    expect(refreshSpy).toHaveBeenNthCalledWith(3, 'networkClientId2');
    expect(refreshSpy).toHaveBeenCalledTimes(3);
    await advanceTime({ clock, duration: 100 });
    expect(refreshSpy).toHaveBeenNthCalledWith(4, 'networkClientId1');
    expect(refreshSpy).toHaveBeenNthCalledWith(5, 'networkClientId2');
    expect(refreshSpy).toHaveBeenCalledTimes(5);

    controller.stopPollingByPollingToken(pollToken);

    await advanceTime({ clock, duration: 100 });
    expect(refreshSpy).toHaveBeenNthCalledWith(6, 'networkClientId1');
    expect(refreshSpy).toHaveBeenCalledTimes(6);

    controller.stopAllPolling();

    await advanceTime({ clock, duration: 100 });

    expect(refreshSpy).toHaveBeenCalledTimes(6);
  });
});
