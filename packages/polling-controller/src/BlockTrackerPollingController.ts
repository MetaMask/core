import { BaseController } from '@metamask/base-controller';
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
// This is a function that's used as class, and the return type is inferred from
// the class defined inside the function scope, so this can't be easily typed.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/naming-convention
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

    _startPolling(input: PollingInput): void {
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
          `Unable to retrieve blockTracker for networkClientId ${input.networkClientId}`,
        );
      }
    }

    _stopPollingByPollingTokenSetId(key: PollingTokenSetId): void {
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
  // The return type is inferred from the class defined inside the function
  // scope, so this can't be easily typed.
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
>() => BlockTrackerPollingControllerMixin<typeof Empty, PollingInput>(Empty);

export const BlockTrackerPollingController = <
  PollingInput extends BlockTrackerPollingInput,
  // The return type is inferred from the class defined inside the function
  // scope, so this can't be easily typed.
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
>() =>
  BlockTrackerPollingControllerMixin<typeof BaseController, PollingInput>(
    BaseController,
  );
