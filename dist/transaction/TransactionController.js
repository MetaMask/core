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
exports.TransactionController = exports.SPEED_UP_RATE = exports.CANCEL_RATE = exports.WalletDevice = exports.TransactionStatus = void 0;
const events_1 = require("events");
const ethereumjs_util_1 = require("ethereumjs-util");
const eth_rpc_errors_1 = require("eth-rpc-errors");
const eth_method_registry_1 = __importDefault(require("eth-method-registry"));
const eth_query_1 = __importDefault(require("eth-query"));
const common_1 = __importDefault(require("@ethereumjs/common"));
const tx_1 = require("@ethereumjs/tx");
const uuid_1 = require("uuid");
const async_mutex_1 = require("async-mutex");
const BaseController_1 = require("../BaseController");
const util_1 = require("../util");
const constants_1 = require("../constants");
const HARDFORK = 'london';
/**
 * The status of the transaction. Each status represents the state of the transaction internally
 * in the wallet. Some of these correspond with the state of the transaction on the network, but
 * some are wallet-specific.
 */
var TransactionStatus;
(function (TransactionStatus) {
    TransactionStatus["approved"] = "approved";
    TransactionStatus["cancelled"] = "cancelled";
    TransactionStatus["confirmed"] = "confirmed";
    TransactionStatus["failed"] = "failed";
    TransactionStatus["rejected"] = "rejected";
    TransactionStatus["signed"] = "signed";
    TransactionStatus["submitted"] = "submitted";
    TransactionStatus["unapproved"] = "unapproved";
})(TransactionStatus = exports.TransactionStatus || (exports.TransactionStatus = {}));
/**
 * Options for wallet device.
 */
var WalletDevice;
(function (WalletDevice) {
    WalletDevice["MM_MOBILE"] = "metamask_mobile";
    WalletDevice["MM_EXTENSION"] = "metamask_extension";
    WalletDevice["OTHER"] = "other_device";
})(WalletDevice = exports.WalletDevice || (exports.WalletDevice = {}));
/**
 * Multiplier used to determine a transaction's increased gas fee during cancellation
 */
exports.CANCEL_RATE = 1.5;
/**
 * Multiplier used to determine a transaction's increased gas fee during speed up
 */
exports.SPEED_UP_RATE = 1.1;
/**
 * Controller responsible for submitting and managing transactions
 */
class TransactionController extends BaseController_1.BaseController {
    /**
     * Creates a TransactionController instance.
     *
     * @param options - The controller options.
     * @param options.getNetworkState - Gets the state of the network controller.
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
     * @param options.getProvider - Returns a provider for the current network.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ getNetworkState, onNetworkStateChange, getProvider, }, config, state) {
        super(config, state);
        this.mutex = new async_mutex_1.Mutex();
        this.normalizeTokenTx = (txMeta, currentNetworkID, currentChainId) => {
            const time = parseInt(txMeta.timeStamp, 10) * 1000;
            const { to, from, gas, gasPrice, gasUsed, hash, contractAddress, tokenDecimal, tokenSymbol, value, } = txMeta;
            return {
                id: (0, uuid_1.v1)({ msecs: time }),
                isTransfer: true,
                networkID: currentNetworkID,
                chainId: currentChainId,
                status: TransactionStatus.confirmed,
                time,
                transaction: {
                    chainId: 1,
                    from,
                    gas,
                    gasPrice,
                    gasUsed,
                    to,
                    value,
                },
                transactionHash: hash,
                transferInformation: {
                    contractAddress,
                    decimals: Number(tokenDecimal),
                    symbol: tokenSymbol,
                },
                verifiedOnBlockchain: false,
            };
        };
        /**
         * EventEmitter instance used to listen to specific transactional events
         */
        this.hub = new events_1.EventEmitter();
        /**
         * Name of this controller used during composition
         */
        this.name = 'TransactionController';
        this.defaultConfig = {
            interval: 15000,
            txHistoryLimit: 40,
        };
        this.defaultState = {
            methodData: {},
            transactions: [],
        };
        this.initialize();
        const provider = getProvider();
        this.getNetworkState = getNetworkState;
        this.ethQuery = new eth_query_1.default(provider);
        this.registry = new eth_method_registry_1.default({ provider });
        onNetworkStateChange(() => {
            const newProvider = getProvider();
            this.ethQuery = new eth_query_1.default(newProvider);
            this.registry = new eth_method_registry_1.default({ provider: newProvider });
        });
        this.poll();
    }
    failTransaction(transactionMeta, error) {
        const newTransactionMeta = Object.assign(Object.assign({}, transactionMeta), { error, status: TransactionStatus.failed });
        this.updateTransaction(newTransactionMeta);
        this.hub.emit(`${transactionMeta.id}:finished`, newTransactionMeta);
    }
    registryLookup(fourBytePrefix) {
        return __awaiter(this, void 0, void 0, function* () {
            const registryMethod = yield this.registry.lookup(fourBytePrefix);
            const parsedRegistryMethod = this.registry.parse(registryMethod);
            return { registryMethod, parsedRegistryMethod };
        });
    }
    /**
     * Normalizes the transaction information from etherscan
     * to be compatible with the TransactionMeta interface.
     *
     * @param txMeta - The transaction.
     * @param currentNetworkID - The current network ID.
     * @param currentChainId - The current chain ID.
     * @returns The normalized transaction.
     */
    normalizeTx(txMeta, currentNetworkID, currentChainId) {
        const time = parseInt(txMeta.timeStamp, 10) * 1000;
        const normalizedTransactionBase = {
            blockNumber: txMeta.blockNumber,
            id: (0, uuid_1.v1)({ msecs: time }),
            networkID: currentNetworkID,
            chainId: currentChainId,
            time,
            transaction: {
                data: txMeta.input,
                from: txMeta.from,
                gas: (0, util_1.BNToHex)(new ethereumjs_util_1.BN(txMeta.gas)),
                gasPrice: (0, util_1.BNToHex)(new ethereumjs_util_1.BN(txMeta.gasPrice)),
                gasUsed: (0, util_1.BNToHex)(new ethereumjs_util_1.BN(txMeta.gasUsed)),
                nonce: (0, util_1.BNToHex)(new ethereumjs_util_1.BN(txMeta.nonce)),
                to: txMeta.to,
                value: (0, util_1.BNToHex)(new ethereumjs_util_1.BN(txMeta.value)),
            },
            transactionHash: txMeta.hash,
            verifiedOnBlockchain: false,
        };
        /* istanbul ignore else */
        if (txMeta.isError === '0') {
            return Object.assign(Object.assign({}, normalizedTransactionBase), { status: TransactionStatus.confirmed });
        }
        /* istanbul ignore next */
        return Object.assign(Object.assign({}, normalizedTransactionBase), { error: new Error('Transaction failed'), status: TransactionStatus.failed });
    }
    /**
     * Starts a new polling interval.
     *
     * @param interval - The polling interval used to fetch new transaction statuses.
     */
    poll(interval) {
        return __awaiter(this, void 0, void 0, function* () {
            interval && this.configure({ interval }, false, false);
            this.handle && clearTimeout(this.handle);
            yield (0, util_1.safelyExecute)(() => this.queryTransactionStatuses());
            this.handle = setTimeout(() => {
                this.poll(this.config.interval);
            }, this.config.interval);
        });
    }
    /**
     * Handle new method data request.
     *
     * @param fourBytePrefix - The method prefix.
     * @returns The method data object corresponding to the given signature prefix.
     */
    handleMethodData(fourBytePrefix) {
        return __awaiter(this, void 0, void 0, function* () {
            const releaseLock = yield this.mutex.acquire();
            try {
                const { methodData } = this.state;
                const knownMethod = Object.keys(methodData).find((knownFourBytePrefix) => fourBytePrefix === knownFourBytePrefix);
                if (knownMethod) {
                    return methodData[fourBytePrefix];
                }
                const registry = yield this.registryLookup(fourBytePrefix);
                this.update({
                    methodData: Object.assign(Object.assign({}, methodData), { [fourBytePrefix]: registry }),
                });
                return registry;
            }
            finally {
                releaseLock();
            }
        });
    }
    /**
     * Add a new unapproved transaction to state. Parameters will be validated, a
     * unique transaction id will be generated, and gas and gasPrice will be calculated
     * if not provided. If A `<tx.id>:unapproved` hub event will be emitted once added.
     *
     * @param transaction - The transaction object to add.
     * @param origin - The domain origin to append to the generated TransactionMeta.
     * @param deviceConfirmedOn - An enum to indicate what device the transaction was confirmed to append to the generated TransactionMeta.
     * @returns Object containing a promise resolving to the transaction hash if approved.
     */
    addTransaction(transaction, origin, deviceConfirmedOn) {
        return __awaiter(this, void 0, void 0, function* () {
            const { provider, network } = this.getNetworkState();
            const { transactions } = this.state;
            transaction = (0, util_1.normalizeTransaction)(transaction);
            (0, util_1.validateTransaction)(transaction);
            const transactionMeta = {
                id: (0, uuid_1.v1)(),
                networkID: network,
                chainId: provider.chainId,
                origin,
                status: TransactionStatus.unapproved,
                time: Date.now(),
                transaction,
                deviceConfirmedOn,
                verifiedOnBlockchain: false,
            };
            try {
                const { gas } = yield this.estimateGas(transaction);
                transaction.gas = gas;
            }
            catch (error) {
                this.failTransaction(transactionMeta, error);
                return Promise.reject(error);
            }
            const result = new Promise((resolve, reject) => {
                this.hub.once(`${transactionMeta.id}:finished`, (meta) => {
                    switch (meta.status) {
                        case TransactionStatus.submitted:
                            return resolve(meta.transactionHash);
                        case TransactionStatus.rejected:
                            return reject(eth_rpc_errors_1.ethErrors.provider.userRejectedRequest('User rejected the transaction'));
                        case TransactionStatus.cancelled:
                            return reject(eth_rpc_errors_1.ethErrors.rpc.internal('User cancelled the transaction'));
                        case TransactionStatus.failed:
                            return reject(eth_rpc_errors_1.ethErrors.rpc.internal(meta.error.message));
                        /* istanbul ignore next */
                        default:
                            return reject(eth_rpc_errors_1.ethErrors.rpc.internal(`MetaMask Tx Signature: Unknown problem: ${JSON.stringify(meta)}`));
                    }
                });
            });
            transactions.push(transactionMeta);
            this.update({ transactions: this.trimTransactionsForState(transactions) });
            this.hub.emit(`unapprovedTransaction`, transactionMeta);
            return { result, transactionMeta };
        });
    }
    prepareUnsignedEthTx(txParams) {
        return tx_1.TransactionFactory.fromTxData(txParams, {
            common: this.getCommonConfiguration(),
            freeze: false,
        });
    }
    /**
     * `@ethereumjs/tx` uses `@ethereumjs/common` as a configuration tool for
     * specifying which chain, network, hardfork and EIPs to support for
     * a transaction. By referencing this configuration, and analyzing the fields
     * specified in txParams, @ethereumjs/tx is able to determine which EIP-2718
     * transaction type to use.
     *
     * @returns {Common} common configuration object
     */
    getCommonConfiguration() {
        const { network: networkId, provider: { type: chain, chainId, nickname: name }, } = this.getNetworkState();
        if (chain !== constants_1.RPC) {
            return new common_1.default({ chain, hardfork: HARDFORK });
        }
        const customChainParams = {
            name,
            chainId: parseInt(chainId, undefined),
            networkId: parseInt(networkId, undefined),
        };
        return common_1.default.forCustomChain(constants_1.MAINNET, customChainParams, HARDFORK);
    }
    /**
     * Approves a transaction and updates it's status in state. If this is not a
     * retry transaction, a nonce will be generated. The transaction is signed
     * using the sign configuration property, then published to the blockchain.
     * A `<tx.id>:finished` hub event is fired after success or failure.
     *
     * @param transactionID - The ID of the transaction to approve.
     */
    approveTransaction(transactionID) {
        return __awaiter(this, void 0, void 0, function* () {
            const { transactions } = this.state;
            const releaseLock = yield this.mutex.acquire();
            const { provider } = this.getNetworkState();
            const { chainId: currentChainId } = provider;
            const index = transactions.findIndex(({ id }) => transactionID === id);
            const transactionMeta = transactions[index];
            const { nonce } = transactionMeta.transaction;
            try {
                const { from } = transactionMeta.transaction;
                if (!this.sign) {
                    releaseLock();
                    this.failTransaction(transactionMeta, new Error('No sign method defined.'));
                    return;
                }
                else if (!currentChainId) {
                    releaseLock();
                    this.failTransaction(transactionMeta, new Error('No chainId defined.'));
                    return;
                }
                const chainId = parseInt(currentChainId, undefined);
                const { approved: status } = TransactionStatus;
                const txNonce = nonce ||
                    (yield (0, util_1.query)(this.ethQuery, 'getTransactionCount', [from, 'pending']));
                transactionMeta.status = status;
                transactionMeta.transaction.nonce = txNonce;
                transactionMeta.transaction.chainId = chainId;
                const baseTxParams = Object.assign(Object.assign({}, transactionMeta.transaction), { gasLimit: transactionMeta.transaction.gas, chainId, nonce: txNonce, status });
                const isEIP1559 = (0, util_1.isEIP1559Transaction)(transactionMeta.transaction);
                const txParams = isEIP1559
                    ? Object.assign(Object.assign({}, baseTxParams), { maxFeePerGas: transactionMeta.transaction.maxFeePerGas, maxPriorityFeePerGas: transactionMeta.transaction.maxPriorityFeePerGas, estimatedBaseFee: transactionMeta.transaction.estimatedBaseFee, 
                        // specify type 2 if maxFeePerGas and maxPriorityFeePerGas are set
                        type: 2 }) : baseTxParams;
                // delete gasPrice if maxFeePerGas and maxPriorityFeePerGas are set
                if (isEIP1559) {
                    delete txParams.gasPrice;
                }
                const unsignedEthTx = this.prepareUnsignedEthTx(txParams);
                const signedTx = yield this.sign(unsignedEthTx, from);
                transactionMeta.status = TransactionStatus.signed;
                this.updateTransaction(transactionMeta);
                const rawTransaction = (0, ethereumjs_util_1.bufferToHex)(signedTx.serialize());
                transactionMeta.rawTransaction = rawTransaction;
                this.updateTransaction(transactionMeta);
                const transactionHash = yield (0, util_1.query)(this.ethQuery, 'sendRawTransaction', [
                    rawTransaction,
                ]);
                transactionMeta.transactionHash = transactionHash;
                transactionMeta.status = TransactionStatus.submitted;
                this.updateTransaction(transactionMeta);
                this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
            }
            catch (error) {
                this.failTransaction(transactionMeta, error);
            }
            finally {
                releaseLock();
            }
        });
    }
    /**
     * Cancels a transaction based on its ID by setting its status to "rejected"
     * and emitting a `<tx.id>:finished` hub event.
     *
     * @param transactionID - The ID of the transaction to cancel.
     */
    cancelTransaction(transactionID) {
        const transactionMeta = this.state.transactions.find(({ id }) => id === transactionID);
        if (!transactionMeta) {
            return;
        }
        transactionMeta.status = TransactionStatus.rejected;
        this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
        const transactions = this.state.transactions.filter(({ id }) => id !== transactionID);
        this.update({ transactions: this.trimTransactionsForState(transactions) });
    }
    /**
     * Attempts to cancel a transaction based on its ID by setting its status to "rejected"
     * and emitting a `<tx.id>:finished` hub event.
     *
     * @param transactionID - The ID of the transaction to cancel.
     * @param gasValues - The gas values to use for the cancellation transation.
     */
    stopTransaction(transactionID, gasValues) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            if (gasValues) {
                (0, util_1.validateGasValues)(gasValues);
            }
            const transactionMeta = this.state.transactions.find(({ id }) => id === transactionID);
            if (!transactionMeta) {
                return;
            }
            if (!this.sign) {
                throw new Error('No sign method defined.');
            }
            // gasPrice (legacy non EIP1559)
            const minGasPrice = (0, util_1.getIncreasedPriceFromExisting)(transactionMeta.transaction.gasPrice, exports.CANCEL_RATE);
            const gasPriceFromValues = (0, util_1.isGasPriceValue)(gasValues) && gasValues.gasPrice;
            const newGasPrice = (gasPriceFromValues &&
                (0, util_1.validateMinimumIncrease)(gasPriceFromValues, minGasPrice)) ||
                minGasPrice;
            // maxFeePerGas (EIP1559)
            const existingMaxFeePerGas = (_a = transactionMeta.transaction) === null || _a === void 0 ? void 0 : _a.maxFeePerGas;
            const minMaxFeePerGas = (0, util_1.getIncreasedPriceFromExisting)(existingMaxFeePerGas, exports.CANCEL_RATE);
            const maxFeePerGasValues = (0, util_1.isFeeMarketEIP1559Values)(gasValues) && gasValues.maxFeePerGas;
            const newMaxFeePerGas = (maxFeePerGasValues &&
                (0, util_1.validateMinimumIncrease)(maxFeePerGasValues, minMaxFeePerGas)) ||
                (existingMaxFeePerGas && minMaxFeePerGas);
            // maxPriorityFeePerGas (EIP1559)
            const existingMaxPriorityFeePerGas = (_b = transactionMeta.transaction) === null || _b === void 0 ? void 0 : _b.maxPriorityFeePerGas;
            const minMaxPriorityFeePerGas = (0, util_1.getIncreasedPriceFromExisting)(existingMaxPriorityFeePerGas, exports.CANCEL_RATE);
            const maxPriorityFeePerGasValues = (0, util_1.isFeeMarketEIP1559Values)(gasValues) && gasValues.maxPriorityFeePerGas;
            const newMaxPriorityFeePerGas = (maxPriorityFeePerGasValues &&
                (0, util_1.validateMinimumIncrease)(maxPriorityFeePerGasValues, minMaxPriorityFeePerGas)) ||
                (existingMaxPriorityFeePerGas && minMaxPriorityFeePerGas);
            const txParams = newMaxFeePerGas && newMaxPriorityFeePerGas
                ? {
                    from: transactionMeta.transaction.from,
                    gasLimit: transactionMeta.transaction.gas,
                    maxFeePerGas: newMaxFeePerGas,
                    maxPriorityFeePerGas: newMaxPriorityFeePerGas,
                    type: 2,
                    nonce: transactionMeta.transaction.nonce,
                    to: transactionMeta.transaction.from,
                    value: '0x0',
                }
                : {
                    from: transactionMeta.transaction.from,
                    gasLimit: transactionMeta.transaction.gas,
                    gasPrice: newGasPrice,
                    nonce: transactionMeta.transaction.nonce,
                    to: transactionMeta.transaction.from,
                    value: '0x0',
                };
            const unsignedEthTx = this.prepareUnsignedEthTx(txParams);
            const signedTx = yield this.sign(unsignedEthTx, transactionMeta.transaction.from);
            const rawTransaction = (0, ethereumjs_util_1.bufferToHex)(signedTx.serialize());
            yield (0, util_1.query)(this.ethQuery, 'sendRawTransaction', [rawTransaction]);
            transactionMeta.status = TransactionStatus.cancelled;
            this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
        });
    }
    /**
     * Attempts to speed up a transaction increasing transaction gasPrice by ten percent.
     *
     * @param transactionID - The ID of the transaction to speed up.
     * @param gasValues - The gas values to use for the speed up transation.
     */
    speedUpTransaction(transactionID, gasValues) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            if (gasValues) {
                (0, util_1.validateGasValues)(gasValues);
            }
            const transactionMeta = this.state.transactions.find(({ id }) => id === transactionID);
            /* istanbul ignore next */
            if (!transactionMeta) {
                return;
            }
            /* istanbul ignore next */
            if (!this.sign) {
                throw new Error('No sign method defined.');
            }
            const { transactions } = this.state;
            // gasPrice (legacy non EIP1559)
            const minGasPrice = (0, util_1.getIncreasedPriceFromExisting)(transactionMeta.transaction.gasPrice, exports.SPEED_UP_RATE);
            const gasPriceFromValues = (0, util_1.isGasPriceValue)(gasValues) && gasValues.gasPrice;
            const newGasPrice = (gasPriceFromValues &&
                (0, util_1.validateMinimumIncrease)(gasPriceFromValues, minGasPrice)) ||
                minGasPrice;
            // maxFeePerGas (EIP1559)
            const existingMaxFeePerGas = (_a = transactionMeta.transaction) === null || _a === void 0 ? void 0 : _a.maxFeePerGas;
            const minMaxFeePerGas = (0, util_1.getIncreasedPriceFromExisting)(existingMaxFeePerGas, exports.SPEED_UP_RATE);
            const maxFeePerGasValues = (0, util_1.isFeeMarketEIP1559Values)(gasValues) && gasValues.maxFeePerGas;
            const newMaxFeePerGas = (maxFeePerGasValues &&
                (0, util_1.validateMinimumIncrease)(maxFeePerGasValues, minMaxFeePerGas)) ||
                (existingMaxFeePerGas && minMaxFeePerGas);
            // maxPriorityFeePerGas (EIP1559)
            const existingMaxPriorityFeePerGas = (_b = transactionMeta.transaction) === null || _b === void 0 ? void 0 : _b.maxPriorityFeePerGas;
            const minMaxPriorityFeePerGas = (0, util_1.getIncreasedPriceFromExisting)(existingMaxPriorityFeePerGas, exports.SPEED_UP_RATE);
            const maxPriorityFeePerGasValues = (0, util_1.isFeeMarketEIP1559Values)(gasValues) && gasValues.maxPriorityFeePerGas;
            const newMaxPriorityFeePerGas = (maxPriorityFeePerGasValues &&
                (0, util_1.validateMinimumIncrease)(maxPriorityFeePerGasValues, minMaxPriorityFeePerGas)) ||
                (existingMaxPriorityFeePerGas && minMaxPriorityFeePerGas);
            const txParams = newMaxFeePerGas && newMaxPriorityFeePerGas
                ? Object.assign(Object.assign({}, transactionMeta.transaction), { gasLimit: transactionMeta.transaction.gas, maxFeePerGas: newMaxFeePerGas, maxPriorityFeePerGas: newMaxPriorityFeePerGas, type: 2 }) : Object.assign(Object.assign({}, transactionMeta.transaction), { gasLimit: transactionMeta.transaction.gas, gasPrice: newGasPrice });
            const unsignedEthTx = this.prepareUnsignedEthTx(txParams);
            const signedTx = yield this.sign(unsignedEthTx, transactionMeta.transaction.from);
            const rawTransaction = (0, ethereumjs_util_1.bufferToHex)(signedTx.serialize());
            const transactionHash = yield (0, util_1.query)(this.ethQuery, 'sendRawTransaction', [
                rawTransaction,
            ]);
            const baseTransactionMeta = Object.assign(Object.assign({}, transactionMeta), { id: (0, uuid_1.v1)(), time: Date.now(), transactionHash });
            const newTransactionMeta = newMaxFeePerGas && newMaxPriorityFeePerGas
                ? Object.assign(Object.assign({}, baseTransactionMeta), { transaction: Object.assign(Object.assign({}, transactionMeta.transaction), { maxFeePerGas: newMaxFeePerGas, maxPriorityFeePerGas: newMaxPriorityFeePerGas }) }) : Object.assign(Object.assign({}, baseTransactionMeta), { transaction: Object.assign(Object.assign({}, transactionMeta.transaction), { gasPrice: newGasPrice }) });
            transactions.push(newTransactionMeta);
            this.update({ transactions: this.trimTransactionsForState(transactions) });
            this.hub.emit(`${transactionMeta.id}:speedup`, newTransactionMeta);
        });
    }
    /**
     * Estimates required gas for a given transaction.
     *
     * @param transaction - The transaction to estimate gas for.
     * @returns The gas and gas price.
     */
    estimateGas(transaction) {
        return __awaiter(this, void 0, void 0, function* () {
            const estimatedTransaction = Object.assign({}, transaction);
            const { gas, gasPrice: providedGasPrice, to, value, data, } = estimatedTransaction;
            const gasPrice = typeof providedGasPrice === 'undefined'
                ? yield (0, util_1.query)(this.ethQuery, 'gasPrice')
                : providedGasPrice;
            const { isCustomNetwork } = this.getNetworkState();
            // 1. If gas is already defined on the transaction, use it
            if (typeof gas !== 'undefined') {
                return { gas, gasPrice };
            }
            const { gasLimit } = yield (0, util_1.query)(this.ethQuery, 'getBlockByNumber', [
                'latest',
                false,
            ]);
            // 2. If to is not defined or this is not a contract address, and there is no data use 0x5208 / 21000.
            // If the newtwork is a custom network then bypass this check and fetch 'estimateGas'.
            /* istanbul ignore next */
            const code = to ? yield (0, util_1.query)(this.ethQuery, 'getCode', [to]) : undefined;
            /* istanbul ignore next */
            if (!isCustomNetwork &&
                (!to || (to && !data && (!code || code === '0x')))) {
                return { gas: '0x5208', gasPrice };
            }
            // if data, should be hex string format
            estimatedTransaction.data = !data
                ? data
                : /* istanbul ignore next */ (0, ethereumjs_util_1.addHexPrefix)(data);
            // 3. If this is a contract address, safely estimate gas using RPC
            estimatedTransaction.value =
                typeof value === 'undefined' ? '0x0' : /* istanbul ignore next */ value;
            const gasLimitBN = (0, util_1.hexToBN)(gasLimit);
            estimatedTransaction.gas = (0, util_1.BNToHex)((0, util_1.fractionBN)(gasLimitBN, 19, 20));
            const gasHex = yield (0, util_1.query)(this.ethQuery, 'estimateGas', [
                estimatedTransaction,
            ]);
            // 4. Pad estimated gas without exceeding the most recent block gasLimit. If the network is a
            // a custom network then return the eth_estimateGas value.
            const gasBN = (0, util_1.hexToBN)(gasHex);
            const maxGasBN = gasLimitBN.muln(0.9);
            const paddedGasBN = gasBN.muln(1.5);
            /* istanbul ignore next */
            if (gasBN.gt(maxGasBN) || isCustomNetwork) {
                return { gas: (0, ethereumjs_util_1.addHexPrefix)(gasHex), gasPrice };
            }
            /* istanbul ignore next */
            if (paddedGasBN.lt(maxGasBN)) {
                return { gas: (0, ethereumjs_util_1.addHexPrefix)((0, util_1.BNToHex)(paddedGasBN)), gasPrice };
            }
            return { gas: (0, ethereumjs_util_1.addHexPrefix)((0, util_1.BNToHex)(maxGasBN)), gasPrice };
        });
    }
    /**
     * Check the status of submitted transactions on the network to determine whether they have
     * been included in a block. Any that have been included in a block are marked as confirmed.
     */
    queryTransactionStatuses() {
        return __awaiter(this, void 0, void 0, function* () {
            const { transactions } = this.state;
            const { provider, network: currentNetworkID } = this.getNetworkState();
            const { chainId: currentChainId } = provider;
            let gotUpdates = false;
            yield (0, util_1.safelyExecute)(() => Promise.all(transactions.map((meta, index) => __awaiter(this, void 0, void 0, function* () {
                // Using fallback to networkID only when there is no chainId present.
                // Should be removed when networkID is completely removed.
                const txBelongsToCurrentChain = meta.chainId === currentChainId ||
                    (!meta.chainId && meta.networkID === currentNetworkID);
                if (!meta.verifiedOnBlockchain && txBelongsToCurrentChain) {
                    const [reconciledTx, updateRequired] = yield this.blockchainTransactionStateReconciler(meta);
                    if (updateRequired) {
                        transactions[index] = reconciledTx;
                        gotUpdates = updateRequired;
                    }
                }
            }))));
            /* istanbul ignore else */
            if (gotUpdates) {
                this.update({
                    transactions: this.trimTransactionsForState(transactions),
                });
            }
        });
    }
    /**
     * Updates an existing transaction in state.
     *
     * @param transactionMeta - The new transaction to store in state.
     */
    updateTransaction(transactionMeta) {
        const { transactions } = this.state;
        transactionMeta.transaction = (0, util_1.normalizeTransaction)(transactionMeta.transaction);
        (0, util_1.validateTransaction)(transactionMeta.transaction);
        const index = transactions.findIndex(({ id }) => transactionMeta.id === id);
        transactions[index] = transactionMeta;
        this.update({ transactions: this.trimTransactionsForState(transactions) });
    }
    /**
     * Removes all transactions from state, optionally based on the current network.
     *
     * @param ignoreNetwork - Determines whether to wipe all transactions, or just those on the
     * current network. If `true`, all transactions are wiped.
     */
    wipeTransactions(ignoreNetwork) {
        /* istanbul ignore next */
        if (ignoreNetwork) {
            this.update({ transactions: [] });
            return;
        }
        const { provider, network: currentNetworkID } = this.getNetworkState();
        const { chainId: currentChainId } = provider;
        const newTransactions = this.state.transactions.filter(({ networkID, chainId }) => {
            // Using fallback to networkID only when there is no chainId present. Should be removed when networkID is completely removed.
            const isCurrentNetwork = chainId === currentChainId ||
                (!chainId && networkID === currentNetworkID);
            return !isCurrentNetwork;
        });
        this.update({
            transactions: this.trimTransactionsForState(newTransactions),
        });
    }
    /**
     * Get transactions from Etherscan for the given address. By default all transactions are
     * returned, but the `fromBlock` option can be given to filter just for transactions from a
     * specific block onward.
     *
     * @param address - The address to fetch the transactions for.
     * @param opt - Object containing optional data, fromBlock and Etherscan API key.
     * @returns The block number of the latest incoming transaction.
     */
    fetchAll(address, opt) {
        return __awaiter(this, void 0, void 0, function* () {
            const { provider, network: currentNetworkID } = this.getNetworkState();
            const { chainId: currentChainId, type: networkType } = provider;
            const { transactions } = this.state;
            const supportedNetworkIds = ['1', '3', '4', '42'];
            /* istanbul ignore next */
            if (supportedNetworkIds.indexOf(currentNetworkID) === -1) {
                return undefined;
            }
            const [etherscanTxResponse, etherscanTokenResponse] = yield (0, util_1.handleTransactionFetch)(networkType, address, this.config.txHistoryLimit, opt);
            const normalizedTxs = etherscanTxResponse.result.map((tx) => this.normalizeTx(tx, currentNetworkID, currentChainId));
            const normalizedTokenTxs = etherscanTokenResponse.result.map((tx) => this.normalizeTokenTx(tx, currentNetworkID, currentChainId));
            const [updateRequired, allTxs] = this.etherscanTransactionStateReconciler([...normalizedTxs, ...normalizedTokenTxs], transactions);
            allTxs.sort((a, b) => (a.time < b.time ? -1 : 1));
            let latestIncomingTxBlockNumber;
            allTxs.forEach((tx) => __awaiter(this, void 0, void 0, function* () {
                /* istanbul ignore next */
                if (
                // Using fallback to networkID only when there is no chainId present. Should be removed when networkID is completely removed.
                (tx.chainId === currentChainId ||
                    (!tx.chainId && tx.networkID === currentNetworkID)) &&
                    tx.transaction.to &&
                    tx.transaction.to.toLowerCase() === address.toLowerCase()) {
                    if (tx.blockNumber &&
                        (!latestIncomingTxBlockNumber ||
                            parseInt(latestIncomingTxBlockNumber, 10) <
                                parseInt(tx.blockNumber, 10))) {
                        latestIncomingTxBlockNumber = tx.blockNumber;
                    }
                }
                /* istanbul ignore else */
                if (tx.toSmartContract === undefined) {
                    // If not `to` is a contract deploy, if not `data` is send eth
                    if (tx.transaction.to &&
                        (!tx.transaction.data || tx.transaction.data !== '0x')) {
                        const code = yield (0, util_1.query)(this.ethQuery, 'getCode', [
                            tx.transaction.to,
                        ]);
                        tx.toSmartContract = (0, util_1.isSmartContractCode)(code);
                    }
                    else {
                        tx.toSmartContract = false;
                    }
                }
            }));
            // Update state only if new transactions were fetched or
            // the status or gas data of a transaction has changed
            if (updateRequired) {
                this.update({ transactions: this.trimTransactionsForState(allTxs) });
            }
            return latestIncomingTxBlockNumber;
        });
    }
    /**
     * Trim the amount of transactions that are set on the state. Checks
     * if the length of the tx history is longer then desired persistence
     * limit and then if it is removes the oldest confirmed or rejected tx.
     * Pending or unapproved transactions will not be removed by this
     * operation. For safety of presenting a fully functional transaction UI
     * representation, this function will not break apart transactions with the
     * same nonce, created on the same day, per network. Not accounting for transactions of the same
     * nonce, same day and network combo can result in confusing or broken experiences
     * in the UI. The transactions are then updated using the BaseController update.
     *
     * @param transactions - The transactions to be applied to the state.
     * @returns The trimmed list of transactions.
     */
    trimTransactionsForState(transactions) {
        const nonceNetworkSet = new Set();
        const txsToKeep = transactions.reverse().filter((tx) => {
            const { chainId, networkID, status, transaction, time } = tx;
            if (transaction) {
                const key = `${transaction.nonce}-${chainId !== null && chainId !== void 0 ? chainId : networkID}-${new Date(time).toDateString()}`;
                if (nonceNetworkSet.has(key)) {
                    return true;
                }
                else if (nonceNetworkSet.size < this.config.txHistoryLimit ||
                    !this.isFinalState(status)) {
                    nonceNetworkSet.add(key);
                    return true;
                }
            }
            return false;
        });
        txsToKeep.reverse();
        return txsToKeep;
    }
    /**
     * Determines if the transaction is in a final state.
     *
     * @param status - The transaction status.
     * @returns Whether the transaction is in a final state.
     */
    isFinalState(status) {
        return (status === TransactionStatus.rejected ||
            status === TransactionStatus.confirmed ||
            status === TransactionStatus.failed ||
            status === TransactionStatus.cancelled);
    }
    /**
     * Method to verify the state of a transaction using the Blockchain as a source of truth.
     *
     * @param meta - The local transaction to verify on the blockchain.
     * @returns A tuple containing the updated transaction, and whether or not an update was required.
     */
    blockchainTransactionStateReconciler(meta) {
        return __awaiter(this, void 0, void 0, function* () {
            const { status, transactionHash } = meta;
            switch (status) {
                case TransactionStatus.confirmed:
                    const txReceipt = yield (0, util_1.query)(this.ethQuery, 'getTransactionReceipt', [
                        transactionHash,
                    ]);
                    if (!txReceipt) {
                        return [meta, false];
                    }
                    meta.verifiedOnBlockchain = true;
                    meta.transaction.gasUsed = txReceipt.gasUsed;
                    // According to the Web3 docs:
                    // TRUE if the transaction was successful, FALSE if the EVM reverted the transaction.
                    if (Number(txReceipt.status) === 0) {
                        const error = new Error('Transaction failed. The transaction was reversed');
                        this.failTransaction(meta, error);
                        return [meta, false];
                    }
                    return [meta, true];
                case TransactionStatus.submitted:
                    const txObj = yield (0, util_1.query)(this.ethQuery, 'getTransactionByHash', [
                        transactionHash,
                    ]);
                    if (!txObj) {
                        const receiptShowsFailedStatus = yield this.checkTxReceiptStatusIsFailed(transactionHash);
                        // Case the txObj is evaluated as false, a second check will
                        // determine if the tx failed or it is pending or confirmed
                        if (receiptShowsFailedStatus) {
                            const error = new Error('Transaction failed. The transaction was dropped or replaced by a new one');
                            this.failTransaction(meta, error);
                        }
                    }
                    /* istanbul ignore next */
                    if (txObj === null || txObj === void 0 ? void 0 : txObj.blockNumber) {
                        meta.status = TransactionStatus.confirmed;
                        this.hub.emit(`${meta.id}:confirmed`, meta);
                        return [meta, true];
                    }
                    return [meta, false];
                default:
                    return [meta, false];
            }
        });
    }
    /**
     * Method to check if a tx has failed according to their receipt
     * According to the Web3 docs:
     * TRUE if the transaction was successful, FALSE if the EVM reverted the transaction.
     * The receipt is not available for pending transactions and returns null.
     *
     * @param txHash - The transaction hash.
     * @returns Whether the transaction has failed.
     */
    checkTxReceiptStatusIsFailed(txHash) {
        return __awaiter(this, void 0, void 0, function* () {
            const txReceipt = yield (0, util_1.query)(this.ethQuery, 'getTransactionReceipt', [
                txHash,
            ]);
            if (!txReceipt) {
                // Transaction is pending
                return false;
            }
            return Number(txReceipt.status) === 0;
        });
    }
    /**
     * Method to verify the state of transactions using Etherscan as a source of truth.
     *
     * @param remoteTxs - Transactions to reconcile that are from a remote source.
     * @param localTxs - Transactions to reconcile that are local.
     * @returns A tuple containing a boolean indicating whether or not an update was required, and the updated transaction.
     */
    etherscanTransactionStateReconciler(remoteTxs, localTxs) {
        const updatedTxs = this.getUpdatedTransactions(remoteTxs, localTxs);
        const newTxs = this.getNewTransactions(remoteTxs, localTxs);
        const updatedLocalTxs = localTxs.map((tx) => {
            const txIdx = updatedTxs.findIndex(({ transactionHash }) => transactionHash === tx.transactionHash);
            return txIdx === -1 ? tx : updatedTxs[txIdx];
        });
        const updateRequired = newTxs.length > 0 || updatedLocalTxs.length > 0;
        return [updateRequired, [...newTxs, ...updatedLocalTxs]];
    }
    /**
     * Get all transactions that are in the remote transactions array
     * but not in the local transactions array.
     *
     * @param remoteTxs - Array of transactions from remote source.
     * @param localTxs - Array of transactions stored locally.
     * @returns The new transactions.
     */
    getNewTransactions(remoteTxs, localTxs) {
        return remoteTxs.filter((tx) => {
            const alreadyInTransactions = localTxs.find(({ transactionHash }) => transactionHash === tx.transactionHash);
            return !alreadyInTransactions;
        });
    }
    /**
     * Get all the transactions that are locally outdated with respect
     * to a remote source (etherscan or blockchain). The returned array
     * contains the transactions with the updated data.
     *
     * @param remoteTxs - Array of transactions from remote source.
     * @param localTxs - Array of transactions stored locally.
     * @returns The updated transactions.
     */
    getUpdatedTransactions(remoteTxs, localTxs) {
        return remoteTxs.filter((remoteTx) => {
            const isTxOutdated = localTxs.find((localTx) => {
                return (remoteTx.transactionHash === localTx.transactionHash &&
                    this.isTransactionOutdated(remoteTx, localTx));
            });
            return isTxOutdated;
        });
    }
    /**
     * Verifies if a local transaction is outdated with respect to the remote transaction.
     *
     * @param remoteTx - The remote transaction from Etherscan.
     * @param localTx - The local transaction.
     * @returns Whether the transaction is outdated.
     */
    isTransactionOutdated(remoteTx, localTx) {
        const statusOutdated = this.isStatusOutdated(remoteTx.transactionHash, localTx.transactionHash, remoteTx.status, localTx.status);
        const gasDataOutdated = this.isGasDataOutdated(remoteTx.transaction.gasUsed, localTx.transaction.gasUsed);
        return statusOutdated || gasDataOutdated;
    }
    /**
     * Verifies if the status of a local transaction is outdated with respect to the remote transaction.
     *
     * @param remoteTxHash - Remote transaction hash.
     * @param localTxHash - Local transaction hash.
     * @param remoteTxStatus - Remote transaction status.
     * @param localTxStatus - Local transaction status.
     * @returns Whether the status is outdated.
     */
    isStatusOutdated(remoteTxHash, localTxHash, remoteTxStatus, localTxStatus) {
        return remoteTxHash === localTxHash && remoteTxStatus !== localTxStatus;
    }
    /**
     * Verifies if the gas data of a local transaction is outdated with respect to the remote transaction.
     *
     * @param remoteGasUsed - Remote gas used in the transaction.
     * @param localGasUsed - Local gas used in the transaction.
     * @returns Whether the gas data is outdated.
     */
    isGasDataOutdated(remoteGasUsed, localGasUsed) {
        return remoteGasUsed !== localGasUsed;
    }
}
exports.TransactionController = TransactionController;
exports.default = TransactionController;
//# sourceMappingURL=TransactionController.js.map