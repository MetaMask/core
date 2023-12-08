import { BaseController, BaseControllerV1 } from '@metamask/base-controller';
import type {
  NetworkClientId,
  NetworkClient,
} from '@metamask/network-controller';
import type { Json } from '@metamask/utils';

import {
  AbstractPollingControllerBaseMixin,
  getKey,
} from './AbstractPollingController';
import type { PollingTokenSetId } from './AbstractPollingController';

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
  abstract class BlockTrackerPollingController extends AbstractPollingControllerBaseMixin(
    Base,
  ) {
    #activeListeners: Record<string, (options: Json) => Promise<void>> = {};

    abstract _getNetworkClientById(
      networkClientId: NetworkClientId,
    ): NetworkClient | undefined;

    _startPollingByNetworkClientId(
      networkClientId: NetworkClientId,
      options: Json,
    ) {
      const key = getKey(networkClientId, options);

      if (this.#activeListeners[key]) {
        return;
      }

      const networkClient = this._getNetworkClientById(networkClientId);
      if (networkClient && networkClient.blockTracker) {
        console.log('networkClient', networkClient);
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

    _stopPollingByPollingTokenSetId(key: PollingTokenSetId) {
      const [networkClientId] = key.split(':');
      const networkClient = this._getNetworkClientById(
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
