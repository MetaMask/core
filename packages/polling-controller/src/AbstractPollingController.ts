import type { NetworkClientId } from '@metamask/network-controller';
import type { Json } from '@metamask/utils';
import stringify from 'fast-json-stable-stringify';
import { v4 as random } from 'uuid';

import type {
  Constructor,
  PollingTokenSetId,
  IPollingController,
} from './types';

export const getKey = (
  networkClientId: NetworkClientId,
  options: Json,
): PollingTokenSetId => `${networkClientId}:${stringify(options)}`;

/**
 * AbstractPollingControllerBaseMixin
 *
 * @param Base - The base class to mix onto.
 * @returns The composed class.
 */
export function AbstractPollingControllerBaseMixin<TBase extends Constructor>(
  Base: TBase,
) {
  abstract class AbstractPollingControllerBase
    extends Base
    implements IPollingController
  {
    readonly #pollingTokenSets: Map<PollingTokenSetId, Set<string>> = new Map();

    #callbacks: Map<
      PollingTokenSetId,
      Set<(PollingTokenSetId: PollingTokenSetId) => void>
    > = new Map();

    abstract _executePoll(
      networkClientId: NetworkClientId,
      options: Json,
    ): Promise<void>;

    abstract _startPollingByNetworkClientId(
      networkClientId: NetworkClientId,
      options: Json,
    ): void;

    abstract _stopPollingByPollingTokenSetId(key: PollingTokenSetId): void;

    startPollingByNetworkClientId(
      networkClientId: NetworkClientId,
      options: Json = {},
    ): string {
      const pollToken = random();
      const key = getKey(networkClientId, options);
      const pollingTokenSet =
        this.#pollingTokenSets.get(key) ?? new Set<string>();
      pollingTokenSet.add(pollToken);
      this.#pollingTokenSets.set(key, pollingTokenSet);

      if (pollingTokenSet.size === 1) {
        this._startPollingByNetworkClientId(networkClientId, options);
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
            callback(keyToDelete);
          }
          callbacks.clear();
        }
      }
    }

    onPollingCompleteByNetworkClientId(
      networkClientId: NetworkClientId,
      callback: (networkClientId: NetworkClientId) => void,
      options: Json = {},
    ) {
      const key = getKey(networkClientId, options);
      const callbacks = this.#callbacks.get(key) ?? new Set<typeof callback>();
      callbacks.add(callback);
      this.#callbacks.set(key, callbacks);
    }
  }
  return AbstractPollingControllerBase;
}
