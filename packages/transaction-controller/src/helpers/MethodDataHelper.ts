import { Interface } from '@ethersproject/abi';
import type { NetworkClientId } from '@metamask/network-controller';
import { createModuleLogger } from '@metamask/utils';
import { Mutex } from 'async-mutex';
// This package purposefully relies on Node's EventEmitter module.
// eslint-disable-next-line import-x/no-nodejs-modules
import EventEmitter from 'events';

import { projectLogger } from '../logger';
import type { MethodData } from '../TransactionController';

const log = createModuleLogger(projectLogger, 'method-data');

export class MethodDataHelper {
  hub: EventEmitter;

  #getState: () => Record<string, MethodData>;

  #interfaceByNetworkClientId: Map<NetworkClientId, Interface>;

  #mutex = new Mutex();

  constructor({ getState }: { getState: () => Record<string, MethodData> }) {
    this.hub = new EventEmitter();

    this.#getState = getState;
    this.#interfaceByNetworkClientId = new Map();
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

      let iface = this.#interfaceByNetworkClientId.get(networkClientId);

      if (!iface) {
        iface = new Interface([]);
        this.#interfaceByNetworkClientId.set(networkClientId, iface);
        log('Created interface', networkClientId);
      }

      const methodData = await this.#interfaceLookup(fourBytePrefix, iface);

      log('Result', methodData);

      this.hub.emit('update', { fourBytePrefix, methodData });

      return methodData;
    } finally {
      releaseLock();
    }
  }

  async #interfaceLookup(
    fourBytePrefix: string,
    iface: Interface,
  ): Promise<MethodData> {
    try {
      const functionFragment = iface.getFunction(fourBytePrefix);
      return {
        registryMethod: functionFragment.format(),
        parsedRegistryMethod: {
          name: functionFragment.name,
          args: functionFragment.inputs.map(({ type }) => ({ type })),
        },
      };
    } catch {
      log('No method found or invalid signature', fourBytePrefix);
      return {
        registryMethod: '',
        parsedRegistryMethod: { name: undefined, args: undefined },
      };
    }
  }
}
