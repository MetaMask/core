import { BaseController, BaseControllerV1 } from '@metamask/base-controller';
import type { NetworkClientId } from '@metamask/network-controller';
import type { Json } from '@metamask/utils';

import {
  AbstractPollingControllerBaseMixin,
  getKey,
  parseKey,
} from './AbstractPollingController';
import type {
  Constructor,
  IPollingController,
  PollingTokenSetId,
} from './types';

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
  abstract class StaticIntervalPollingController
    extends AbstractPollingControllerBaseMixin(Base)
    implements IPollingController
  {
    readonly pollers: Record<
      PollingTokenSetId,
      { timeoutId?: NodeJS.Timeout; lastPollTime?: number }
    > = {};

    #intervalLength: number | undefined = 1000;

    isPaused = false;

    setIntervalLength(intervalLength: number) {
      this.#intervalLength = intervalLength;
    }

    getIntervalLength() {
      return this.#intervalLength;
    }

    _startPollingByNetworkClientId(
      networkClientId: NetworkClientId,
      options: Json,
    ) {
      if (!this.#intervalLength) {
        throw new Error('intervalLength must be defined and greater than 0');
      }

      const key = getKey(networkClientId, options);
      const lastPollTime = this.pollers[key]?.lastPollTime;
      this._stopPollingByPollingTokenSetId(key);

      this.pollers[key] = this.isPaused
        ? {}
        : {
            lastPollTime: Date.now(),
            timeoutId: setTimeout(
              async () => {
                try {
                  await this._executePoll(networkClientId, options);
                } catch (error) {
                  console.error(error);
                }
                this._startPollingByNetworkClientId(networkClientId, options);
              },
              lastPollTime === undefined ? 0 : this.#intervalLength,
            ),
          };
    }

    _stopPollingByPollingTokenSetId(key: PollingTokenSetId) {
      clearTimeout(this.pollers[key]?.timeoutId);
      delete this.pollers[key];
    }

    pause(): void {
      if (!this.isPaused) {
        Object.values(this.pollers).forEach((p) => clearTimeout(p.timeoutId));
        this.isPaused = true;
      }
    }

    resume(): void {
      if (this.isPaused && this.#intervalLength) {
        const keys = Object.keys(this.pollers) as PollingTokenSetId[];
        for (const key of keys) {
          const nextPoll = Math.max(
            this.#intervalLength -
              (Date.now() - (this.pollers[key]?.lastPollTime ?? 0)),
            0,
          );

          this.pollers[key] = {
            timeoutId: setTimeout(
              () => this._startPollingByNetworkClientId(...parseKey(key)),
              nextPoll,
            ),
          };
        }
        this.isPaused = false;
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
