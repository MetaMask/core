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
import type { Constructor, PollingTokenSetId } from './types';

/**
 * The minimum input required to start polling for a {@link BlockTrackerPollingController}.
 * Implementing classes may provide additional properties.
 */
export type BlockTrackerPollingInput = {
  networkClientId: NetworkClientId;
};

/**
 * BlockTrackerPollingControllerMixin
 * A polling controller that polls using a block tracker.
 *
 * @param Base - The base class to mix onto.
 * @returns The composed class.
 */
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
function BlockTrackerPollingControllerMixin<
  TBase extends Constructor,
  PollingInput extends BlockTrackerPollingInput,
>(Base: TBase) {
  abstract class BlockTrackerPollingController extends AbstractPollingControllerBaseMixin<
    TBase,
    PollingInput
  >(Base) {
    #activeListeners: Record<string, (options: Json) => Promise<void>> = {};

    abstract _getNetworkClientById(
      networkClientId: NetworkClientId,
    ): NetworkClient | undefined;

    _startPolling(input: PollingInput) {
      const key = getKey(input);

      if (this.#activeListeners[key]) {
        return;
      }

      const networkClient = this._getNetworkClientById(input.networkClientId);
      if (networkClient) {
        const updateOnNewBlock = this._executePoll.bind(this, input);
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        networkClient.blockTracker.addListener('latest', updateOnNewBlock);
        this.#activeListeners[key] = updateOnNewBlock;
      } else {
        throw new Error(
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Unable to retrieve blockTracker for networkClientId ${input.networkClientId}`,
        );
      }
    }

    _stopPollingByPollingTokenSetId(key: PollingTokenSetId) {
      const { networkClientId } = JSON.parse(key);
      const networkClient = this._getNetworkClientById(
        networkClientId as NetworkClientId,
      );

      if (networkClient && this.#activeListeners[key]) {
        const listener = this.#activeListeners[key];
        if (listener) {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          networkClient.blockTracker.removeListener('latest', listener);
          delete this.#activeListeners[key];
        }
      }
    }
  }

  return BlockTrackerPollingController;
}

class Empty {}

export const BlockTrackerPollingControllerOnly = <
  PollingInput extends BlockTrackerPollingInput,
>() => BlockTrackerPollingControllerMixin<typeof Empty, PollingInput>(Empty);

export const BlockTrackerPollingController = <
  PollingInput extends BlockTrackerPollingInput,
>() =>
  BlockTrackerPollingControllerMixin<typeof BaseController, PollingInput>(
    BaseController,
  );

export const BlockTrackerPollingControllerV1 = <
  PollingInput extends BlockTrackerPollingInput,
>() =>
  BlockTrackerPollingControllerMixin<typeof BaseControllerV1, PollingInput>(
    BaseControllerV1,
  );
