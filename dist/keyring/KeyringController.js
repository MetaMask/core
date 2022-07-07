"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _KeyringController_keyring;
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyringController = exports.SignTypedDataVersion = exports.AccountImportStrategy = exports.KeyringTypes = void 0;
const ethereumjs_util_1 = require("ethereumjs-util");
const eth_sig_util_1 = require("eth-sig-util");
const ethereumjs_wallet_1 = __importStar(require("ethereumjs-wallet"));
const eth_keyring_controller_1 = __importDefault(require("eth-keyring-controller"));
const async_mutex_1 = require("async-mutex");
const BaseController_1 = require("../BaseController");
const util_1 = require("../util");
/**
 * Available keyring types
 */
var KeyringTypes;
(function (KeyringTypes) {
    KeyringTypes["simple"] = "Simple Key Pair";
    KeyringTypes["hd"] = "HD Key Tree";
    KeyringTypes["qr"] = "QR Hardware Wallet Device";
})(KeyringTypes = exports.KeyringTypes || (exports.KeyringTypes = {}));
/**
 * A strategy for importing an account
 */
var AccountImportStrategy;
(function (AccountImportStrategy) {
    AccountImportStrategy["privateKey"] = "privateKey";
    AccountImportStrategy["json"] = "json";
})(AccountImportStrategy = exports.AccountImportStrategy || (exports.AccountImportStrategy = {}));
/**
 * The `signTypedMessage` version
 *
 * @see https://docs.metamask.io/guide/signing-data.html
 */
var SignTypedDataVersion;
(function (SignTypedDataVersion) {
    SignTypedDataVersion["V1"] = "V1";
    SignTypedDataVersion["V3"] = "V3";
    SignTypedDataVersion["V4"] = "V4";
})(SignTypedDataVersion = exports.SignTypedDataVersion || (exports.SignTypedDataVersion = {}));
/**
 * Controller responsible for establishing and managing user identity
 */
class KeyringController extends BaseController_1.BaseController {
    /**
     * Creates a KeyringController instance.
     *
     * @param options - The controller options.
     * @param options.removeIdentity - Remove the identity with the given address.
     * @param options.syncIdentities - Sync identities with the given list of addresses.
     * @param options.updateIdentities - Generate an identity for each address given that doesn't already have an identity.
     * @param options.setSelectedAddress - Set the selected address.
     * @param options.setAccountLabel - Set a new name for account.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ removeIdentity, syncIdentities, updateIdentities, setSelectedAddress, setAccountLabel, }, config, state) {
        super(config, state);
        this.mutex = new async_mutex_1.Mutex();
        /**
         * Name of this controller used during composition
         */
        this.name = 'KeyringController';
        _KeyringController_keyring.set(this, void 0);
        __classPrivateFieldSet(this, _KeyringController_keyring, new eth_keyring_controller_1.default(Object.assign({ initState: state }, config)), "f");
        this.defaultState = Object.assign(Object.assign({}, __classPrivateFieldGet(this, _KeyringController_keyring, "f").store.getState()), { keyrings: [] });
        this.removeIdentity = removeIdentity;
        this.syncIdentities = syncIdentities;
        this.updateIdentities = updateIdentities;
        this.setSelectedAddress = setSelectedAddress;
        this.setAccountLabel = setAccountLabel;
        this.initialize();
        this.fullUpdate();
    }
    /**
     * Adds a new account to the default (first) HD seed phrase keyring.
     *
     * @returns Promise resolving to current state when the account is added.
     */
    addNewAccount() {
        return __awaiter(this, void 0, void 0, function* () {
            const primaryKeyring = __classPrivateFieldGet(this, _KeyringController_keyring, "f").getKeyringsByType('HD Key Tree')[0];
            /* istanbul ignore if */
            if (!primaryKeyring) {
                throw new Error('No HD keyring found');
            }
            const oldAccounts = yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").getAccounts();
            yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").addNewAccount(primaryKeyring);
            const newAccounts = yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").getAccounts();
            yield this.verifySeedPhrase();
            this.updateIdentities(newAccounts);
            newAccounts.forEach((selectedAddress) => {
                if (!oldAccounts.includes(selectedAddress)) {
                    this.setSelectedAddress(selectedAddress);
                }
            });
            return this.fullUpdate();
        });
    }
    /**
     * Adds a new account to the default (first) HD seed phrase keyring without updating identities in preferences.
     *
     * @returns Promise resolving to current state when the account is added.
     */
    addNewAccountWithoutUpdate() {
        return __awaiter(this, void 0, void 0, function* () {
            const primaryKeyring = __classPrivateFieldGet(this, _KeyringController_keyring, "f").getKeyringsByType('HD Key Tree')[0];
            /* istanbul ignore if */
            if (!primaryKeyring) {
                throw new Error('No HD keyring found');
            }
            yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").addNewAccount(primaryKeyring);
            yield this.verifySeedPhrase();
            return this.fullUpdate();
        });
    }
    /**
     * Effectively the same as creating a new keychain then populating it
     * using the given seed phrase.
     *
     * @param password - Password to unlock keychain.
     * @param seed - A BIP39-compliant seed phrase,
     * either as a string or an array of UTF-8 bytes that represent the string.
     * @returns Promise resolving to the restored keychain object.
     */
    createNewVaultAndRestore(password, seed) {
        return __awaiter(this, void 0, void 0, function* () {
            const releaseLock = yield this.mutex.acquire();
            if (!password || !password.length) {
                throw new Error('Invalid password');
            }
            try {
                this.updateIdentities([]);
                const vault = yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").createNewVaultAndRestore(password, seed);
                this.updateIdentities(yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").getAccounts());
                this.fullUpdate();
                return vault;
            }
            finally {
                releaseLock();
            }
        });
    }
    /**
     * Create a new primary keychain and wipe any previous keychains.
     *
     * @param password - Password to unlock the new vault.
     * @returns Newly-created keychain object.
     */
    createNewVaultAndKeychain(password) {
        return __awaiter(this, void 0, void 0, function* () {
            const releaseLock = yield this.mutex.acquire();
            try {
                const vault = yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").createNewVaultAndKeychain(password);
                this.updateIdentities(yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").getAccounts());
                this.fullUpdate();
                return vault;
            }
            finally {
                releaseLock();
            }
        });
    }
    /**
     * Returns the status of the vault.
     *
     * @returns Boolean returning true if the vault is unlocked.
     */
    isUnlocked() {
        return __classPrivateFieldGet(this, _KeyringController_keyring, "f").memStore.getState().isUnlocked;
    }
    /**
     * Gets the seed phrase of the HD keyring.
     *
     * @param password - Password of the keyring.
     * @returns Promise resolving to the seed phrase.
     */
    exportSeedPhrase(password) {
        if (__classPrivateFieldGet(this, _KeyringController_keyring, "f").password === password) {
            return __classPrivateFieldGet(this, _KeyringController_keyring, "f").keyrings[0].mnemonic;
        }
        throw new Error('Invalid password');
    }
    /**
     * Gets the private key from the keyring controlling an address.
     *
     * @param password - Password of the keyring.
     * @param address - Address to export.
     * @returns Promise resolving to the private key for an address.
     */
    exportAccount(password, address) {
        if (__classPrivateFieldGet(this, _KeyringController_keyring, "f").password === password) {
            return __classPrivateFieldGet(this, _KeyringController_keyring, "f").exportAccount(address);
        }
        throw new Error('Invalid password');
    }
    /**
     * Returns the public addresses of all accounts for the current keyring.
     *
     * @returns A promise resolving to an array of addresses.
     */
    getAccounts() {
        return __classPrivateFieldGet(this, _KeyringController_keyring, "f").getAccounts();
    }
    /**
     * Imports an account with the specified import strategy.
     *
     * @param strategy - Import strategy name.
     * @param args - Array of arguments to pass to the underlying stategy.
     * @throws Will throw when passed an unrecognized strategy.
     * @returns Promise resolving to current state when the import is complete.
     */
    importAccountWithStrategy(strategy, args) {
        return __awaiter(this, void 0, void 0, function* () {
            let privateKey;
            switch (strategy) {
                case 'privateKey':
                    const [importedKey] = args;
                    if (!importedKey) {
                        throw new Error('Cannot import an empty key.');
                    }
                    const prefixed = (0, ethereumjs_util_1.addHexPrefix)(importedKey);
                    let bufferedPrivateKey;
                    try {
                        bufferedPrivateKey = (0, ethereumjs_util_1.toBuffer)(prefixed);
                    }
                    catch (_a) {
                        throw new Error('Cannot import invalid private key.');
                    }
                    /* istanbul ignore if */
                    if (!(0, ethereumjs_util_1.isValidPrivate)(bufferedPrivateKey)) {
                        throw new Error('Cannot import invalid private key.');
                    }
                    privateKey = (0, ethereumjs_util_1.stripHexPrefix)(prefixed);
                    break;
                case 'json':
                    let wallet;
                    const [input, password] = args;
                    try {
                        wallet = ethereumjs_wallet_1.thirdparty.fromEtherWallet(input, password);
                    }
                    catch (e) {
                        wallet = wallet || (yield ethereumjs_wallet_1.default.fromV3(input, password, true));
                    }
                    privateKey = (0, ethereumjs_util_1.bufferToHex)(wallet.getPrivateKey());
                    break;
                default:
                    throw new Error(`Unexpected import strategy: '${strategy}'`);
            }
            const newKeyring = yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").addNewKeyring(KeyringTypes.simple, [
                privateKey,
            ]);
            const accounts = yield newKeyring.getAccounts();
            const allAccounts = yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").getAccounts();
            this.updateIdentities(allAccounts);
            this.setSelectedAddress(accounts[0]);
            return this.fullUpdate();
        });
    }
    /**
     * Removes an account from keyring state.
     *
     * @param address - Address of the account to remove.
     * @returns Promise resolving current state when this account removal completes.
     */
    removeAccount(address) {
        return __awaiter(this, void 0, void 0, function* () {
            this.removeIdentity(address);
            yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").removeAccount(address);
            return this.fullUpdate();
        });
    }
    /**
     * Deallocates all secrets and locks the wallet.
     *
     * @returns Promise resolving to current state.
     */
    setLocked() {
        return __classPrivateFieldGet(this, _KeyringController_keyring, "f").setLocked();
    }
    /**
     * Signs message by calling down into a specific keyring.
     *
     * @param messageParams - PersonalMessageParams object to sign.
     * @returns Promise resolving to a signed message string.
     */
    signMessage(messageParams) {
        return __classPrivateFieldGet(this, _KeyringController_keyring, "f").signMessage(messageParams);
    }
    /**
     * Signs personal message by calling down into a specific keyring.
     *
     * @param messageParams - PersonalMessageParams object to sign.
     * @returns Promise resolving to a signed message string.
     */
    signPersonalMessage(messageParams) {
        return __classPrivateFieldGet(this, _KeyringController_keyring, "f").signPersonalMessage(messageParams);
    }
    /**
     * Signs typed message by calling down into a specific keyring.
     *
     * @param messageParams - TypedMessageParams object to sign.
     * @param version - Compatibility version EIP712.
     * @throws Will throw when passed an unrecognized version.
     * @returns Promise resolving to a signed message string or an error if any.
     */
    signTypedMessage(messageParams, version) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const address = (0, eth_sig_util_1.normalize)(messageParams.from);
                const qrKeyring = yield this.getOrAddQRKeyring();
                const qrAccounts = yield qrKeyring.getAccounts();
                if (qrAccounts.findIndex((qrAddress) => qrAddress.toLowerCase() === address.toLowerCase()) !== -1) {
                    const messageParamsClone = Object.assign({}, messageParams);
                    if (version !== SignTypedDataVersion.V1 &&
                        typeof messageParamsClone.data === 'string') {
                        messageParamsClone.data = JSON.parse(messageParamsClone.data);
                    }
                    return __classPrivateFieldGet(this, _KeyringController_keyring, "f").signTypedMessage(messageParamsClone, { version });
                }
                const { password } = __classPrivateFieldGet(this, _KeyringController_keyring, "f");
                const privateKey = yield this.exportAccount(password, address);
                const privateKeyBuffer = (0, ethereumjs_util_1.toBuffer)((0, ethereumjs_util_1.addHexPrefix)(privateKey));
                switch (version) {
                    case SignTypedDataVersion.V1:
                        // signTypedDataLegacy will throw if the data is invalid.
                        return (0, eth_sig_util_1.signTypedDataLegacy)(privateKeyBuffer, {
                            data: messageParams.data,
                        });
                    case SignTypedDataVersion.V3:
                        return (0, eth_sig_util_1.signTypedData)(privateKeyBuffer, {
                            data: JSON.parse(messageParams.data),
                        });
                    case SignTypedDataVersion.V4:
                        return (0, eth_sig_util_1.signTypedData_v4)(privateKeyBuffer, {
                            data: JSON.parse(messageParams.data),
                        });
                    default:
                        throw new Error(`Unexpected signTypedMessage version: '${version}'`);
                }
            }
            catch (error) {
                throw new Error(`Keyring Controller signTypedMessage: ${error}`);
            }
        });
    }
    /**
     * Signs a transaction by calling down into a specific keyring.
     *
     * @param transaction - Transaction object to sign. Must be a `ethereumjs-tx` transaction instance.
     * @param from - Address to sign from, should be in keychain.
     * @returns Promise resolving to a signed transaction string.
     */
    signTransaction(transaction, from) {
        return __classPrivateFieldGet(this, _KeyringController_keyring, "f").signTransaction(transaction, from);
    }
    /**
     * Attempts to decrypt the current vault and load its keyrings.
     *
     * @param password - Password to unlock the keychain.
     * @returns Promise resolving to the current state.
     */
    submitPassword(password) {
        return __awaiter(this, void 0, void 0, function* () {
            yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").submitPassword(password);
            const accounts = yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").getAccounts();
            yield this.syncIdentities(accounts);
            return this.fullUpdate();
        });
    }
    /**
     * Adds new listener to be notified of state changes.
     *
     * @param listener - Callback triggered when state changes.
     */
    subscribe(listener) {
        __classPrivateFieldGet(this, _KeyringController_keyring, "f").store.subscribe(listener);
    }
    /**
     * Removes existing listener from receiving state changes.
     *
     * @param listener - Callback to remove.
     * @returns True if a listener is found and unsubscribed.
     */
    unsubscribe(listener) {
        return __classPrivateFieldGet(this, _KeyringController_keyring, "f").store.unsubscribe(listener);
    }
    /**
     * Adds new listener to be notified when the wallet is locked.
     *
     * @param listener - Callback triggered when wallet is locked.
     * @returns EventEmitter if listener added.
     */
    onLock(listener) {
        return __classPrivateFieldGet(this, _KeyringController_keyring, "f").on('lock', listener);
    }
    /**
     * Adds new listener to be notified when the wallet is unlocked.
     *
     * @param listener - Callback triggered when wallet is unlocked.
     * @returns EventEmitter if listener added.
     */
    onUnlock(listener) {
        return __classPrivateFieldGet(this, _KeyringController_keyring, "f").on('unlock', listener);
    }
    /**
     * Verifies the that the seed phrase restores the current keychain's accounts.
     *
     * @returns Whether the verification succeeds.
     */
    verifySeedPhrase() {
        return __awaiter(this, void 0, void 0, function* () {
            const primaryKeyring = __classPrivateFieldGet(this, _KeyringController_keyring, "f").getKeyringsByType(KeyringTypes.hd)[0];
            /* istanbul ignore if */
            if (!primaryKeyring) {
                throw new Error('No HD keyring found.');
            }
            const seedWords = (yield primaryKeyring.serialize()).mnemonic;
            const accounts = yield primaryKeyring.getAccounts();
            /* istanbul ignore if */
            if (accounts.length === 0) {
                throw new Error('Cannot verify an empty keyring.');
            }
            const TestKeyringClass = __classPrivateFieldGet(this, _KeyringController_keyring, "f").getKeyringClassForType(KeyringTypes.hd);
            const testKeyring = new TestKeyringClass({
                mnemonic: seedWords,
                numberOfAccounts: accounts.length,
            });
            const testAccounts = yield testKeyring.getAccounts();
            /* istanbul ignore if */
            if (testAccounts.length !== accounts.length) {
                throw new Error('Seed phrase imported incorrect number of accounts.');
            }
            testAccounts.forEach((account, i) => {
                /* istanbul ignore if */
                if (account.toLowerCase() !== accounts[i].toLowerCase()) {
                    throw new Error('Seed phrase imported different accounts.');
                }
            });
            return seedWords;
        });
    }
    /**
     * Update keyrings in state and calls KeyringController fullUpdate method returning current state.
     *
     * @returns The current state.
     */
    fullUpdate() {
        return __awaiter(this, void 0, void 0, function* () {
            const keyrings = yield Promise.all(__classPrivateFieldGet(this, _KeyringController_keyring, "f").keyrings.map((keyring, index) => __awaiter(this, void 0, void 0, function* () {
                const keyringAccounts = yield keyring.getAccounts();
                const accounts = Array.isArray(keyringAccounts)
                    ? keyringAccounts.map((address) => (0, util_1.toChecksumHexAddress)(address))
                    : /* istanbul ignore next */ [];
                return {
                    accounts,
                    index,
                    type: keyring.type,
                };
            })));
            this.update({ keyrings: [...keyrings] });
            return __classPrivateFieldGet(this, _KeyringController_keyring, "f").fullUpdate();
        });
    }
    // QR Hardware related methods
    /**
     * Add qr hardware keyring.
     *
     * @returns The added keyring
     */
    addQRKeyring() {
        return __awaiter(this, void 0, void 0, function* () {
            const keyring = yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").addNewKeyring(KeyringTypes.qr);
            yield this.fullUpdate();
            return keyring;
        });
    }
    /**
     * Get qr hardware keyring.
     *
     * @returns The added keyring
     */
    getOrAddQRKeyring() {
        return __awaiter(this, void 0, void 0, function* () {
            const keyring = __classPrivateFieldGet(this, _KeyringController_keyring, "f").getKeyringsByType(KeyringTypes.qr)[0];
            return keyring || (yield this.addQRKeyring());
        });
    }
    restoreQRKeyring(serialized) {
        return __awaiter(this, void 0, void 0, function* () {
            (yield this.getOrAddQRKeyring()).deserialize(serialized);
            this.updateIdentities(yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").getAccounts());
            yield this.fullUpdate();
        });
    }
    resetQRKeyringState() {
        return __awaiter(this, void 0, void 0, function* () {
            (yield this.getOrAddQRKeyring()).resetStore();
        });
    }
    getQRKeyringState() {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this.getOrAddQRKeyring()).getMemStore();
        });
    }
    submitQRCryptoHDKey(cryptoHDKey) {
        return __awaiter(this, void 0, void 0, function* () {
            (yield this.getOrAddQRKeyring()).submitCryptoHDKey(cryptoHDKey);
        });
    }
    submitQRCryptoAccount(cryptoAccount) {
        return __awaiter(this, void 0, void 0, function* () {
            (yield this.getOrAddQRKeyring()).submitCryptoAccount(cryptoAccount);
        });
    }
    submitQRSignature(requestId, ethSignature) {
        return __awaiter(this, void 0, void 0, function* () {
            (yield this.getOrAddQRKeyring()).submitSignature(requestId, ethSignature);
        });
    }
    cancelQRSignRequest() {
        return __awaiter(this, void 0, void 0, function* () {
            (yield this.getOrAddQRKeyring()).cancelSignRequest();
        });
    }
    connectQRHardware(page) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const keyring = yield this.getOrAddQRKeyring();
                let accounts;
                switch (page) {
                    case -1:
                        accounts = yield keyring.getPreviousPage();
                        break;
                    case 1:
                        accounts = yield keyring.getNextPage();
                        break;
                    default:
                        accounts = yield keyring.getFirstPage();
                }
                return accounts.map((account) => {
                    return Object.assign(Object.assign({}, account), { balance: '0x0' });
                });
            }
            catch (e) {
                throw new Error(`Unspecified error when connect QR Hardware, ${e}`);
            }
        });
    }
    unlockQRHardwareWalletAccount(index) {
        return __awaiter(this, void 0, void 0, function* () {
            const keyring = yield this.getOrAddQRKeyring();
            keyring.setAccountToUnlock(index);
            const oldAccounts = yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").getAccounts();
            yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").addNewAccount(keyring);
            const newAccounts = yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").getAccounts();
            this.updateIdentities(newAccounts);
            newAccounts.forEach((address) => {
                if (!oldAccounts.includes(address)) {
                    if (this.setAccountLabel) {
                        this.setAccountLabel(address, `${keyring.getName()} ${index}`);
                    }
                    this.setSelectedAddress(address);
                }
            });
            yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").persistAllKeyrings();
            yield this.fullUpdate();
        });
    }
    getAccountKeyringType(account) {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").getKeyringForAccount(account)).type;
        });
    }
    forgetQRDevice() {
        return __awaiter(this, void 0, void 0, function* () {
            const keyring = yield this.getOrAddQRKeyring();
            keyring.forgetDevice();
            const accounts = (yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").getAccounts());
            accounts.forEach((account) => {
                this.setSelectedAddress(account);
            });
            yield __classPrivateFieldGet(this, _KeyringController_keyring, "f").persistAllKeyrings();
            yield this.fullUpdate();
        });
    }
}
exports.KeyringController = KeyringController;
_KeyringController_keyring = new WeakMap();
exports.default = KeyringController;
//# sourceMappingURL=KeyringController.js.map