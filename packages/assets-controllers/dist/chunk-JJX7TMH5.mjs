import {
  __privateAdd,
  __privateGet,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/TokenBalancesController.ts
import { BaseController } from "@metamask/base-controller";
import { safelyExecute, toHex } from "@metamask/controller-utils";
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
var TokenBalancesController = class extends BaseController {
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
    __privateAdd(this, _handle, void 0);
    __privateAdd(this, _interval, void 0);
    __privateAdd(this, _tokens, void 0);
    __privateAdd(this, _disabled, void 0);
    __privateSet(this, _disabled, disabled);
    __privateSet(this, _interval, interval);
    __privateSet(this, _tokens, tokens);
    this.messagingSystem.subscribe(
      "TokensController:stateChange",
      ({ tokens: newTokens, detectedTokens }) => {
        __privateSet(this, _tokens, [...newTokens, ...detectedTokens]);
        this.updateBalances();
      }
    );
    this.poll();
  }
  /**
   * Allows controller to update tracked tokens contract balances.
   */
  enable() {
    __privateSet(this, _disabled, false);
  }
  /**
   * Blocks controller from updating tracked tokens contract balances.
   */
  disable() {
    __privateSet(this, _disabled, true);
  }
  /**
   * Starts a new polling interval.
   *
   * @param interval - Polling interval used to fetch new token balances.
   */
  async poll(interval) {
    if (interval) {
      __privateSet(this, _interval, interval);
    }
    if (__privateGet(this, _handle)) {
      clearTimeout(__privateGet(this, _handle));
    }
    await safelyExecute(() => this.updateBalances());
    __privateSet(this, _handle, setTimeout(() => {
      this.poll(__privateGet(this, _interval));
    }, __privateGet(this, _interval)));
  }
  /**
   * Updates balances for all tokens.
   */
  async updateBalances() {
    if (__privateGet(this, _disabled)) {
      return;
    }
    const selectedInternalAccount = this.messagingSystem.call(
      "AccountsController:getSelectedAccount"
    );
    const newContractBalances = {};
    for (const token of __privateGet(this, _tokens)) {
      const { address } = token;
      try {
        const balance = await this.messagingSystem.call(
          "AssetsContractController:getERC20BalanceOf",
          address,
          selectedInternalAccount.address
        );
        newContractBalances[address] = toHex(balance);
        token.hasBalanceError = false;
      } catch (error) {
        newContractBalances[address] = toHex(0);
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

export {
  getDefaultTokenBalancesState,
  TokenBalancesController,
  TokenBalancesController_default
};
//# sourceMappingURL=chunk-JJX7TMH5.mjs.map