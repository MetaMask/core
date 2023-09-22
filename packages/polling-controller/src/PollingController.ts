import { BaseControllerV2 } from '@metamask/base-controller';
import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import type { NetworkClientId } from '@metamask/network-controller';
import type { Json } from '@metamask/utils';
import { v1 as random } from 'uuid';

export type PollingCompleteType<N extends string> = {
  type: `${N}:pollingComplete`;
  payload: [string];
};

export default abstract class ControllerPolling<
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
  readonly #intervalLength = 1000;

  private readonly networkClientIdTokensMap: Map<NetworkClientId, Set<string>> =
    new Map();

  private readonly intervalIds: Record<NetworkClientId, NodeJS.Timeout> = {};

  start(networkClientId: NetworkClientId) {
    const innerPollToken = random();
    if (this.networkClientIdTokensMap.has(networkClientId)) {
      //
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

  stopAll() {
    this.networkClientIdTokensMap.forEach((tokens, _networkClientId) => {
      tokens.forEach((token) => {
        this.stop(token);
      });
    });
  }

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
