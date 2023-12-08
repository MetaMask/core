import { ControllerMessenger } from '@metamask/base-controller';
import { useFakeTimers } from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import { StaticIntervalPollingController } from './StaticIntervalPollingController';

const TICK_TIME = 1000;

const createExecutePollMock = () => {
  const executePollMock = jest.fn().mockImplementation(async () => {
    return true;
  });
  return executePollMock;
};

class MyGasFeeController extends StaticIntervalPollingController<
  any,
  any,
  any
> {
  _executePoll = createExecutePollMock();

  _intervalLength = TICK_TIME;
}

describe('PollingController', () => {
  let clock: sinon.SinonFakeTimers;
  let mockMessenger: any;
  let controller: any;
  beforeEach(() => {
    mockMessenger = new ControllerMessenger<any, any>();
    controller = new MyGasFeeController({
      messenger: mockMessenger,
      metadata: {},
      name: 'PollingController',
      state: { foo: 'bar' },
    });
    clock = useFakeTimers();
  });
  afterEach(() => {
    clock.restore();
  });

  describe('startPollingByNetworkClientId', () => {
    it('should start polling if not polling', async () => {
      controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });
      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      await advanceTime({ clock, duration: TICK_TIME });
      expect(controller._executePoll).toHaveBeenCalledTimes(2);
      controller.stopAllPolling();
    });
    it('should call _executePoll immediately and on interval if polling', async () => {
      controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });
      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      await advanceTime({ clock, duration: TICK_TIME * 2 });
      expect(controller._executePoll).toHaveBeenCalledTimes(3);
    });
    it('should call _executePoll immediately once and continue calling _executePoll on interval when start is called again with the same networkClientId', async () => {
      controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });

      controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });

      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      await advanceTime({ clock, duration: TICK_TIME * 2 });

      expect(controller._executePoll).toHaveBeenCalledTimes(3);
      controller.stopAllPolling();
    });
    describe('multiple networkClientIds', () => {
      it('should poll for each networkClientId', async () => {
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
      controller.stopAllPolling();
    });
    it('should not stop polling if called with one of multiple active polling tokens for a given networkClient', async () => {
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
      controller.startPollingByNetworkClientId('mainnet');
      expect(() => {
        controller.stopPollingByPollingToken(undefined as unknown as any);
      }).toThrow('pollingToken required');
      controller.stopAllPolling();
    });
    it('should error if no matching pollingToken is found', () => {
      controller.startPollingByNetworkClientId('mainnet');
      expect(() => {
        controller.stopPollingByPollingToken('potato');
      }).toThrow('pollingToken not found');
      controller.stopAllPolling();
    });

    it('should publish "pollingComplete" when stop is called', async () => {
      const pollingComplete: any = jest.fn();
      controller.onPollingCompleteByNetworkClientId('mainnet', pollingComplete);
      const pollingToken = controller.startPollingByNetworkClientId('mainnet');
      controller.stopPollingByPollingToken(pollingToken);
      expect(pollingComplete).toHaveBeenCalledTimes(1);
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
});
