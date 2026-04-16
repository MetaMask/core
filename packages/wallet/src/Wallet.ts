import { Messenger } from '@metamask/messenger';

import type {
  DefaultActions,
  DefaultEvents,
  DefaultInstances,
  DefaultState,
  RootMessenger,
} from './initialization';
import { initialize } from './initialization';
import { KeyValueStore, loadState, subscribeToChanges } from './persistence';
import type { WalletOptions } from './types';

export type WalletConstructorArgs = {
  options: WalletOptions;
  databasePath?: string;
};

export class Wallet {
  // TODO: Expand types when passing additionalConfigurations.
  public readonly messenger: RootMessenger<DefaultActions, DefaultEvents>;

  readonly #instances: DefaultInstances;

  readonly #store: KeyValueStore;

  readonly #unsubscribePersistence: () => void;

  #destroyed = false;

  constructor({ options, databasePath = ':memory:' }: WalletConstructorArgs) {
    this.messenger = new Messenger({
      namespace: 'Root',
    });

    this.#store = new KeyValueStore(databasePath);

    try {
      const state = loadState(this.#store);

      this.#instances = initialize({
        state,
        messenger: this.messenger,
        options,
      });

      this.#unsubscribePersistence = subscribeToChanges(
        this.messenger,
        this.#instances,
        this.#store,
      );
    } catch (error) {
      this.#store.close();
      throw error;
    }
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
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;

    try {
      const destroyed = Promise.allSettled(
        Object.values(this.#instances).map((instance) => {
          // @ts-expect-error Accessing protected property.
          if (typeof instance.destroy === 'function') {
            // @ts-expect-error Accessing protected property.
            return instance.destroy();
          }
          /* istanbul ignore next */
          return undefined;
        }),
      );

      this.#unsubscribePersistence();
      await destroyed;
    } finally {
      this.#store.close();
    }
  }
}
