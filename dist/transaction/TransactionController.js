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
const BaseController_1 = __importDefault(require("../BaseController"));
const util_1 = require("../util");
const constants_1 = require("../constants");
const HARDFORK = 'berlin';
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
class TransactionController extends BaseController_1.default {
    /**
     * Creates a TransactionController instance
     *
     * @param options
     * @param options.getNetworkState - Gets the state of the network controller
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes
     * @param options.getProvider - Returns a provider for the current network
     * @param config - Initial options used to configure this controller
     * @param state - Initial state to set on this controller
     */
    constructor({ getNetworkState, onNetworkStateChange, getProvider, }, config, state) {
        super(config, state);
        this.mutex = new async_mutex_1.Mutex();
        this.normalizeTokenTx = (txMeta, currentNetworkID, currentChainId) => {
            const time = parseInt(txMeta.timeStamp, 10) * 1000;
            const { to, from, gas, gasPrice, hash, contractAddress, tokenDecimal, tokenSymbol, value, } = txMeta;
            return {
                id: uuid_1.v1({ msecs: time }),
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
                    to,
                    value,
                },
                transactionHash: hash,
                transferInformation: {
                    contractAddress,
                    decimals: Number(tokenDecimal),
                    symbol: tokenSymbol,
                },
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
            interval: 5000,
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
     * to be compatible with the TransactionMeta interface
     *
     * @param txMeta - Object containing the transaction information
     * @param currentNetworkID - string representing the current network id
     * @param currentChainId - string representing the current chain id
     * @returns - TransactionMeta
     */
    normalizeTx(txMeta, currentNetworkID, currentChainId) {
        const time = parseInt(txMeta.timeStamp, 10) * 1000;
        const normalizedTransactionBase = {
            blockNumber: txMeta.blockNumber,
            id: uuid_1.v1({ msecs: time }),
            networkID: currentNetworkID,
            chainId: currentChainId,
            time,
            transaction: {
                data: txMeta.input,
                from: txMeta.from,
                gas: util_1.BNToHex(new ethereumjs_util_1.BN(txMeta.gas)),
                gasPrice: util_1.BNToHex(new ethereumjs_util_1.BN(txMeta.gasPrice)),
                nonce: util_1.BNToHex(new ethereumjs_util_1.BN(txMeta.nonce)),
                to: txMeta.to,
                value: util_1.BNToHex(new ethereumjs_util_1.BN(txMeta.value)),
            },
            transactionHash: txMeta.hash,
        };
        /* istanbul ignore else */
        if (txMeta.isError === '0') {
            return Object.assign(Object.assign({}, normalizedTransactionBase), { status: TransactionStatus.confirmed });
        }
        /* istanbul ignore next */
        return Object.assign(Object.assign({}, normalizedTransactionBase), { error: new Error('Transaction failed'), status: TransactionStatus.failed });
    }
    /**
     * Starts a new polling interval
     *
     * @param interval - Polling interval used to fetch new transaction statuses
     */
    poll(interval) {
        return __awaiter(this, void 0, void 0, function* () {
            interval && this.configure({ interval }, false, false);
            this.handle && clearTimeout(this.handle);
            yield util_1.safelyExecute(() => this.queryTransactionStatuses());
            this.handle = setTimeout(() => {
                this.poll(this.config.interval);
            }, this.config.interval);
        });
    }
    /**
     * Handle new method data request
     *
     * @param fourBytePrefix - String corresponding to method prefix
     * @returns - Promise resolving to method data object corresponding to signature prefix
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
     * @param transaction - Transaction object to add
     * @param origin - Domain origin to append to the generated TransactionMeta
     * @param deviceConfirmedOn - enum to indicate what device the transaction was confirmed to append to the generated TransactionMeta
     * @returns - Object containing a promise resolving to the transaction hash if approved
     */
    addTransaction(transaction, origin, deviceConfirmedOn) {
        return __awaiter(this, void 0, void 0, function* () {
            const { provider, network } = this.getNetworkState();
            const { transactions } = this.state;
            transaction = util_1.normalizeTransaction(transaction);
            util_1.validateTransaction(transaction);
            const transactionMeta = {
                id: uuid_1.v1(),
                networkID: network,
                chainId: provider.chainId,
                origin,
                status: TransactionStatus.unapproved,
                time: Date.now(),
                transaction,
                deviceConfirmedOn,
            };
            try {
                const { gas, gasPrice } = yield this.estimateGas(transaction);
                transaction.gas = gas;
                transaction.gasPrice = gasPrice;
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
            this.update({ transactions: [...transactions] });
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
     * @ethereumjs/tx uses @ethereumjs/common as a configuration tool for
     * specifying which chain, network, hardfork and EIPs to support for
     * a transaction. By referencing this configuration, and analyzing the fields
     * specified in txParams, @ethereumjs/tx is able to determine which EIP-2718
     * transaction type to use.
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
     * @param transactionID - ID of the transaction to approve
     * @returns - Promise resolving when this operation completes
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
                    (yield util_1.query(this.ethQuery, 'getTransactionCount', [from, 'pending']));
                transactionMeta.status = status;
                transactionMeta.transaction.nonce = txNonce;
                transactionMeta.transaction.chainId = chainId;
                const txParams = Object.assign(Object.assign({}, transactionMeta.transaction), { gasLimit: transactionMeta.transaction.gas, chainId, nonce: txNonce, status });
                const unsignedEthTx = this.prepareUnsignedEthTx(txParams);
                const signedTx = yield this.sign(unsignedEthTx, from);
                transactionMeta.status = TransactionStatus.signed;
                this.updateTransaction(transactionMeta);
                const rawTransaction = ethereumjs_util_1.bufferToHex(signedTx.serialize());
                transactionMeta.rawTransaction = rawTransaction;
                this.updateTransaction(transactionMeta);
                const transactionHash = yield util_1.query(this.ethQuery, 'sendRawTransaction', [
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
     * @param transactionID - ID of the transaction to cancel
     */
    cancelTransaction(transactionID) {
        const transactionMeta = this.state.transactions.find(({ id }) => id === transactionID);
        if (!transactionMeta) {
            return;
        }
        transactionMeta.status = TransactionStatus.rejected;
        this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
        const transactions = this.state.transactions.filter(({ id }) => id !== transactionID);
        this.update({ transactions: [...transactions] });
    }
    /**
     * Attempts to cancel a transaction based on its ID by setting its status to "rejected"
     * and emitting a `<tx.id>:finished` hub event.
     *
     * @param transactionID - ID of the transaction to cancel
     */
    stopTransaction(transactionID) {
        return __awaiter(this, void 0, void 0, function* () {
            const transactionMeta = this.state.transactions.find(({ id }) => id === transactionID);
            if (!transactionMeta) {
                return;
            }
            if (!this.sign) {
                throw new Error('No sign method defined.');
            }
            const existingGasPrice = transactionMeta.transaction.gasPrice;
            /* istanbul ignore next */
            const existingGasPriceDecimal = parseInt(existingGasPrice === undefined ? '0x0' : existingGasPrice, 16);
            const gasPrice = ethereumjs_util_1.addHexPrefix(`${parseInt(`${existingGasPriceDecimal * exports.CANCEL_RATE}`, 10).toString(16)}`);
            const txParams = {
                from: transactionMeta.transaction.from,
                gasLimit: transactionMeta.transaction.gas,
                gasPrice,
                nonce: transactionMeta.transaction.nonce,
                to: transactionMeta.transaction.from,
                value: '0x0',
            };
            const unsignedEthTx = this.prepareUnsignedEthTx(txParams);
            const signedTx = yield this.sign(unsignedEthTx, transactionMeta.transaction.from);
            const rawTransaction = ethereumjs_util_1.bufferToHex(signedTx.serialize());
            yield util_1.query(this.ethQuery, 'sendRawTransaction', [rawTransaction]);
            transactionMeta.status = TransactionStatus.cancelled;
            this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
        });
    }
    /**
     * Attemps to speed up a transaction increasing transaction gasPrice by ten percent
     *
     * @param transactionID - ID of the transaction to speed up
     */
    speedUpTransaction(transactionID) {
        return __awaiter(this, void 0, void 0, function* () {
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
            const existingGasPrice = transactionMeta.transaction.gasPrice;
            /* istanbul ignore next */
            const existingGasPriceDecimal = parseInt(existingGasPrice === undefined ? '0x0' : existingGasPrice, 16);
            const gasPrice = ethereumjs_util_1.addHexPrefix(`${parseInt(`${existingGasPriceDecimal * exports.SPEED_UP_RATE}`, 10).toString(16)}`);
            const txParams = Object.assign(Object.assign({}, transactionMeta.transaction), { gasLimit: transactionMeta.transaction.gas, gasPrice });
            const unsignedEthTx = this.prepareUnsignedEthTx(txParams);
            const signedTx = yield this.sign(unsignedEthTx, transactionMeta.transaction.from);
            const rawTransaction = ethereumjs_util_1.bufferToHex(signedTx.serialize());
            const transactionHash = yield util_1.query(this.ethQuery, 'sendRawTransaction', [
                rawTransaction,
            ]);
            const newTransactionMeta = Object.assign(Object.assign({}, transactionMeta), { id: uuid_1.v1(), time: Date.now(), transaction: Object.assign(Object.assign({}, transactionMeta.transaction), { gasPrice }), transactionHash });
            transactions.push(newTransactionMeta);
            this.update({ transactions: [...transactions] });
            this.hub.emit(`${transactionMeta.id}:speedup`, newTransactionMeta);
        });
    }
    /**
     * Estimates required gas for a given transaction
     *
     * @param transaction - Transaction object to estimate gas for
     * @returns - Promise resolving to an object containing gas and gasPrice
     */
    estimateGas(transaction) {
        return __awaiter(this, void 0, void 0, function* () {
            const estimatedTransaction = Object.assign({}, transaction);
            const { gas, gasPrice: providedGasPrice, to, value, data, } = estimatedTransaction;
            const gasPrice = typeof providedGasPrice === 'undefined'
                ? yield util_1.query(this.ethQuery, 'gasPrice')
                : providedGasPrice;
            // 1. If gas is already defined on the transaction, use it
            if (typeof gas !== 'undefined') {
                return { gas, gasPrice };
            }
            const { gasLimit } = yield util_1.query(this.ethQuery, 'getBlockByNumber', [
                'latest',
                false,
            ]);
            // 2. If to is not defined or this is not a contract address, and there is no data use 0x5208 / 21000
            /* istanbul ignore next */
            const code = to ? yield util_1.query(this.ethQuery, 'getCode', [to]) : undefined;
            /* istanbul ignore next */
            if (!to || (to && !data && (!code || code === '0x'))) {
                return { gas: '0x5208', gasPrice };
            }
            // if data, should be hex string format
            estimatedTransaction.data = !data
                ? data
                : /* istanbul ignore next */ ethereumjs_util_1.addHexPrefix(data);
            // 3. If this is a contract address, safely estimate gas using RPC
            estimatedTransaction.value =
                typeof value === 'undefined' ? '0x0' : /* istanbul ignore next */ value;
            const gasLimitBN = util_1.hexToBN(gasLimit);
            estimatedTransaction.gas = util_1.BNToHex(util_1.fractionBN(gasLimitBN, 19, 20));
            const gasHex = yield util_1.query(this.ethQuery, 'estimateGas', [
                estimatedTransaction,
            ]);
            // 4. Pad estimated gas without exceeding the most recent block gasLimit
            const gasBN = util_1.hexToBN(gasHex);
            const maxGasBN = gasLimitBN.muln(0.9);
            const paddedGasBN = gasBN.muln(1.5);
            /* istanbul ignore next */
            if (gasBN.gt(maxGasBN)) {
                return { gas: ethereumjs_util_1.addHexPrefix(gasHex), gasPrice };
            }
            /* istanbul ignore next */
            if (paddedGasBN.lt(maxGasBN)) {
                return { gas: ethereumjs_util_1.addHexPrefix(util_1.BNToHex(paddedGasBN)), gasPrice };
            }
            return { gas: ethereumjs_util_1.addHexPrefix(util_1.BNToHex(maxGasBN)), gasPrice };
        });
    }
    /**
     * Resiliently checks all submitted transactions on the blockchain
     * and verifies that it has been included in a block
     * when that happens, the tx status is updated to confirmed
     *
     * @returns - Promise resolving when this operation completes
     */
    queryTransactionStatuses() {
        return __awaiter(this, void 0, void 0, function* () {
            const { transactions } = this.state;
            const { provider, network: currentNetworkID } = this.getNetworkState();
            const { chainId: currentChainId } = provider;
            let gotUpdates = false;
            yield util_1.safelyExecute(() => Promise.all(transactions.map((meta, index) => __awaiter(this, void 0, void 0, function* () {
                // Using fallback to networkID only when there is no chainId present. Should be removed when networkID is completely removed.
                if (meta.status === TransactionStatus.submitted &&
                    (meta.chainId === currentChainId ||
                        (!meta.chainId && meta.networkID === currentNetworkID))) {
                    const txObj = yield util_1.query(this.ethQuery, 'getTransactionByHash', [
                        meta.transactionHash,
                    ]);
                    /* istanbul ignore next */
                    if (txObj === null || txObj === void 0 ? void 0 : txObj.blockNumber) {
                        transactions[index].status = TransactionStatus.confirmed;
                        this.hub.emit(`${meta.id}:confirmed`, meta);
                        gotUpdates = true;
                    }
                }
            }))));
            /* istanbul ignore else */
            if (gotUpdates) {
                this.update({ transactions: [...transactions] });
            }
        });
    }
    /**
     * Updates an existing transaction in state
     *
     * @param transactionMeta - New transaction meta to store in state
     */
    updateTransaction(transactionMeta) {
        const { transactions } = this.state;
        transactionMeta.transaction = util_1.normalizeTransaction(transactionMeta.transaction);
        util_1.validateTransaction(transactionMeta.transaction);
        const index = transactions.findIndex(({ id }) => transactionMeta.id === id);
        transactions[index] = transactionMeta;
        this.update({ transactions: [...transactions] });
    }
    /**
     * Removes all transactions from state, optionally based on the current network
     *
     * @param ignoreNetwork - Ignores network
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
        this.update({ transactions: newTransactions });
    }
    /**
     * Gets all transactions from etherscan for a specific address
     * optionally starting from a specific block
     *
     * @param address - string representing the address to fetch the transactions from
     * @param opt - Object containing optional data, fromBlock and Alethio API key
     * @returns - Promise resolving to an string containing the block number of the latest incoming transaction.
     */
    fetchAll(address, opt) {
        return __awaiter(this, void 0, void 0, function* () {
            const { provider, network: currentNetworkID } = this.getNetworkState();
            const { chainId: currentChainId, type: networkType } = provider;
            const supportedNetworkIds = ['1', '3', '4', '42'];
            /* istanbul ignore next */
            if (supportedNetworkIds.indexOf(currentNetworkID) === -1) {
                return undefined;
            }
            const [etherscanTxResponse, etherscanTokenResponse,] = yield util_1.handleTransactionFetch(networkType, address, opt);
            const normalizedTxs = etherscanTxResponse.result.map((tx) => this.normalizeTx(tx, currentNetworkID, currentChainId));
            const normalizedTokenTxs = etherscanTokenResponse.result.map((tx) => this.normalizeTokenTx(tx, currentNetworkID, currentChainId));
            const remoteTxs = [...normalizedTxs, ...normalizedTokenTxs].filter((tx) => {
                const alreadyInTransactions = this.state.transactions.find(({ transactionHash }) => transactionHash === tx.transactionHash);
                return !alreadyInTransactions;
            });
            const allTxs = [...remoteTxs, ...this.state.transactions];
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
                        const code = yield util_1.query(this.ethQuery, 'getCode', [
                            tx.transaction.to,
                        ]);
                        tx.toSmartContract = util_1.isSmartContractCode(code);
                    }
                    else {
                        tx.toSmartContract = false;
                    }
                }
            }));
            // Update state only if new transactions were fetched
            if (allTxs.length > this.state.transactions.length) {
                this.update({ transactions: allTxs });
            }
            return latestIncomingTxBlockNumber;
        });
    }
}
exports.TransactionController = TransactionController;
exports.default = TransactionController;
//# sourceMappingURL=TransactionController.js.map