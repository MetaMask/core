import { BaseController, BaseControllerV1 } from '@metamask/base-controller';
import type { NetworkClientId } from '@metamask/network-controller';
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
function StaticIntervalPollingControllerMixin<TBase extends Constructor>(
  Base: TBase,
) {
  abstract class StaticIntervalPollingController extends PollingControllerBaseMixin(
    Base,
  ) {
    readonly #intervalIds: Record<PollingTokenSetId, NodeJS.Timeout> = {};

    constructor() {
      super();
      this.setPollingStrategy({
        start: (networkClientId: NetworkClientId, options: Json) =>
          this.startStaticIntervalPolling(networkClientId, options),
        stop: (key: PollingTokenSetId) => this.stopStaticIntervalPolling(key),
      });
    }

    abstract _executePoll(
      networkClientId: NetworkClientId,
      options: Json,
    ): Promise<void>;

    abstract getIntervalLength(): number;

    startStaticIntervalPolling(
      networkClientId: NetworkClientId,
      options: Json,
    ) {
      const key = getKey(networkClientId, options);

      if (!this.#intervalIds[key]) {
        this.#intervalIds[key] = setInterval(() => {
          this._executePoll(networkClientId, options).catch(console.error);
        }, this.getIntervalLength());
      }
    }

    stopStaticIntervalPolling(key: PollingTokenSetId) {
      const intervalId = this.#intervalIds[key];
      if (intervalId) {
        clearInterval(intervalId);
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
