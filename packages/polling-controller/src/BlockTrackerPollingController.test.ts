import { ControllerMessenger } from '@metamask/base-controller';
import type { NetworkClient } from '@metamask/network-controller';
import EventEmitter from 'events';
import { useFakeTimers } from 'sinon';

import type { BlockTrackerPollingInput } from './BlockTrackerPollingController';
import { BlockTrackerPollingController } from './BlockTrackerPollingController';

const createExecutePollMock = () => {
  const executePollMock = jest.fn().mockImplementation(async () => {
    return true;
  });
  return executePollMock;
};

let getNetworkClientByIdStub: jest.Mock;
class ChildBlockTrackerPollingController extends BlockTrackerPollingController<BlockTrackerPollingInput>()<
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

  _getNetworkClientById(networkClientId: string): NetworkClient | undefined {
    return getNetworkClientByIdStub(networkClientId);
  }
}

class TestBlockTracker extends EventEmitter {
  private latestBlockNumber = 0;

  emitBlockEvent() {
    this.latestBlockNumber += 1;
    this.emit('latest', this.latestBlockNumber);
  }
}

describe('BlockTrackerPollingController', () => {
  let clock: sinon.SinonFakeTimers;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockMessenger: any;
  let controller: ChildBlockTrackerPollingController;
  let mainnetBlockTracker: TestBlockTracker;
  let goerliBlockTracker: TestBlockTracker;
  let sepoliaBlockTracker: TestBlockTracker;
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

    mainnetBlockTracker = new TestBlockTracker();
    goerliBlockTracker = new TestBlockTracker();
    sepoliaBlockTracker = new TestBlockTracker();

    getNetworkClientByIdStub = jest
      .fn()
      .mockImplementation((networkClientId: string) => {
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
    clock = useFakeTimers();
  });
  afterEach(() => {
    clock.restore();
  });

  describe('startPolling', () => {
    it('should call _executePoll on "latest" block events emitted by blockTrackers for each networkClientId passed to startPolling', async () => {
      controller.startPolling({ networkClientId: 'mainnet' });
      controller.startPolling({ networkClientId: 'goerli' });
      // await advanceTime({ clock, duration: 5 });
      mainnetBlockTracker.emitBlockEvent();

      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      expect(controller._executePoll).toHaveBeenCalledWith(
        { networkClientId: 'mainnet' },
        1,
      );

      mainnetBlockTracker.emitBlockEvent();
      goerliBlockTracker.emitBlockEvent();

      expect(controller._executePoll).toHaveBeenNthCalledWith(
        2,
        { networkClientId: 'mainnet' },
        2, // 2nd block for mainnet
      );
      expect(controller._executePoll).toHaveBeenNthCalledWith(
        3,
        { networkClientId: 'goerli' },
        1, // 1st block for goerli
      );

      mainnetBlockTracker.emitBlockEvent();
      goerliBlockTracker.emitBlockEvent();

      // sepolioa not being listened to yet, so first block for sepolia will not cause an executePoll
      sepoliaBlockTracker.emitBlockEvent();

      expect(controller._executePoll).toHaveBeenNthCalledWith(
        4,
        { networkClientId: 'mainnet' },
        3,
      );
      expect(controller._executePoll).toHaveBeenNthCalledWith(
        5,
        { networkClientId: 'goerli' },
        2,
      );

      controller.startPolling({ networkClientId: 'sepolia' });

      mainnetBlockTracker.emitBlockEvent();
      sepoliaBlockTracker.emitBlockEvent();

      expect(controller._executePoll).toHaveBeenNthCalledWith(
        6,
        { networkClientId: 'mainnet' },
        4,
      );
      expect(controller._executePoll).toHaveBeenNthCalledWith(
        7,
        { networkClientId: 'sepolia' },
        2,
      );

      controller.stopAllPolling();
    });
  });

  describe('stopPollingByPollingToken', () => {
    it('should should stop polling when all polling tokens for a networkClientId are deleted', async () => {
      const pollingToken1 = controller.startPolling({
        networkClientId: 'mainnet',
      });

      // await advanceTime({ clock, duration: 5 });
      mainnetBlockTracker.emitBlockEvent();

      expect(controller._executePoll).toHaveBeenCalledTimes(1);
      expect(controller._executePoll).toHaveBeenCalledWith(
        { networkClientId: 'mainnet' },
        1,
      );

      const pollingToken2 = controller.startPolling({
        networkClientId: 'mainnet',
      });

      mainnetBlockTracker.emitBlockEvent();

      expect(controller._executePoll.mock.calls).toMatchObject([
        [{ networkClientId: 'mainnet' }, 1],
        [{ networkClientId: 'mainnet' }, 2],
      ]);

      controller.stopPollingByPollingToken(pollingToken1);

      mainnetBlockTracker.emitBlockEvent();

      // polling is still active for mainnet because pollingToken2 is still active
      expect(controller._executePoll.mock.calls).toMatchObject([
        [{ networkClientId: 'mainnet' }, 1],
        [{ networkClientId: 'mainnet' }, 2],
        [{ networkClientId: 'mainnet' }, 3],
      ]);

      controller.stopPollingByPollingToken(pollingToken2);

      mainnetBlockTracker.emitBlockEvent();
      mainnetBlockTracker.emitBlockEvent();
      mainnetBlockTracker.emitBlockEvent();

      // no further polling should occur regardless of how many blocks are emitted
      // because all pollingTokens for mainnet have been deleted
      expect(controller._executePoll.mock.calls).toMatchObject([
        [{ networkClientId: 'mainnet' }, 1],
        [{ networkClientId: 'mainnet' }, 2],
        [{ networkClientId: 'mainnet' }, 3],
      ]);
    });

    it('should should stop polling for one networkClientId when all polling tokens for that networkClientId are deleted, without stopping polling for networkClientIds with active pollingTokens', async () => {
      const pollingToken1 = controller.startPolling({
        networkClientId: 'mainnet',
      });

      mainnetBlockTracker.emitBlockEvent();

      expect(controller._executePoll).toHaveBeenCalledWith(
        { networkClientId: 'mainnet' },
        1,
      );

      const pollingToken2 = controller.startPolling({
        networkClientId: 'mainnet',
      });

      mainnetBlockTracker.emitBlockEvent();

      expect(controller._executePoll.mock.calls).toMatchObject([
        [{ networkClientId: 'mainnet' }, 1],
        [{ networkClientId: 'mainnet' }, 2],
      ]);

      controller.startPolling({ networkClientId: 'goerli' });

      mainnetBlockTracker.emitBlockEvent();

      // we are polling for mainnet and goerli but goerli has not emitted any blocks yet
      expect(controller._executePoll.mock.calls).toMatchObject([
        [{ networkClientId: 'mainnet' }, 1],
        [{ networkClientId: 'mainnet' }, 2],
        [{ networkClientId: 'mainnet' }, 3],
      ]);

      controller.stopPollingByPollingToken(pollingToken1);

      mainnetBlockTracker.emitBlockEvent();
      goerliBlockTracker.emitBlockEvent();

      expect(controller._executePoll.mock.calls).toMatchObject([
        [{ networkClientId: 'mainnet' }, 1],
        [{ networkClientId: 'mainnet' }, 2],
        [{ networkClientId: 'mainnet' }, 3],
        [{ networkClientId: 'mainnet' }, 4],
        [{ networkClientId: 'goerli' }, 1],
      ]);

      controller.stopPollingByPollingToken(pollingToken2);

      mainnetBlockTracker.emitBlockEvent();
      mainnetBlockTracker.emitBlockEvent();
      mainnetBlockTracker.emitBlockEvent();
      goerliBlockTracker.emitBlockEvent();
      goerliBlockTracker.emitBlockEvent();

      // no further polling for mainnet should occur
      expect(controller._executePoll.mock.calls).toMatchObject([
        [{ networkClientId: 'mainnet' }, 1],
        [{ networkClientId: 'mainnet' }, 2],
        [{ networkClientId: 'mainnet' }, 3],
        [{ networkClientId: 'mainnet' }, 4],
        [{ networkClientId: 'goerli' }, 1],
        [{ networkClientId: 'goerli' }, 2],
        [{ networkClientId: 'goerli' }, 3],
      ]);

      controller.stopAllPolling();
    });
  });

  describe('onPollingCompleteByNetworkClientId', () => {
    it('should publish "pollingComplete" callback function set by "onPollingCompleteByNetworkClientId" when polling stops', async () => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pollingComplete: any = jest.fn();
      controller.onPollingComplete(
        { networkClientId: 'mainnet' },
        pollingComplete,
      );
      const pollingToken = controller.startPolling({
        networkClientId: 'mainnet',
      });
      controller.stopPollingByPollingToken(pollingToken);
      expect(pollingComplete).toHaveBeenCalledTimes(1);
      expect(pollingComplete).toHaveBeenCalledWith({
        networkClientId: 'mainnet',
      });
    });
  });
});
