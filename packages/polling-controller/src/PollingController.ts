import { BaseController, BaseControllerV2 } from '@metamask/base-controller';
import type { NetworkClientId } from '@metamask/network-controller';
import type { Json } from '@metamask/utils';
import stringify from 'fast-json-stable-stringify';
import { v4 as random } from 'uuid';

// Mixin classes require a constructor with an `...any[]` parameter
// See TS2545
type Constructor = new (...args: any[]) => object;

/**
 * Returns a unique key for a networkClientId and options. This is used to group networkClientId polls with the same options
 * @param networkClientId - The networkClientId to get a key for
 * @param options - The options used to group the polling events
 * @returns The unique key
 */
export const getKey = (
  networkClientId: NetworkClientId,
  options: Json,
): PollingTokenSetId => `${networkClientId}:${stringify(options)}`;

type PollingTokenSetId = `${NetworkClientId}:${string}`;
/**
 * PollingControllerMixin
 *
 * @param Base - The base class to mix onto.
 * @returns The composed class.
 */
function PollingControllerMixin<TBase extends Constructor>(Base: TBase) {
  /**
   * PollingController is an abstract class that implements the polling
   * functionality for a controller. It is meant to be extended by a controller
   * that needs to poll for data by networkClientId.
   *
   */
  abstract class PollingControllerBase extends Base {
    readonly #pollingTokenSets: Map<PollingTokenSetId, Set<string>> = new Map();

    readonly #intervalIds: Record<PollingTokenSetId, NodeJS.Timeout> = {};

    #callbacks: Map<
      NetworkClientId,
      Set<(networkClientId: NetworkClientId) => void>
    > = new Map();

    #intervalLength = 1000;

    getIntervalLength() {
      return this.#intervalLength;
    }

    /**
     * Sets the length of the polling interval
     *
     * @param length - The length of the polling interval in milliseconds
     */
    setIntervalLength(length: number) {
      this.#intervalLength = length;
    }

    /**
     * Starts polling for a networkClientId
     *
     * @param networkClientId - The networkClientId to start polling for
     * @param options - The options used to group the polling events
     * @returns void
     */
    startPollingByNetworkClientId(
      networkClientId: NetworkClientId,
      options: Json = {},
    ) {
      const pollToken = random();

      const key = getKey(networkClientId, options);

      const pollingTokenSet = this.#pollingTokenSets.get(key);
      if (pollingTokenSet) {
        pollingTokenSet.add(pollToken);
      } else {
        const set = new Set<string>();
        set.add(pollToken);
        this.#pollingTokenSets.set(key, set);
      }
      this.#poll(networkClientId, options);
      return pollToken;
    }

    /**
     * Stops polling for all networkClientIds
     */
    stopAllPolling() {
      this.#pollingTokenSets.forEach((tokenSet, _networkClientId) => {
        tokenSet.forEach((token) => {
          this.stopPollingByPollingToken(token);
        });
      });
    }

    /**
     * Stops polling for a networkClientId
     *
     * @param pollingToken - The polling token to stop polling for
     */
    stopPollingByPollingToken(pollingToken: string) {
      if (!pollingToken) {
        throw new Error('pollingToken required');
      }
      let found = false;
      this.#pollingTokenSets.forEach((tokenSet, key) => {
        if (tokenSet.has(pollingToken)) {
          found = true;
          tokenSet.delete(pollingToken);
          if (tokenSet.size === 0) {
            clearTimeout(this.#intervalIds[key]);
            delete this.#intervalIds[key];
            this.#pollingTokenSets.delete(key);
            this.#callbacks.get(key)?.forEach((callback) => {
              callback(key);
            });
            this.#callbacks.get(key)?.clear();
          }
        }
      });
      if (!found) {
        throw new Error('pollingToken not found');
      }
    }

    /**
     * Executes the poll for a networkClientId
     *
     * @param networkClientId - The networkClientId to execute the poll for
     * @param options - The options passed to startPollingByNetworkClientId
     */
    abstract _executePoll(
      networkClientId: NetworkClientId,
      options: Json,
    ): Promise<void>;

    #poll(networkClientId: NetworkClientId, options: Json) {
      const key = getKey(networkClientId, options);
      if (this.#intervalIds[key]) {
        clearTimeout(this.#intervalIds[key]);
        delete this.#intervalIds[key];
      }
      // setTimeout is not `await`ing this async function, which is expected
      // We're just using async here for improved stack traces
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.#intervalIds[key] = setTimeout(async () => {
        try {
          await this._executePoll(networkClientId, options);
        } catch (error) {
          console.error(error);
        }
        this.#poll(networkClientId, options);
      }, this.#intervalLength);
    }

    /**
     * Adds a callback to execute when polling is complete
     *
     * @param networkClientId - The networkClientId to listen for polling complete events
     * @param callback - The callback to execute when polling is complete
     * @param options - The options used to group the polling events
     */
    onPollingCompleteByNetworkClientId(
      networkClientId: NetworkClientId,
      callback: (networkClientId: NetworkClientId) => void,
      options: Json = {},
    ) {
      const key = getKey(networkClientId, options);
      const callbacks = this.#callbacks.get(key);

      if (callbacks === undefined) {
        const set = new Set<typeof callback>();
        set.add(callback);
        this.#callbacks.set(key, set);
      } else {
        callbacks.add(callback);
      }
    }
  }
  return PollingControllerBase;
}

export const PollingController = PollingControllerMixin(BaseControllerV2);
export const PollingControllerV1 = PollingControllerMixin(BaseController);
