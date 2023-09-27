import { BaseController, BaseControllerV2 } from '@metamask/base-controller';
import type { NetworkClientId } from '@metamask/network-controller';
import { v4 as random } from 'uuid';

export type PollingCompleteType<N extends string> = {
  type: `${N}:pollingComplete`;
  payload: [string];
};

type Constructor = new (...args: any[]) => {};

/**
 * PollingControllerMixin
 *
 * @param Base - The base class to mix onto.
 * @returns The mixin.
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
      this.#intervalIds[networkClientId] = setTimeout(async () => {
        try {
          await this.executePoll(networkClientId);
        } catch (error) {
          console.error(error);
        }
        this.#poll(networkClientId);
      }, this.#intervalLength);
    }

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
