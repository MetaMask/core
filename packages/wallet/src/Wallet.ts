import type { StateMetadataConstraint } from '@metamask/base-controller';
import { Messenger } from '@metamask/messenger';
import { hasProperty } from '@metamask/utils';
import type { Duplex } from 'stream';

import type {
  DefaultActions,
  DefaultEvents,
  DefaultInstances,
  DefaultState,
  RootMessenger,
} from './initialization';
import { initialize } from './initialization';
import { createProviderRpc } from './json-rpc/createProviderRpc';
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
      namespace: 'Wallet',
    });

    this.#instances = initialize({
      state: state ?? {},
      messenger: this.messenger,
      options,
      createProviderRpc: this.createProviderRpc.bind(this),
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
  
  createProviderRpc(stream: Duplex) {
    return createProviderRpc(stream);
  }

  async destroy(): Promise<void> {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;

    await Promise.allSettled(
      Object.values(this.#instances).map(async (instance) => {
        // @ts-expect-error Accessing protected property.
        if (typeof instance.destroy === 'function') {
          // @ts-expect-error Accessing protected property.
          return await instance.destroy();
        }
        /* istanbul ignore next */
        return undefined;
      }),
    );

    this.messenger.publish('Wallet:destroyed');
  }
}
