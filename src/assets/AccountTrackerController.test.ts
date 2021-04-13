import { stub, spy } from 'sinon';
import HttpProvider from 'ethjs-provider-http';
import type { ContactEntry } from '../user/AddressBookController';
import { PreferencesController } from '../user/PreferencesController';
import AccountTrackerController from './AccountTrackerController';

const provider = new HttpProvider(
  'https://ropsten.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);

describe('AccountTrackerController', () => {
  it('should set default state', () => {
    const controller = new AccountTrackerController({
      onPreferencesStateChange: stub(),
      getIdentities: () => ({}),
    });
    expect(controller.state).toStrictEqual({
      accounts: {},
    });
  });

  it('should throw when provider property is accessed', () => {
    const controller = new AccountTrackerController({
      onPreferencesStateChange: stub(),
      getIdentities: () => ({}),
    });
    expect(() => console.log(controller.provider)).toThrow(
      'Property only used for setting',
    );
  });

  it('should get real balance', async () => {
    const address = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const controller = new AccountTrackerController(
      {
        onPreferencesStateChange: stub(),
        getIdentities: () => {
          return { [address]: {} as ContactEntry };
        },
      },
      { provider },
    );
    await controller.refresh();
    expect(controller.state.accounts[address].balance).toBeDefined();
  });

  it('should sync addresses', () => {
    const controller = new AccountTrackerController(
      {
        onPreferencesStateChange: stub(),
        getIdentities: () => {
          return { baz: {} as ContactEntry };
        },
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
      },
      { provider },
    );
    controller.refresh = stub();

    preferences.setFeatureFlag('foo', true);
    expect((controller.refresh as any).called).toBe(true);
  });

  it('should call refresh every ten seconds', async () => {
    await new Promise<void>((resolve) => {
      const preferences = new PreferencesController();
      const poll = spy(AccountTrackerController.prototype, 'poll');
      const controller = new AccountTrackerController(
        {
          onPreferencesStateChange: (listener) =>
            preferences.subscribe(listener),
          getIdentities: () => ({}),
        },
        { provider, interval: 100 },
      );
      stub(controller, 'refresh');

      expect(poll.called).toBe(true);
      expect(poll.calledTwice).toBe(false);
      setTimeout(() => {
        expect(poll.calledTwice).toBe(true);
        resolve();
      }, 120);
    });
  });
});
