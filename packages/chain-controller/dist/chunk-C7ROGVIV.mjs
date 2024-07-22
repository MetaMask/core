import {
  __privateAdd,
  __privateGet,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/SnapChainProviderClient.ts
import { ChainRpcMethod } from "@metamask/chain-api";
var _client;
var SnapChainProviderClient = class {
  /**
   * Constructor for `SnapChainProviderClient`.
   *
   * @param client - A Snap handler client.
   */
  constructor(client) {
    __privateAdd(this, _client, void 0);
    /**
     * Fetches asset balances for each given accounts.
     *
     * @param scope - CAIP-2 chain ID that must compatible with `accounts`.
     * @param accounts - Accounts (addresses).
     * @param assets - List of CAIP-19 asset identifiers to fetch balances from.
     * @returns Assets balances for each accounts.
     */
    this.getBalances = async (scope, accounts, assets) => {
      return await __privateGet(this, _client).submitRequest(ChainRpcMethod.GetBalances, {
        scope,
        accounts,
        assets
      });
    };
    __privateSet(this, _client, client);
  }
};
_client = new WeakMap();

export {
  SnapChainProviderClient
};
//# sourceMappingURL=chunk-C7ROGVIV.mjs.map