"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkHM4PN53Hjs = require('./chunk-HM4PN53H.js');


var _chunkZS3LBXVMjs = require('./chunk-ZS3LBXVM.js');





var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/ChainController.ts
var _basecontroller = require('@metamask/base-controller');
var controllerName = "ChainController";
var defaultState = {};
var _providers, _getProviderClient, getProviderClient_fn, _registerMessageHandlers, registerMessageHandlers_fn;
var ChainController = class extends _basecontroller.BaseController {
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
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getProviderClient);
    /**
     * Registers message handlers for the ChainController.
     * @private
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _registerMessageHandlers);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _providers, void 0);
    /**
     * Fetches asset balances for each given accounts.
     *
     * @param scope - CAIP-2 chain ID that must compatible with `accounts`.
     * @param accounts - Accounts (addresses).
     * @param assets - List of CAIP-19 asset identifiers to fetch balances from.
     * @returns Assets balances for each accounts.
     */
    this.getBalances = async (scope, accounts, assets) => {
      return await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getProviderClient, getProviderClient_fn).call(this, scope).getBalances(
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
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _providers, {});
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _registerMessageHandlers, registerMessageHandlers_fn).call(this);
  }
  /**
   * Checks whether a chain provider has been registered for a given scope.
   *
   * @param scope - CAIP-2 chain ID.
   * @returns True if there is a registerd provider, false otherwise.
   */
  hasProviderFor(scope) {
    return scope in _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _providers);
  }
  /**
   * Registers a Snap chain provider for a given scope.
   *
   * @param scope - CAIP-2 chain ID.
   * @param snapId - Snap ID that implements the Chain API methods.
   * @returns A SnapChainProviderClient for this Snap.
   */
  registerProvider(scope, snapId) {
    const client = new (0, _chunkZS3LBXVMjs.SnapHandlerClient)({
      snapId,
      handler: (request) => {
        return this.messagingSystem.call(
          "SnapController:handleRequest",
          request
        );
      }
    });
    const provider = new (0, _chunkHM4PN53Hjs.SnapChainProviderClient)(client);
    if (this.hasProviderFor(scope)) {
      throw new Error(
        `Found an already existing provider for scope: "${scope}"`
      );
    }
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _providers)[scope] = provider;
    return provider;
  }
};
_providers = new WeakMap();
_getProviderClient = new WeakSet();
getProviderClient_fn = function(scope) {
  if (scope in _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _providers)) {
    return _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _providers)[scope];
  }
  const error = `No Chain provider found for scope: "${scope}"`;
  console.error(error, _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _providers));
  throw new Error(error);
};
_registerMessageHandlers = new WeakSet();
registerMessageHandlers_fn = function() {
};



exports.ChainController = ChainController;
//# sourceMappingURL=chunk-WRRW5IT7.js.map