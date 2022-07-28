"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenBalancesController = exports.BN = void 0;
const ethereumjs_util_1 = require("ethereumjs-util");
Object.defineProperty(exports, "BN", { enumerable: true, get: function () { return ethereumjs_util_1.BN; } });
const BaseController_1 = require("../BaseController");
const util_1 = require("../util");
/**
 * Controller that passively polls on a set interval token balances
 * for tokens stored in the TokensController
 */
class TokenBalancesController extends BaseController_1.BaseController {
    /**
     * Creates a TokenBalancesController instance.
     *
     * @param options - The controller options.
     * @param options.onTokensStateChange - Allows subscribing to assets controller state changes.
     * @param options.getSelectedAddress - Gets the current selected address.
     * @param options.getERC20BalanceOf - Gets the balance of the given account at the given contract address.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ onTokensStateChange, getSelectedAddress, getERC20BalanceOf, }, config, state) {
        super(config, state);
        /**
         * Name of this controller used during composition
         */
        this.name = 'TokenBalancesController';
        this.defaultConfig = {
            interval: 180000,
            tokens: [],
        };
        this.defaultState = { contractBalances: {} };
        this.initialize();
        onTokensStateChange(({ tokens, detectedTokens }) => {
            this.configure({ tokens: [...tokens, ...detectedTokens] });
            this.updateBalances();
        });
        this.getSelectedAddress = getSelectedAddress;
        this.getERC20BalanceOf = getERC20BalanceOf;
        this.poll();
    }
    /**
     * Starts a new polling interval.
     *
     * @param interval - Polling interval used to fetch new token balances.
     */
    poll(interval) {
        return __awaiter(this, void 0, void 0, function* () {
            interval && this.configure({ interval }, false, false);
            this.handle && clearTimeout(this.handle);
            yield (0, util_1.safelyExecute)(() => this.updateBalances());
            this.handle = setTimeout(() => {
                this.poll(this.config.interval);
            }, this.config.interval);
        });
    }
    /**
     * Updates balances for all tokens.
     */
    updateBalances() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.disabled) {
                return;
            }
            const { tokens } = this.config;
            const newContractBalances = {};
            for (const i in tokens) {
                const { address } = tokens[i];
                try {
                    newContractBalances[address] = yield this.getERC20BalanceOf(address, this.getSelectedAddress());
                    tokens[i].balanceError = null;
                }
                catch (error) {
                    newContractBalances[address] = new ethereumjs_util_1.BN(0);
                    tokens[i].balanceError = error;
                }
            }
            this.update({ contractBalances: newContractBalances });
        });
    }
}
exports.TokenBalancesController = TokenBalancesController;
exports.default = TokenBalancesController;
//# sourceMappingURL=TokenBalancesController.js.map