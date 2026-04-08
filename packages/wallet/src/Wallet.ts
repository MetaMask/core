import { Messenger } from '@metamask/messenger';
import type { Json } from '@metamask/utils';

import { initialize } from './initialization';
import { RootMessenger, WalletOptions } from './types';

export type WalletConstructorArgs = {
  state?: Record<string, Json>;
  options: WalletOptions;
};

export class Wallet {
  public messenger: RootMessenger;

  readonly #instances;

  constructor({ state = {}, options }: WalletConstructorArgs) {
    this.messenger = new Messenger({
      namespace: 'Root',
    });

    this.#instances = initialize({ state, messenger: this.messenger, options });
  }

  get state(): Record<string, unknown> {
    return Object.entries(this.#instances).reduce<Record<string, unknown>>(
      (accumulator, [key, instance]) => {
        accumulator[key] =
          instance !== null &&
          typeof instance === 'object' &&
          'state' in instance
            ? instance.state
            : null;
        return accumulator;
      },
      {},
    );
  }

  async destroy(): Promise<void> {
    await Promise.all(
      Object.values(this.#instances).map((instance) => {
        if (
          instance !== null &&
          typeof instance === 'object' &&
          'destroy' in instance &&
          typeof instance.destroy === 'function'
        ) {
          return instance.destroy();
        }
        return undefined;
      }),
    );
  }
}
