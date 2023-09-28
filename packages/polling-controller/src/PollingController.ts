import { BaseController, BaseControllerV2 } from '@metamask/base-controller';
import type { NetworkClientId } from '@metamask/network-controller';
import { v4 as random } from 'uuid';

// Mixin classes require a constructor with an `...any[]` parameter
// See TS2545
type Constructor = new (...args: any[]) => object;

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
    readonly #networkClientIdTokensMap: Map<NetworkClientId, Set<string>> =
      new Map();

    readonly #intervalIds: Record<NetworkClientId, NodeJS.Timeout> = {};

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
     * @returns void
     */
    start(networkClientId: NetworkClientId) {
      const innerPollToken = random();
      if (this.#networkClientIdTokensMap.has(networkClientId)) {
        const set = this.#networkClientIdTokensMap.get(networkClientId);
        set?.add(innerPollToken);
      } else {
        const set = new Set<string>();
        set.add(innerPollToken);
        this.#networkClientIdTokensMap.set(networkClientId, set);
      }
      this.#poll(networkClientId);
      return innerPollToken;
    }

    /**
     * Stops polling for all networkClientIds
     */
    stopAll() {
      this.#networkClientIdTokensMap.forEach((tokens, _networkClientId) => {
        tokens.forEach((token) => {
          this.stop(token);
        });
      });
    }

    /**
     * Stops polling for a networkClientId
     *
     * @param pollingToken - The polling token to stop polling for
     */
    stop(pollingToken: string) {
      if (!pollingToken) {
        throw new Error('pollingToken required');
      }
      let found = false;
      this.#networkClientIdTokensMap.forEach((tokens, networkClientId) => {
        if (tokens.has(pollingToken)) {
          found = true;
          this.#networkClientIdTokensMap
            .get(networkClientId)
            ?.delete(pollingToken);
          if (this.#networkClientIdTokensMap.get(networkClientId)?.size === 0) {
            clearTimeout(this.#intervalIds[networkClientId]);
            delete this.#intervalIds[networkClientId];
            this.#networkClientIdTokensMap.delete(networkClientId);
            this.#callbacks.get(networkClientId)?.forEach((callback) => {
              callback(networkClientId);
            });
            this.#callbacks.get(networkClientId)?.clear();
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
     */
    abstract executePoll(networkClientId: NetworkClientId): Promise<void>;

    #poll(networkClientId: NetworkClientId) {
      if (this.#intervalIds[networkClientId]) {
        clearTimeout(this.#intervalIds[networkClientId]);
        delete this.#intervalIds[networkClientId];
      }
      // setTimeout is not `await`ing this async function, which is expected
      // We're just using async here for improved stack traces
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.#intervalIds[networkClientId] = setTimeout(async () => {
        try {
          await this.executePoll(networkClientId);
        } catch (error) {
          console.error(error);
        }
        this.#poll(networkClientId);
      }, this.#intervalLength);
    }

    /**
     * Adds a callback to execute when polling is complete
     *
     * @param networkClientId - The networkClientId to listen for polling complete events
     * @param callback - The callback to execute when polling is complete
     */
    onPollingComplete(
      networkClientId: NetworkClientId,
      callback: (networkClientId: NetworkClientId) => void,
    ) {
      if (this.#callbacks.has(networkClientId)) {
        this.#callbacks.get(networkClientId)?.add(callback);
      } else {
        const set = new Set<typeof callback>();
        set.add(callback);
        this.#callbacks.set(networkClientId, set);
      }
    }
  }
  return PollingControllerBase;
}

export const PollingController = PollingControllerMixin(BaseControllerV2);
export const PollingControllerV1 = PollingControllerMixin(BaseController);
