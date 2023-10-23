import { ControllerMessenger } from '@metamask/base-controller';

import { PollingController, PollingControllerOnly } from './PollingController';

const TICK_TIME = 1000;

const createExecutePollMock = () => {
  const executePollMock = jest.fn().mockImplementation(async () => {
    return true;
  });
  return executePollMock;
};

describe('PollingController', () => {
  describe('start', () => {
    it('should start polling if not polling', async () => {
      jest.useFakeTimers();

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
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(TICK_TIME);
      controller.stopAllPolling();
      expect(controller._executePoll).toHaveBeenCalledTimes(2);
    });
  });
  describe('stop', () => {
    it('should stop polling when called with a valid polling that was the only active pollingToken for a given networkClient', async () => {
      jest.useFakeTimers();
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
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(TICK_TIME);
      controller.stopPollingByPollingToken(pollingToken);
      jest.advanceTimersByTime(TICK_TIME);
      expect(controller._executePoll).toHaveBeenCalledTimes(2);
      controller.stopAllPolling();
    });
    it('should not stop polling if called with one of multiple active polling tokens for a given networkClient', async () => {
      jest.useFakeTimers();
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
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      controller.startPollingByNetworkClientId('mainnet');
      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      controller.stopPollingByPollingToken(pollingToken1);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller._executePoll).toHaveBeenCalledTimes(3);
      controller.stopAllPolling();
    });
    it('should error if no pollingToken is passed', () => {
      jest.useFakeTimers();
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
      jest.useFakeTimers();
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
  describe('poll', () => {
    it('should call _executePoll immediately and on interval if polling', async () => {
      jest.useFakeTimers();

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
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller._executePoll).toHaveBeenCalledTimes(3);
    });
    it('should call _executePoll immediately once and continue calling _executePoll on interval when start is called again with the same networkClientId', async () => {
      jest.useFakeTimers();

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
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      controller.startPollingByNetworkClientId('mainnet');
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller._executePoll).toHaveBeenCalledTimes(3);
      controller.stopAllPolling();
    });
    it('should publish "pollingComplete" when stop is called', async () => {
      jest.useFakeTimers();
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
      jest.useFakeTimers();

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
      controller.setIntervalLength(TICK_TIME * 3);
      controller.startPollingByNetworkClientId('mainnet');
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller._executePoll).toHaveBeenCalledTimes(2);
      jest.advanceTimersByTime(TICK_TIME * 3);
      await Promise.resolve();
      expect(controller._executePoll).toHaveBeenCalledTimes(3);
    });
    it('should start and stop polling sessions for different networkClientIds with the same options', async () => {
      jest.useFakeTimers();

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
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      controller.startPollingByNetworkClientId('sepolia', { address: '0x2' });
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', { address: '0x1' }],
        ['mainnet', { address: '0x2' }],
        ['sepolia', { address: '0x2' }],
      ]);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', { address: '0x1' }],
        ['mainnet', { address: '0x2' }],
        ['sepolia', { address: '0x2' }],
        ['mainnet', { address: '0x1' }],
        ['mainnet', { address: '0x2' }],
        ['sepolia', { address: '0x2' }],
      ]);
      controller.stopPollingByPollingToken(pollToken1);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
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
      jest.useFakeTimers();
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
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      controller.startPollingByNetworkClientId('rinkeby');
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
        ['rinkeby', {}],
      ]);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
        ['rinkeby', {}],
        ['mainnet', {}],
        ['rinkeby', {}],
      ]);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
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
      jest.useFakeTimers();

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
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
      ]);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      controller.startPollingByNetworkClientId('sepolia');
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
        ['sepolia', {}],
      ]);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
        ['sepolia', {}],
        ['mainnet', {}],
      ]);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
        ['sepolia', {}],
        ['mainnet', {}],
        ['sepolia', {}],
      ]);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
        ['sepolia', {}],
        ['mainnet', {}],
        ['sepolia', {}],
        ['mainnet', {}],
      ]);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
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
