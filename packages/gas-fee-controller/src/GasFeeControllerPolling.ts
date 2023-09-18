import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseControllerV2 } from '@metamask/base-controller';
import { safelyExecute, safelyExecuteWithTimeout } from '@metamask/controller-utils';
import type { NetworkClientId } from '@metamask/network-controller';
import type { Json } from '@metamask/utils';
import { v1 as random } from 'uuid';

export type PollingCompleteType<N extends string> = {
  type: `${N}:pollingComplete`;
  payload: [string];
};

export default abstract class GasFeeControllerPolling<
  N extends string,
  S extends Record<string, Json>,
  messenger extends RestrictedControllerMessenger<
    N,
    any,
    PollingCompleteType<N> | any,
    string,
    string
  >,
> extends BaseControllerV2<N, S, messenger> {
  private readonly intervalLength = 1000;

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

    // call _poll
    // add the inner poll token to the poll tokens set
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
    console.log('inside poll');
    if (this.intervalIds[networkClientId]) {
      clearTimeout(this.intervalIds[networkClientId]);
    }

    this.intervalIds[networkClientId] = setTimeout(async () => {
      console.log('before safelyExecute')
      await safelyExecuteWithTimeout(() => this.executePoll(networkClientId));
      console.log('after safelyExecute')
      this.#poll(networkClientId);
    }, this.intervalLength);

    // call _poll with the poll tokens
  }
}
