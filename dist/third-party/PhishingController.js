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
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _PhishingController_instances, _PhishingController_inProgressUpdate, _PhishingController_updatePhishingLists;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhishingController = exports.PHISHFORT_HOTLIST_URL = exports.METAMASK_CONFIG_URL = exports.PHISHFORT_HOTLIST_FILE = exports.METAMASK_CONFIG_FILE = exports.PHISHING_CONFIG_BASE_URL = void 0;
const punycode_1 = require("punycode/");
const config_json_1 = __importDefault(require("eth-phishing-detect/src/config.json"));
const detector_1 = __importDefault(require("eth-phishing-detect/src/detector"));
const BaseController_1 = require("../BaseController");
const util_1 = require("../util");
exports.PHISHING_CONFIG_BASE_URL = 'https://static.metafi.codefi.network/api/v1/lists';
exports.METAMASK_CONFIG_FILE = '/eth_phishing_detect_config.json';
exports.PHISHFORT_HOTLIST_FILE = '/phishfort_hotlist.json';
exports.METAMASK_CONFIG_URL = `${exports.PHISHING_CONFIG_BASE_URL}${exports.METAMASK_CONFIG_FILE}`;
exports.PHISHFORT_HOTLIST_URL = `${exports.PHISHING_CONFIG_BASE_URL}${exports.PHISHFORT_HOTLIST_FILE}`;
/**
 * Controller that manages community-maintained lists of approved and unapproved website origins.
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
        _PhishingController_instances.add(this);
        this.lastFetched = 0;
        _PhishingController_inProgressUpdate.set(this, void 0);
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
                    allowlist: config_json_1.default.whitelist,
                    blocklist: config_json_1.default.blacklist,
                    fuzzylist: config_json_1.default.fuzzylist,
                    tolerance: config_json_1.default.tolerance,
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
     * Determine if an update to the phishing configuration is needed.
     *
     * @returns Whether an update is needed
     */
    isOutOfDate() {
        return Date.now() - this.lastFetched >= this.config.refreshInterval;
    }
    /**
     * Determines if a given origin is unapproved.
     *
     * It is strongly recommended that you call {@link isOutOfDate} before calling this,
     * to check whether the phishing configuration is up-to-date. It can be
     * updated by calling {@link updatePhishingLists}.
     *
     * @param origin - Domain origin of a website.
     * @returns Whether the origin is an unapproved origin.
     */
    test(origin) {
        const punycodeOrigin = (0, punycode_1.toASCII)(origin);
        if (this.state.whitelist.indexOf(punycodeOrigin) !== -1) {
            return { result: false, type: 'all' }; // Same as whitelisted match returned by detector.check(...).
        }
        return this.detector.check(punycodeOrigin);
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
     * Update the phishing configuration.
     *
     * If an update is in progress, no additional update will be made. Instead this will wait until
     * the in-progress update has finished.
     */
    updatePhishingLists() {
        return __awaiter(this, void 0, void 0, function* () {
            if (__classPrivateFieldGet(this, _PhishingController_inProgressUpdate, "f")) {
                yield __classPrivateFieldGet(this, _PhishingController_inProgressUpdate, "f");
                return;
            }
            try {
                __classPrivateFieldSet(this, _PhishingController_inProgressUpdate, __classPrivateFieldGet(this, _PhishingController_instances, "m", _PhishingController_updatePhishingLists).call(this), "f");
                yield __classPrivateFieldGet(this, _PhishingController_inProgressUpdate, "f");
            }
            finally {
                __classPrivateFieldSet(this, _PhishingController_inProgressUpdate, undefined, "f");
            }
        });
    }
    queryConfig(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield (0, util_1.safelyExecute)(() => fetch(input, { cache: 'no-cache' }), true);
            switch (response === null || response === void 0 ? void 0 : response.status) {
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
_PhishingController_inProgressUpdate = new WeakMap(), _PhishingController_instances = new WeakSet(), _PhishingController_updatePhishingLists = function _PhishingController_updatePhishingLists() {
    return __awaiter(this, void 0, void 0, function* () {
        if (this.disabled) {
            return;
        }
        const configs = [];
        let metamaskConfigLegacy;
        let phishfortHotlist;
        try {
            [metamaskConfigLegacy, phishfortHotlist] = yield Promise.all([
                this.queryConfig(exports.METAMASK_CONFIG_URL),
                this.queryConfig(exports.PHISHFORT_HOTLIST_URL),
            ]);
        }
        finally {
            // Set `lastFetched` even for failed requests to prevent server from being overwhelmed with
            // traffic after a network disruption.
            this.lastFetched = Date.now();
        }
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
    });
};
exports.default = PhishingController;
//# sourceMappingURL=PhishingController.js.map