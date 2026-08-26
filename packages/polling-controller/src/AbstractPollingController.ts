import type { Json } from '@metamask/utils';
import stringify from 'fast-json-stable-stringify';
import { v4 as random } from 'uuid';

import type {
  Constructor,
  PollingTokenSetId,
  IPollingController,
} from './types.js';

export const getKey = <PollingInput>(input: PollingInput): PollingTokenSetId =>
  stringify(input);

/**
 * AbstractPollingControllerBaseMixin
 *
 * @param Base - The base class to mix onto.
 * @returns The composed class.
 */
export function AbstractPollingControllerBaseMixin<
  TBase extends Constructor,
  PollingInput extends Json,
>(Base: TBase) {
  abstract class AbstractPollingControllerBase
    extends Base
    implements IPollingController<PollingInput>
  {
    // These fields are public (rather than using `#`) so that declaration
    // emission can describe them. Private/protected members on the class
    // returned by an exported mixin function trigger TS4094, and giving the
    // mixin an explicit return type to work around that breaks consumers
    // that supply the base class's own type arguments via
    // `SomeMixin()<Name, State, Messenger>`. The leading underscore signals
    // "internal, do not use" without needing true privacy.
    readonly _pollingTokenSets: Map<PollingTokenSetId, Set<string>> = new Map();

    readonly _callbacks: Map<
      PollingTokenSetId,
      Set<(input: PollingInput) => void>
    > = new Map();

    abstract _executePoll(input: PollingInput): Promise<void>;

    abstract _startPolling(input: PollingInput): void;

    abstract _stopPollingByPollingTokenSetId(key: PollingTokenSetId): void;

    startPolling(input: PollingInput): string {
      const pollToken = random();
      const key = getKey(input);
      const pollingTokenSet =
        this._pollingTokenSets.get(key) ?? new Set<string>();
      pollingTokenSet.add(pollToken);
      this._pollingTokenSets.set(key, pollingTokenSet);

      if (pollingTokenSet.size === 1) {
        this._startPolling(input);
      }

      return pollToken;
    }

    stopAllPolling() {
      this._pollingTokenSets.forEach((tokenSet, _key) => {
        tokenSet.forEach((token) => {
          this.stopPollingByPollingToken(token);
        });
      });
    }

    stopPollingByPollingToken(pollingToken: string) {
      if (!pollingToken) {
        throw new Error('pollingToken required');
      }

      let keyToDelete: PollingTokenSetId | null = null;
      for (const [key, tokenSet] of this._pollingTokenSets) {
        if (tokenSet.delete(pollingToken)) {
          if (tokenSet.size === 0) {
            keyToDelete = key;
          }
          break;
        }
      }

      if (keyToDelete) {
        this._stopPollingByPollingTokenSetId(keyToDelete);
        this._pollingTokenSets.delete(keyToDelete);
        const callbacks = this._callbacks.get(keyToDelete);
        if (callbacks) {
          for (const callback of callbacks) {
            callback(JSON.parse(keyToDelete));
          }
          callbacks.clear();
        }
      }
    }

    onPollingComplete(
      input: PollingInput,
      callback: (input: PollingInput) => void,
    ) {
      const key = getKey(input);
      const callbacks = this._callbacks.get(key) ?? new Set<typeof callback>();
      callbacks.add(callback);
      this._callbacks.set(key, callbacks);
    }
  }
  return AbstractPollingControllerBase;
}
