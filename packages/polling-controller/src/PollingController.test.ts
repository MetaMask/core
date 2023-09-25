import { ControllerMessenger } from '@metamask/base-controller';

import type { PollingCompleteType } from './PollingController';
import PollingController from './PollingController';

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
      controller.start('mainnet');
      jest.advanceTimersByTime(TICK_TIME);
      controller.stopAll();
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
      const pollingToken = controller.start('mainnet');
      jest.advanceTimersByTime(TICK_TIME);
      controller.stop(pollingToken);
      jest.advanceTimersByTime(TICK_TIME);
      expect(controller.executePoll).toHaveBeenCalledTimes(1);
      controller.stopAll();
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
      const pollingToken1 = controller.start('mainnet');
      controller.start('mainnet');
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      controller.stop(pollingToken1);
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller.executePoll).toHaveBeenCalledTimes(2);
      controller.stopAll();
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
      controller.start('mainnet');
      expect(() => {
        controller.stop(undefined as unknown as any);
      }).toThrow('pollingToken required');
      controller.stopAll();
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
      controller.start('mainnet');
      expect(() => {
        controller.stop('potato');
      }).toThrow('pollingToken not found');
      controller.stopAll();
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
      controller.start('mainnet');
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
      controller.start('mainnet');
      controller.start('mainnet');
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller.executePoll).toHaveBeenCalledTimes(2);
      controller.stopAll();
    });
    it('should publish "pollingComplete" when stop is called', async () => {
      jest.useFakeTimers();
      const pollingComplete: any = jest.fn();
      class MyGasFeeController extends PollingController<any, any, any> {
        executePoll = createExecutePollMock();
      }
      const name = 'PollingController';

      const mockMessenger = new ControllerMessenger<
        any,
        PollingCompleteType<typeof name>
      >();

      mockMessenger.subscribe(`${name}:pollingComplete`, pollingComplete);

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name,
        state: { foo: 'bar' },
      });
      const pollingToken = controller.start('mainnet');
      controller.stop(pollingToken);
      expect(pollingComplete).toHaveBeenCalledTimes(1);
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
      controller.start('mainnet');
      controller.start('rinkeby');
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      jest.advanceTimersByTime(TICK_TIME);
      await Promise.resolve();
      expect(controller.executePoll).toHaveBeenCalledTimes(4);
      controller.stopAll();
    });
  });
});
