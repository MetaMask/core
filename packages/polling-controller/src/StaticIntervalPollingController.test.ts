import { ControllerMessenger } from '@metamask/base-controller';
import { useFakeTimers } from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import { StaticIntervalPollingController } from './StaticIntervalPollingController';

const TICK_TIME = 5;

const createExecutePollMock = () => {
  const executePollMock = jest.fn().mockImplementation(async () => {
    return true;
  });
  return executePollMock;
};

class ChildBlockTrackerPollingController extends StaticIntervalPollingController<
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
> {
  _executePoll = createExecutePollMock();
}

describe('StaticIntervalPollingController', () => {
  let clock: sinon.SinonFakeTimers;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockMessenger: any;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let controller: any;
  beforeEach(() => {
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockMessenger = new ControllerMessenger<any, any>();
    controller = new ChildBlockTrackerPollingController({
      messenger: mockMessenger,
      metadata: {},
      name: 'PollingController',
      state: { foo: 'bar' },
    });
    controller.setIntervalLength(TICK_TIME);
    clock = useFakeTimers();
  });
  afterEach(() => {
    clock.restore();
  });

  describe('startPollingByNetworkClientId', () => {
    it('should start polling if not already polling', async () => {
      const pollingToken = controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });
      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      await advanceTime({ clock, duration: TICK_TIME });
      expect(controller._executePoll).toHaveBeenCalledTimes(2);
      controller.stopPollingByPollingToken(pollingToken);
    });

    it('should call _executePoll immediately once and continue calling _executePoll on interval when called again with the same networkClientId', async () => {
      const pollingToken1 = controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });

      const pollingToken2 = controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });

      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      await advanceTime({ clock, duration: TICK_TIME * 2 });

      expect(controller._executePoll).toHaveBeenCalledTimes(3);
      controller.stopPollingByPollingToken(pollingToken1);
      controller.stopPollingByPollingToken(pollingToken2);
    });
    describe('multiple networkClientIds', () => {
      it('should poll for each networkClientId', async () => {
        const pollingToken1 =
          controller.startPollingByNetworkClientId('mainnet');
        await advanceTime({ clock, duration: 0 });

        const pollingToken2 =
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
        controller.stopPollingByPollingToken(pollingToken1);
        controller.stopPollingByPollingToken(pollingToken2);
      });

      it('should poll multiple networkClientIds when setting interval length', async () => {
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
  });

  describe('stopPollingByPollingToken', () => {
    it('should stop polling when called with a valid polling that was the only active pollingToken for a given networkClient', async () => {
      const pollingToken = controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });
      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      await advanceTime({ clock, duration: TICK_TIME });
      controller.stopPollingByPollingToken(pollingToken);
      await advanceTime({ clock, duration: TICK_TIME });
      expect(controller._executePoll).toHaveBeenCalledTimes(2);
      controller.stopPollingByPollingToken(pollingToken);
    });
    it('should not stop polling if called with one of multiple active polling tokens for a given networkClient', async () => {
      const pollingToken1 = controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });

      const pollingToken2 = controller.startPollingByNetworkClientId('mainnet');
      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      await advanceTime({ clock, duration: TICK_TIME });
      controller.stopPollingByPollingToken(pollingToken1);
      await advanceTime({ clock, duration: TICK_TIME });
      expect(controller._executePoll).toHaveBeenCalledTimes(3);
      controller.stopPollingByPollingToken(pollingToken1);
      controller.stopPollingByPollingToken(pollingToken2);
    });
    it('should error if no pollingToken is passed', () => {
      const pollingToken = controller.startPollingByNetworkClientId('mainnet');
      expect(() => {
        controller.stopPollingByPollingToken();
      }).toThrow('pollingToken required');
      controller.stopPollingByPollingToken(pollingToken);
    });

    it('should start and stop polling sessions for different networkClientIds with the same options', async () => {
      controller.setIntervalLength(TICK_TIME);
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

  describe('onPollingCompleteByNetworkClientId', () => {
    it('should publish "pollingComplete" callback function set by "onPollingCompleteByNetworkClientId" when polling stops', async () => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pollingComplete: any = jest.fn();
      controller.onPollingCompleteByNetworkClientId('mainnet', pollingComplete);
      const pollingToken = controller.startPollingByNetworkClientId('mainnet');
      controller.stopPollingByPollingToken(pollingToken);
      expect(pollingComplete).toHaveBeenCalledTimes(1);
      expect(pollingComplete).toHaveBeenCalledWith('mainnet:{}');
    });
  });

  describe('pause / resume', () => {
    it('should pause and resume polling execution', async () => {
      // Execution on initial start
      const pollingToken = controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });
      expect(controller._executePoll).toHaveBeenCalledTimes(1);

      // Execution after first interval
      await advanceTime({ clock, duration: TICK_TIME });
      expect(controller._executePoll).toHaveBeenCalledTimes(2);

      // No execution while paused
      controller.pause();
      await advanceTime({ clock, duration: 5 * TICK_TIME });
      expect(controller._executePoll).toHaveBeenCalledTimes(2);

      // Resume execution
      controller.resume();
      await advanceTime({ clock, duration: 1 });
      expect(controller._executePoll).toHaveBeenCalledTimes(3);
      await advanceTime({ clock, duration: TICK_TIME });
      expect(controller._executePoll).toHaveBeenCalledTimes(4);
      controller.stopPollingByPollingToken(pollingToken);
    });

    it('should resume polling with correct delay based on the previous poll time', async () => {
      const pollingToken = controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });
      expect(controller._executePoll).toHaveBeenCalledTimes(1);

      controller.pause();
      await advanceTime({ clock, duration: TICK_TIME - 2 });
      controller.resume();

      await advanceTime({ clock, duration: 2 });
      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      await advanceTime({ clock, duration: 1 });
      expect(controller._executePoll).toHaveBeenCalledTimes(2);

      controller.stopPollingByPollingToken(pollingToken);
    });

    it('should allow registering new pollers while paused', async () => {
      controller.pause();
      const pollingToken1 = controller.startPollingByNetworkClientId('mainnet');
      const pollingToken2 =
        controller.startPollingByNetworkClientId('linea-mainnet');
      await advanceTime({ clock, duration: TICK_TIME });
      expect(controller._executePoll).toHaveBeenCalledTimes(0);
      controller.resume();
      await advanceTime({ clock, duration: 1 });
      expect(controller._executePoll).toHaveBeenCalledTimes(2);
      expect(controller._executePoll.mock.calls).toMatchObject([
        ['mainnet', {}],
        ['linea-mainnet', {}],
      ]);
      controller.stopPollingByPollingToken(pollingToken1);
      controller.stopPollingByPollingToken(pollingToken2);
    });

    it('should no-op when pause() or resume() is called multuple times', async () => {
      const pollingToken = controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });
      expect(controller._executePoll).toHaveBeenCalledTimes(1);

      controller.pause();
      await advanceTime({ clock, duration: TICK_TIME });
      controller.pause();
      await advanceTime({ clock, duration: TICK_TIME });
      expect(controller._executePoll).toHaveBeenCalledTimes(1);

      controller.resume();
      await advanceTime({ clock, duration: 1 });
      controller.resume();
      await advanceTime({ clock, duration: 1 });
      expect(controller._executePoll).toHaveBeenCalledTimes(2);

      await advanceTime({ clock, duration: TICK_TIME });
      expect(controller._executePoll).toHaveBeenCalledTimes(3);
      controller.stopPollingByPollingToken(pollingToken);
    });
  });
});
