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
exports.PhishingController = void 0;
const punycode_1 = require("punycode/");
const config_json_1 = __importDefault(require("eth-phishing-detect/src/config.json"));
const detector_1 = __importDefault(require("eth-phishing-detect/src/detector"));
const BaseController_1 = require("../BaseController");
/**
 * Controller that passively polls on a set interval for approved and unapproved website origins
 */
class PhishingController extends BaseController_1.BaseController {
    /**
     * Creates a PhishingController instance.
     *
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor(config, state) {
        super(config, state);
        this.configUrlMetaMask = 'https://cdn.jsdelivr.net/gh/MetaMask/eth-phishing-detect@master/src/config.json';
        this.configUrlPhishFortHotlist = `https://cdn.jsdelivr.net/gh/phishfort/phishfort-lists@master/blacklists/hotlist.json`;
        this.lastFetched = 0;
        /**
         * Name of this controller used during composition
         */
        this.name = 'PhishingController';
        this.defaultConfig = {
            refreshInterval: 60 * 60 * 1000,
        };
        this.defaultState = {
            phishing: [
                {
                    allowlist: config_json_1.default
                        .whitelist,
                    blocklist: config_json_1.default
                        .blacklist,
                    fuzzylist: config_json_1.default
                        .fuzzylist,
                    tolerance: config_json_1.default
                        .tolerance,
                    name: `MetaMask`,
                    version: config_json_1.default.version,
                },
            ],
            whitelist: [],
        };
        this.detector = new detector_1.default(this.defaultState.phishing);
        this.initialize();
    }
    /**
     * Set the interval at which the phishing list will be refetched. Fetching will only occur on the next call to test/bypass. For immediate update to the phishing list, call updatePhishingLists directly.
     *
     * @param interval - the new interval, in ms.
     */
    setRefreshInterval(interval) {
        this.configure({ refreshInterval: interval }, false, false);
    }
    /**
     * Calls this.updatePhishingLists if this.refreshInterval has passed since last this.lastFetched.
     *
     * @returns Promise<void> when finished fetching phishing lists or when fetching in not necessary.
     */
    fetchIfNecessary() {
        return __awaiter(this, void 0, void 0, function* () {
            const outOfDate = Date.now() - this.lastFetched >= this.config.refreshInterval;
            if (outOfDate) {
                yield this.updatePhishingLists();
            }
        });
    }
    /**
     * Determines if a given origin is unapproved.
     *
     * @param origin - Domain origin of a website.
     * @returns Promise<EthPhishingDetectResult> Whether the origin is an unapproved origin.
     */
    test(origin) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.fetchIfNecessary();
            const punycodeOrigin = (0, punycode_1.toASCII)(origin);
            if (this.state.whitelist.indexOf(punycodeOrigin) !== -1) {
                return { result: false, type: 'all' }; // Same as whitelisted match returned by detector.check(...).
            }
            return this.detector.check(punycodeOrigin);
        });
    }
    /**
     * Temporarily marks a given origin as approved.
     *
     * @param origin - The origin to mark as approved.
     */
    bypass(origin) {
        const punycodeOrigin = (0, punycode_1.toASCII)(origin);
        const { whitelist } = this.state;
        if (whitelist.indexOf(punycodeOrigin) !== -1) {
            return;
        }
        this.update({ whitelist: [...whitelist, punycodeOrigin] });
    }
    /**
     * Updates lists of approved and unapproved website origins.
     */
    updatePhishingLists() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.disabled) {
                return;
            }
            const configs = [];
            const [metamaskConfigLegacy, phishfortHotlist] = yield Promise.all([
                yield this.queryConfig(this.configUrlMetaMask),
                yield this.queryConfig(this.configUrlPhishFortHotlist),
            ]);
            // Correctly shaping MetaMask config.
            const metamaskConfig = {
                allowlist: metamaskConfigLegacy ? metamaskConfigLegacy.whitelist : [],
                blocklist: metamaskConfigLegacy ? metamaskConfigLegacy.blacklist : [],
                fuzzylist: metamaskConfigLegacy ? metamaskConfigLegacy.fuzzylist : [],
                tolerance: metamaskConfigLegacy ? metamaskConfigLegacy.tolerance : 0,
                name: `MetaMask`,
                version: metamaskConfigLegacy ? metamaskConfigLegacy.version : 0,
            };
            if (metamaskConfigLegacy) {
                configs.push(metamaskConfig);
            }
            // Correctly shaping PhishFort config.
            const phishfortConfig = {
                allowlist: [],
                blocklist: (phishfortHotlist || []).filter((i) => !metamaskConfig.blocklist.includes(i)),
                fuzzylist: [],
                tolerance: 0,
                name: `PhishFort`,
                version: 1,
            };
            if (phishfortHotlist) {
                configs.push(phishfortConfig);
            }
            // Do not update if all configs are unavailable.
            if (!configs.length) {
                return;
            }
            this.detector = new detector_1.default(configs);
            this.update({
                phishing: configs,
            });
            this.lastFetched = Date.now();
        });
    }
    queryConfig(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield fetch(input, { cache: 'no-cache' });
            switch (response.status) {
                case 200: {
                    return yield response.json();
                }
                default: {
                    return null;
                }
            }
        });
    }
}
exports.PhishingController = PhishingController;
exports.default = PhishingController;
//# sourceMappingURL=PhishingController.js.map