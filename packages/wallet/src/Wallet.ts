import type { StateMetadataConstraint } from '@metamask/base-controller';
import { Messenger } from '@metamask/messenger';
import { hasProperty } from '@metamask/utils';

import type {
  DefaultActions,
  DefaultEvents,
  DefaultInstances,
  DefaultState,
  RootMessenger,
} from './initialization';
import { initialize } from './initialization';
import type { WalletOptions } from './types';

export class Wallet {
  // TODO: Expand types when passing additionalConfigurations.
  public readonly messenger: RootMessenger<DefaultActions, DefaultEvents>;

  readonly #instances: DefaultInstances;

  readonly #controllerMetadata: Readonly<
    Record<string, Readonly<StateMetadataConstraint>>
  >;

  #destroyed = false;

  constructor({ state, ...options }: WalletOptions) {
    this.messenger = new Messenger({
      namespace: 'Root',
    });

    this.#instances = initialize({
      state: state ?? {},
      messenger: this.messenger,
      options,
    });

    this.#controllerMetadata = Object.fromEntries(
      Object.entries(this.#instances)
        .filter(([_, instance]) => hasProperty(instance, 'metadata'))
        .map(([name, instance]) => [name, instance.metadata]),
    );
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

  get controllerMetadata(): Readonly<
    Record<string, Readonly<StateMetadataConstraint>>
  > {
    return this.#controllerMetadata;
  }

  async destroy(): Promise<void> {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;

    await Promise.allSettled(
      Object.values(this.#instances).map((instance) => {
        // @ts-expect-error Accessing protected property.
        if (typeof instance.destroy === 'function') {
          // @ts-expect-error Accessing protected property.
          return (async (): Promise<void> => await instance.destroy())();
        }
        /* istanbul ignore next */
        return Promise.resolve();
      }),
    );

    this.messenger.publish('Root:walletDestroyed');
  }
}
