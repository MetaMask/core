import type { Json } from '@metamask/utils';
import stringify from 'fast-json-stable-stringify';
import { v4 as random } from 'uuid';

import type {
  Constructor,
  PollingTokenSetId,
  IPollingController,
} from './types';

export const getKey = <PollingInput>(input: PollingInput): PollingTokenSetId =>
  stringify(input);

/**
 * AbstractPollingControllerBaseMixin
 *
 * @param Base - The base class to mix onto.
 * @returns The composed class.
 */
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
export function AbstractPollingControllerBaseMixin<
  TBase extends Constructor,
  PollingInput extends Json,
>(Base: TBase) {
  abstract class AbstractPollingControllerBase
    extends Base
    implements IPollingController<PollingInput>
  {
    readonly #pollingTokenSets: Map<PollingTokenSetId, Set<string>> = new Map();

    #callbacks: Map<PollingTokenSetId, Set<(input: PollingInput) => void>> =
      new Map();

    abstract _executePoll(input: PollingInput): Promise<void>;

    abstract _startPolling(input: PollingInput): void;

    abstract _stopPollingByPollingTokenSetId(key: PollingTokenSetId): void;

    startPolling(input: PollingInput): string {
      const pollToken = random();
      const key = getKey(input);
      const pollingTokenSet =
        this.#pollingTokenSets.get(key) ?? new Set<string>();
      pollingTokenSet.add(pollToken);
      this.#pollingTokenSets.set(key, pollingTokenSet);

      if (pollingTokenSet.size === 1) {
        this._startPolling(input);
      }

      return pollToken;
    }

    stopAllPolling() {
      this.#pollingTokenSets.forEach((tokenSet, _key) => {
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
      for (const [key, tokenSet] of this.#pollingTokenSets) {
        if (tokenSet.delete(pollingToken)) {
          if (tokenSet.size === 0) {
            keyToDelete = key;
          }
          break;
        }
      }

      if (keyToDelete) {
        this._stopPollingByPollingTokenSetId(keyToDelete);
        this.#pollingTokenSets.delete(keyToDelete);
        const callbacks = this.#callbacks.get(keyToDelete);
        if (callbacks) {
          for (const callback of callbacks) {
            // eslint-disable-next-line n/callback-return
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
      const callbacks = this.#callbacks.get(key) ?? new Set<typeof callback>();
      callbacks.add(callback);
      this.#callbacks.set(key, callbacks);
    }
  }
  return AbstractPollingControllerBase;
}
