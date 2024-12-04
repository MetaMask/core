import { BaseController, BaseControllerV1 } from '@metamask/base-controller';
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
 * StaticIntervalPollingControllerMixin
 * A polling controller that polls on a static interval.
 *
 * @param Base - The base class to mix onto.
 * @returns The composed class.
 */
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
function StaticIntervalPollingControllerMixin<
  TBase extends Constructor,
  PollingInput extends Json,
>(Base: TBase) {
  abstract class StaticIntervalPollingController
    extends AbstractPollingControllerBaseMixin<TBase, PollingInput>(Base)
    implements IPollingController<PollingInput>
  {
    readonly #intervalIds: Record<PollingTokenSetId, NodeJS.Timeout> = {};

    #intervalLength: number | undefined = 1000;

    setIntervalLength(intervalLength: number) {
      this.#intervalLength = intervalLength;
    }

    getIntervalLength() {
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

  return StaticIntervalPollingController;
}

class Empty {}

export const StaticIntervalPollingControllerOnly = <
  PollingInput extends Json,
>() => StaticIntervalPollingControllerMixin<typeof Empty, PollingInput>(Empty);

export const StaticIntervalPollingController = <PollingInput extends Json>() =>
  StaticIntervalPollingControllerMixin<typeof BaseController, PollingInput>(
    BaseController,
  );

export const StaticIntervalPollingControllerV1 = <
  PollingInput extends Json,
>() =>
  StaticIntervalPollingControllerMixin<typeof BaseControllerV1, PollingInput>(
    BaseControllerV1,
  );
