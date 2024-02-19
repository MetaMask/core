import { ControllerMessenger } from '@metamask/base-controller';
import { useFakeTimers } from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import { PollingController, PollingControllerOnly } from './PollingController';

const TICK_TIME = 1000;

const createExecutePollMock = () => {
  const executePollMock = jest.fn().mockImplementation(async () => {
    return true;
  });
  return executePollMock;
};

describe('PollingController', () => {
  let clock: sinon.SinonFakeTimers;
  beforeEach(() => {
    clock = useFakeTimers();
  });
  afterEach(() => {
    clock.restore();
  });
  describe('start', () => {
    it('should start polling if not polling', async () => {
      class MyGasFeeController extends PollingController<any, any, any> {
        _executePoll = createExecutePollMock();
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'PollingController',
        state: { foo: 'bar' },
      });
      controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });
      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      await advanceTime({ clock, duration: TICK_TIME });
      expect(controller._executePoll).toHaveBeenCalledTimes(2);
      controller.stopAllPolling();
    });
  });
  describe('stop', () => {
    it('should stop polling when called with a valid polling that was the only active pollingToken for a given networkClient', async () => {
      class MyGasFeeController extends PollingController<any, any, any> {
        _executePoll = createExecutePollMock();
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'PollingController',
        state: { foo: 'bar' },
      });
      const pollingToken = controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });
      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      await advanceTime({ clock, duration: TICK_TIME });
      controller.stopPollingByPollingToken(pollingToken);
      await advanceTime({ clock, duration: TICK_TIME });
      expect(controller._executePoll).toHaveBeenCalledTimes(2);
      controller.stopAllPolling();
    });
    it('should not stop polling if called with one of multiple active polling tokens for a given networkClient', async () => {
      class MyGasFeeController extends PollingController<any, any, any> {
        _executePoll = createExecutePollMock();
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'PollingController',
        state: { foo: 'bar' },
      });
      const pollingToken1 = controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });

      controller.startPollingByNetworkClientId('mainnet');
      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      await advanceTime({ clock, duration: TICK_TIME });
      controller.stopPollingByPollingToken(pollingToken1);
      await advanceTime({ clock, duration: TICK_TIME });
      expect(controller._executePoll).toHaveBeenCalledTimes(3);
      controller.stopAllPolling();
    });
    it('should error if no pollingToken is passed', () => {
      class MyGasFeeController extends PollingController<any, any, any> {
        _executePoll = createExecutePollMock();
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'PollingController',
        state: { foo: 'bar' },
      });
      controller.startPollingByNetworkClientId('mainnet');
      expect(() => {
        controller.stopPollingByPollingToken(undefined as unknown as any);
      }).toThrow('pollingToken required');
      controller.stopAllPolling();
    });
    it('should error if no matching pollingToken is found', () => {
      class MyGasFeeController extends PollingController<any, any, any> {
        _executePoll = createExecutePollMock();
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'PollingController',
        state: { foo: 'bar' },
      });
      controller.startPollingByNetworkClientId('mainnet');
      expect(() => {
        controller.stopPollingByPollingToken('potato');
      }).toThrow('pollingToken not found');
      controller.stopAllPolling();
    });
  });
  describe('startPollingByNetworkClientId', () => {
    it('should call _executePoll immediately and on interval if polling', async () => {
      class MyGasFeeController extends PollingController<any, any, any> {
        _executePoll = createExecutePollMock();
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'PollingController',
        state: { foo: 'bar' },
      });
      controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });
      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      await advanceTime({ clock, duration: TICK_TIME * 2 });
      expect(controller._executePoll).toHaveBeenCalledTimes(3);
    });
    it('should call _executePoll immediately once and continue calling _executePoll on interval when start is called again with the same networkClientId', async () => {
      class MyGasFeeController extends PollingController<any, any, any> {
        _executePoll = createExecutePollMock();
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'PollingController',
        state: { foo: 'bar' },
      });
      controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });

      controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });

      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      await advanceTime({ clock, duration: TICK_TIME * 2 });

      expect(controller._executePoll).toHaveBeenCalledTimes(3);
      controller.stopAllPolling();
    });
    it('should publish "pollingComplete" when stop is called', async () => {
      const pollingComplete: any = jest.fn();
      class MyGasFeeController extends PollingController<any, any, any> {
        _executePoll = createExecutePollMock();
      }
      const name = 'PollingController';

      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name,
        state: { foo: 'bar' },
      });
      controller.onPollingCompleteByNetworkClientId('mainnet', pollingComplete);
      const pollingToken = controller.startPollingByNetworkClientId('mainnet');
      controller.stopPollingByPollingToken(pollingToken);
      expect(pollingComplete).toHaveBeenCalledTimes(1);
    });
    it('should poll at the interval length when set via setIntervalLength', async () => {
      class MyGasFeeController extends PollingController<any, any, any> {
        _executePoll = createExecutePollMock();
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'PollingController',
        state: { foo: 'bar' },
      });
      controller.setIntervalLength(TICK_TIME);
      controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });
      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      await advanceTime({ clock, duration: TICK_TIME / 2 });

      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      await advanceTime({ clock, duration: TICK_TIME / 2 });

      expect(controller._executePoll).toHaveBeenCalledTimes(2);
    });
    it('should start and stop polling sessions for different networkClientIds with the same options', async () => {
      class MyGasFeeController extends PollingController<any, any, any> {
        _executePoll = createExecutePollMock();
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'PollingController',
        state: { foo: 'bar' },
      });
      const pollToken1 = controller.startPollingByNetworkClientId('mainnet', {
        address: '0x1',
      });
      controller.startPollingByNetworkClientId('mainnet', { address: '0x2' });
      await advanceTime({ clock, duration: 0 });

      controller.startPollingByNetworkClientId('sepolia', { address: '0x2' });
      await advanceTime({ clock, duration: 0 });

      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', { address: '0x1' }],
        ['mainnet', { address: '0x2' }],
        ['sepolia', { address: '0x2' }],
      ]);
      await advanceTime({ clock, duration: TICK_TIME });

      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', { address: '0x1' }],
        ['mainnet', { address: '0x2' }],
        ['sepolia', { address: '0x2' }],
        ['mainnet', { address: '0x1' }],
        ['mainnet', { address: '0x2' }],
        ['sepolia', { address: '0x2' }],
      ]);
      controller.stopPollingByPollingToken(pollToken1);
      await advanceTime({ clock, duration: TICK_TIME });

      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', { address: '0x1' }],
        ['mainnet', { address: '0x2' }],
        ['sepolia', { address: '0x2' }],
        ['mainnet', { address: '0x1' }],
        ['mainnet', { address: '0x2' }],
        ['sepolia', { address: '0x2' }],
        ['mainnet', { address: '0x2' }],
        ['sepolia', { address: '0x2' }],
      ]);
    });
  });
  describe('multiple networkClientIds', () => {
    it('should poll for each networkClientId', async () => {
      class MyGasFeeController extends PollingController<any, any, any> {
        _executePoll = createExecutePollMock();
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'PollingController',
        state: { foo: 'bar' },
      });
      controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });

      controller.startPollingByNetworkClientId('rinkeby');
      await advanceTime({ clock, duration: 0 });

      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
        ['rinkeby', {}],
      ]);
      await advanceTime({ clock, duration: TICK_TIME });

      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
        ['rinkeby', {}],
        ['mainnet', {}],
        ['rinkeby', {}],
      ]);
      await advanceTime({ clock, duration: TICK_TIME });

      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
        ['rinkeby', {}],
        ['mainnet', {}],
        ['rinkeby', {}],
        ['mainnet', {}],
        ['rinkeby', {}],
      ]);
      controller.stopAllPolling();
    });

    it('should poll multiple networkClientIds when setting interval length', async () => {
      class MyGasFeeController extends PollingController<any, any, any> {
        _executePoll = createExecutePollMock();
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'PollingController',
        state: { foo: 'bar' },
      });
      controller.setIntervalLength(TICK_TIME * 2);
      controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });

      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
      ]);
      await advanceTime({ clock, duration: TICK_TIME });

      controller.startPollingByNetworkClientId('sepolia');
      await advanceTime({ clock, duration: 0 });

      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
        ['sepolia', {}],
      ]);
      await advanceTime({ clock, duration: TICK_TIME });

      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
        ['sepolia', {}],
        ['mainnet', {}],
      ]);
      await advanceTime({ clock, duration: TICK_TIME });

      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
        ['sepolia', {}],
        ['mainnet', {}],
        ['sepolia', {}],
      ]);
      await advanceTime({ clock, duration: TICK_TIME });

      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
        ['sepolia', {}],
        ['mainnet', {}],
        ['sepolia', {}],
        ['mainnet', {}],
      ]);
      await advanceTime({ clock, duration: TICK_TIME });

      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
        ['sepolia', {}],
        ['mainnet', {}],
        ['sepolia', {}],
        ['mainnet', {}],
        ['sepolia', {}],
      ]);
    });
  });
  describe('PollingControllerOnly', () => {
    it('can be extended from and constructed', async () => {
      class MyClass extends PollingControllerOnly {
        _executePoll = createExecutePollMock();
      }
      const c = new MyClass();
      expect(c._executePoll).toBeDefined();
      expect(c.getIntervalLength).toBeDefined();
      expect(c.setIntervalLength).toBeDefined();
      expect(c.stopAllPolling).toBeDefined();
      expect(c.startPollingByNetworkClientId).toBeDefined();
      expect(c.stopPollingByPollingToken).toBeDefined();
    });
  });
});
