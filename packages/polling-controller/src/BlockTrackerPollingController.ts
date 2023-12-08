import { BaseController, BaseControllerV1 } from '@metamask/base-controller';
import type {
  NetworkClientId,
  NetworkClient,
} from '@metamask/network-controller';
import type { Json } from '@metamask/utils';

import {
  PollingControllerBaseMixin,
  getKey,
} from './PollingController-abstract';
import type { PollingTokenSetId } from './PollingController-abstract';

type Constructor = new (...args: any[]) => object;

/**
 * BlockTrackerPollingControllerMixin
 *
 * @param Base - The base class to mix onto.
 * @returns The composed class.
 */
function BlockTrackerPollingControllerMixin<TBase extends Constructor>(
  Base: TBase,
) {
  abstract class BlockTrackerPollingController extends PollingControllerBaseMixin(
    Base,
  ) {
    #activeListeners: Record<string, (options: Json) => Promise<void>> = {};

    _start(networkClientId: NetworkClientId, options: Json) {
      this.startBlockTrackingPolling(networkClientId, options);
    }

    abstract getNetworkClientById(
      networkClientId: NetworkClientId,
    ): NetworkClient | undefined;

    abstract _executePoll(
      networkClientId: NetworkClientId,
      options: Json,
    ): Promise<void>;

    startBlockTrackingPolling(networkClientId: NetworkClientId, options: Json) {
      const key = getKey(networkClientId, options);

      if (this.#activeListeners[key]) {
        return;
      }

      const networkClient = this.getNetworkClientById(networkClientId);
      if (networkClient && networkClient.blockTracker) {
        const updateOnNewBlock = this._executePoll.bind(
          this,
          networkClientId,
          options,
        );
        networkClient.blockTracker.addListener('latest', updateOnNewBlock);
        this.#activeListeners[key] = updateOnNewBlock;
      } else {
        throw new Error(
          `Unable to retrieve blockTracker for networkClientId ${networkClientId}`,
        );
      }
    }

    stopBlockTrackingPolling(key: string) {
      const [networkClientId] = key.split(':');
      const networkClient = this.getNetworkClientById(
        networkClientId as NetworkClientId,
      );

      if (networkClient && this.#activeListeners[key]) {
        const listener = this.#activeListeners[key];
        if (listener) {
          networkClient.blockTracker.removeListener('latest', listener);
          delete this.#activeListeners[key];
        }
      }
    }
  }

  return BlockTrackerPollingController;
}

class Empty {}

export const BlockTrackerPollingControllerOnly =
  BlockTrackerPollingControllerMixin(Empty);
export const BlockTrackerPollingController =
  BlockTrackerPollingControllerMixin(BaseController);
export const BlockTrackerPollingControllerV1 =
  BlockTrackerPollingControllerMixin(BaseControllerV1);
