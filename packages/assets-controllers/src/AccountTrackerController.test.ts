import * as sinon from 'sinon';
import HttpProvider from 'ethjs-provider-http';
import {
  ContactEntry,
  PreferencesController,
} from '@metamask/preferences-controller';
import { query } from '@metamask/controller-utils';
import { AccountTrackerController } from './AccountTrackerController';

jest.mock('@metamask/controller-utils', () => {
  return {
    ...jest.requireActual('@metamask/controller-utils'),
    query: jest.fn(),
  };
});

const mockedQuery = query as jest.Mock<
  ReturnType<typeof query>,
  Parameters<typeof query>
>;

const provider = new HttpProvider(
  'https://goerli.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);

describe('AccountTrackerController', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('should set default state', () => {
    const controller = new AccountTrackerController({
      onPreferencesStateChange: sinon.stub(),
      getIdentities: () => ({}),
      getSelectedAddress: () => '0x0',
      getMultiAccountBalancesEnabled: () => true,
    });
    expect(controller.state).toStrictEqual({
      accounts: {},
    });
  });

  it('should throw when provider property is accessed', () => {
    const controller = new AccountTrackerController({
      onPreferencesStateChange: sinon.stub(),
      getIdentities: () => ({}),
      getSelectedAddress: () => '0x0',
      getMultiAccountBalancesEnabled: () => true,
    });
    expect(() => console.log(controller.provider)).toThrow(
      'Property only used for setting',
    );
  });

  it('should sync balance with addresses', async () => {
    const address = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const controller = new AccountTrackerController(
      {
        onPreferencesStateChange: sinon.stub(),
        getIdentities: () => {
          return {};
        },
        getSelectedAddress: () => '0x0',
        getMultiAccountBalancesEnabled: () => true,
      },
      { provider },
    );
    mockedQuery.mockReturnValue(Promise.resolve('0x10'));
    const result = await controller.syncBalanceWithAddresses([address]);
    expect(result[address].balance).toBe('0x10');
  });

  it('should sync addresses', () => {
    const controller = new AccountTrackerController(
      {
        onPreferencesStateChange: sinon.stub(),
        getIdentities: () => {
          return { baz: {} as ContactEntry };
        },
        getSelectedAddress: () => '0x0',
        getMultiAccountBalancesEnabled: () => true,
      },
      { provider },
      {
        accounts: {
          bar: { balance: '' },
          foo: { balance: '' },
        },
      },
    );
    controller.refresh();
    expect(controller.state.accounts).toStrictEqual({
      baz: { balance: '0x0' },
    });
  });

  it('should subscribe to new sibling preference controllers', async () => {
    const preferences = new PreferencesController();
    const controller = new AccountTrackerController(
      {
        onPreferencesStateChange: (listener) => preferences.subscribe(listener),
        getIdentities: () => ({}),
        getSelectedAddress: () => '0x0',
        getMultiAccountBalancesEnabled: () => true,
      },
      { provider },
    );
    controller.refresh = sinon.stub();

    preferences.setFeatureFlag('foo', true);
    expect((controller.refresh as any).called).toBe(true);
  });

  it('should call refresh every ten seconds', async () => {
    await new Promise<void>((resolve) => {
      const preferences = new PreferencesController();
      const poll = sinon.spy(AccountTrackerController.prototype, 'poll');
      const controller = new AccountTrackerController(
        {
          onPreferencesStateChange: (listener) =>
            preferences.subscribe(listener),
          getIdentities: () => ({}),
          getSelectedAddress: () => '0x0',
          getMultiAccountBalancesEnabled: () => true,
        },
        { provider, interval: 100 },
      );
      sinon.stub(controller, 'refresh');

      expect(poll.called).toBe(true);
      expect(poll.calledTwice).toBe(false);
      setTimeout(() => {
        expect(poll.calledTwice).toBe(true);
        resolve();
      }, 120);
    });
  });


  it('should update only selected address balance when multi-account is disabled', async () => {
    const address1 = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const address2 = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';

    mockedQuery.mockReturnValueOnce(Promise.resolve('0x10'));

    const controller = new AccountTrackerController(
      {
        onPreferencesStateChange: sinon.stub(),
        getIdentities: () => {
          return { [address1]: {} as ContactEntry, [address2]: {} as ContactEntry };
        },
        getSelectedAddress: () => address1,
        getMultiAccountBalancesEnabled: () => false,
      },
      { provider, interval: 0 },
    );
    
    // Wait for polling to finish
    await new Promise((res, _) => setTimeout(() => res(true), 0));

    expect(controller.state.accounts[address1].balance).toBe('0x10');
    expect(controller.state.accounts[address2].balance).toBe('0x0');
  });

  it('should update all address balances when multi-account is enabled', async () => {
    const address1 = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const address2 = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';

    mockedQuery.mockReturnValueOnce(Promise.resolve('0x11'));
    mockedQuery.mockReturnValueOnce(Promise.resolve('0x12'));

    const controller = new AccountTrackerController(
      {
        onPreferencesStateChange: sinon.stub(),
        getIdentities: () => {
          return { [address1]: {} as ContactEntry, [address2]: {} as ContactEntry };
        },
        getSelectedAddress: () => address1,
        getMultiAccountBalancesEnabled: () => true,
      },
      { provider, interval: 0 },
    );
    
    // Wait for polling to finish
    await new Promise((res, _) => setTimeout(() => res(true), 0));

    expect(controller.state.accounts[address1].balance).toBe('0x11');
    expect(controller.state.accounts[address2].balance).toBe('0x12');
  });
});
