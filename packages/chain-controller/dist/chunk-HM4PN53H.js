"use strict";Object.defineProperty(exports, "__esModule", {value: true});



var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/SnapChainProviderClient.ts
var _chainapi = require('@metamask/chain-api');
var _client;
var SnapChainProviderClient = class {
  /**
   * Constructor for `SnapChainProviderClient`.
   *
   * @param client - A Snap handler client.
   */
  constructor(client) {
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _client, void 0);
    /**
     * Fetches asset balances for each given accounts.
     *
     * @param scope - CAIP-2 chain ID that must compatible with `accounts`.
     * @param accounts - Accounts (addresses).
     * @param assets - List of CAIP-19 asset identifiers to fetch balances from.
     * @returns Assets balances for each accounts.
     */
    this.getBalances = async (scope, accounts, assets) => {
      return await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _client).submitRequest(_chainapi.ChainRpcMethod.GetBalances, {
        scope,
        accounts,
        assets
      });
    };
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _client, client);
  }
};
_client = new WeakMap();



exports.SnapChainProviderClient = SnapChainProviderClient;
//# sourceMappingURL=chunk-HM4PN53H.js.map