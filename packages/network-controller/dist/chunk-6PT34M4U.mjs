import {
  INFURA_BLOCKED_KEY
} from "./chunk-2QJYHWIP.mjs";
import {
  createAutoManagedNetworkClient
} from "./chunk-TZA3CBEI.mjs";
import {
  createModuleLogger,
  projectLogger
} from "./chunk-VTLOAS2R.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/NetworkController.ts
import { BaseController } from "@metamask/base-controller";
import {
  BUILT_IN_NETWORKS,
  InfuraNetworkType,
  NetworkType,
  isSafeChainId,
  isInfuraNetworkType
} from "@metamask/controller-utils";
import EthQuery from "@metamask/eth-query";
import { errorCodes } from "@metamask/rpc-errors";
import { createEventEmitterProxy } from "@metamask/swappable-obj-proxy";
import {
  assertIsStrictHexString,
  hasProperty,
  isPlainObject
} from "@metamask/utils";
import { strict as assert } from "assert";
import { v4 as random } from "uuid";
var debugLog = createModuleLogger(projectLogger, "NetworkController");
function knownKeysOf(object) {
  return Object.keys(object);
}
function assertOfType(value, validate, message) {
  assert.ok(validate(value), message);
}
function pick(object, keys) {
  const pickedObject = keys.reduce(
    (finalObject, key) => {
      return { ...finalObject, [key]: object[key] };
    },
    {}
  );
  assertOfType(
    pickedObject,
    () => keys.every((key) => key in pickedObject),
    "The reduce did not produce an object with all of the desired keys."
  );
  return pickedObject;
}
function isErrorWithCode(error) {
  return typeof error === "object" && error !== null && "code" in error;
}
var name = "NetworkController";
var defaultState = {
  selectedNetworkClientId: NetworkType.mainnet,
  networksMetadata: {},
  networkConfigurations: {}
};
var _ethQuery, _infuraProjectId, _trackMetaMetricsEvent, _previouslySelectedNetworkClientId, _providerProxy, _blockTrackerProxy, _autoManagedNetworkClientRegistry, _autoManagedNetworkClient, _log, _refreshNetwork, refreshNetwork_fn, _getLatestBlock, getLatestBlock_fn, _determineEIP1559Compatibility, determineEIP1559Compatibility_fn, _ensureAutoManagedNetworkClientRegistryPopulated, ensureAutoManagedNetworkClientRegistryPopulated_fn, _createAutoManagedNetworkClientRegistry, createAutoManagedNetworkClientRegistry_fn, _buildIdentifiedInfuraNetworkClientConfigurations, buildIdentifiedInfuraNetworkClientConfigurations_fn, _buildIdentifiedCustomNetworkClientConfigurations, buildIdentifiedCustomNetworkClientConfigurations_fn, _applyNetworkSelection, applyNetworkSelection_fn;
var NetworkController = class extends BaseController {
  constructor({
    messenger,
    state,
    infuraProjectId,
    trackMetaMetricsEvent,
    log
  }) {
    super({
      name,
      metadata: {
        selectedNetworkClientId: {
          persist: true,
          anonymous: false
        },
        networksMetadata: {
          persist: true,
          anonymous: false
        },
        networkConfigurations: {
          persist: true,
          anonymous: false
        }
      },
      messenger,
      state: { ...defaultState, ...state }
    });
    /**
     * Executes a series of steps to switch the network:
     *
     * 1. Notifies subscribers via the messenger that the network is about to be
     * switched (and, really, that the global provider and block tracker proxies
     * will be re-pointed to a new network).
     * 2. Looks up a known and preinitialized network client matching the given
     * ID and uses it to re-point the aforementioned provider and block tracker
     * proxies.
     * 3. Notifies subscribers via the messenger that the network has switched.
     * 4. Captures metadata for the newly switched network in state.
     *
     * @param networkClientId - The ID of a network client that requests will be
     * routed through (either the name of an Infura network or the ID of a custom
     * network configuration).
     */
    __privateAdd(this, _refreshNetwork);
    /**
     * Fetches the latest block for the network.
     *
     * @param networkClientId - The networkClientId to fetch the correct provider against which to check the latest block. Defaults to the selectedNetworkClientId.
     * @returns A promise that either resolves to the block header or null if
     * there is no latest block, or rejects with an error.
     */
    __privateAdd(this, _getLatestBlock);
    /**
     * Retrieves and checks the latest block from the currently selected
     * network; if the block has a `baseFeePerGas` property, then we know
     * that the network supports EIP-1559; otherwise it doesn't.
     *
     * @param networkClientId - The networkClientId to fetch the correct provider against which to check 1559 compatibility
     * @returns A promise that resolves to `true` if the network supports EIP-1559,
     * `false` otherwise, or `undefined` if unable to retrieve the last block.
     */
    __privateAdd(this, _determineEIP1559Compatibility);
    /**
     * Before accessing or switching the network, the registry of network clients
     * needs to be populated. Otherwise, `#applyNetworkSelection` and
     * `getNetworkClientRegistry` will throw an error. This method checks to see if the
     * population step has happened yet, and if not, makes it happen.
     *
     * @returns The populated network client registry.
     */
    __privateAdd(this, _ensureAutoManagedNetworkClientRegistryPopulated);
    /**
     * Constructs the registry of network clients based on the set of built-in
     * networks as well as the custom networks in state.
     *
     * @returns The network clients keyed by ID.
     */
    __privateAdd(this, _createAutoManagedNetworkClientRegistry);
    /**
     * Constructs the list of network clients for built-in networks (that is,
     * the subset of the networks we know Infura supports that consumers do not
     * need to explicitly add).
     *
     * @returns The network clients.
     */
    __privateAdd(this, _buildIdentifiedInfuraNetworkClientConfigurations);
    /**
     * Constructs the list of network clients for custom networks (that is, those
     * which consumers have added via `networkConfigurations`).
     *
     * @returns The network clients.
     */
    __privateAdd(this, _buildIdentifiedCustomNetworkClientConfigurations);
    /**
     * Updates the global provider and block tracker proxies (accessible via
     * {@link getSelectedNetworkClient}) to point to the same ones within the
     * given network client, thereby magically switching any consumers using these
     * proxies to use the new network.
     *
     * Also refreshes the EthQuery instance accessible via the `getEthQuery`
     * action to wrap the provider from the new network client. Note that this is
     * not a proxy, so consumers will need to call `getEthQuery` again after the
     * network switch.
     *
     * @param networkClientId - The ID of a network client that requests will be
     * routed through (either the name of an Infura network or the ID of a custom
     * network configuration).
     * @throws if no network client could be found matching the given ID.
     */
    __privateAdd(this, _applyNetworkSelection);
    __privateAdd(this, _ethQuery, void 0);
    __privateAdd(this, _infuraProjectId, void 0);
    __privateAdd(this, _trackMetaMetricsEvent, void 0);
    __privateAdd(this, _previouslySelectedNetworkClientId, void 0);
    __privateAdd(this, _providerProxy, void 0);
    __privateAdd(this, _blockTrackerProxy, void 0);
    __privateAdd(this, _autoManagedNetworkClientRegistry, void 0);
    __privateAdd(this, _autoManagedNetworkClient, void 0);
    __privateAdd(this, _log, void 0);
    if (!infuraProjectId || typeof infuraProjectId !== "string") {
      throw new Error("Invalid Infura project ID");
    }
    __privateSet(this, _infuraProjectId, infuraProjectId);
    __privateSet(this, _trackMetaMetricsEvent, trackMetaMetricsEvent);
    this.messagingSystem.registerActionHandler(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:getEthQuery`,
      () => {
        return __privateGet(this, _ethQuery);
      }
    );
    this.messagingSystem.registerActionHandler(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:getNetworkClientById`,
      this.getNetworkClientById.bind(this)
    );
    this.messagingSystem.registerActionHandler(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:getEIP1559Compatibility`,
      this.getEIP1559Compatibility.bind(this)
    );
    this.messagingSystem.registerActionHandler(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:setActiveNetwork`,
      this.setActiveNetwork.bind(this)
    );
    this.messagingSystem.registerActionHandler(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:setProviderType`,
      this.setProviderType.bind(this)
    );
    this.messagingSystem.registerActionHandler(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:findNetworkClientIdByChainId`,
      this.findNetworkClientIdByChainId.bind(this)
    );
    this.messagingSystem.registerActionHandler(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:getNetworkConfigurationByNetworkClientId`,
      this.getNetworkConfigurationByNetworkClientId.bind(this)
    );
    this.messagingSystem.registerActionHandler(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:getSelectedNetworkClient`,
      this.getSelectedNetworkClient.bind(this)
    );
    __privateSet(this, _previouslySelectedNetworkClientId, this.state.selectedNetworkClientId);
    __privateSet(this, _log, log);
  }
  /**
   * Accesses the provider and block tracker for the currently selected network.
   * @returns The proxy and block tracker proxies.
   * @deprecated This method has been replaced by `getSelectedNetworkClient` (which has a more easily used return type) and will be removed in a future release.
   */
  getProviderAndBlockTracker() {
    return {
      provider: __privateGet(this, _providerProxy),
      blockTracker: __privateGet(this, _blockTrackerProxy)
    };
  }
  /**
   * Accesses the provider and block tracker for the currently selected network.
   *
   * @returns an object with the provider and block tracker proxies for the currently selected network.
   */
  getSelectedNetworkClient() {
    if (__privateGet(this, _providerProxy) && __privateGet(this, _blockTrackerProxy)) {
      return {
        provider: __privateGet(this, _providerProxy),
        blockTracker: __privateGet(this, _blockTrackerProxy)
      };
    }
    return void 0;
  }
  /**
   * Returns all of the network clients that have been created so far, keyed by
   * their identifier in the network client registry. This collection represents
   * not only built-in networks but also any custom networks that consumers have
   * added.
   *
   * @returns The list of known network clients.
   */
  getNetworkClientRegistry() {
    const autoManagedNetworkClientRegistry = __privateMethod(this, _ensureAutoManagedNetworkClientRegistryPopulated, ensureAutoManagedNetworkClientRegistryPopulated_fn).call(this);
    return Object.assign(
      {},
      autoManagedNetworkClientRegistry["infura" /* Infura */],
      autoManagedNetworkClientRegistry["custom" /* Custom */]
    );
  }
  getNetworkClientById(networkClientId) {
    if (!networkClientId) {
      throw new Error("No network client ID was provided.");
    }
    const autoManagedNetworkClientRegistry = __privateMethod(this, _ensureAutoManagedNetworkClientRegistryPopulated, ensureAutoManagedNetworkClientRegistryPopulated_fn).call(this);
    if (isInfuraNetworkType(networkClientId)) {
      const infuraNetworkClient = autoManagedNetworkClientRegistry["infura" /* Infura */][networkClientId];
      if (!infuraNetworkClient) {
        throw new Error(
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `No Infura network client was found with the ID "${networkClientId}".`
        );
      }
      return infuraNetworkClient;
    }
    const customNetworkClient = autoManagedNetworkClientRegistry["custom" /* Custom */][networkClientId];
    if (!customNetworkClient) {
      throw new Error(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `No custom network client was found with the ID "${networkClientId}".`
      );
    }
    return customNetworkClient;
  }
  /**
   * Creates network clients for built-in and custom networks, then establishes
   * the currently selected network client based on state.
   */
  async initializeProvider() {
    __privateMethod(this, _applyNetworkSelection, applyNetworkSelection_fn).call(this, this.state.selectedNetworkClientId);
    await this.lookupNetwork();
  }
  /**
   * Refreshes the network meta with EIP-1559 support and the network status
   * based on the given network client ID.
   *
   * @param networkClientId - The ID of the network client to update.
   */
  async lookupNetworkByClientId(networkClientId) {
    const isInfura = isInfuraNetworkType(networkClientId);
    let updatedNetworkStatus;
    let updatedIsEIP1559Compatible;
    try {
      updatedIsEIP1559Compatible = await __privateMethod(this, _determineEIP1559Compatibility, determineEIP1559Compatibility_fn).call(this, networkClientId);
      updatedNetworkStatus = "available" /* Available */;
    } catch (error) {
      debugLog("NetworkController: lookupNetworkByClientId: ", error);
      if (isErrorWithCode(error)) {
        let responseBody;
        if (isInfura && hasProperty(error, "message") && typeof error.message === "string") {
          try {
            responseBody = JSON.parse(error.message);
          } catch {
            __privateGet(this, _log)?.warn(
              "NetworkController: lookupNetworkByClientId: json parse error: ",
              error
            );
          }
        }
        if (isPlainObject(responseBody) && responseBody.error === INFURA_BLOCKED_KEY) {
          updatedNetworkStatus = "blocked" /* Blocked */;
        } else if (error.code === errorCodes.rpc.internal) {
          updatedNetworkStatus = "unknown" /* Unknown */;
          __privateGet(this, _log)?.warn(
            "NetworkController: lookupNetworkByClientId: rpc internal error: ",
            error
          );
        } else {
          updatedNetworkStatus = "unavailable" /* Unavailable */;
          __privateGet(this, _log)?.warn(
            "NetworkController: lookupNetworkByClientId: ",
            error
          );
        }
      } else if (typeof Error !== "undefined" && hasProperty(error, "message") && typeof error.message === "string" && error.message.includes(
        "No custom network client was found with the ID"
      )) {
        throw error;
      } else {
        debugLog(
          "NetworkController - could not determine network status",
          error
        );
        updatedNetworkStatus = "unknown" /* Unknown */;
        __privateGet(this, _log)?.warn("NetworkController: lookupNetworkByClientId: ", error);
      }
    }
    this.update((state) => {
      if (state.networksMetadata[networkClientId] === void 0) {
        state.networksMetadata[networkClientId] = {
          status: "unknown" /* Unknown */,
          EIPS: {}
        };
      }
      const meta = state.networksMetadata[networkClientId];
      meta.status = updatedNetworkStatus;
      if (updatedIsEIP1559Compatible === void 0) {
        delete meta.EIPS[1559];
      } else {
        meta.EIPS[1559] = updatedIsEIP1559Compatible;
      }
    });
  }
  /**
   * Persists the following metadata about the given or selected network to
   * state:
   *
   * - The status of the network, namely, whether it is available, geo-blocked
   * (Infura only), or unavailable, or whether the status is unknown
   * - Whether the network supports EIP-1559, or whether it is unknown
   *
   * Note that it is possible for the network to be switched while this data is
   * being collected. If that is the case, no metadata for the (now previously)
   * selected network will be updated.
   *
   * @param networkClientId - The ID of the network client to update.
   * If no ID is provided, uses the currently selected network.
   */
  async lookupNetwork(networkClientId) {
    if (networkClientId) {
      await this.lookupNetworkByClientId(networkClientId);
      return;
    }
    if (!__privateGet(this, _ethQuery)) {
      return;
    }
    const isInfura = __privateGet(this, _autoManagedNetworkClient)?.configuration.type === "infura" /* Infura */;
    let networkChanged = false;
    const listener = () => {
      networkChanged = true;
      this.messagingSystem.unsubscribe(
        "NetworkController:networkDidChange",
        listener
      );
    };
    this.messagingSystem.subscribe(
      "NetworkController:networkDidChange",
      listener
    );
    let updatedNetworkStatus;
    let updatedIsEIP1559Compatible;
    try {
      const isEIP1559Compatible = await __privateMethod(this, _determineEIP1559Compatibility, determineEIP1559Compatibility_fn).call(this, this.state.selectedNetworkClientId);
      updatedNetworkStatus = "available" /* Available */;
      updatedIsEIP1559Compatible = isEIP1559Compatible;
    } catch (error) {
      if (isErrorWithCode(error)) {
        let responseBody;
        if (isInfura && hasProperty(error, "message") && typeof error.message === "string") {
          try {
            responseBody = JSON.parse(error.message);
          } catch (parseError) {
            __privateGet(this, _log)?.warn(
              "NetworkController: lookupNetwork: json parse error",
              parseError
            );
          }
        }
        if (isPlainObject(responseBody) && responseBody.error === INFURA_BLOCKED_KEY) {
          updatedNetworkStatus = "blocked" /* Blocked */;
        } else if (error.code === errorCodes.rpc.internal) {
          updatedNetworkStatus = "unknown" /* Unknown */;
          __privateGet(this, _log)?.warn(
            "NetworkController: lookupNetwork: rpc internal error",
            error
          );
        } else {
          updatedNetworkStatus = "unavailable" /* Unavailable */;
          __privateGet(this, _log)?.warn("NetworkController: lookupNetwork: ", error);
        }
      } else {
        debugLog(
          "NetworkController - could not determine network status",
          error
        );
        updatedNetworkStatus = "unknown" /* Unknown */;
        __privateGet(this, _log)?.warn("NetworkController: lookupNetwork: ", error);
      }
    }
    if (networkChanged) {
      return;
    }
    this.messagingSystem.unsubscribe(
      "NetworkController:networkDidChange",
      listener
    );
    this.update((state) => {
      const meta = state.networksMetadata[state.selectedNetworkClientId];
      meta.status = updatedNetworkStatus;
      if (updatedIsEIP1559Compatible === void 0) {
        delete meta.EIPS[1559];
      } else {
        meta.EIPS[1559] = updatedIsEIP1559Compatible;
      }
    });
    if (isInfura) {
      if (updatedNetworkStatus === "available" /* Available */) {
        this.messagingSystem.publish("NetworkController:infuraIsUnblocked");
      } else if (updatedNetworkStatus === "blocked" /* Blocked */) {
        this.messagingSystem.publish("NetworkController:infuraIsBlocked");
      }
    } else {
      this.messagingSystem.publish("NetworkController:infuraIsUnblocked");
    }
  }
  /**
   * Convenience method to update provider network type settings.
   *
   * @param type - Human readable network name.
   * @deprecated This has been replaced by `setActiveNetwork`, and will be
   * removed in a future release
   */
  async setProviderType(type) {
    assert.notStrictEqual(
      type,
      NetworkType.rpc,
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `NetworkController - cannot call "setProviderType" with type "${NetworkType.rpc}". Use "setActiveNetwork"`
    );
    assert.ok(
      isInfuraNetworkType(type),
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `Unknown Infura provider type "${type}".`
    );
    await this.setActiveNetwork(type);
  }
  /**
   * Changes the selected network.
   *
   * @param networkClientId - The ID of a network client that requests will be
   * routed through (either the name of an Infura network or the ID of a custom
   * network configuration).
   * @throws if no network client is associated with the given
   * `networkClientId`.
   */
  async setActiveNetwork(networkClientId) {
    __privateSet(this, _previouslySelectedNetworkClientId, this.state.selectedNetworkClientId);
    await __privateMethod(this, _refreshNetwork, refreshNetwork_fn).call(this, networkClientId);
  }
  /**
   * Determines whether the network supports EIP-1559 by checking whether the
   * latest block has a `baseFeePerGas` property, then updates state
   * appropriately.
   *
   * @param networkClientId - The networkClientId to fetch the correct provider against which to check 1559 compatibility.
   * @returns A promise that resolves to true if the network supports EIP-1559
   * , false otherwise, or `undefined` if unable to determine the compatibility.
   */
  async getEIP1559Compatibility(networkClientId) {
    if (networkClientId) {
      return this.get1559CompatibilityWithNetworkClientId(networkClientId);
    }
    if (!__privateGet(this, _ethQuery)) {
      return false;
    }
    const { EIPS } = this.state.networksMetadata[this.state.selectedNetworkClientId];
    if (EIPS[1559] !== void 0) {
      return EIPS[1559];
    }
    const isEIP1559Compatible = await __privateMethod(this, _determineEIP1559Compatibility, determineEIP1559Compatibility_fn).call(this, this.state.selectedNetworkClientId);
    this.update((state) => {
      if (isEIP1559Compatible !== void 0) {
        state.networksMetadata[state.selectedNetworkClientId].EIPS[1559] = isEIP1559Compatible;
      }
    });
    return isEIP1559Compatible;
  }
  async get1559CompatibilityWithNetworkClientId(networkClientId) {
    let metadata = this.state.networksMetadata[networkClientId];
    if (metadata === void 0) {
      await this.lookupNetwork(networkClientId);
      metadata = this.state.networksMetadata[networkClientId];
    }
    const { EIPS } = metadata;
    return EIPS[1559];
  }
  /**
   * Ensures that the provider and block tracker proxies are pointed to the
   * currently selected network and refreshes the metadata for the
   */
  async resetConnection() {
    await __privateMethod(this, _refreshNetwork, refreshNetwork_fn).call(this, this.state.selectedNetworkClientId);
  }
  /**
   * Returns a configuration object for the network identified by the given
   * network client ID. If given an Infura network type, constructs one based on
   * what we know about the network; otherwise attempts locates a network
   * configuration in state that corresponds to the network client ID.
   *
   * @param networkClientId - The network client ID.
   * @returns The configuration for the referenced network if one exists, or
   * undefined otherwise.
   */
  getNetworkConfigurationByNetworkClientId(networkClientId) {
    if (isInfuraNetworkType(networkClientId)) {
      const rpcUrl = `https://${networkClientId}.infura.io/v3/${__privateGet(this, _infuraProjectId)}`;
      return {
        rpcUrl,
        ...BUILT_IN_NETWORKS[networkClientId]
      };
    }
    return this.state.networkConfigurations[networkClientId];
  }
  /**
   * Adds a new custom network or updates the information for an existing
   * network.
   *
   * This may involve updating the `networkConfigurations` property in
   * state as well and/or adding a new network client to the network client
   * registry. The `rpcUrl` and `chainId` of the given object are used to
   * determine which action to take:
   *
   * - If the `rpcUrl` corresponds to an existing network configuration
   * (case-insensitively), then it is overwritten with the object. Furthermore,
   * if the `chainId` is different from the existing network configuration, then
   * the existing network client is replaced with a new one.
   * - If the `rpcUrl` does not correspond to an existing network configuration
   * (case-insensitively), then the object is used to add a new network
   * configuration along with a new network client.
   *
   * @param networkConfiguration - The network configuration to add or update.
   * @param options - Additional configuration options.
   * @param options.referrer - Used to create a metrics event; the site from which the call originated, or 'metamask' for internal calls.
   * @param options.source - Used to create a metrics event; where the event originated (i.e. from a dapp or from the network form).
   * @param options.setActive - If true, switches to the network upon adding or updating it (default: false).
   * @returns The ID for the added or updated network configuration.
   */
  async upsertNetworkConfiguration(networkConfiguration, {
    referrer,
    source,
    setActive = false
  }) {
    const sanitizedNetworkConfiguration = pick(
      networkConfiguration,
      ["rpcUrl", "chainId", "ticker", "nickname", "rpcPrefs"]
    );
    const { rpcUrl, chainId, ticker } = sanitizedNetworkConfiguration;
    assertIsStrictHexString(chainId);
    if (!isSafeChainId(chainId)) {
      throw new Error(
        `Invalid chain ID "${chainId}": numerical value greater than max safe value.`
      );
    }
    if (!rpcUrl) {
      throw new Error(
        "An rpcUrl is required to add or update network configuration"
      );
    }
    if (!referrer || !source) {
      throw new Error(
        "referrer and source are required arguments for adding or updating a network configuration"
      );
    }
    try {
      new URL(rpcUrl);
    } catch (e) {
      if (e.message.includes("Invalid URL")) {
        throw new Error("rpcUrl must be a valid URL");
      }
    }
    if (!ticker) {
      throw new Error(
        "A ticker is required to add or update networkConfiguration"
      );
    }
    const autoManagedNetworkClientRegistry = __privateMethod(this, _ensureAutoManagedNetworkClientRegistryPopulated, ensureAutoManagedNetworkClientRegistryPopulated_fn).call(this);
    const existingNetworkConfiguration = Object.values(
      this.state.networkConfigurations
    ).find(
      (networkConfig) => networkConfig.rpcUrl.toLowerCase() === rpcUrl.toLowerCase()
    );
    const upsertedNetworkConfigurationId = existingNetworkConfiguration ? existingNetworkConfiguration.id : random();
    const networkClientId = upsertedNetworkConfigurationId;
    const customNetworkClientRegistry = autoManagedNetworkClientRegistry["custom" /* Custom */];
    const existingAutoManagedNetworkClient = customNetworkClientRegistry[networkClientId];
    const shouldDestroyExistingNetworkClient = existingAutoManagedNetworkClient && existingAutoManagedNetworkClient.configuration.chainId !== chainId;
    if (shouldDestroyExistingNetworkClient) {
      existingAutoManagedNetworkClient.destroy();
    }
    if (!existingAutoManagedNetworkClient || shouldDestroyExistingNetworkClient) {
      customNetworkClientRegistry[networkClientId] = createAutoManagedNetworkClient({
        type: "custom" /* Custom */,
        chainId,
        rpcUrl,
        ticker
      });
    }
    this.update((state) => {
      state.networkConfigurations[upsertedNetworkConfigurationId] = {
        id: upsertedNetworkConfigurationId,
        ...sanitizedNetworkConfiguration
      };
    });
    if (!existingNetworkConfiguration) {
      __privateGet(this, _trackMetaMetricsEvent).call(this, {
        event: "Custom Network Added",
        category: "Network",
        referrer: {
          url: referrer
        },
        properties: {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          chain_id: chainId,
          symbol: ticker,
          source
        }
      });
    }
    if (setActive) {
      await this.setActiveNetwork(upsertedNetworkConfigurationId);
    }
    return upsertedNetworkConfigurationId;
  }
  /**
   * Removes a custom network from state.
   *
   * This involves updating the `networkConfigurations` property in state as
   * well and removing the network client that corresponds to the network from
   * the client registry.
   *
   * @param networkConfigurationId - The ID of an existing network
   * configuration.
   */
  removeNetworkConfiguration(networkConfigurationId) {
    if (!this.state.networkConfigurations[networkConfigurationId]) {
      throw new Error(
        `networkConfigurationId ${networkConfigurationId} does not match a configured networkConfiguration`
      );
    }
    const autoManagedNetworkClientRegistry = __privateMethod(this, _ensureAutoManagedNetworkClientRegistryPopulated, ensureAutoManagedNetworkClientRegistryPopulated_fn).call(this);
    const networkClientId = networkConfigurationId;
    this.update((state) => {
      delete state.networkConfigurations[networkConfigurationId];
    });
    const customNetworkClientRegistry = autoManagedNetworkClientRegistry["custom" /* Custom */];
    const existingAutoManagedNetworkClient = customNetworkClientRegistry[networkClientId];
    existingAutoManagedNetworkClient.destroy();
    delete customNetworkClientRegistry[networkClientId];
  }
  /**
   * Assuming that the network has been previously switched, switches to this
   * new network.
   *
   * If the network has not been previously switched, this method is equivalent
   * to {@link resetConnection}.
   */
  async rollbackToPreviousProvider() {
    await __privateMethod(this, _refreshNetwork, refreshNetwork_fn).call(this, __privateGet(this, _previouslySelectedNetworkClientId));
  }
  /**
   * Deactivates the controller, stopping any ongoing polling.
   *
   * In-progress requests will not be aborted.
   */
  async destroy() {
    await __privateGet(this, _blockTrackerProxy)?.destroy();
  }
  /**
   * Updates the controller using the given backup data.
   *
   * @param backup - The data that has been backed up.
   * @param backup.networkConfigurations - Network configurations in the backup.
   */
  loadBackup({
    networkConfigurations
  }) {
    this.update((state) => {
      state.networkConfigurations = {
        ...state.networkConfigurations,
        ...networkConfigurations
      };
    });
  }
  /**
   * Searches for a network configuration ID with the given ChainID and returns it.
   *
   * @param chainId - ChainId to search for
   * @returns networkClientId of the network configuration with the given chainId
   */
  findNetworkClientIdByChainId(chainId) {
    const networkClients = this.getNetworkClientRegistry();
    const networkClientEntry = Object.entries(networkClients).find(
      ([_, networkClient]) => networkClient.configuration.chainId === chainId
    );
    if (networkClientEntry === void 0) {
      throw new Error("Couldn't find networkClientId for chainId");
    }
    return networkClientEntry[0];
  }
};
_ethQuery = new WeakMap();
_infuraProjectId = new WeakMap();
_trackMetaMetricsEvent = new WeakMap();
_previouslySelectedNetworkClientId = new WeakMap();
_providerProxy = new WeakMap();
_blockTrackerProxy = new WeakMap();
_autoManagedNetworkClientRegistry = new WeakMap();
_autoManagedNetworkClient = new WeakMap();
_log = new WeakMap();
_refreshNetwork = new WeakSet();
refreshNetwork_fn = async function(networkClientId) {
  this.messagingSystem.publish(
    "NetworkController:networkWillChange",
    this.state
  );
  __privateMethod(this, _applyNetworkSelection, applyNetworkSelection_fn).call(this, networkClientId);
  this.messagingSystem.publish(
    "NetworkController:networkDidChange",
    this.state
  );
  await this.lookupNetwork();
};
_getLatestBlock = new WeakSet();
getLatestBlock_fn = function(networkClientId) {
  if (networkClientId === void 0) {
    networkClientId = this.state.selectedNetworkClientId;
  }
  const networkClient = this.getNetworkClientById(networkClientId);
  const ethQuery = new EthQuery(networkClient.provider);
  return new Promise((resolve, reject) => {
    ethQuery.sendAsync(
      { method: "eth_getBlockByNumber", params: ["latest", false] },
      (error, block) => {
        if (error) {
          reject(error);
        } else {
          resolve(block);
        }
      }
    );
  });
};
_determineEIP1559Compatibility = new WeakSet();
determineEIP1559Compatibility_fn = async function(networkClientId) {
  const latestBlock = await __privateMethod(this, _getLatestBlock, getLatestBlock_fn).call(this, networkClientId);
  if (!latestBlock) {
    return void 0;
  }
  return latestBlock.baseFeePerGas !== void 0;
};
_ensureAutoManagedNetworkClientRegistryPopulated = new WeakSet();
ensureAutoManagedNetworkClientRegistryPopulated_fn = function() {
  const autoManagedNetworkClientRegistry = __privateGet(this, _autoManagedNetworkClientRegistry) ?? __privateMethod(this, _createAutoManagedNetworkClientRegistry, createAutoManagedNetworkClientRegistry_fn).call(this);
  __privateSet(this, _autoManagedNetworkClientRegistry, autoManagedNetworkClientRegistry);
  return autoManagedNetworkClientRegistry;
};
_createAutoManagedNetworkClientRegistry = new WeakSet();
createAutoManagedNetworkClientRegistry_fn = function() {
  return [
    ...__privateMethod(this, _buildIdentifiedInfuraNetworkClientConfigurations, buildIdentifiedInfuraNetworkClientConfigurations_fn).call(this),
    ...__privateMethod(this, _buildIdentifiedCustomNetworkClientConfigurations, buildIdentifiedCustomNetworkClientConfigurations_fn).call(this)
  ].reduce(
    (registry, [networkClientType, networkClientId, networkClientConfiguration]) => {
      const autoManagedNetworkClient = createAutoManagedNetworkClient(
        networkClientConfiguration
      );
      return {
        ...registry,
        [networkClientType]: {
          ...registry[networkClientType],
          [networkClientId]: autoManagedNetworkClient
        }
      };
    },
    {
      ["infura" /* Infura */]: {},
      ["custom" /* Custom */]: {}
    }
  );
};
_buildIdentifiedInfuraNetworkClientConfigurations = new WeakSet();
buildIdentifiedInfuraNetworkClientConfigurations_fn = function() {
  return knownKeysOf(InfuraNetworkType).map((network) => {
    const networkClientConfiguration = {
      type: "infura" /* Infura */,
      network,
      infuraProjectId: __privateGet(this, _infuraProjectId),
      chainId: BUILT_IN_NETWORKS[network].chainId,
      ticker: BUILT_IN_NETWORKS[network].ticker
    };
    return ["infura" /* Infura */, network, networkClientConfiguration];
  });
};
_buildIdentifiedCustomNetworkClientConfigurations = new WeakSet();
buildIdentifiedCustomNetworkClientConfigurations_fn = function() {
  return Object.entries(this.state.networkConfigurations).map(
    ([networkConfigurationId, networkConfiguration]) => {
      const networkClientId = networkConfigurationId;
      const networkClientConfiguration = {
        type: "custom" /* Custom */,
        chainId: networkConfiguration.chainId,
        rpcUrl: networkConfiguration.rpcUrl,
        ticker: networkConfiguration.ticker
      };
      return [
        "custom" /* Custom */,
        networkClientId,
        networkClientConfiguration
      ];
    }
  );
};
_applyNetworkSelection = new WeakSet();
applyNetworkSelection_fn = function(networkClientId) {
  const autoManagedNetworkClientRegistry = __privateMethod(this, _ensureAutoManagedNetworkClientRegistryPopulated, ensureAutoManagedNetworkClientRegistryPopulated_fn).call(this);
  let autoManagedNetworkClient;
  if (isInfuraNetworkType(networkClientId)) {
    const possibleAutoManagedNetworkClient = autoManagedNetworkClientRegistry["infura" /* Infura */][networkClientId];
    if (!possibleAutoManagedNetworkClient) {
      throw new Error(
        `Infura network client not found with ID '${networkClientId}'`
      );
    }
    autoManagedNetworkClient = possibleAutoManagedNetworkClient;
  } else {
    const possibleAutoManagedNetworkClient = autoManagedNetworkClientRegistry["custom" /* Custom */][networkClientId];
    if (!possibleAutoManagedNetworkClient) {
      throw new Error(
        `Custom network client not found with ID '${networkClientId}'`
      );
    }
    autoManagedNetworkClient = possibleAutoManagedNetworkClient;
  }
  __privateSet(this, _autoManagedNetworkClient, autoManagedNetworkClient);
  this.update((state) => {
    state.selectedNetworkClientId = networkClientId;
    if (state.networksMetadata[networkClientId] === void 0) {
      state.networksMetadata[networkClientId] = {
        status: "unknown" /* Unknown */,
        EIPS: {}
      };
    }
  });
  if (__privateGet(this, _providerProxy)) {
    __privateGet(this, _providerProxy).setTarget(__privateGet(this, _autoManagedNetworkClient).provider);
  } else {
    __privateSet(this, _providerProxy, createEventEmitterProxy(
      __privateGet(this, _autoManagedNetworkClient).provider
    ));
  }
  if (__privateGet(this, _blockTrackerProxy)) {
    __privateGet(this, _blockTrackerProxy).setTarget(
      __privateGet(this, _autoManagedNetworkClient).blockTracker
    );
  } else {
    __privateSet(this, _blockTrackerProxy, createEventEmitterProxy(
      __privateGet(this, _autoManagedNetworkClient).blockTracker,
      { eventFilter: "skipInternal" }
    ));
  }
  __privateSet(this, _ethQuery, new EthQuery(__privateGet(this, _providerProxy)));
};

export {
  knownKeysOf,
  defaultState,
  NetworkController
};
//# sourceMappingURL=chunk-6PT34M4U.mjs.map