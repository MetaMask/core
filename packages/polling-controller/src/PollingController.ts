import { BaseControllerV2 } from '@metamask/base-controller';
import type {
  RestrictedControllerMessenger,
  StateMetadata,
} from '@metamask/base-controller';
import type { NetworkClientId } from '@metamask/network-controller';
import type { Json } from '@metamask/utils';
import { v1 as random } from 'uuid';

export type PollingCompleteType<N extends string> = {
  type: `${N}:pollingComplete`;
  payload: [string];
};

/**
 * PollingController is an abstract class that implements the polling
 * functionality for a controller. It is meant to be extended by a controller
 * that needs to poll for data by networkClientId.
 *
 */
export default abstract class PollingController<
  Name extends string,
  State extends Record<string, Json>,
  messenger extends RestrictedControllerMessenger<
    Name,
    any,
    PollingCompleteType<Name> | any,
    string,
    string
  >,
> extends BaseControllerV2<Name, State, messenger> {
  readonly #intervalLength: number;

  private readonly networkClientIdTokensMap: Map<NetworkClientId, Set<string>> =
    new Map();

  private readonly intervalIds: Record<NetworkClientId, NodeJS.Timeout> = {};

  constructor({
    name,
    state,
    messenger,
    metadata,
    pollingIntervalLength,
  }: {
    name: Name;
    state: State;
    metadata: StateMetadata<State>;
    messenger: messenger;
    pollingIntervalLength: number;
  }) {
    super({
      name,
      state,
      messenger,
      metadata,
    });

    if (!pollingIntervalLength) {
      throw new Error('pollingIntervalLength required for PollingController');
    }

    this.#intervalLength = pollingIntervalLength;
  }

  /**
   * Starts polling for a networkClientId
   *
   * @param networkClientId - The networkClientId to start polling for
   * @returns void
   */
  start(networkClientId: NetworkClientId) {
    const innerPollToken = random();
    if (this.networkClientIdTokensMap.has(networkClientId)) {
      const set = this.networkClientIdTokensMap.get(networkClientId);
      set?.add(innerPollToken);
    } else {
      const set = new Set<string>();
      set.add(innerPollToken);
      this.networkClientIdTokensMap.set(networkClientId, set);
    }
    this.#poll(networkClientId);
    return innerPollToken;
  }

  /**
   * Stops polling for all networkClientIds
   */
  stopAll() {
    this.networkClientIdTokensMap.forEach((tokens, _networkClientId) => {
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
    this.networkClientIdTokensMap.forEach((tokens, networkClientId) => {
      if (tokens.has(pollingToken)) {
        found = true;
        this.networkClientIdTokensMap
          .get(networkClientId)
          ?.delete(pollingToken);
        if (this.networkClientIdTokensMap.get(networkClientId)?.size === 0) {
          clearTimeout(this.intervalIds[networkClientId]);
          delete this.intervalIds[networkClientId];
          this.networkClientIdTokensMap.delete(networkClientId);
          this.messagingSystem.publish(
            `${this.name}:pollingComplete`,
            networkClientId,
          );
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
    if (this.intervalIds[networkClientId]) {
      clearTimeout(this.intervalIds[networkClientId]);
      delete this.intervalIds[networkClientId];
    }
    this.intervalIds[networkClientId] = setTimeout(async () => {
      try {
        await this.executePoll(networkClientId);
      } catch (error) {
        console.error(error);
      }
      this.#poll(networkClientId);
    }, this.#intervalLength);
  }
}
