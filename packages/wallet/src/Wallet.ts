import type { StateMetadataConstraint } from '@metamask/base-controller';
import { Messenger } from '@metamask/messenger';
import { hasProperty } from '@metamask/utils';

import type {
  DefaultActions,
  DefaultEvents,
  DefaultInstances,
  DefaultState,
  RootMessenger,
} from './initialization/defaults.js';
import { initialize } from './initialization/initialization.js';
import { WalletOptions } from './types.js';

export class Wallet {
  // TODO: Expand default types when passing additionalConfigurations.
  readonly #messenger: RootMessenger<DefaultActions, DefaultEvents>;

  readonly #instances: DefaultInstances;

  readonly #controllerMetadata: Readonly<
    Record<string, Readonly<StateMetadataConstraint>>
  >;

  #isDestroyed = false;

  /**
   * Creates a `Wallet` instance, initializing all instances as specified by the passed options.
   *
   * @param options - Options bag.
   * @param options.messenger - An optional messenger to override the default one.
   * @param options.state - An optional state blob.
   * @param options.initializationConfigurations - An optional list of additional initialization configurations
   * required beyond the ones included by default.
   * @param options.instanceOptions - An optional object containing options that should be passed
   * to specific instances for additional customization.
   */
  constructor(options: WalletOptions) {
    this.#messenger =
      options.messenger ??
      new Messenger({
        namespace: 'Root',
      });

    this.#instances = initialize({
      ...options,
      messenger: this.#messenger,
    });

    this.#controllerMetadata = Object.fromEntries(
      Object.entries(this.#instances)
        .filter(([_, instance]) => hasProperty(instance, 'metadata'))
        .map(([name, instance]) => [
          name,
          (instance as { metadata: StateMetadataConstraint }).metadata,
        ]),
    );
  }

  /**
   * @returns The root messenger of the wallet.
   */
  get messenger(): Readonly<RootMessenger<DefaultActions, DefaultEvents>> {
    return this.#messenger;
  }

  set messenger(_) {
    throw new Error('The messenger cannot be directly mutated.');
  }

  /**
   * @returns The combined state of the wallet.
   */
  get state(): DefaultState {
    return Object.entries(this.#instances).reduce<Record<string, unknown>>(
      (totalState, [name, instance]) => {
        // We do actually want to check the prototype here.
        // eslint-disable-next-line no-restricted-syntax
        if ('state' in instance && instance.state) {
          totalState[name] = instance.state;
        }
        return totalState;
      },
      {},
    ) as DefaultState;
  }

  set state(_) {
    throw new Error('Wallet state cannot be directly mutated.');
  }

  /**
   * @returns The controller metadata; containing per-controller information about what properties to persist etc.
   */
  get controllerMetadata(): Readonly<
    Record<string, Readonly<StateMetadataConstraint>>
  > {
    return this.#controllerMetadata;
  }

  set controllerMetadata(_) {
    throw new Error('The controller metadata cannot be directly mutated.');
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

  /**
   * Complete additional initialization of instantiated controllers or services after instantiating `Wallet`.
   *
   * @returns The results of all initialization calls.
   */
  init(): Promise<PromiseSettledResult<unknown>[]> {
    return Promise.allSettled(
      Object.values(this.#instances)
        .filter(
          (instance): instance is Extract<typeof instance, { init: unknown }> =>
            // We do actually want to check the prototype here.
            // eslint-disable-next-line no-restricted-syntax
            'init' in instance && typeof instance.init === 'function',
        )
        .map(async (instance) => instance.init()),
    );
  }

  /**
   * Destroy the wallet instance.
   */
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
          return await instance.destroy();
        }
        /* istanbul ignore next */
        return undefined;
      }),
    );
  }
}
