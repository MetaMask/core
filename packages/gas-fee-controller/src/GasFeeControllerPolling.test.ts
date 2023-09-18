import { ControllerMessenger } from '@metamask/base-controller';

import type { PollingCompleteType } from './GasFeeControllerPolling';
import GasFeeControllerPolling from './GasFeeControllerPolling';

describe('GasFeeControllerPolling', () => {
  let executePollMock: GasFeeControllerPolling<any, any, any>['executePoll'];

  beforeEach(() => {
    executePollMock = jest.fn().mockImplementation(async () => {
      console.log('executePollMock called');
      return true;
    });
  });

  describe('start', () => {
    it('should start polling if not polling', () => {
      jest.useFakeTimers();

      class MyGasFeeController extends GasFeeControllerPolling<any, any, any> {
        executePoll = executePollMock;
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'GasFeeControllerPolling',
        state: { foo: 'bar' },
      });
      controller.start('mainnet');
      jest.advanceTimersByTime(1500);
      controller.stopAll();
      expect(executePollMock).toHaveBeenCalledTimes(1);
    });
  });
  describe('stop', () => {
    it('should stop polling if polling', () => {
      jest.useFakeTimers();
      class MyGasFeeController extends GasFeeControllerPolling<any, any, any> {
        executePoll = executePollMock;
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'GasFeeControllerPolling',
        state: { foo: 'bar' },
      });
      const pollingToken = controller.start('mainnet');
      jest.advanceTimersByTime(1500);
      controller.stop(pollingToken);
      jest.advanceTimersByTime(1500);
      expect(executePollMock).toHaveBeenCalledTimes(1);
      controller.stopAll();
    });
    it.only('should not stop polling if multiple polling tokens exist', () => {
      jest.useFakeTimers();
      class MyGasFeeController extends GasFeeControllerPolling<any, any, any> {
        executePoll = executePollMock;
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'GasFeeControllerPolling',
        state: { foo: 'bar' },
      });
      const pollingToken1 = controller.start('mainnet');
      controller.start('mainnet');
      jest.advanceTimersByTime(1400);
      controller.stop(pollingToken1);
      jest.advanceTimersByTime(1400);
      expect(executePollMock).toHaveBeenCalledTimes(2);
      controller.stopAll();
    });
    it('should error if no poll token is passed', () => {
      jest.useFakeTimers();
      class MyGasFeeController extends GasFeeControllerPolling<any, any, any> {
        executePoll = executePollMock;
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'GasFeeControllerPolling',
        state: { foo: 'bar' },
      });
      controller.start('mainnet');
      expect(() => {
        controller.stop(undefined as unknown as any);
      }).toThrow('pollingToken required');
      controller.stopAll();
    });
    it('should error if no poll token is found', () => {
      jest.useFakeTimers();
      class MyGasFeeController extends GasFeeControllerPolling<any, any, any> {
        executePoll = executePollMock;
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'GasFeeControllerPolling',
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
    it('should call executePoll if polling', () => {
      jest.useFakeTimers();

      class MyGasFeeController extends GasFeeControllerPolling<any, any, any> {
        executePoll = executePollMock;
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'GasFeeControllerPolling',
        state: { foo: 'bar' },
      });
      controller.start('mainnet');
      jest.advanceTimersByTime(2500);
      expect(executePollMock).toHaveBeenCalledTimes(2);
    });
    it('should continue calling executePoll when start is called again with the same networkClientId', () => {
      jest.useFakeTimers();

      class MyGasFeeController extends GasFeeControllerPolling<any, any, any> {
        executePoll = executePollMock;
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'GasFeeControllerPolling',
        state: { foo: 'bar' },
      });
      controller.start('mainnet');
      controller.start('mainnet');
      jest.advanceTimersByTime(2500);
      expect(executePollMock).toHaveBeenCalledTimes(2);
      controller.stopAll();
    });
    it('should publish polligComplete when stop is called', async () => {
      jest.useFakeTimers();
      const pollingComplete: any = jest.fn();
      class MyGasFeeController extends GasFeeControllerPolling<any, any, any> {
        executePoll = executePollMock;
      }
      const name = 'GasFeeControllerPolling';

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
    it('should poll for each networkClientId', () => {
      jest.useFakeTimers();
      class MyGasFeeController extends GasFeeControllerPolling<any, any, any> {
        executePoll = executePollMock;
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'GasFeeControllerPolling',
        state: { foo: 'bar' },
      });
      controller.start('mainnet');
      controller.start('rinkeby');
      jest.advanceTimersByTime(2200);
      expect(executePollMock).toHaveBeenCalledTimes(4);
      controller.stopAll();
    });
  });
});
