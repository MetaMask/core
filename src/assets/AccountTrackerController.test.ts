import { stub, spy } from 'sinon';
import HttpProvider from 'ethjs-provider-http';
import PreferencesController from '../user/PreferencesController';
import ComposableController from '../ComposableController';
import AccountTrackerController from './AccountTrackerController';

const provider = new HttpProvider('https://ropsten.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035');

describe('AccountTrackerController', () => {
  it('should set default state', () => {
    const controller = new AccountTrackerController();
    expect(controller.state).toEqual({
      accounts: {},
    });
  });

  it('should throw when provider property is accessed', () => {
    const controller = new AccountTrackerController();
    expect(() => console.log(controller.provider)).toThrow('Property only used for setting');
  });

  it('should get real balance', async () => {
    const address = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const controller = new AccountTrackerController({ provider });
    controller.context = { PreferencesController: { state: { identities: { [address]: {} } } } } as any;
    await controller.refresh();
    expect(controller.state.accounts[address].balance).toBeDefined();
  });

  it('should sync addresses', () => {
    const controller = new AccountTrackerController(
      { provider },
      {
        accounts: {
          bar: { balance: '' },
          foo: { balance: '' },
        },
      },
    );
    controller.context = { PreferencesController: { state: { identities: { baz: {} } } } } as any;
    controller.refresh();
    expect(controller.state.accounts).toEqual({ baz: { balance: '0x0' } });
  });

  it('should subscribe to new sibling preference controllers', async () => {
    const preferences = new PreferencesController();
    const controller = new AccountTrackerController({ provider });
    controller.refresh = stub();

    new ComposableController([controller, preferences]);
    preferences.setFeatureFlag('foo', true);
    expect((controller.refresh as any).called).toBe(true);
  });

  it('should call refresh every ten seconds', () => {
    return new Promise<void>((resolve) => {
      const preferences = new PreferencesController();
      const controller = new AccountTrackerController({ provider, interval: 100 });
      stub(controller, 'refresh');
      const poll = spy(controller, 'poll');

      new ComposableController([controller, preferences]);
      expect(poll.called).toBe(true);
      expect(poll.calledTwice).toBe(false);
      setTimeout(() => {
        expect(poll.calledTwice).toBe(true);
        resolve();
      }, 120);
    });
  });
});
