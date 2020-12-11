import { stub, spy } from 'sinon';
import AccountTrackerController from '../src/assets/AccountTrackerController';
import { GET_PREFERENCES_STATE, PREFERENCES_STATE_CHANGED } from '../src/user/PreferencesController';
import { publish, resetSubscriptions, registerActionHandler, unregisterActionHandler } from '../src/controller-messaging-system';

const HttpProvider = require('ethjs-provider-http');

const provider = new HttpProvider('https://ropsten.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035');

describe('AccountTrackerController', () => {
  it('should set default state', () => {
    const controller = new AccountTrackerController();
    expect(controller.state).toEqual({
      accounts: {},
    });
  });

  it('should get real balance', async () => {
    const address = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    registerActionHandler(GET_PREFERENCES_STATE, () => ({
      identities: { [address]: {} },
    }));
    const controller = new AccountTrackerController({ provider });
    await controller.refresh();
    expect(controller.state.accounts[address].balance).toBeDefined();
    unregisterActionHandler(GET_PREFERENCES_STATE);
  });

  it('should sync addresses', () => {
    registerActionHandler(GET_PREFERENCES_STATE, () => ({
      identities: { baz: {} },
    }));
    const controller = new AccountTrackerController(
      { provider },
      {
        accounts: {
          bar: { balance: '' },
          foo: { balance: '' },
        },
      },
    );
    controller.refresh();
    expect(controller.state.accounts).toEqual({ baz: { balance: '0x0' } });
    unregisterActionHandler(GET_PREFERENCES_STATE);
  });

  it('should subscribe to new sibling preference controllers', async () => {
    const controller = new AccountTrackerController({ provider });
    controller.refresh = stub();
    controller.onComposed();

    publish(PREFERENCES_STATE_CHANGED, {});
    expect((controller.refresh as any).called).toBe(true);
    resetSubscriptions();
  });

  it('should call refresh every ten seconds', () => {
    return new Promise((resolve) => {
      const controller = new AccountTrackerController({ provider, interval: 100 });
      stub(controller, 'refresh');
      const poll = spy(controller, 'poll');

      controller.onComposed();
      expect(poll.called).toBe(true);
      expect(poll.calledTwice).toBe(false);
      setTimeout(() => {
        expect(poll.calledTwice).toBe(true);
        resolve();
      }, 120);
    });
  });
});
