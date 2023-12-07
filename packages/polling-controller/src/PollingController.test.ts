import { ControllerMessenger } from '@metamask/base-controller';
import EventEmitter from 'events';
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

class MyGasFeeController extends PollingController<any, any, any> {
  _executePoll = createExecutePollMock();
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
  describe('start', () => {
    it('should start polling if not polling', async () => {
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
  });

  describe('setIntervalLength', () => {
    it('should set getNetworkClientById (if previously set by setPollWithBlockTracker) to undefined when setting interval length', async () => {
      controller.setPollWithBlockTracker(() => {
        throw new Error('should not be called');
      });
      expect(controller.getPollingWithBlockTracker()).toBe(true);
      controller.setIntervalLength(1000);
      expect(controller.getPollingWithBlockTracker()).toBe(false);
    });
  });

  describe('startPollingByNetworkClientId', () => {
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
    it('should publish "pollingComplete" when stop is called', async () => {
      const pollingComplete: any = jest.fn();
      controller.onPollingCompleteByNetworkClientId('mainnet', pollingComplete);
      const pollingToken = controller.startPollingByNetworkClientId('mainnet');
      controller.stopPollingByPollingToken(pollingToken);
      expect(pollingComplete).toHaveBeenCalledTimes(1);
    });
    it('should poll at the interval length when set via setIntervalLength', async () => {
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
    describe('startPollingByNetworkClientId after setPollWithBlockTracker', () => {
      class TestBlockTracker extends EventEmitter {
        private latestBlockNumber: number;

        public interval: number;

        constructor({ interval } = { interval: 1000 }) {
          super();
          this.latestBlockNumber = 0;
          this.interval = interval;
          this.start(interval);
        }

        private start(interval: number) {
          setInterval(() => {
            this.latestBlockNumber += 1;
            this.emit('latest', this.latestBlockNumber);
          }, interval);
        }
      }

      let getNetworkClientById: jest.Mock;
      let mainnetBlockTracker: TestBlockTracker;
      let goerliBlockTracker: TestBlockTracker;
      let sepoliaBlockTracker: TestBlockTracker;
      beforeEach(() => {
        mainnetBlockTracker = new TestBlockTracker({ interval: 5 });
        goerliBlockTracker = new TestBlockTracker({ interval: 10 });
        sepoliaBlockTracker = new TestBlockTracker({ interval: 15 });

        getNetworkClientById = jest
          .fn()
          .mockImplementation((networkClientId) => {
            switch (networkClientId) {
              case 'mainnet':
                return {
                  blockTracker: mainnetBlockTracker,
                };
              case 'goerli':
                return {
                  blockTracker: goerliBlockTracker,
                };
              case 'sepolia':
                return {
                  blockTracker: sepoliaBlockTracker,
                };
              default:
                throw new Error(`Unknown networkClientId: ${networkClientId}`);
            }
          });
      });

      it('should set the interval length to undefined', () => {
        controller.setPollWithBlockTracker(getNetworkClientById);

        expect(controller.getIntervalLength()).toBeUndefined();
      });

      it('should start polling for the specified networkClientId', async () => {
        controller.setPollWithBlockTracker(getNetworkClientById);

        controller.startPollingByNetworkClientId('mainnet');

        expect(getNetworkClientById).toHaveBeenCalledWith('mainnet');

        await advanceTime({ clock, duration: 5 });

        expect(controller._executePoll).toHaveBeenCalledTimes(1);

        await advanceTime({ clock, duration: 1 });

        expect(controller._executePoll).toHaveBeenCalledTimes(1);

        await advanceTime({ clock, duration: 4 });

        expect(controller._executePoll.mock.calls).toMatchObject([
          expect.arrayContaining(['mainnet', {}]),
          expect.arrayContaining(['mainnet', {}]),
        ]);

        controller.stopAllPolling();
      });

      it('should poll on new block intervals for each networkClientId', async () => {
        controller.setPollWithBlockTracker(getNetworkClientById);

        controller.startPollingByNetworkClientId('mainnet');
        controller.startPollingByNetworkClientId('goerli');
        await advanceTime({ clock, duration: 5 });

        expect(controller._executePoll).toHaveBeenCalledTimes(1);
        expect(controller._executePoll).toHaveBeenCalledWith('mainnet', {}, 1);

        await advanceTime({ clock, duration: 5 });

        expect(controller._executePoll.mock.calls).toMatchObject([
          ['mainnet', {}, 1],
          ['mainnet', {}, 2],
          ['goerli', {}, 1],
        ]);

        await advanceTime({ clock, duration: 5 });

        expect(controller._executePoll.mock.calls).toMatchObject([
          ['mainnet', {}, 1],
          ['mainnet', {}, 2],
          ['goerli', {}, 1],
          ['mainnet', {}, 3],
        ]);

        // 15ms have passed
        // Start polling for sepolia, 15ms interval
        controller.startPollingByNetworkClientId('sepolia');

        await advanceTime({ clock, duration: 15 });

        // at 30ms, 6 blocks have passed for mainnet (every 5ms), 3 for goerli (every 10ms), and 2 for sepolia (every 15ms)
        // Didn't start listening to sepolia until 15ms had passed, so we only call executePoll on the 2nd block
        expect(controller._executePoll.mock.calls).toMatchObject([
          ['mainnet', {}, 1],
          ['mainnet', {}, 2],
          ['goerli', {}, 1],
          ['mainnet', {}, 3],
          ['mainnet', {}, 4],
          ['goerli', {}, 2],
          ['mainnet', {}, 5],
          ['mainnet', {}, 6],
          ['goerli', {}, 3],
          ['sepolia', {}, 2],
        ]);

        controller.stopAllPolling();
      });

      it('should should stop polling when all polling tokens for a networkClientId are deleted', async () => {
        controller.setPollWithBlockTracker(getNetworkClientById);

        const pollingToken1 =
          controller.startPollingByNetworkClientId('mainnet');

        await advanceTime({ clock, duration: 5 });

        expect(controller._executePoll).toHaveBeenCalledTimes(1);
        expect(controller._executePoll).toHaveBeenCalledWith('mainnet', {}, 1);

        const pollingToken2 =
          controller.startPollingByNetworkClientId('mainnet');
        await advanceTime({ clock, duration: 5 });

        expect(controller._executePoll.mock.calls).toMatchObject([
          ['mainnet', {}, 1],
          ['mainnet', {}, 2],
        ]);

        controller.stopPollingByPollingToken(pollingToken1);

        await advanceTime({ clock, duration: 5 });

        expect(controller._executePoll.mock.calls).toMatchObject([
          ['mainnet', {}, 1],
          ['mainnet', {}, 2],
          ['mainnet', {}, 3],
        ]);

        controller.stopPollingByPollingToken(pollingToken2);

        await advanceTime({ clock, duration: 15 });

        // no further polling should occur
        expect(controller._executePoll.mock.calls).toMatchObject([
          ['mainnet', {}, 1],
          ['mainnet', {}, 2],
          ['mainnet', {}, 3],
        ]);
      });

      it('should should stop polling for one networkClientId when all polling tokens for that networkClientId are deleted, without stopping polling for networkClientIds with active pollingTokens', async () => {
        controller.setPollWithBlockTracker(getNetworkClientById);

        const pollingToken1 =
          controller.startPollingByNetworkClientId('mainnet');

        await advanceTime({ clock, duration: 5 });

        expect(controller._executePoll).toHaveBeenCalledWith('mainnet', {}, 1);

        const pollingToken2 =
          controller.startPollingByNetworkClientId('mainnet');

        await advanceTime({ clock, duration: 5 });

        expect(controller._executePoll.mock.calls).toMatchObject([
          ['mainnet', {}, 1],
          ['mainnet', {}, 2],
        ]);

        controller.startPollingByNetworkClientId('goerli');
        await advanceTime({ clock, duration: 5 });

        // 3 blocks have passed for mainnet, 1 for goerli but we only started listening to goerli after 5ms
        // so the next block will come at 20ms and be the 2nd block for goerli
        expect(controller._executePoll.mock.calls).toMatchObject([
          ['mainnet', {}, 1],
          ['mainnet', {}, 2],
          ['mainnet', {}, 3],
        ]);

        controller.stopPollingByPollingToken(pollingToken1);

        await advanceTime({ clock, duration: 5 });

        // 20ms have passed, 4 blocks for mainnet, 2 for goerli
        expect(controller._executePoll.mock.calls).toMatchObject([
          ['mainnet', {}, 1],
          ['mainnet', {}, 2],
          ['mainnet', {}, 3],
          ['mainnet', {}, 4],
          ['goerli', {}, 2],
        ]);

        controller.stopPollingByPollingToken(pollingToken2);

        await advanceTime({ clock, duration: 20 });

        // no further polling for mainnet should occur
        expect(controller._executePoll.mock.calls).toMatchObject([
          ['mainnet', {}, 1],
          ['mainnet', {}, 2],
          ['mainnet', {}, 3],
          ['mainnet', {}, 4],
          ['goerli', {}, 2],
          ['goerli', {}, 3],
          ['goerli', {}, 4],
        ]);

        controller.stopAllPolling();
      });
    });
  });
});
