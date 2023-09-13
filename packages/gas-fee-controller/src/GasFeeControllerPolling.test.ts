import { ControllerMessenger, RestrictedControllerMessenger } from "@metamask/base-controller";
import GasFeeControllerPolling from './GasFeeControllerPolling';

describe('GasFeeControllerPolling', () => {
  // let controller: GasFeeControllerPolling<
  //   'GasFeeControllerPolling',
  //   { foo: string },
  //   RestrictedControllerMessenger<
  //     'GasFeeControllerPolling',
  //     any,
  //     any,
  //     string,
  //     string
  //   >
  // >;

  describe('start', () => {
    it('should start polling if not polling', () => {
      jest.useFakeTimers();

      const executePollMock = jest.fn();
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
      controller.stop();
      expect(executePollMock).toHaveBeenCalledTimes(1);
    });
  });
  describe('stop', () => {
    it('should stop polling if polling', () => {
      const executePollMock = jest.fn();
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
      controller.stop({
        pollingToken,
        networkClientId: 'mainnet',
      });
      jest.advanceTimersByTime(1500);
      expect(executePollMock).toHaveBeenCalledTimes(1);
      controller.stop();
    });
    it('should not stop polling if multiple polling tokens exist', () => {
      const executePollMock = jest.fn();
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
      jest.advanceTimersByTime(1200);
      controller.stop({
        pollingToken: pollingToken1,
        networkClientId: 'mainnet',
      });
      jest.advanceTimersByTime(1200);
      expect(executePollMock).toHaveBeenCalledTimes(2);
      controller.stop();
    });
    it('should error if no poll token is passed', () => {
      const executePollMock = jest.fn();
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
      expect(() => {
        controller.stop({
          pollingToken,
        });
      }).toThrow('networkClientId is required when pollingToken is passed');
    });
  });
  describe('poll', () => {
    it('should poll if polling', () => {
      jest.useFakeTimers();

      const executePollMock = jest.fn();
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
    it('should continue polling when start is called again with the same networkClientId', () => {
      jest.useFakeTimers();

      const executePollMock = jest.fn();
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
      controller.stop();
    });
  });
});
