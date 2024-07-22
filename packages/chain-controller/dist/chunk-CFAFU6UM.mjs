import {
  SnapChainProviderClient
} from "./chunk-C7ROGVIV.mjs";
import {
  SnapHandlerClient
} from "./chunk-3JPVIA5L.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/ChainController.ts
import { BaseController } from "@metamask/base-controller";
var controllerName = "ChainController";
var defaultState = {};
var _providers, _getProviderClient, getProviderClient_fn, _registerMessageHandlers, registerMessageHandlers_fn;
var ChainController = class extends BaseController {
  /**
   * Constructor for ChainController.
   *
   * @param options - The controller options.
   * @param options.messenger - The messenger object.
   * @param options.state - Initial state to set on this controller
   */
  constructor({
    messenger,
    state = {}
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: {},
      state: {
        ...defaultState,
        ...state
      }
    });
    /**
     * Get a SnapChainProviderClient for a given scope.
     *
     * @private
     * @param scope - CAIP-2 chain ID.
     * @throws If no chain provider has been registered for this scope.
     * @returns The associated SnapChainProviderClient.
     */
    __privateAdd(this, _getProviderClient);
    /**
     * Registers message handlers for the ChainController.
     * @private
     */
    __privateAdd(this, _registerMessageHandlers);
    __privateAdd(this, _providers, void 0);
    /**
     * Fetches asset balances for each given accounts.
     *
     * @param scope - CAIP-2 chain ID that must compatible with `accounts`.
     * @param accounts - Accounts (addresses).
     * @param assets - List of CAIP-19 asset identifiers to fetch balances from.
     * @returns Assets balances for each accounts.
     */
    this.getBalances = async (scope, accounts, assets) => {
      return await __privateMethod(this, _getProviderClient, getProviderClient_fn).call(this, scope).getBalances(
        scope,
        accounts,
        assets
      );
    };
    /**
     * Fetches asset balances for a given internal account.
     *
     * @param scope - CAIP-2 chain ID that must compatible with `accounts`.
     * @param account - The internal account.
     * @param assets - List of CAIP-19 asset identifiers to fetch balances from.
     * @returns Assets balances for the internal accounts.
     */
    this.getBalancesFromAccount = async (scope, account, assets) => {
      return this.getBalances(scope, [account.address], assets);
    };
    __privateSet(this, _providers, {});
    __privateMethod(this, _registerMessageHandlers, registerMessageHandlers_fn).call(this);
  }
  /**
   * Checks whether a chain provider has been registered for a given scope.
   *
   * @param scope - CAIP-2 chain ID.
   * @returns True if there is a registerd provider, false otherwise.
   */
  hasProviderFor(scope) {
    return scope in __privateGet(this, _providers);
  }
  /**
   * Registers a Snap chain provider for a given scope.
   *
   * @param scope - CAIP-2 chain ID.
   * @param snapId - Snap ID that implements the Chain API methods.
   * @returns A SnapChainProviderClient for this Snap.
   */
  registerProvider(scope, snapId) {
    const client = new SnapHandlerClient({
      snapId,
      handler: (request) => {
        return this.messagingSystem.call(
          "SnapController:handleRequest",
          request
        );
      }
    });
    const provider = new SnapChainProviderClient(client);
    if (this.hasProviderFor(scope)) {
      throw new Error(
        `Found an already existing provider for scope: "${scope}"`
      );
    }
    __privateGet(this, _providers)[scope] = provider;
    return provider;
  }
};
_providers = new WeakMap();
_getProviderClient = new WeakSet();
getProviderClient_fn = function(scope) {
  if (scope in __privateGet(this, _providers)) {
    return __privateGet(this, _providers)[scope];
  }
  const error = `No Chain provider found for scope: "${scope}"`;
  console.error(error, __privateGet(this, _providers));
  throw new Error(error);
};
_registerMessageHandlers = new WeakSet();
registerMessageHandlers_fn = function() {
};

export {
  ChainController
};
//# sourceMappingURL=chunk-CFAFU6UM.mjs.map