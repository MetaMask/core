"use strict";Object.defineProperty(exports, "__esModule", {value: true});



var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/TokenBalancesController.ts
var _basecontroller = require('@metamask/base-controller');
var _controllerutils = require('@metamask/controller-utils');
var DEFAULT_INTERVAL = 18e4;
var controllerName = "TokenBalancesController";
var metadata = {
  contractBalances: { persist: true, anonymous: false }
};
function getDefaultTokenBalancesState() {
  return {
    contractBalances: {}
  };
}
var _handle, _interval, _tokens, _disabled;
var TokenBalancesController = class extends _basecontroller.BaseController {
  /**
   * Construct a Token Balances Controller.
   *
   * @param options - The controller options.
   * @param options.interval - Polling interval used to fetch new token balances.
   * @param options.tokens - List of tokens to track balances for.
   * @param options.disabled - If set to true, all tracked tokens contract balances updates are blocked.
   * @param options.state - Initial state to set on this controller.
   * @param options.messenger - The controller restricted messenger.
   */
  constructor({
    interval = DEFAULT_INTERVAL,
    tokens = [],
    disabled = false,
    messenger,
    state = {}
  }) {
    super({
      name: controllerName,
      metadata,
      messenger,
      state: {
        ...getDefaultTokenBalancesState(),
        ...state
      }
    });
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _handle, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _interval, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _tokens, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _disabled, void 0);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _disabled, disabled);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _interval, interval);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _tokens, tokens);
    this.messagingSystem.subscribe(
      "TokensController:stateChange",
      ({ tokens: newTokens, detectedTokens }) => {
        _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _tokens, [...newTokens, ...detectedTokens]);
        this.updateBalances();
      }
    );
    this.poll();
  }
  /**
   * Allows controller to update tracked tokens contract balances.
   */
  enable() {
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _disabled, false);
  }
  /**
   * Blocks controller from updating tracked tokens contract balances.
   */
  disable() {
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _disabled, true);
  }
  /**
   * Starts a new polling interval.
   *
   * @param interval - Polling interval used to fetch new token balances.
   */
  async poll(interval) {
    if (interval) {
      _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _interval, interval);
    }
    if (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _handle)) {
      clearTimeout(_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _handle));
    }
    await _controllerutils.safelyExecute.call(void 0, () => this.updateBalances());
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _handle, setTimeout(() => {
      this.poll(_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _interval));
    }, _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _interval)));
  }
  /**
   * Updates balances for all tokens.
   */
  async updateBalances() {
    if (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _disabled)) {
      return;
    }
    const selectedInternalAccount = this.messagingSystem.call(
      "AccountsController:getSelectedAccount"
    );
    const newContractBalances = {};
    for (const token of _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _tokens)) {
      const { address } = token;
      try {
        const balance = await this.messagingSystem.call(
          "AssetsContractController:getERC20BalanceOf",
          address,
          selectedInternalAccount.address
        );
        newContractBalances[address] = _controllerutils.toHex.call(void 0, balance);
        token.hasBalanceError = false;
      } catch (error) {
        newContractBalances[address] = _controllerutils.toHex.call(void 0, 0);
        token.hasBalanceError = true;
      }
    }
    this.update((state) => {
      state.contractBalances = newContractBalances;
    });
  }
};
_handle = new WeakMap();
_interval = new WeakMap();
_tokens = new WeakMap();
_disabled = new WeakMap();
var TokenBalancesController_default = TokenBalancesController;





exports.getDefaultTokenBalancesState = getDefaultTokenBalancesState; exports.TokenBalancesController = TokenBalancesController; exports.TokenBalancesController_default = TokenBalancesController_default;
//# sourceMappingURL=chunk-YGGUAMHV.js.map