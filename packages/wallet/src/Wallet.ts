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
import type { InitializationConfiguration } from './initialization/types';
import type { WalletOptions } from './types';

export class Wallet {
  // messenger is typed against the default controller set. Action/event types for
  // any additional configurations passed to the constructor are not reflected here.
  public readonly messenger: RootMessenger<DefaultActions, DefaultEvents>;

  readonly #instances: DefaultInstances;

  readonly #controllerMetadata: Readonly<
    Record<string, Readonly<StateMetadataConstraint>>
  >;

  #destroyed = false;

  constructor({
    state,
    initializationConfigurations,
    ...options
  }: WalletOptions & {
    initializationConfigurations?: InitializationConfiguration<unknown, unknown>[];
  }) {
    this.messenger = new Messenger({
      namespace: 'Wallet',
    });

    this.#instances = initialize({
      state: state ?? {},
      messenger: this.messenger,
      initializationConfigurations,
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
      Object.values(this.#instances).map(async (instance) => {
        if (typeof instance.destroy === 'function') {
          return await instance.destroy();
        }
        /* istanbul ignore next */
        return undefined;
      }),
    );

    this.messenger.publish('Wallet:destroyed');
  }
}
