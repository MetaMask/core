import { Messenger } from '@metamask/messenger';
import type { Json } from '@metamask/utils';

import { initialize } from './initialization';
import { RootMessenger } from './types';

export type WalletArgs = {
  state: Json;
};

export class Wallet {
  public messenger: RootMessenger;

  readonly #instances;

  constructor({ state = {} } = {}) {
    this.messenger = new Messenger({
      namespace: 'Root',
    });

    this.#instances = initialize({ state, messenger: this.messenger });
  }

  get state(): Record<string, unknown> {
    return Object.entries(this.#instances).reduce<Record<string, unknown>>(
      (accumulator, [key, instance]) => {
        accumulator[key] = instance.state ?? null;
        return accumulator;
      },
      {},
    );
  }
}
