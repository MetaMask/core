import { BaseController } from '@metamask/base-controller';
import type { Json } from '@metamask/utils';

import {
  AbstractPollingControllerBaseMixin,
  getKey,
} from './AbstractPollingController.js';
import type {
  Constructor,
  IPollingController,
  PollingTokenSetId,
} from './types.js';

/**
 * StaticIntervalPollingControllerMixin
 * A polling controller that polls on a static interval.
 *
 * @param Base - The base class to mix onto.
 * @returns The composed class.
 */
// This is a function that's used as class, and the return type is inferred from
// the class defined inside the function scope, so this can't be easily typed.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/naming-convention
function StaticIntervalPollingControllerMixin<
  TBase extends Constructor,
  PollingInput extends Json,
>(Base: TBase) {
  abstract class StaticIntervalPollingController
    extends AbstractPollingControllerBaseMixin<TBase, PollingInput>(Base)
    implements IPollingController<PollingInput>
  {
    // These fields are public (rather than using `#`) so that declaration
    // emission can describe them. Private/protected members on the class
    // returned by an exported mixin function trigger TS4094, and giving the
    // mixin an explicit return type to work around that breaks consumers
    // that supply the base class's own type arguments via
    // `StaticIntervalPollingController()<Name, State, Messenger>`. The
    // leading underscore signals "internal, do not use" without needing
    // true privacy.
    readonly _intervalIds: Record<PollingTokenSetId, NodeJS.Timeout> = {};

    _intervalLength: number | undefined = 1000;

    setIntervalLength(intervalLength: number): void {
      this._intervalLength = intervalLength;
    }

    getIntervalLength(): number | undefined {
      return this._intervalLength;
    }

    _startPolling(input: PollingInput): void {
      if (!this._intervalLength) {
        throw new Error('intervalLength must be defined and greater than 0');
      }

      const key = getKey(input);
      const existingInterval = this._intervalIds[key];
      this._stopPollingByPollingTokenSetId(key);

      // eslint-disable-next-line no-multi-assign
      const intervalId = (this._intervalIds[key] = setTimeout(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async () => {
          try {
            await this._executePoll(input);
          } catch (error) {
            console.error(error);
          }
          if (intervalId === this._intervalIds[key]) {
            this._startPolling(input);
          }
        },
        existingInterval ? this._intervalLength : 0,
      ));
    }

    _stopPollingByPollingTokenSetId(key: PollingTokenSetId): void {
      const intervalId = this._intervalIds[key];
      if (intervalId) {
        clearTimeout(intervalId);
        delete this._intervalIds[key];
      }
    }
  }

  return StaticIntervalPollingController;
}

class Empty {}

export const StaticIntervalPollingControllerOnly = <
  PollingInput extends Json,
  // The return type is inferred from the class defined inside the function
  // scope, so this can't be easily typed.
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
>() => StaticIntervalPollingControllerMixin<typeof Empty, PollingInput>(Empty);

// The return type is inferred from the class defined inside the function
// scope, so this can't be easily typed.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const StaticIntervalPollingController = <PollingInput extends Json>() =>
  StaticIntervalPollingControllerMixin<typeof BaseController, PollingInput>(
    BaseController,
  );
