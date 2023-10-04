import { ControllerMessenger } from '@metamask/base-controller';

import { PollingController } from './PollingController';

const TICK_TIME = 1000;

const createExecutePollMock = () => {
  const executePollMock = jest.fn().mockImplementation(async () => {
    return true;
  });
  return executePollMock;
};

describe('PollingController', () => {
  describe('start', () => {
    it('should start polling if not polling', () => {
      jest.useFakeTimers();

      class MyGasFeeController extends PollingController<any, any, any> {
        executePoll = createExecutePollMock();
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'PollingController',
        state: { foo: 'bar' },
      });
      controller.startPollingByNetworkClientId('mainnet');
      jest.advanceTimersByTime(TICK_TIME);
      controller.stopAllPolling();
      expect(controller.executePoll).toHaveBeenCalledTimes(1);
    });
  });
  describe('stop', () => {
    it('should stop polling when called with a valid polling that was the only active pollingToken for a given networkClient', () => {
      jest.useFakeTimers();
      class MyGasFeeController extends PollingController<any, any, any> {
        executePoll = createExecutePollMock();
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'PollingController',
        state: { foo: 'bar' },
      });
      const pollingToken = controller.startPollingByNetworkClientId('mainnet');
      jest.advanceTimersByTime(TICK_TIME);
      controller.stopPollingByNetworkClientId(pollingToken);
      jest.advanceTimersByTime(TICK_TIME);
      expect(controller.executePoll).toHaveBeenCalledTimes(1);
      controller.stopAllPolling();
    });
    it('should not stop polling if called with one of multiple active polling tokens for a given networkClient', async () => {
      jest.useFakeTimers();
      class MyGasFeeController extends PollingController<any, any, any> {
        executePoll = createExecutePollMock();
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'PollingController',
        state: { foo: 'bar' },
      });
      const pollingToken1 = controller.startPollingByNetworkClientId('mainnet');
      controller.startPollingByNetworkClientId('mainnet');
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      controller.stopPollingByNetworkClientId(pollingToken1);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller.executePoll).toHaveBeenCalledTimes(2);
      controller.stopAllPolling();
    });
    it('should error if no pollingToken is passed', () => {
      jest.useFakeTimers();
      class MyGasFeeController extends PollingController<any, any, any> {
        executePoll = createExecutePollMock();
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
        controller.stopPollingByNetworkClientId(undefined as unknown as any);
      }).toThrow('pollingToken required');
      controller.stopAllPolling();
    });
    it('should error if no matching pollingToken is found', () => {
      jest.useFakeTimers();
      class MyGasFeeController extends PollingController<any, any, any> {
        executePoll = createExecutePollMock();
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
        controller.stopPollingByNetworkClientId('potato');
      }).toThrow('pollingToken not found');
      controller.stopAllPolling();
    });
  });
  describe('poll', () => {
    it('should call executePoll if polling', async () => {
      jest.useFakeTimers();

      class MyGasFeeController extends PollingController<any, any, any> {
        executePoll = createExecutePollMock();
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'PollingController',
        state: { foo: 'bar' },
      });
      controller.startPollingByNetworkClientId('mainnet');
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller.executePoll).toHaveBeenCalledTimes(2);
    });
    it('should continue calling executePoll when start is called again with the same networkClientId', async () => {
      jest.useFakeTimers();

      class MyGasFeeController extends PollingController<any, any, any> {
        executePoll = createExecutePollMock();
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'PollingController',
        state: { foo: 'bar' },
      });
      controller.startPollingByNetworkClientId('mainnet');
      controller.startPollingByNetworkClientId('mainnet');
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller.executePoll).toHaveBeenCalledTimes(2);
      controller.stopAllPolling();
    });
    it('should publish "pollingComplete" when stop is called', async () => {
      jest.useFakeTimers();
      const pollingComplete: any = jest.fn();
      class MyGasFeeController extends PollingController<any, any, any> {
        executePoll = createExecutePollMock();
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
      controller.stopPollingByNetworkClientId(pollingToken);
      expect(pollingComplete).toHaveBeenCalledTimes(1);
    });
    it('should poll at the interval length when set via setIntervalLength', async () => {
      jest.useFakeTimers();

      class MyGasFeeController extends PollingController<any, any, any> {
        executePoll = createExecutePollMock();
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
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller.executePoll).not.toHaveBeenCalled();
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller.executePoll).not.toHaveBeenCalled();
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller.executePoll).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(TICK_TIME * 3);
      await Promise.resolve();
      expect(controller.executePoll).toHaveBeenCalledTimes(2);
    });
    it('should not poll twice for the same networkClientId and options', async () => {
      jest.useFakeTimers();

      class MyGasFeeController extends PollingController<any, any, any> {
        executePoll = createExecutePollMock();
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'PollingController',
        state: { foo: 'bar' },
      });
      controller.startPollingByNetworkClientId('mainnet', { address: '0x1' });
      controller.startPollingByNetworkClientId('mainnet', { address: '0x1' });
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller.executePoll).toHaveBeenCalledTimes(1);
    });
  });
  describe('multiple networkClientIds', () => {
    it('should poll for each networkClientId', async () => {
      jest.useFakeTimers();
      class MyGasFeeController extends PollingController<any, any, any> {
        executePoll = createExecutePollMock();
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'PollingController',
        state: { foo: 'bar' },
      });
      controller.startPollingByNetworkClientId('mainnet');
      controller.startPollingByNetworkClientId('rinkeby');
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller.executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
        ['rinkeby', {}],
      ]);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller.executePoll.mock.calls).toMatchObject([
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
        executePoll = createExecutePollMock();
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
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      controller.startPollingByNetworkClientId('sepolia');
      expect(controller.executePoll.mock.calls).toMatchObject([]);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller.executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
      ]);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller.executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
        ['sepolia', {}],
      ]);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller.executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
        ['sepolia', {}],
        ['mainnet', {}],
      ]);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller.executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
        ['sepolia', {}],
        ['mainnet', {}],
        ['sepolia', {}],
      ]);
    });
  });
});
