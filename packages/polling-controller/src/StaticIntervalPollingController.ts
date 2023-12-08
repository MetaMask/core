import { BaseController, BaseControllerV1 } from '@metamask/base-controller';
import type { NetworkClientId } from '@metamask/network-controller';
import type { Json } from '@metamask/utils';

import {
  AbstractPollingControllerBaseMixin,
  getKey,
} from './AbstractPollingController';
import type { PollingTokenSetId } from './AbstractPollingController';

type Constructor = new (...args: any[]) => object;

/**
 * StaticIntervalPollingControllerMixin
 * A polling controller that polls on a static interval.
 *
 * @param Base - The base class to mix onto.
 * @returns The composed class.
 */
function StaticIntervalPollingControllerMixin<TBase extends Constructor>(
  Base: TBase,
) {
  abstract class StaticIntervalPollingController extends AbstractPollingControllerBaseMixin(
    Base,
  ) {
    readonly #intervalIds: Record<PollingTokenSetId, NodeJS.Timeout> = {};

    abstract _intervalLength: number;

    getIntervalLength() {
      return this._intervalLength;
    }

    _startPollingByNetworkClientId(
      networkClientId: NetworkClientId,
      options: Json,
    ) {
      const key = getKey(networkClientId, options);
      const existingInterval = this.#intervalIds[key];
      this._stopPollingByPollingTokenSetId(key);

      this.#intervalIds[key] = setTimeout(
        async () => {
          try {
            await this._executePoll(networkClientId, options);
          } catch (error) {
            console.error(error);
          }
          this._startPollingByNetworkClientId(networkClientId, options);
        },
        existingInterval ? this._intervalLength : 0,
      );
    }

    _stopPollingByPollingTokenSetId(key: PollingTokenSetId) {
      const intervalId = this.#intervalIds[key];
      if (intervalId) {
        clearTimeout(intervalId);
        delete this.#intervalIds[key];
      }
    }
  }

  return StaticIntervalPollingController;
}

class Empty {}

export const StaticIntervalPollingControllerOnly =
  StaticIntervalPollingControllerMixin(Empty);
export const StaticIntervalPollingController =
  StaticIntervalPollingControllerMixin(BaseController);
export const StaticIntervalPollingControllerV1 =
  StaticIntervalPollingControllerMixin(BaseControllerV1);
