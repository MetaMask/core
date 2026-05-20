import type { StateMetadataConstraint } from '@metamask/base-controller';
import { Messenger } from '@metamask/messenger';
import { hasProperty } from '@metamask/utils';

import type {
  DefaultActions,
  DefaultEvents,
  DefaultInstances,
  DefaultState,
  RootMessenger,
} from './initialization/defaults';
import { initialize } from './initialization/initialization';
import { WalletOptions } from './types';

export class Wallet {
  // TODO: Expand default types when passing additionalConfigurations.
  readonly #messenger: RootMessenger<DefaultActions, DefaultEvents>;

  readonly #instances: DefaultInstances;

  readonly #controllerMetadata: Readonly<
    Record<string, Readonly<StateMetadataConstraint>>
  >;

  #isDestroyed = false;

  constructor(options: WalletOptions) {
    this.#messenger =
      options.messenger ??
      new Messenger({
        namespace: 'Wallet',
      });

    this.#instances = initialize({
      options,
      messenger: this.#messenger,
    });

    this.#controllerMetadata = Object.fromEntries(
      Object.entries(this.#instances)
        .filter(([_, instance]) => hasProperty(instance, 'metadata'))
        .map(([name, instance]) => [name, instance.metadata]),
    );
  }

  get messenger(): Readonly<RootMessenger<DefaultActions, DefaultEvents>> {
    return this.#messenger;
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

  getInstance<Name extends keyof DefaultInstances>(
    name: Name,
  ): DefaultInstances[Name];

  getInstance(
    name: string,
  ): DefaultInstances[keyof DefaultInstances] | undefined;

  /**
   * Get an instantiated controller or service.
   *
   * @param name - The name.
   * @returns The instance, if it exists.
   * @deprecated - Please use the messenger instead of direct access.
   */
  getInstance(
    name: string,
  ): DefaultInstances[keyof DefaultInstances] | undefined {
    return this.#instances[name as keyof DefaultInstances];
  }

  async destroy(): Promise<void> {
    if (this.#isDestroyed) {
      return;
    }

    this.#isDestroyed = true;

    await Promise.allSettled(
      Object.values(this.#instances).map(async (instance) => {
        // @ts-expect-error Accessing protected property.
        if (typeof instance.destroy === 'function') {
          // @ts-expect-error Accessing protected property.
          // eslint-disable-next-line @typescript-eslint/await-thenable
          return await instance.destroy();
        }
        /* istanbul ignore next */
        return undefined;
      }),
    );

    this.messenger.publish('Wallet:destroyed');
  }
}
