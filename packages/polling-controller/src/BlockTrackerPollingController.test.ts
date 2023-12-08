import { ControllerMessenger } from '@metamask/base-controller';
import type { NetworkClient } from '@metamask/network-controller';
import EventEmitter from 'events';
import { useFakeTimers } from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import { BlockTrackerPollingController } from './BlockTrackerPollingController';

const createExecutePollMock = () => {
  const executePollMock = jest.fn().mockImplementation(async () => {
    return true;
  });
  return executePollMock;
};

let getNetworkClientByIdStub: jest.Mock;
class MyGasFeeController extends BlockTrackerPollingController<any, any, any> {
  _executePoll = createExecutePollMock();

  _getNetworkClientById(networkClientId: string): NetworkClient | undefined {
    return getNetworkClientByIdStub(networkClientId);
  }
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

  describe('Polling on block times', () => {
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

    let mainnetBlockTracker: TestBlockTracker;
    let goerliBlockTracker: TestBlockTracker;
    let sepoliaBlockTracker: TestBlockTracker;
    beforeEach(() => {
      mainnetBlockTracker = new TestBlockTracker({ interval: 5 });
      goerliBlockTracker = new TestBlockTracker({ interval: 10 });
      sepoliaBlockTracker = new TestBlockTracker({ interval: 15 });

      getNetworkClientByIdStub = jest
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

    describe('startPollingByNetworkClientId', () => {
      it('should start polling for the specified networkClientId', async () => {
        controller.startPollingByNetworkClientId('mainnet');

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
    });

    describe('stopPollingByPollingToken', () => {
      it('should should stop polling when all polling tokens for a networkClientId are deleted', async () => {
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
