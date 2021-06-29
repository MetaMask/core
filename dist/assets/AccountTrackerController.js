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
exports.AccountTrackerController = void 0;
const eth_query_1 = __importDefault(require("eth-query"));
const async_mutex_1 = require("async-mutex");
const BaseController_1 = __importDefault(require("../BaseController"));
const util_1 = require("../util");
/**
 * Controller that tracks information for all accounts in the current keychain
 */
class AccountTrackerController extends BaseController_1.default {
    /**
     * Creates an AccountTracker instance
     *
     * @param options
     * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes
     * @param options.getIdentities - Gets the identities from the Preferences store
     * @param config - Initial options used to configure this controller
     * @param state - Initial state to set on this controller
     */
    constructor({ onPreferencesStateChange, getIdentities, }, config, state) {
        super(config, state);
        this.mutex = new async_mutex_1.Mutex();
        /**
         * Name of this controller used during composition
         */
        this.name = 'AccountTrackerController';
        /**
         * Refreshes all accounts in the current keychain
         */
        this.refresh = () => __awaiter(this, void 0, void 0, function* () {
            this.syncAccounts();
            const { accounts } = this.state;
            for (const address in accounts) {
                yield util_1.safelyExecuteWithTimeout(() => __awaiter(this, void 0, void 0, function* () {
                    const balance = yield util_1.query(this.ethQuery, 'getBalance', [address]);
                    accounts[address] = { balance: util_1.BNToHex(balance) };
                    this.update({ accounts: Object.assign({}, accounts) });
                }));
            }
        });
        this.defaultConfig = {
            interval: 10000,
        };
        this.defaultState = { accounts: {} };
        this.initialize();
        this.getIdentities = getIdentities;
        onPreferencesStateChange(() => {
            this.refresh();
        });
        this.poll();
    }
    syncAccounts() {
        const { accounts } = this.state;
        const addresses = Object.keys(this.getIdentities());
        const existing = Object.keys(accounts);
        const newAddresses = addresses.filter((address) => existing.indexOf(address) === -1);
        const oldAddresses = existing.filter((address) => addresses.indexOf(address) === -1);
        newAddresses.forEach((address) => {
            accounts[address] = { balance: '0x0' };
        });
        oldAddresses.forEach((address) => {
            delete accounts[address];
        });
        this.update({ accounts: Object.assign({}, accounts) });
    }
    /**
     * Sets a new provider
     *
     * TODO: Replace this wth a method
     *
     * @param provider - Provider used to create a new underlying EthQuery instance
     */
    set provider(provider) {
        this.ethQuery = new eth_query_1.default(provider);
    }
    get provider() {
        throw new Error('Property only used for setting');
    }
    /**
     * Starts a new polling interval
     *
     * @param interval - Polling interval trigger a 'refresh'
     */
    poll(interval) {
        return __awaiter(this, void 0, void 0, function* () {
            const releaseLock = yield this.mutex.acquire();
            interval && this.configure({ interval }, false, false);
            this.handle && clearTimeout(this.handle);
            yield this.refresh();
            this.handle = setTimeout(() => {
                releaseLock();
                this.poll(this.config.interval);
            }, this.config.interval);
        });
    }
}
exports.AccountTrackerController = AccountTrackerController;
exports.default = AccountTrackerController;
//# sourceMappingURL=AccountTrackerController.js.map