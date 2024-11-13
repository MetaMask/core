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

import { createModuleLogger, projectLogger } from '../logger';
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

const log = createModuleLogger(projectLogger, 'multichain-tracking');

export type MultichainTrackingHelperOptions = {
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
    chainId: Hex;
  }) => NonceTracker;
  createIncomingTransactionHelper: (opts: {
    blockTracker: BlockTracker;
    etherscanRemoteTransactionSource: EtherscanRemoteTransactionSource;
    chainId: Hex;
  }) => IncomingTransactionHelper;
  createPendingTransactionTracker: (opts: {
    provider: Provider;
    blockTracker: BlockTracker;
    chainId: Hex;
  }) => PendingTransactionTracker;
  onNetworkStateChange: (
    listener: (
      ...payload: NetworkControllerStateChangeEvent['payload']
    ) => void,
  ) => void;
};

export class MultichainTrackingHelper {
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
    chainId: Hex;
  }) => NonceTracker;

  readonly #createIncomingTransactionHelper: (opts: {
    blockTracker: BlockTracker;
    chainId: Hex;
    etherscanRemoteTransactionSource: EtherscanRemoteTransactionSource;
  }) => IncomingTransactionHelper;

  readonly #createPendingTransactionTracker: (opts: {
    provider: Provider;
    blockTracker: BlockTracker;
    chainId: Hex;
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
      const networkClients = this.#getNetworkClientRegistry();

      patches.forEach(({ op, path }) => {
        if (op === 'remove' && path[0] === 'networkConfigurations') {
          const networkClientId = path[1] as NetworkClientId;
          delete networkClients[networkClientId];
        }
      });

      this.#refreshTrackingMap(networkClients);
    });
  }

  initialize() {
    const networkClients = this.#getNetworkClientRegistry();

    this.#refreshTrackingMap(networkClients);

    log('Initialized');
  }

  has(networkClientId: NetworkClientId) {
    return this.#trackingMap.has(networkClientId);
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
    networkClientId: NetworkClientId,
  ): Promise<NonceLock> {
    const networkClient = this.#getNetworkClientById(networkClientId);

    const releaseLockForChainIdKey = await this.acquireNonceLockForChainIdKey({
      chainId: networkClient.configuration.chainId,
      key: address,
    });

    const nonceTracker = this.#trackingMap.get(networkClientId)?.nonceTracker;

    if (!nonceTracker) {
      throw new Error(
        `Missing nonce tracker for network client ID - ${networkClientId}`,
      );
    }

    // Acquires the lock for the chainId + address and the nonceLock from the nonceTracker, then
    // couples them together by replacing the nonceLock's releaseLock method with
    // an anonymous function that calls releases both the original nonceLock and the
    // lock for the chainId.
    try {
      const nonceLock = await nonceTracker.getNonceLock(address);

      const releaseLock = () => {
        nonceLock.releaseLock();
        releaseLockForChainIdKey?.();
      };

      return {
        ...nonceLock,
        releaseLock,
      };
    } catch (err) {
      releaseLockForChainIdKey?.();
      throw err;
    }
  }

  startIncomingTransactionPolling(networkClientIds?: NetworkClientId[]) {
    const finalNetworkClientIds = networkClientIds ?? [
      ...this.#trackingMap.keys(),
    ];

    finalNetworkClientIds.forEach((networkClientId) => {
      this.#trackingMap.get(networkClientId)?.incomingTransactionHelper.start();
    });
  }

  stopIncomingTransactionPolling(networkClientIds?: NetworkClientId[]) {
    const finalNetworkClientIds = networkClientIds ?? [
      ...this.#trackingMap.keys(),
    ];

    finalNetworkClientIds.forEach((networkClientId) => {
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

  getNetworkClient({
    chainId,
    networkClientId: requestNetworkClientId,
  }: {
    chainId?: Hex;
    networkClientId?: NetworkClientId;
  }): NetworkClient & { id: NetworkClientId } {
    if (!requestNetworkClientId && !chainId) {
      throw new Error(
        'Cannot locate network client without networkClientId or chainId',
      );
    }

    let networkClient: NetworkClient | undefined;
    let networkClientId = requestNetworkClientId;

    try {
      if (requestNetworkClientId) {
        networkClient = this.#getNetworkClientById(requestNetworkClientId);
      }
    } catch (error) {
      log('No network client found with ID', requestNetworkClientId);

      if (!chainId) {
        throw error;
      }
    }

    if (!networkClient && chainId) {
      networkClientId = this.#findNetworkClientIdByChainId(chainId);
      networkClient = this.#getNetworkClientById(networkClientId);
    }

    return {
      ...(networkClient as NetworkClient),
      id: networkClientId as NetworkClientId,
    };
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

    if (networkClientIdsToAdd.length) {
      log('Added trackers', networkClientIdsToAdd);
    }

    if (networkClientIdsToRemove.length) {
      log('Removed trackers', networkClientIdsToRemove);
    }
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

      log('Created Etherscan remote transaction source', chainId);

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
}
