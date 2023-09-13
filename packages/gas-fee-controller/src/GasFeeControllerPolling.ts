import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseControllerV2 } from '@metamask/base-controller';
import { safelyExecute } from '@metamask/controller-utils';
import type { NetworkClientId } from '@metamask/network-controller';
import type { Json } from '@metamask/utils';
import { v1 as random } from 'uuid';

export default abstract class GasFeeControllerPolling<
  N extends string,
  S extends Record<string, Json>,
  messenger extends RestrictedControllerMessenger<N, any, any, string, string>
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

  stop({
    pollingToken,
    networkClientId,
  }: {
    pollingToken?: string;
    networkClientId?: NetworkClientId;
  } = {}) {
    if (pollingToken && !networkClientId) {
      throw new Error(
        'networkClientId is required when pollingToken is passed',
      );
    }
    if (!pollingToken || !networkClientId) {
      this.networkClientIdTokensMap.forEach((tokens, _networkClientId) => {
        tokens.forEach((token) => {
          this.stop({
            pollingToken: token,
            networkClientId: _networkClientId,
          });
        });
      });
      return;
    }
    this.networkClientIdTokensMap.get(networkClientId)?.delete(pollingToken);
    if (this.networkClientIdTokensMap.get(networkClientId)?.size === 0) {
      clearInterval(this.intervalIds[networkClientId]);
      delete this.intervalIds[networkClientId];
      this.networkClientIdTokensMap.delete(networkClientId);
    }
  }

  abstract executePoll(networkClientId: NetworkClientId): Promise<void>;

  #poll(networkClientId: NetworkClientId) {
    if (this.intervalIds[networkClientId]) {
      clearInterval(this.intervalIds[networkClientId]);
    }

    // get the poll tokens from the poll tokens map
    const tokens = this.networkClientIdTokensMap.get(networkClientId);
    if (tokens && tokens.size > 0) {
      this.intervalIds[networkClientId] = setInterval(async () => {
        await safelyExecute(() => this.executePoll(networkClientId));
      }, this.intervalLength);
    }

    // call _poll with the poll tokens
  }
}
