import { Messenger } from '@metamask/messenger';
import type { Json } from '@metamask/utils';

import type {
  DefaultActions,
  DefaultEvents,
  DefaultInstances,
  DefaultState,
  RootMessenger,
} from './initialization';
import { initialize } from './initialization';
import type { WalletOptions } from './types';

export type WalletConstructorArgs = {
  state?: Record<string, Json>;
  options: WalletOptions;
};

export class Wallet {
  // TODO: Expand types when passing additionalConfigurations.
  public readonly messenger: RootMessenger<DefaultActions, DefaultEvents>;

  readonly #instances: DefaultInstances;

  constructor({ state = {}, options }: WalletConstructorArgs) {
    this.messenger = new Messenger({
      namespace: 'Root',
    });

    this.#instances = initialize({ state, messenger: this.messenger, options });
  }

  get state(): DefaultState {
    return Object.entries(this.#instances).reduce<Record<string, unknown>>(
      (totalState, [name, instance]) => {
        totalState[name] = instance.state ?? null;
        return totalState;
      },
      {},
    ) as DefaultState;
  }

  async destroy(): Promise<void> {
    await Promise.all(
      Object.values(this.#instances).map((instance) => {
        // @ts-expect-error Accessing protected property.
        if (typeof instance.destroy === 'function') {
          // @ts-expect-error Accessing protected property.
          return instance.destroy();
        }
        return undefined;
      }),
    );
  }
}
