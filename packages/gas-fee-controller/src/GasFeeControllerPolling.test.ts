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
        // async executePoll(networkClientId: string): Promise<void> {
        //   console.log('executing poll', networkClientId);
        // }
        // Implement any abstract methods here
      }
      const mockMessenger = new ControllerMessenger<any, any>();

      const controller = new MyGasFeeController({
        messenger: mockMessenger,
        metadata: {},
        name: 'GasFeeControllerPolling',
        state: { foo: 'bar' },
      });
      jest.advanceTimersByTime(1500);
      controller.stop();
      expect(executePollMock).toHaveBeenCalledTimes(1);
    });
  });
});
