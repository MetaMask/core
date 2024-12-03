import type { NetworkClientId, Provider } from '@metamask/network-controller';
import { createModuleLogger } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import { MethodRegistry } from 'eth-method-registry';
// This package purposefully relies on Node's EventEmitter module.
// eslint-disable-next-line import/no-nodejs-modules
import EventEmitter from 'events';

import { projectLogger } from '../logger';
import type { MethodData } from '../TransactionController';

const log = createModuleLogger(projectLogger, 'method-data');

export class MethodDataHelper {
  hub: EventEmitter;

  #getProvider: (networkClientId: NetworkClientId) => Provider;

  #getState: () => Record<string, MethodData>;

  #methodRegistryByNetworkClientId: Map<NetworkClientId, MethodRegistry>;

  #mutex = new Mutex();

  constructor({
    getProvider,
    getState,
  }: {
    getProvider: (networkClientId: NetworkClientId) => Provider;
    getState: () => Record<string, MethodData>;
  }) {
    this.hub = new EventEmitter();

    this.#getProvider = getProvider;
    this.#getState = getState;
    this.#methodRegistryByNetworkClientId = new Map();
  }

  async lookup(
    fourBytePrefix: string,
    networkClientId: NetworkClientId,
  ): Promise<MethodData> {
    log('lookup', fourBytePrefix, networkClientId);

    const releaseLock = await this.#mutex.acquire();

    try {
      const cachedResult = this.#getState()[fourBytePrefix];

      if (cachedResult) {
        log('Cached', cachedResult);
        return cachedResult;
      }

      let registry = this.#methodRegistryByNetworkClientId.get(networkClientId);

      if (!registry) {
        const provider = this.#getProvider(networkClientId);

        // @ts-expect-error Type in eth-method-registry is inappropriate and should be changed
        registry = new MethodRegistry({ provider });

        this.#methodRegistryByNetworkClientId.set(networkClientId, registry);

        log('Created registry', networkClientId);
      }

      const methodData = await this.#registryLookup(fourBytePrefix, registry);

      log('Result', methodData);

      this.hub.emit('update', { fourBytePrefix, methodData });

      return methodData;
    } finally {
      releaseLock();
    }
  }

  async #registryLookup(
    fourBytePrefix: string,
    methodRegistry: MethodRegistry,
  ): Promise<MethodData> {
    const registryMethod = await methodRegistry.lookup(fourBytePrefix);

    if (!registryMethod) {
      log('No method found', fourBytePrefix);

      return {
        registryMethod: '',
        parsedRegistryMethod: { name: undefined, args: undefined },
      };
    }

    log('Parsing', registryMethod);

    const parsedRegistryMethod = methodRegistry.parse(registryMethod);

    return { registryMethod, parsedRegistryMethod };
  }
}
