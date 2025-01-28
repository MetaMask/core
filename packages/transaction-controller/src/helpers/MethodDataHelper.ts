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

const methodRegistryAbi = [
  {
    constant: false,
    inputs: [{ name: '_new', type: 'address' }],
    name: 'setOwner',
    outputs: [],
    payable: false,
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'totalSignatures',
    outputs: [{ name: '', type: 'uint256' }],
    payable: false,
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    payable: false,
    type: 'function',
  },
  {
    constant: false,
    inputs: [],
    name: 'drain',
    outputs: [],
    payable: false,
    type: 'function',
  },
  {
    constant: true,
    inputs: [{ name: '', type: 'bytes4' }],
    name: 'entries',
    outputs: [{ name: '', type: 'string' }],
    payable: false,
    type: 'function',
  },
  {
    constant: false,
    inputs: [{ name: '_method', type: 'string' }],
    name: 'register',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    type: 'function',
  },
  { inputs: [], type: 'constructor' },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'creator', type: 'address' },
      { indexed: true, name: 'signature', type: 'bytes4' },
      { indexed: false, name: 'method', type: 'string' },
    ],
    name: 'Registered',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'old', type: 'address' },
      { indexed: true, name: 'current', type: 'address' },
    ],
    name: 'NewOwner',
    type: 'event',
  },
];

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
        iface = new Interface(methodRegistryAbi);
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
