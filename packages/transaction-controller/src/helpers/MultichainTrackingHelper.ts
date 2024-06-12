import EthQuery from '@metamask/eth-query';
import type {
  NetworkClientId,
  NetworkController,
  NetworkClient,
  BlockTracker,
  Provider,
  NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';
import type { NonceLock, NonceTracker } from '@metamask/nonce-tracker';
import type { Hex } from '@metamask/utils';
import { Mutex } from 'async-mutex';

import { incomingTransactionsLogger as log } from '../logger';
import { EtherscanRemoteTransactionSource } from './EtherscanRemoteTransactionSource';
import type {
  IncomingTransactionHelper,
  IncomingTransactionOptions,
} from './IncomingTransactionHelper';
import type { PendingTransactionTracker } from './PendingTransactionTracker';

/**
 * Registry of network clients provided by the NetworkController
 */
type NetworkClientRegistry = ReturnType<
  NetworkController['getNetworkClientRegistry']
>;

export type MultichainTrackingHelperOptions = {
  isMultichainEnabled: boolean;
  provider: Provider;
  nonceTracker: NonceTracker;
  incomingTransactionOptions: IncomingTransactionOptions;

  findNetworkClientIdByChainId: NetworkController['findNetworkClientIdByChainId'];
  getNetworkClientById: NetworkController['getNetworkClientById'];
  getNetworkClientRegistry: NetworkController['getNetworkClientRegistry'];

  removeIncomingTransactionHelperListeners: (
    IncomingTransactionHelper: IncomingTransactionHelper,
  ) => void;
  removePendingTransactionTrackerListeners: (
    pendingTransactionTracker: PendingTransactionTracker,
  ) => void;
  createNonceTracker: (opts: {
    provider: Provider;
    blockTracker: BlockTracker;
    chainId?: Hex;
  }) => NonceTracker;
  createIncomingTransactionHelper: (opts: {
    blockTracker: BlockTracker;
    etherscanRemoteTransactionSource: EtherscanRemoteTransactionSource;
    chainId?: Hex;
  }) => IncomingTransactionHelper;
  createPendingTransactionTracker: (opts: {
    provider: Provider;
    blockTracker: BlockTracker;
    chainId?: Hex;
  }) => PendingTransactionTracker;
  onNetworkStateChange: (
    listener: (
      ...payload: NetworkControllerStateChangeEvent['payload']
    ) => void,
  ) => void;
};

export class MultichainTrackingHelper {
  #isMultichainEnabled: boolean;

  readonly #provider: Provider;

  readonly #nonceTracker: NonceTracker;

  readonly #incomingTransactionOptions: IncomingTransactionOptions;

  readonly #findNetworkClientIdByChainId: NetworkController['findNetworkClientIdByChainId'];

  readonly #getNetworkClientById: NetworkController['getNetworkClientById'];

  readonly #getNetworkClientRegistry: NetworkController['getNetworkClientRegistry'];

  readonly #removeIncomingTransactionHelperListeners: (
    IncomingTransactionHelper: IncomingTransactionHelper,
  ) => void;

  readonly #removePendingTransactionTrackerListeners: (
    pendingTransactionTracker: PendingTransactionTracker,
  ) => void;

  readonly #createNonceTracker: (opts: {
    provider: Provider;
    blockTracker: BlockTracker;
    chainId?: Hex;
  }) => NonceTracker;

  readonly #createIncomingTransactionHelper: (opts: {
    blockTracker: BlockTracker;
    chainId?: Hex;
    etherscanRemoteTransactionSource: EtherscanRemoteTransactionSource;
  }) => IncomingTransactionHelper;

  readonly #createPendingTransactionTracker: (opts: {
    provider: Provider;
    blockTracker: BlockTracker;
    chainId?: Hex;
  }) => PendingTransactionTracker;

  readonly #nonceMutexesByChainId = new Map<Hex, Map<string, Mutex>>();

  readonly #trackingMap: Map<
    NetworkClientId,
    {
      nonceTracker: NonceTracker;
      pendingTransactionTracker: PendingTransactionTracker;
      incomingTransactionHelper: IncomingTransactionHelper;
    }
  > = new Map();

  readonly #etherscanRemoteTransactionSourcesMap: Map<
    Hex,
    EtherscanRemoteTransactionSource
  > = new Map();

  constructor({
    isMultichainEnabled,
    provider,
    nonceTracker,
    incomingTransactionOptions,
    findNetworkClientIdByChainId,
    getNetworkClientById,
    getNetworkClientRegistry,
    removeIncomingTransactionHelperListeners,
    removePendingTransactionTrackerListeners,
    createNonceTracker,
    createIncomingTransactionHelper,
    createPendingTransactionTracker,
    onNetworkStateChange,
  }: MultichainTrackingHelperOptions) {
    this.#isMultichainEnabled = isMultichainEnabled;
    this.#provider = provider;
    this.#nonceTracker = nonceTracker;
    this.#incomingTransactionOptions = incomingTransactionOptions;

    this.#findNetworkClientIdByChainId = findNetworkClientIdByChainId;
    this.#getNetworkClientById = getNetworkClientById;
    this.#getNetworkClientRegistry = getNetworkClientRegistry;

    this.#removeIncomingTransactionHelperListeners =
      removeIncomingTransactionHelperListeners;
    this.#removePendingTransactionTrackerListeners =
      removePendingTransactionTrackerListeners;
    this.#createNonceTracker = createNonceTracker;
    this.#createIncomingTransactionHelper = createIncomingTransactionHelper;
    this.#createPendingTransactionTracker = createPendingTransactionTracker;

    onNetworkStateChange((_, patches) => {
      if (this.#isMultichainEnabled) {
        const networkClients = this.#getNetworkClientRegistry();
        patches.forEach(({ op, path }) => {
          if (op === 'remove' && path[0] === 'networkConfigurations') {
            const networkClientId = path[1] as NetworkClientId;
            delete networkClients[networkClientId];
          }
        });

        this.#refreshTrackingMap(networkClients);
      }
    });
  }

  initialize() {
    if (!this.#isMultichainEnabled) {
      return;
    }
    const networkClients = this.#getNetworkClientRegistry();
    this.#refreshTrackingMap(networkClients);
  }

  has(networkClientId: NetworkClientId) {
    return this.#trackingMap.has(networkClientId);
  }

  getEthQuery({
    networkClientId,
    chainId,
  }: {
    networkClientId?: NetworkClientId;
    chainId?: Hex;
  } = {}): EthQuery {
    if (!this.#isMultichainEnabled) {
      return new EthQuery(this.getProvider());
    }
    return new EthQuery(this.getProvider({ networkClientId, chainId }));
  }

  getProvider({
    networkClientId,
    chainId,
  }: {
    networkClientId?: NetworkClientId;
    chainId?: Hex;
  } = {}): Provider {
    if (!this.#isMultichainEnabled) {
      return this.#provider;
    }

    const networkClient = this.#getNetworkClient({
      networkClientId,
      chainId,
    });

    return networkClient?.provider || this.#provider;
  }

  /**
   * Gets the mutex intended to guard the nonceTracker for a particular chainId and key .
   *
   * @param opts - The options object.
   * @param opts.chainId - The hex chainId.
   * @param opts.key - The hex address (or constant) pertaining to the chainId
   * @returns Mutex instance for the given chainId and key pair
   */
  async acquireNonceLockForChainIdKey({
    chainId,
    key = 'global',
  }: {
    chainId: Hex;
    key?: string;
  }): Promise<() => void> {
    let nonceMutexesForChainId = this.#nonceMutexesByChainId.get(chainId);
    if (!nonceMutexesForChainId) {
      nonceMutexesForChainId = new Map<string, Mutex>();
      this.#nonceMutexesByChainId.set(chainId, nonceMutexesForChainId);
    }
    let nonceMutexForKey = nonceMutexesForChainId.get(key);
    if (!nonceMutexForKey) {
      nonceMutexForKey = new Mutex();
      nonceMutexesForChainId.set(key, nonceMutexForKey);
    }

    return await nonceMutexForKey.acquire();
  }

  /**
   * Gets the next nonce according to the nonce-tracker.
   * Ensure `releaseLock` is called once processing of the `nonce` value is complete.
   *
   * @param address - The hex string address for the transaction.
   * @param networkClientId - The network client ID for the transaction, used to fetch the correct nonce tracker.
   * @returns object with the `nextNonce` `nonceDetails`, and the releaseLock.
   */
  async getNonceLock(
    address: string,
    networkClientId?: NetworkClientId,
  ): Promise<NonceLock> {
    let releaseLockForChainIdKey: (() => void) | undefined;
    let nonceTracker = this.#nonceTracker;
    if (networkClientId && this.#isMultichainEnabled) {
      const networkClient = this.#getNetworkClientById(networkClientId);
      releaseLockForChainIdKey = await this.acquireNonceLockForChainIdKey({
        chainId: networkClient.configuration.chainId,
        key: address,
      });
      const trackers = this.#trackingMap.get(networkClientId);
      if (!trackers) {
        throw new Error('missing nonceTracker for networkClientId');
      }
      nonceTracker = trackers.nonceTracker;
    }

    // Acquires the lock for the chainId + address and the nonceLock from the nonceTracker, then
    // couples them together by replacing the nonceLock's releaseLock method with
    // an anonymous function that calls releases both the original nonceLock and the
    // lock for the chainId.
    try {
      const nonceLock = await nonceTracker.getNonceLock(address);
      return {
        ...nonceLock,
        releaseLock: () => {
          nonceLock.releaseLock();
          releaseLockForChainIdKey?.();
        },
      };
    } catch (err) {
      releaseLockForChainIdKey?.();
      throw err;
    }
  }

  startIncomingTransactionPolling(networkClientIds: NetworkClientId[] = []) {
    networkClientIds.forEach((networkClientId) => {
      this.#trackingMap.get(networkClientId)?.incomingTransactionHelper.start();
    });
  }

  stopIncomingTransactionPolling(networkClientIds: NetworkClientId[] = []) {
    networkClientIds.forEach((networkClientId) => {
      this.#trackingMap.get(networkClientId)?.incomingTransactionHelper.stop();
    });
  }

  stopAllIncomingTransactionPolling() {
    for (const [, trackers] of this.#trackingMap) {
      trackers.incomingTransactionHelper.stop();
    }
  }

  async updateIncomingTransactions(networkClientIds: NetworkClientId[] = []) {
    const promises = await Promise.allSettled(
      networkClientIds.map(async (networkClientId) => {
        return await this.#trackingMap
          .get(networkClientId)
          ?.incomingTransactionHelper.update();
      }),
    );

    promises
      .filter((result) => result.status === 'rejected')
      .forEach((result) => {
        log(
          'failed to update incoming transactions',
          (result as PromiseRejectedResult).reason,
        );
      });
  }

  checkForPendingTransactionAndStartPolling = () => {
    for (const [, trackers] of this.#trackingMap) {
      trackers.pendingTransactionTracker.startIfPendingTransactions();
    }
  };

  stopAllTracking() {
    for (const [networkClientId] of this.#trackingMap) {
      this.#stopTrackingByNetworkClientId(networkClientId);
    }
  }

  #refreshTrackingMap = (networkClients: NetworkClientRegistry) => {
    this.#refreshEtherscanRemoteTransactionSources(networkClients);

    const networkClientIds = Object.keys(networkClients);
    const existingNetworkClientIds = Array.from(this.#trackingMap.keys());

    // Remove tracking for NetworkClientIds that no longer exist
    const networkClientIdsToRemove = existingNetworkClientIds.filter(
      (id) => !networkClientIds.includes(id),
    );
    networkClientIdsToRemove.forEach((id) => {
      this.#stopTrackingByNetworkClientId(id);
    });

    // Start tracking new NetworkClientIds from the registry
    const networkClientIdsToAdd = networkClientIds.filter(
      (id) => !existingNetworkClientIds.includes(id),
    );
    networkClientIdsToAdd.forEach((id) => {
      this.#startTrackingByNetworkClientId(id);
    });
  };

  #stopTrackingByNetworkClientId(networkClientId: NetworkClientId) {
    const trackers = this.#trackingMap.get(networkClientId);
    if (trackers) {
      trackers.pendingTransactionTracker.stop();
      this.#removePendingTransactionTrackerListeners(
        trackers.pendingTransactionTracker,
      );
      trackers.incomingTransactionHelper.stop();
      this.#removeIncomingTransactionHelperListeners(
        trackers.incomingTransactionHelper,
      );
      this.#trackingMap.delete(networkClientId);
    }
  }

  #startTrackingByNetworkClientId(networkClientId: NetworkClientId) {
    const trackers = this.#trackingMap.get(networkClientId);
    if (trackers) {
      return;
    }

    const {
      provider,
      blockTracker,
      configuration: { chainId },
    } = this.#getNetworkClientById(networkClientId);

    let etherscanRemoteTransactionSource =
      this.#etherscanRemoteTransactionSourcesMap.get(chainId);
    if (!etherscanRemoteTransactionSource) {
      etherscanRemoteTransactionSource = new EtherscanRemoteTransactionSource({
        includeTokenTransfers:
          this.#incomingTransactionOptions.includeTokenTransfers,
      });
      this.#etherscanRemoteTransactionSourcesMap.set(
        chainId,
        etherscanRemoteTransactionSource,
      );
    }

    const nonceTracker = this.#createNonceTracker({
      provider,
      blockTracker,
      chainId,
    });

    const incomingTransactionHelper = this.#createIncomingTransactionHelper({
      blockTracker,
      etherscanRemoteTransactionSource,
      chainId,
    });

    const pendingTransactionTracker = this.#createPendingTransactionTracker({
      provider,
      blockTracker,
      chainId,
    });

    this.#trackingMap.set(networkClientId, {
      nonceTracker,
      incomingTransactionHelper,
      pendingTransactionTracker,
    });
  }

  #refreshEtherscanRemoteTransactionSources = (
    networkClients: NetworkClientRegistry,
  ) => {
    // this will be prettier when we have consolidated network clients with a single chainId:
    // check if there are still other network clients using the same chainId
    // if not remove the etherscanRemoteTransaction source from the map
    const chainIdsInRegistry = new Set();
    Object.values(networkClients).forEach((networkClient) =>
      chainIdsInRegistry.add(networkClient.configuration.chainId),
    );
    const existingChainIds = Array.from(
      this.#etherscanRemoteTransactionSourcesMap.keys(),
    );
    const chainIdsToRemove = existingChainIds.filter(
      (chainId) => !chainIdsInRegistry.has(chainId),
    );

    chainIdsToRemove.forEach((chainId) => {
      this.#etherscanRemoteTransactionSourcesMap.delete(chainId);
    });
  };

  #getNetworkClient({
    networkClientId,
    chainId,
  }: {
    networkClientId?: NetworkClientId;
    chainId?: Hex;
  } = {}): NetworkClient | undefined {
    let networkClient: NetworkClient | undefined;

    if (networkClientId) {
      try {
        networkClient = this.#getNetworkClientById(networkClientId);
      } catch (err) {
        log('failed to get network client by networkClientId');
      }
    }
    if (!networkClient && chainId) {
      try {
        const networkClientIdForChainId =
          this.#findNetworkClientIdByChainId(chainId);
        networkClient = this.#getNetworkClientById(networkClientIdForChainId);
      } catch (err) {
        log('failed to get network client by chainId');
      }
    }
    return networkClient;
  }
}
