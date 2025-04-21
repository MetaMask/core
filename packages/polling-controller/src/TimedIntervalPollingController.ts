import { BaseController } from '@metamask/base-controller';
import type { Json } from '@metamask/utils';

import {
  AbstractPollingControllerBaseMixin,
  getKey,
} from './AbstractPollingController';
import type {
  Constructor,
  IPollingController,
  PollingTokenSetId,
} from './types';

/**
 * TimedIntervalPollingControllerMixin
 * A polling controller that polls on a static interval for a duration of time.
 * You will set the interval length (poll every interval of time) and a total duration of time (poll for a duration of time).
 *
 * @param Base - The base class to mix onto.
 * @returns The composed class.
 */
function TimedIntervalPollingControllerMixin<
  TBase extends Constructor,
  PollingInput extends Json,
>(Base: TBase) {
  abstract class TimedIntervalPollingController
    extends AbstractPollingControllerBaseMixin<TBase, PollingInput>(Base)
    implements IPollingController<PollingInput>
  {
    readonly #intervalIds: Record<PollingTokenSetId, NodeJS.Timeout> = {};

    #durationIds: Record<PollingTokenSetId, number> = {};

    #intervalLength: number | undefined = 1000;

    setIntervalLength(intervalLength: number) {
      this.#intervalLength = intervalLength;
    }

    getIntervalLength() {
      return this.#intervalLength;
    }

    setKeyDuration(key: string, duration: number) {
      this.#durationIds[key] = duration;
    }

    getKeyDuration(key: string) {
      return this.#durationIds[key];
    }

    getDurationToPoll() {
      return this.#intervalLength;
    }

    _startPolling(input: PollingInput) {
      if (!this.#intervalLength) {
        throw new Error('intervalLength must be defined and greater than 0');
      }

      const key = getKey(input);
      const existingInterval = this.#intervalIds[key];
      this._stopPollingByPollingTokenSetId(key);

      // eslint-disable-next-line no-multi-assign
      const intervalId = (this.#intervalIds[key] = setTimeout(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async () => {
          if (this.#durationIds[key] && Date.now() >= this.#durationIds[key]) {
            this._stopPollingByPollingTokenSetId(key);
            delete this.#durationIds[key];
            return;
          }

          try {
            await this._executePoll(input);
          } catch (error) {
            console.error(error);
          }
          if (intervalId === this.#intervalIds[key]) {
            this._startPolling(input);
          }
        },
        existingInterval ? this.#intervalLength : 0,
      ));
    }

    _stopPollingByPollingTokenSetId(key: PollingTokenSetId) {
      const intervalId = this.#intervalIds[key];
      if (intervalId) {
        clearTimeout(intervalId);
        delete this.#intervalIds[key];
      }
    }
  }

  return TimedIntervalPollingController;
}

class Empty {}

export const TimedIntervalPollingControllerOnly = <
  PollingInput extends Json,
>() => TimedIntervalPollingControllerMixin<typeof Empty, PollingInput>(Empty);

export const TimedIntervalPollingController = <PollingInput extends Json>() =>
  TimedIntervalPollingControllerMixin<typeof BaseController, PollingInput>(
    BaseController,
  );
