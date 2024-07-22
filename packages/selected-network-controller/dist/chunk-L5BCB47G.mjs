var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet = (obj, member, value, setter) => {
  __accessCheck(obj, member, "write to private field");
  setter ? setter.call(obj, value) : member.set(obj, value);
  return value;
};
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};

// src/SelectedNetworkController.ts
import { BaseController } from "@metamask/base-controller";
import { createEventEmitterProxy } from "@metamask/swappable-obj-proxy";
var controllerName = "SelectedNetworkController";
var stateMetadata = {
  domains: { persist: true, anonymous: false }
};
var getDefaultState = () => ({ domains: {} });
var snapsPrefixes = ["npm:", "local:"];
var METAMASK_DOMAIN = "metamask";
var SelectedNetworkControllerActionTypes = {
  getState: `${controllerName}:getState`,
  getNetworkClientIdForDomain: `${controllerName}:getNetworkClientIdForDomain`,
  setNetworkClientIdForDomain: `${controllerName}:setNetworkClientIdForDomain`
};
var SelectedNetworkControllerEventTypes = {
  stateChange: `${controllerName}:stateChange`
};
var _domainProxyMap, _useRequestQueuePreference, _registerMessageHandlers, registerMessageHandlers_fn, _setNetworkClientIdForDomain, setNetworkClientIdForDomain_fn, _unsetNetworkClientIdForDomain, unsetNetworkClientIdForDomain_fn, _domainHasPermissions, domainHasPermissions_fn, _resetAllPermissionedDomains, resetAllPermissionedDomains_fn;
var SelectedNetworkController = class extends BaseController {
  /**
   * Construct a SelectedNetworkController controller.
   *
   * @param options - The controller options.
   * @param options.messenger - The restricted controller messenger for the EncryptionPublicKey controller.
   * @param options.state - The controllers initial state.
   * @param options.useRequestQueuePreference - A boolean indicating whether to use the request queue preference.
   * @param options.onPreferencesStateChange - A callback that is called when the preference state changes.
   * @param options.domainProxyMap - A map for storing domain-specific proxies that are held in memory only during use.
   */
  constructor({
    messenger,
    state = getDefaultState(),
    useRequestQueuePreference,
    onPreferencesStateChange,
    domainProxyMap
  }) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state
    });
    __privateAdd(this, _registerMessageHandlers);
    __privateAdd(this, _setNetworkClientIdForDomain);
    /**
     * This method is used when a domain is removed from the PermissionsController.
     * It will remove re-point the network proxy to the globally selected network in the domainProxyMap or, if no globally selected network client is available, delete the proxy.
     *
     * @param domain - The domain for which to unset the network client ID.
     */
    __privateAdd(this, _unsetNetworkClientIdForDomain);
    __privateAdd(this, _domainHasPermissions);
    // Loop through all domains and for those with permissions it points that domain's proxy
    // to an unproxied instance of the globally selected network client.
    // NOT the NetworkController's proxy of the globally selected networkClient
    __privateAdd(this, _resetAllPermissionedDomains);
    __privateAdd(this, _domainProxyMap, void 0);
    __privateAdd(this, _useRequestQueuePreference, void 0);
    __privateSet(this, _useRequestQueuePreference, useRequestQueuePreference);
    __privateSet(this, _domainProxyMap, domainProxyMap);
    __privateMethod(this, _registerMessageHandlers, registerMessageHandlers_fn).call(this);
    this.messagingSystem.call("PermissionController:getSubjectNames").filter((domain) => this.state.domains[domain] === void 0).forEach(
      (domain) => this.setNetworkClientIdForDomain(
        domain,
        this.messagingSystem.call("NetworkController:getState").selectedNetworkClientId
      )
    );
    this.messagingSystem.subscribe(
      "PermissionController:stateChange",
      (_, patches) => {
        patches.forEach(({ op, path }) => {
          const isChangingSubject = path[0] === "subjects" && path[1] !== void 0;
          if (isChangingSubject && typeof path[1] === "string") {
            const domain = path[1];
            if (op === "add" && this.state.domains[domain] === void 0) {
              this.setNetworkClientIdForDomain(
                domain,
                this.messagingSystem.call("NetworkController:getState").selectedNetworkClientId
              );
            } else if (op === "remove" && this.state.domains[domain] !== void 0) {
              __privateMethod(this, _unsetNetworkClientIdForDomain, unsetNetworkClientIdForDomain_fn).call(this, domain);
            }
          }
        });
      }
    );
    this.messagingSystem.subscribe(
      "NetworkController:stateChange",
      ({ selectedNetworkClientId }, patches) => {
        patches.forEach(({ op, path }) => {
          if (op === "remove" && path[0] === "networkConfigurations") {
            const removedNetworkClientId = path[1];
            Object.entries(this.state.domains).forEach(
              ([domain, networkClientIdForDomain]) => {
                if (networkClientIdForDomain === removedNetworkClientId) {
                  this.setNetworkClientIdForDomain(
                    domain,
                    selectedNetworkClientId
                  );
                }
              }
            );
          }
        });
      }
    );
    onPreferencesStateChange(({ useRequestQueue }) => {
      if (__privateGet(this, _useRequestQueuePreference) !== useRequestQueue) {
        if (!useRequestQueue) {
          Object.keys(this.state.domains).forEach((domain) => {
            __privateMethod(this, _unsetNetworkClientIdForDomain, unsetNetworkClientIdForDomain_fn).call(this, domain);
          });
        } else {
          __privateMethod(this, _resetAllPermissionedDomains, resetAllPermissionedDomains_fn).call(this);
        }
        __privateSet(this, _useRequestQueuePreference, useRequestQueue);
      }
    });
  }
  setNetworkClientIdForDomain(domain, networkClientId) {
    if (!__privateGet(this, _useRequestQueuePreference)) {
      return;
    }
    if (domain === METAMASK_DOMAIN) {
      throw new Error(
        `NetworkClientId for domain "${METAMASK_DOMAIN}" cannot be set on the SelectedNetworkController`
      );
    }
    if (snapsPrefixes.some((prefix) => domain.startsWith(prefix))) {
      return;
    }
    if (!__privateMethod(this, _domainHasPermissions, domainHasPermissions_fn).call(this, domain)) {
      throw new Error(
        "NetworkClientId for domain cannot be called with a domain that has not yet been granted permissions"
      );
    }
    __privateMethod(this, _setNetworkClientIdForDomain, setNetworkClientIdForDomain_fn).call(this, domain, networkClientId);
  }
  getNetworkClientIdForDomain(domain) {
    const { selectedNetworkClientId: metamaskSelectedNetworkClientId } = this.messagingSystem.call("NetworkController:getState");
    if (!__privateGet(this, _useRequestQueuePreference)) {
      return metamaskSelectedNetworkClientId;
    }
    return this.state.domains[domain] ?? metamaskSelectedNetworkClientId;
  }
  /**
   * Accesses the provider and block tracker for the currently selected network.
   *
   * @param domain - the domain for the provider
   * @returns The proxy and block tracker proxies.
   */
  getProviderAndBlockTracker(domain) {
    if (domain === METAMASK_DOMAIN || snapsPrefixes.some((prefix) => domain.startsWith(prefix))) {
      const networkClient = this.messagingSystem.call(
        "NetworkController:getSelectedNetworkClient"
      );
      if (networkClient === void 0) {
        throw new Error("Selected network not initialized");
      }
      return networkClient;
    }
    let networkProxy = __privateGet(this, _domainProxyMap).get(domain);
    if (networkProxy === void 0) {
      let networkClient;
      if (__privateGet(this, _useRequestQueuePreference) && __privateMethod(this, _domainHasPermissions, domainHasPermissions_fn).call(this, domain)) {
        const networkClientId = this.getNetworkClientIdForDomain(domain);
        networkClient = this.messagingSystem.call(
          "NetworkController:getNetworkClientById",
          networkClientId
        );
      } else {
        networkClient = this.messagingSystem.call(
          "NetworkController:getSelectedNetworkClient"
        );
        if (networkClient === void 0) {
          throw new Error("Selected network not initialized");
        }
      }
      networkProxy = {
        provider: createEventEmitterProxy(networkClient.provider),
        blockTracker: createEventEmitterProxy(networkClient.blockTracker, {
          eventFilter: "skipInternal"
        })
      };
      __privateGet(this, _domainProxyMap).set(domain, networkProxy);
    }
    return networkProxy;
  }
};
_domainProxyMap = new WeakMap();
_useRequestQueuePreference = new WeakMap();
_registerMessageHandlers = new WeakSet();
registerMessageHandlers_fn = function() {
  this.messagingSystem.registerActionHandler(
    SelectedNetworkControllerActionTypes.getNetworkClientIdForDomain,
    this.getNetworkClientIdForDomain.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    SelectedNetworkControllerActionTypes.setNetworkClientIdForDomain,
    this.setNetworkClientIdForDomain.bind(this)
  );
};
_setNetworkClientIdForDomain = new WeakSet();
setNetworkClientIdForDomain_fn = function(domain, networkClientId) {
  const networkClient = this.messagingSystem.call(
    "NetworkController:getNetworkClientById",
    networkClientId
  );
  const networkProxy = this.getProviderAndBlockTracker(domain);
  networkProxy.provider.setTarget(networkClient.provider);
  networkProxy.blockTracker.setTarget(networkClient.blockTracker);
  this.update((state) => {
    state.domains[domain] = networkClientId;
  });
};
_unsetNetworkClientIdForDomain = new WeakSet();
unsetNetworkClientIdForDomain_fn = function(domain) {
  const globallySelectedNetworkClient = this.messagingSystem.call(
    "NetworkController:getSelectedNetworkClient"
  );
  const networkProxy = __privateGet(this, _domainProxyMap).get(domain);
  if (networkProxy && globallySelectedNetworkClient) {
    networkProxy.provider.setTarget(globallySelectedNetworkClient.provider);
    networkProxy.blockTracker.setTarget(
      globallySelectedNetworkClient.blockTracker
    );
  } else if (networkProxy) {
    __privateGet(this, _domainProxyMap).delete(domain);
  }
  this.update((state) => {
    delete state.domains[domain];
  });
};
_domainHasPermissions = new WeakSet();
domainHasPermissions_fn = function(domain) {
  return this.messagingSystem.call(
    "PermissionController:hasPermissions",
    domain
  );
};
_resetAllPermissionedDomains = new WeakSet();
resetAllPermissionedDomains_fn = function() {
  __privateGet(this, _domainProxyMap).forEach((_, domain) => {
    const { selectedNetworkClientId } = this.messagingSystem.call(
      "NetworkController:getState"
    );
    if (__privateMethod(this, _domainHasPermissions, domainHasPermissions_fn).call(this, domain)) {
      __privateMethod(this, _setNetworkClientIdForDomain, setNetworkClientIdForDomain_fn).call(this, domain, selectedNetworkClientId);
    }
  });
};

export {
  controllerName,
  METAMASK_DOMAIN,
  SelectedNetworkControllerActionTypes,
  SelectedNetworkControllerEventTypes,
  SelectedNetworkController
};
//# sourceMappingURL=chunk-L5BCB47G.mjs.map