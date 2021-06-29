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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenBalancesController = exports.BN = void 0;
const ethereumjs_util_1 = require("ethereumjs-util");
Object.defineProperty(exports, "BN", { enumerable: true, get: function () { return ethereumjs_util_1.BN; } });
const BaseController_1 = __importDefault(require("../BaseController"));
const util_1 = require("../util");
/**
 * Controller that passively polls on a set interval token balances
 * for tokens stored in the AssetsController
 */
class TokenBalancesController extends BaseController_1.default {
    /**
     * Creates a TokenBalancesController instance
     *
     * @param options
     * @param options.onAssetsStateChange - Allows subscribing to assets controller state changes
     * @param options.getSelectedAddress - Gets the current selected address
     * @param options.getBalanceOf - Gets the balance of the given account at the given contract address
     * @param config - Initial options used to configure this controller
     * @param state - Initial state to set on this controller
     */
    constructor({ onAssetsStateChange, getSelectedAddress, getBalanceOf, }, config, state) {
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
        onAssetsStateChange(({ tokens }) => {
            this.configure({ tokens });
            this.updateBalances();
        });
        this.getSelectedAddress = getSelectedAddress;
        this.getBalanceOf = getBalanceOf;
        this.poll();
    }
    /**
     * Starts a new polling interval
     *
     * @param interval - Polling interval used to fetch new token balances
     */
    poll(interval) {
        return __awaiter(this, void 0, void 0, function* () {
            interval && this.configure({ interval }, false, false);
            this.handle && clearTimeout(this.handle);
            yield util_1.safelyExecute(() => this.updateBalances());
            this.handle = setTimeout(() => {
                this.poll(this.config.interval);
            }, this.config.interval);
        });
    }
    /**
     * Updates balances for all tokens
     *
     * @returns Promise resolving when this operation completes
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
                    newContractBalances[address] = yield this.getBalanceOf(address, this.getSelectedAddress());
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