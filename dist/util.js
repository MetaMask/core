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
exports.isTokenListSupportedForNetwork = exports.isTokenDetectionSupportedForNetwork = exports.SupportedTokenDetectionNetworks = exports.isValidJson = exports.isNonEmptyArray = exports.hasProperty = exports.isPlainObject = exports.getFormattedIpfsUrl = exports.addUrlProtocolPrefix = exports.getIpfsCIDv1AndPath = exports.removeIpfsProtocolPrefix = exports.validateMinimumIncrease = exports.isGasPriceValue = exports.isFeeMarketEIP1559Values = exports.validateGasValues = exports.getIncreasedPriceFromExisting = exports.getIncreasedPriceHex = exports.convertHexToDecimal = exports.isEIP1559Transaction = exports.query = exports.normalizeEnsName = exports.timeoutFetch = exports.fetchWithErrorHandling = exports.handleFetch = exports.successfulFetch = exports.isSmartContractCode = exports.validateTokenToWatch = exports.validateTypedSignMessageDataV3 = exports.validateTypedSignMessageDataV1 = exports.validateSignMessageData = exports.normalizeMessageData = exports.validateTransaction = exports.isValidHexAddress = exports.toChecksumHexAddress = exports.safelyExecuteWithTimeout = exports.safelyExecute = exports.normalizeTransaction = exports.toHex = exports.fromHex = exports.hexToText = exports.hexToBN = exports.handleTransactionFetch = exports.getEtherscanApiUrl = exports.getBuyURL = exports.weiHexToGweiDec = exports.gweiDecToWEIBN = exports.fractionBN = exports.BNToHex = void 0;
const ethereumjs_util_1 = require("ethereumjs-util");
const ethjs_unit_1 = require("ethjs-unit");
const eth_rpc_errors_1 = require("eth-rpc-errors");
const eth_ens_namehash_1 = __importDefault(require("eth-ens-namehash"));
const eth_sig_util_1 = require("eth-sig-util");
const jsonschema_1 = require("jsonschema");
const cid_1 = require("multiformats/cid");
const fast_deep_equal_1 = __importDefault(require("fast-deep-equal"));
const constants_1 = require("./constants");
const TIMEOUT_ERROR = new Error('timeout');
const hexRe = /^[0-9A-Fa-f]+$/gu;
const NORMALIZERS = {
    data: (data) => (0, ethereumjs_util_1.addHexPrefix)(data),
    from: (from) => (0, ethereumjs_util_1.addHexPrefix)(from).toLowerCase(),
    gas: (gas) => (0, ethereumjs_util_1.addHexPrefix)(gas),
    gasPrice: (gasPrice) => (0, ethereumjs_util_1.addHexPrefix)(gasPrice),
    nonce: (nonce) => (0, ethereumjs_util_1.addHexPrefix)(nonce),
    to: (to) => (0, ethereumjs_util_1.addHexPrefix)(to).toLowerCase(),
    value: (value) => (0, ethereumjs_util_1.addHexPrefix)(value),
    maxFeePerGas: (maxFeePerGas) => (0, ethereumjs_util_1.addHexPrefix)(maxFeePerGas),
    maxPriorityFeePerGas: (maxPriorityFeePerGas) => (0, ethereumjs_util_1.addHexPrefix)(maxPriorityFeePerGas),
    estimatedBaseFee: (maxPriorityFeePerGas) => (0, ethereumjs_util_1.addHexPrefix)(maxPriorityFeePerGas),
};
/**
 * Converts a BN object to a hex string with a '0x' prefix.
 *
 * @param inputBn - BN instance to convert to a hex string.
 * @returns A '0x'-prefixed hex string.
 */
function BNToHex(inputBn) {
    return (0, ethereumjs_util_1.addHexPrefix)(inputBn.toString(16));
}
exports.BNToHex = BNToHex;
/**
 * Used to multiply a BN by a fraction.
 *
 * @param targetBN - Number to multiply by a fraction.
 * @param numerator - Numerator of the fraction multiplier.
 * @param denominator - Denominator of the fraction multiplier.
 * @returns Product of the multiplication.
 */
function fractionBN(targetBN, numerator, denominator) {
    const numBN = new ethereumjs_util_1.BN(numerator);
    const denomBN = new ethereumjs_util_1.BN(denominator);
    return targetBN.mul(numBN).div(denomBN);
}
exports.fractionBN = fractionBN;
/**
 * Used to convert a base-10 number from GWEI to WEI. Can handle numbers with decimal parts.
 *
 * @param n - The base 10 number to convert to WEI.
 * @returns The number in WEI, as a BN.
 */
function gweiDecToWEIBN(n) {
    if (Number.isNaN(n)) {
        return new ethereumjs_util_1.BN(0);
    }
    const parts = n.toString().split('.');
    const wholePart = parts[0] || '0';
    let decimalPart = parts[1] || '';
    if (!decimalPart) {
        return (0, ethjs_unit_1.toWei)(wholePart, 'gwei');
    }
    if (decimalPart.length <= 9) {
        return (0, ethjs_unit_1.toWei)(`${wholePart}.${decimalPart}`, 'gwei');
    }
    const decimalPartToRemove = decimalPart.slice(9);
    const decimalRoundingDigit = decimalPartToRemove[0];
    decimalPart = decimalPart.slice(0, 9);
    let wei = (0, ethjs_unit_1.toWei)(`${wholePart}.${decimalPart}`, 'gwei');
    if (Number(decimalRoundingDigit) >= 5) {
        wei = wei.add(new ethereumjs_util_1.BN(1));
    }
    return wei;
}
exports.gweiDecToWEIBN = gweiDecToWEIBN;
/**
 * Used to convert values from wei hex format to dec gwei format.
 *
 * @param hex - The value in hex wei.
 * @returns The value in dec gwei as string.
 */
function weiHexToGweiDec(hex) {
    const hexWei = new ethereumjs_util_1.BN((0, ethereumjs_util_1.stripHexPrefix)(hex), 16);
    return (0, ethjs_unit_1.fromWei)(hexWei, 'gwei').toString(10);
}
exports.weiHexToGweiDec = weiHexToGweiDec;
/**
 * Return a URL that can be used to obtain ETH for a given network.
 *
 * @param networkCode - Network code of desired network.
 * @param address - Address to deposit obtained ETH.
 * @param amount - How much ETH is desired.
 * @returns URL to buy ETH based on network.
 */
function getBuyURL(networkCode = '1', address, amount = 5) {
    switch (networkCode) {
        case '1':
            return `https://buy.coinbase.com/?code=9ec56d01-7e81-5017-930c-513daa27bb6a&amount=${amount}&address=${address}&crypto_currency=ETH`;
        case '3':
            return 'https://faucet.metamask.io/';
        case '4':
            return 'https://www.rinkeby.io/';
        case '5':
            return 'https://goerli-faucet.slock.it/';
        case '42':
            return 'https://github.com/kovan-testnet/faucet';
        default:
            return undefined;
    }
}
exports.getBuyURL = getBuyURL;
/**
 * Return a URL that can be used to fetch ETH transactions.
 *
 * @param networkType - Network type of desired network.
 * @param urlParams - The parameters used to construct the URL.
 * @returns URL to fetch the access the endpoint.
 */
function getEtherscanApiUrl(networkType, urlParams) {
    let etherscanSubdomain = 'api';
    if (networkType !== constants_1.MAINNET) {
        etherscanSubdomain = `api-${networkType}`;
    }
    const apiUrl = `https://${etherscanSubdomain}.etherscan.io`;
    let url = `${apiUrl}/api?`;
    for (const paramKey in urlParams) {
        if (urlParams[paramKey]) {
            url += `${paramKey}=${urlParams[paramKey]}&`;
        }
    }
    url += 'tag=latest&page=1';
    return url;
}
exports.getEtherscanApiUrl = getEtherscanApiUrl;
/**
 * Handles the fetch of incoming transactions.
 *
 * @param networkType - Network type of desired network.
 * @param address - Address to get the transactions from.
 * @param txHistoryLimit - The maximum number of transactions to fetch.
 * @param opt - Object that can contain fromBlock and Etherscan service API key.
 * @returns Responses for both ETH and ERC20 token transactions.
 */
function handleTransactionFetch(networkType, address, txHistoryLimit, opt) {
    return __awaiter(this, void 0, void 0, function* () {
        // transactions
        const urlParams = {
            module: 'account',
            address,
            startBlock: opt === null || opt === void 0 ? void 0 : opt.fromBlock,
            apikey: opt === null || opt === void 0 ? void 0 : opt.etherscanApiKey,
            offset: txHistoryLimit.toString(),
            order: 'desc',
        };
        const etherscanTxUrl = getEtherscanApiUrl(networkType, Object.assign(Object.assign({}, urlParams), { action: 'txlist' }));
        const etherscanTxResponsePromise = handleFetch(etherscanTxUrl);
        // tokens
        const etherscanTokenUrl = getEtherscanApiUrl(networkType, Object.assign(Object.assign({}, urlParams), { action: 'tokentx' }));
        const etherscanTokenResponsePromise = handleFetch(etherscanTokenUrl);
        let [etherscanTxResponse, etherscanTokenResponse] = yield Promise.all([
            etherscanTxResponsePromise,
            etherscanTokenResponsePromise,
        ]);
        if (etherscanTxResponse.status === '0' ||
            etherscanTxResponse.result.length <= 0) {
            etherscanTxResponse = { status: etherscanTxResponse.status, result: [] };
        }
        if (etherscanTokenResponse.status === '0' ||
            etherscanTokenResponse.result.length <= 0) {
            etherscanTokenResponse = {
                status: etherscanTokenResponse.status,
                result: [],
            };
        }
        return [etherscanTxResponse, etherscanTokenResponse];
    });
}
exports.handleTransactionFetch = handleTransactionFetch;
/**
 * Converts a hex string to a BN object.
 *
 * @param inputHex - Number represented as a hex string.
 * @returns A BN instance.
 */
function hexToBN(inputHex) {
    return new ethereumjs_util_1.BN((0, ethereumjs_util_1.stripHexPrefix)(inputHex), 16);
}
exports.hexToBN = hexToBN;
/**
 * A helper function that converts hex data to human readable string.
 *
 * @param hex - The hex string to convert to string.
 * @returns A human readable string conversion.
 */
function hexToText(hex) {
    try {
        const stripped = (0, ethereumjs_util_1.stripHexPrefix)(hex);
        const buff = Buffer.from(stripped, 'hex');
        return buff.toString('utf8');
    }
    catch (e) {
        /* istanbul ignore next */
        return hex;
    }
}
exports.hexToText = hexToText;
/**
 * Parses a hex string and converts it into a number that can be operated on in a bignum-safe,
 * base-10 way.
 *
 * @param value - A base-16 number encoded as a string.
 * @returns The number as a BN object in base-16 mode.
 */
function fromHex(value) {
    if (ethereumjs_util_1.BN.isBN(value)) {
        return value;
    }
    return new ethereumjs_util_1.BN(hexToBN(value).toString(10));
}
exports.fromHex = fromHex;
/**
 * Converts an integer to a hexadecimal representation.
 *
 * @param value - An integer, an integer encoded as a base-10 string, or a BN.
 * @returns The integer encoded as a hex string.
 */
function toHex(value) {
    if (typeof value === 'string' && (0, ethereumjs_util_1.isHexString)(value)) {
        return value;
    }
    const hexString = ethereumjs_util_1.BN.isBN(value)
        ? value.toString(16)
        : new ethereumjs_util_1.BN(value.toString(), 10).toString(16);
    return `0x${hexString}`;
}
exports.toHex = toHex;
/**
 * Normalizes properties on a Transaction object.
 *
 * @param transaction - Transaction object to normalize.
 * @returns Normalized Transaction object.
 */
function normalizeTransaction(transaction) {
    const normalizedTransaction = { from: '' };
    let key;
    for (key in NORMALIZERS) {
        if (transaction[key]) {
            normalizedTransaction[key] = NORMALIZERS[key](transaction[key]);
        }
    }
    return normalizedTransaction;
}
exports.normalizeTransaction = normalizeTransaction;
/**
 * Execute and return an asynchronous operation without throwing errors.
 *
 * @param operation - Function returning a Promise.
 * @param logError - Determines if the error should be logged.
 * @returns Promise resolving to the result of the async operation.
 */
function safelyExecute(operation, logError = false) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return yield operation();
        }
        catch (error) {
            /* istanbul ignore next */
            if (logError) {
                console.error(error);
            }
            return undefined;
        }
    });
}
exports.safelyExecute = safelyExecute;
/**
 * Execute and return an asynchronous operation with a timeout.
 *
 * @param operation - Function returning a Promise.
 * @param logError - Determines if the error should be logged.
 * @param timeout - Timeout to fail the operation.
 * @returns Promise resolving to the result of the async operation.
 */
function safelyExecuteWithTimeout(operation, logError = false, timeout = 500) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return yield Promise.race([
                operation(),
                new Promise((_, reject) => setTimeout(() => {
                    reject(TIMEOUT_ERROR);
                }, timeout)),
            ]);
        }
        catch (error) {
            /* istanbul ignore next */
            if (logError) {
                console.error(error);
            }
            return undefined;
        }
    });
}
exports.safelyExecuteWithTimeout = safelyExecuteWithTimeout;
/**
 * Convert an address to a checksummed hexidecimal address.
 *
 * @param address - The address to convert.
 * @returns A 0x-prefixed hexidecimal checksummed address.
 */
function toChecksumHexAddress(address) {
    const hexPrefixed = (0, ethereumjs_util_1.addHexPrefix)(address);
    if (!(0, ethereumjs_util_1.isHexString)(hexPrefixed)) {
        // Version 5.1 of ethereumjs-utils would have returned '0xY' for input 'y'
        // but we shouldn't waste effort trying to change case on a clearly invalid
        // string. Instead just return the hex prefixed original string which most
        // closely mimics the original behavior.
        return hexPrefixed;
    }
    return (0, ethereumjs_util_1.toChecksumAddress)(hexPrefixed);
}
exports.toChecksumHexAddress = toChecksumHexAddress;
/**
 * Validates that the input is a hex address. This utility method is a thin
 * wrapper around ethereumjs-util.isValidAddress, with the exception that it
 * does not throw an error when provided values that are not hex strings. In
 * addition, and by default, this method will return true for hex strings that
 * meet the length requirement of a hex address, but are not prefixed with `0x`
 * Finally, if the mixedCaseUseChecksum flag is true and a mixed case string is
 * provided this method will validate it has the proper checksum formatting.
 *
 * @param possibleAddress - Input parameter to check against.
 * @param options - The validation options.
 * @param options.allowNonPrefixed - If true will first ensure '0x' is prepended to the string.
 * @returns Whether or not the input is a valid hex address.
 */
function isValidHexAddress(possibleAddress, { allowNonPrefixed = true } = {}) {
    const addressToCheck = allowNonPrefixed
        ? (0, ethereumjs_util_1.addHexPrefix)(possibleAddress)
        : possibleAddress;
    if (!(0, ethereumjs_util_1.isHexString)(addressToCheck)) {
        return false;
    }
    return (0, ethereumjs_util_1.isValidAddress)(addressToCheck);
}
exports.isValidHexAddress = isValidHexAddress;
/**
 * Validates a Transaction object for required properties and throws in
 * the event of any validation error.
 *
 * @param transaction - Transaction object to validate.
 */
function validateTransaction(transaction) {
    if (!transaction.from ||
        typeof transaction.from !== 'string' ||
        !isValidHexAddress(transaction.from)) {
        throw new Error(`Invalid "from" address: ${transaction.from} must be a valid string.`);
    }
    if (transaction.to === '0x' || transaction.to === undefined) {
        if (transaction.data) {
            delete transaction.to;
        }
        else {
            throw new Error(`Invalid "to" address: ${transaction.to} must be a valid string.`);
        }
    }
    else if (transaction.to !== undefined &&
        !isValidHexAddress(transaction.to)) {
        throw new Error(`Invalid "to" address: ${transaction.to} must be a valid string.`);
    }
    if (transaction.value !== undefined) {
        const value = transaction.value.toString();
        if (value.includes('-')) {
            throw new Error(`Invalid "value": ${value} is not a positive number.`);
        }
        if (value.includes('.')) {
            throw new Error(`Invalid "value": ${value} number must be denominated in wei.`);
        }
        const intValue = parseInt(transaction.value, 10);
        const isValid = Number.isFinite(intValue) &&
            !Number.isNaN(intValue) &&
            !isNaN(Number(value)) &&
            Number.isSafeInteger(intValue);
        if (!isValid) {
            throw new Error(`Invalid "value": ${value} number must be a valid number.`);
        }
    }
}
exports.validateTransaction = validateTransaction;
/**
 * A helper function that converts rawmessageData buffer data to a hex, or just returns the data if
 * it is already formatted as a hex.
 *
 * @param data - The buffer data to convert to a hex.
 * @returns A hex string conversion of the buffer data.
 */
function normalizeMessageData(data) {
    try {
        const stripped = (0, ethereumjs_util_1.stripHexPrefix)(data);
        if (stripped.match(hexRe)) {
            return (0, ethereumjs_util_1.addHexPrefix)(stripped);
        }
    }
    catch (e) {
        /* istanbul ignore next */
    }
    return (0, ethereumjs_util_1.bufferToHex)(Buffer.from(data, 'utf8'));
}
exports.normalizeMessageData = normalizeMessageData;
/**
 * Validates a PersonalMessageParams and MessageParams objects for required properties and throws in
 * the event of any validation error.
 *
 * @param messageData - PersonalMessageParams object to validate.
 */
function validateSignMessageData(messageData) {
    const { from, data } = messageData;
    if (!from || typeof from !== 'string' || !isValidHexAddress(from)) {
        throw new Error(`Invalid "from" address: ${from} must be a valid string.`);
    }
    if (!data || typeof data !== 'string') {
        throw new Error(`Invalid message "data": ${data} must be a valid string.`);
    }
}
exports.validateSignMessageData = validateSignMessageData;
/**
 * Validates a TypedMessageParams object for required properties and throws in
 * the event of any validation error for eth_signTypedMessage_V1.
 *
 * @param messageData - TypedMessageParams object to validate.
 */
function validateTypedSignMessageDataV1(messageData) {
    if (!messageData.from ||
        typeof messageData.from !== 'string' ||
        !isValidHexAddress(messageData.from)) {
        throw new Error(`Invalid "from" address: ${messageData.from} must be a valid string.`);
    }
    if (!messageData.data || !Array.isArray(messageData.data)) {
        throw new Error(`Invalid message "data": ${messageData.data} must be a valid array.`);
    }
    try {
        // typedSignatureHash will throw if the data is invalid.
        (0, eth_sig_util_1.typedSignatureHash)(messageData.data);
    }
    catch (e) {
        throw new Error(`Expected EIP712 typed data.`);
    }
}
exports.validateTypedSignMessageDataV1 = validateTypedSignMessageDataV1;
/**
 * Validates a TypedMessageParams object for required properties and throws in
 * the event of any validation error for eth_signTypedMessage_V3.
 *
 * @param messageData - TypedMessageParams object to validate.
 */
function validateTypedSignMessageDataV3(messageData) {
    if (!messageData.from ||
        typeof messageData.from !== 'string' ||
        !isValidHexAddress(messageData.from)) {
        throw new Error(`Invalid "from" address: ${messageData.from} must be a valid string.`);
    }
    if (!messageData.data || typeof messageData.data !== 'string') {
        throw new Error(`Invalid message "data": ${messageData.data} must be a valid array.`);
    }
    let data;
    try {
        data = JSON.parse(messageData.data);
    }
    catch (e) {
        throw new Error('Data must be passed as a valid JSON string.');
    }
    const validation = (0, jsonschema_1.validate)(data, eth_sig_util_1.TYPED_MESSAGE_SCHEMA);
    if (validation.errors.length > 0) {
        throw new Error('Data must conform to EIP-712 schema. See https://git.io/fNtcx.');
    }
}
exports.validateTypedSignMessageDataV3 = validateTypedSignMessageDataV3;
/**
 * Validates a ERC20 token to be added with EIP747.
 *
 * @param token - Token object to validate.
 */
function validateTokenToWatch(token) {
    const { address, symbol, decimals } = token;
    if (!address || !symbol || typeof decimals === 'undefined') {
        throw eth_rpc_errors_1.ethErrors.rpc.invalidParams(`Must specify address, symbol, and decimals.`);
    }
    if (typeof symbol !== 'string') {
        throw eth_rpc_errors_1.ethErrors.rpc.invalidParams(`Invalid symbol: not a string.`);
    }
    if (symbol.length > 11) {
        throw eth_rpc_errors_1.ethErrors.rpc.invalidParams(`Invalid symbol "${symbol}": longer than 11 characters.`);
    }
    const numDecimals = parseInt(decimals, 10);
    if (isNaN(numDecimals) || numDecimals > 36 || numDecimals < 0) {
        throw eth_rpc_errors_1.ethErrors.rpc.invalidParams(`Invalid decimals "${decimals}": must be 0 <= 36.`);
    }
    if (!isValidHexAddress(address)) {
        throw eth_rpc_errors_1.ethErrors.rpc.invalidParams(`Invalid address "${address}".`);
    }
}
exports.validateTokenToWatch = validateTokenToWatch;
/**
 * Returns whether the given code corresponds to a smart contract.
 *
 * @param code - The potential smart contract code.
 * @returns Whether the code was smart contract code or not.
 */
function isSmartContractCode(code) {
    /* istanbul ignore if */
    if (!code) {
        return false;
    }
    // Geth will return '0x', and ganache-core v2.2.1 will return '0x0'
    const smartContractCode = code !== '0x' && code !== '0x0';
    return smartContractCode;
}
exports.isSmartContractCode = isSmartContractCode;
/**
 * Execute fetch and verify that the response was successful.
 *
 * @param request - Request information.
 * @param options - Fetch options.
 * @returns The fetch response.
 */
function successfulFetch(request, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield fetch(request, options);
        if (!response.ok) {
            throw new Error(`Fetch failed with status '${response.status}' for request '${request}'`);
        }
        return response;
    });
}
exports.successfulFetch = successfulFetch;
/**
 * Execute fetch and return object response.
 *
 * @param request - The request information.
 * @param options - The fetch options.
 * @returns The fetch response JSON data.
 */
function handleFetch(request, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield successfulFetch(request, options);
        const object = yield response.json();
        return object;
    });
}
exports.handleFetch = handleFetch;
/**
 * Execute fetch and return object response, log if known error thrown, otherwise rethrow error.
 *
 * @param request - the request options object
 * @param request.url - The request url to query.
 * @param request.options - The fetch options.
 * @param request.timeout - Timeout to fail request
 * @param request.errorCodesToCatch - array of error codes for errors we want to catch in a particular context
 * @returns The fetch response JSON data or undefined (if error occurs).
 */
function fetchWithErrorHandling({ url, options, timeout, errorCodesToCatch, }) {
    return __awaiter(this, void 0, void 0, function* () {
        let result;
        try {
            if (timeout) {
                result = Promise.race([
                    yield handleFetch(url, options),
                    new Promise((_, reject) => setTimeout(() => {
                        reject(TIMEOUT_ERROR);
                    }, timeout)),
                ]);
            }
            else {
                result = yield handleFetch(url, options);
            }
        }
        catch (e) {
            logOrRethrowError(e, errorCodesToCatch);
        }
        return result;
    });
}
exports.fetchWithErrorHandling = fetchWithErrorHandling;
/**
 * Fetch that fails after timeout.
 *
 * @param url - Url to fetch.
 * @param options - Options to send with the request.
 * @param timeout - Timeout to fail request.
 * @returns Promise resolving the request.
 */
function timeoutFetch(url, options, timeout = 500) {
    return __awaiter(this, void 0, void 0, function* () {
        return Promise.race([
            successfulFetch(url, options),
            new Promise((_, reject) => setTimeout(() => {
                reject(TIMEOUT_ERROR);
            }, timeout)),
        ]);
    });
}
exports.timeoutFetch = timeoutFetch;
/**
 * Normalizes the given ENS name.
 *
 * @param ensName - The ENS name.
 * @returns The normalized ENS name string.
 */
function normalizeEnsName(ensName) {
    if (ensName && typeof ensName === 'string') {
        try {
            const normalized = eth_ens_namehash_1.default.normalize(ensName.trim());
            // this regex is only sufficient with the above call to ensNamehash.normalize
            // TODO: change 7 in regex to 3 when shorter ENS domains are live
            if (normalized.match(/^(([\w\d-]+)\.)*[\w\d-]{7,}\.(eth|test)$/u)) {
                return normalized;
            }
        }
        catch (_) {
            // do nothing
        }
    }
    return null;
}
exports.normalizeEnsName = normalizeEnsName;
/**
 * Wrapper method to handle EthQuery requests.
 *
 * @param ethQuery - EthQuery object initialized with a provider.
 * @param method - Method to request.
 * @param args - Arguments to send.
 * @returns Promise resolving the request.
 */
function query(ethQuery, method, args = []) {
    return new Promise((resolve, reject) => {
        const cb = (error, result) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(result);
        };
        if (typeof ethQuery[method] === 'function') {
            ethQuery[method](...args, cb);
        }
        else {
            ethQuery.sendAsync({ method, params: args }, cb);
        }
    });
}
exports.query = query;
/**
 * Checks if a transaction is EIP-1559 by checking for the existence of
 * maxFeePerGas and maxPriorityFeePerGas within its parameters.
 *
 * @param transaction - Transaction object to add.
 * @returns Boolean that is true if the transaction is EIP-1559 (has maxFeePerGas and maxPriorityFeePerGas), otherwise returns false.
 */
const isEIP1559Transaction = (transaction) => {
    const hasOwnProp = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
    return (hasOwnProp(transaction, 'maxFeePerGas') &&
        hasOwnProp(transaction, 'maxPriorityFeePerGas'));
};
exports.isEIP1559Transaction = isEIP1559Transaction;
/**
 * Converts valid hex strings to decimal numbers, and handles unexpected arg types.
 *
 * @param value - a string that is either a hexadecimal with `0x` prefix or a decimal string.
 * @returns a decimal number.
 */
const convertHexToDecimal = (value = '0x0') => {
    if ((0, ethereumjs_util_1.isHexString)(value)) {
        return parseInt(value, 16);
    }
    return Number(value) ? Number(value) : 0;
};
exports.convertHexToDecimal = convertHexToDecimal;
const getIncreasedPriceHex = (value, rate) => (0, ethereumjs_util_1.addHexPrefix)(`${parseInt(`${value * rate}`, 10).toString(16)}`);
exports.getIncreasedPriceHex = getIncreasedPriceHex;
const getIncreasedPriceFromExisting = (value, rate) => {
    return (0, exports.getIncreasedPriceHex)((0, exports.convertHexToDecimal)(value), rate);
};
exports.getIncreasedPriceFromExisting = getIncreasedPriceFromExisting;
const validateGasValues = (gasValues) => {
    Object.keys(gasValues).forEach((key) => {
        const value = gasValues[key];
        if (typeof value !== 'string' || !(0, ethereumjs_util_1.isHexString)(value)) {
            throw new TypeError(`expected hex string for ${key} but received: ${value}`);
        }
    });
};
exports.validateGasValues = validateGasValues;
const isFeeMarketEIP1559Values = (gasValues) => (gasValues === null || gasValues === void 0 ? void 0 : gasValues.maxFeePerGas) !== undefined ||
    (gasValues === null || gasValues === void 0 ? void 0 : gasValues.maxPriorityFeePerGas) !== undefined;
exports.isFeeMarketEIP1559Values = isFeeMarketEIP1559Values;
const isGasPriceValue = (gasValues) => (gasValues === null || gasValues === void 0 ? void 0 : gasValues.gasPrice) !== undefined;
exports.isGasPriceValue = isGasPriceValue;
/**
 * Validates that the proposed value is greater than or equal to the minimum value.
 *
 * @param proposed - The proposed value.
 * @param min - The minimum value.
 * @returns The proposed value.
 * @throws Will throw if the proposed value is too low.
 */
function validateMinimumIncrease(proposed, min) {
    const proposedDecimal = (0, exports.convertHexToDecimal)(proposed);
    const minDecimal = (0, exports.convertHexToDecimal)(min);
    if (proposedDecimal >= minDecimal) {
        return proposed;
    }
    const errorMsg = `The proposed value: ${proposedDecimal} should meet or exceed the minimum value: ${minDecimal}`;
    throw new Error(errorMsg);
}
exports.validateMinimumIncrease = validateMinimumIncrease;
/**
 * Removes IPFS protocol prefix from input string.
 *
 * @param ipfsUrl - An IPFS url (e.g. ipfs://{content id})
 * @returns IPFS content identifier and (possibly) path in a string
 * @throws Will throw if the url passed is not IPFS.
 */
function removeIpfsProtocolPrefix(ipfsUrl) {
    if (ipfsUrl.startsWith('ipfs://ipfs/')) {
        return ipfsUrl.replace('ipfs://ipfs/', '');
    }
    else if (ipfsUrl.startsWith('ipfs://')) {
        return ipfsUrl.replace('ipfs://', '');
    }
    // this method should not be used with non-ipfs urls (i.e. startsWith('ipfs://') === true)
    throw new Error('this method should not be used with non ipfs urls');
}
exports.removeIpfsProtocolPrefix = removeIpfsProtocolPrefix;
/**
 * Extracts content identifier and path from an input string.
 *
 * @param ipfsUrl - An IPFS URL minus the IPFS protocol prefix
 * @returns IFPS content identifier (cid) and sub path as string.
 * @throws Will throw if the url passed is not ipfs.
 */
function getIpfsCIDv1AndPath(ipfsUrl) {
    const url = removeIpfsProtocolPrefix(ipfsUrl);
    // check if there is a path
    // (CID is everything preceding first forward slash, path is everything after)
    const index = url.indexOf('/');
    const cid = index !== -1 ? url.substring(0, index) : url;
    const path = index !== -1 ? url.substring(index) : undefined;
    // We want to ensure that the CID is v1 (https://docs.ipfs.io/concepts/content-addressing/#identifier-formats)
    // because most cid v0s appear to be incompatible with IPFS subdomains
    return {
        cid: cid_1.CID.parse(cid).toV1().toString(),
        path,
    };
}
exports.getIpfsCIDv1AndPath = getIpfsCIDv1AndPath;
/**
 * Adds URL protocol prefix to input URL string if missing.
 *
 * @param urlString - An IPFS URL.
 * @returns A URL with a https:// prepended.
 */
function addUrlProtocolPrefix(urlString) {
    if (!urlString.match(/(^http:\/\/)|(^https:\/\/)/u)) {
        return `https://${urlString}`;
    }
    return urlString;
}
exports.addUrlProtocolPrefix = addUrlProtocolPrefix;
/**
 * Formats URL correctly for use retrieving assets hosted on IPFS.
 *
 * @param ipfsGateway - The users preferred IPFS gateway (full URL or just host).
 * @param ipfsUrl - The IFPS URL pointed at the asset.
 * @param subdomainSupported - Boolean indicating whether the URL should be formatted with subdomains or not.
 * @returns A formatted URL, with the user's preferred IPFS gateway and format (subdomain or not), pointing to an asset hosted on IPFS.
 */
function getFormattedIpfsUrl(ipfsGateway, ipfsUrl, subdomainSupported) {
    const { host, protocol, origin } = new URL(addUrlProtocolPrefix(ipfsGateway));
    if (subdomainSupported) {
        const { cid, path } = getIpfsCIDv1AndPath(ipfsUrl);
        return `${protocol}//${cid}.ipfs.${host}${path !== null && path !== void 0 ? path : ''}`;
    }
    const cidAndPath = removeIpfsProtocolPrefix(ipfsUrl);
    return `${origin}/ipfs/${cidAndPath}`;
}
exports.getFormattedIpfsUrl = getFormattedIpfsUrl;
/**
 * Determines whether a value is a "plain" object.
 *
 * @param value - A value to check
 * @returns True if the passed value is a plain object
 */
function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
exports.isPlainObject = isPlainObject;
const hasProperty = (object, key) => Reflect.hasOwnProperty.call(object, key);
exports.hasProperty = hasProperty;
/**
 * Type guard for {@link NonEmptyArray}.
 *
 * @template T - The non-empty array member type.
 * @param value - The value to check.
 * @returns Whether the value is a non-empty array.
 */
function isNonEmptyArray(value) {
    return Array.isArray(value) && value.length > 0;
}
exports.isNonEmptyArray = isNonEmptyArray;
/**
 * Type guard for {@link Json}.
 *
 * @param value - The value to check.
 * @returns Whether the value is valid JSON.
 */
function isValidJson(value) {
    try {
        return (0, fast_deep_equal_1.default)(value, JSON.parse(JSON.stringify(value)));
    }
    catch (_) {
        return false;
    }
}
exports.isValidJson = isValidJson;
/**
 * Networks where token detection is supported - Values are in decimal format
 */
var SupportedTokenDetectionNetworks;
(function (SupportedTokenDetectionNetworks) {
    SupportedTokenDetectionNetworks["mainnet"] = "1";
    SupportedTokenDetectionNetworks["bsc"] = "56";
    SupportedTokenDetectionNetworks["polygon"] = "137";
    SupportedTokenDetectionNetworks["avax"] = "43114";
})(SupportedTokenDetectionNetworks = exports.SupportedTokenDetectionNetworks || (exports.SupportedTokenDetectionNetworks = {}));
/**
 * Check if token detection is enabled for certain networks.
 *
 * @param chainId - ChainID of network
 * @returns Whether the current network supports token detection
 */
function isTokenDetectionSupportedForNetwork(chainId) {
    return Object.values(SupportedTokenDetectionNetworks).includes(chainId);
}
exports.isTokenDetectionSupportedForNetwork = isTokenDetectionSupportedForNetwork;
/**
 * Check if token list polling is enabled for a given network.
 * Currently this method is used to support e2e testing for consumers of this package.
 *
 * @param chainId - ChainID of network
 * @returns Whether the current network supports tokenlists
 */
function isTokenListSupportedForNetwork(chainId) {
    const chainIdDecimal = (0, exports.convertHexToDecimal)(chainId).toString();
    return (isTokenDetectionSupportedForNetwork(chainIdDecimal) ||
        chainIdDecimal === constants_1.GANACHE_CHAIN_ID);
}
exports.isTokenListSupportedForNetwork = isTokenListSupportedForNetwork;
/**
 * Utility method to log if error is a common fetch error and otherwise rethrow it.
 *
 * @param error - Caught error that we should either rethrow or log to console
 * @param codesToCatch - array of error codes for errors we want to catch and log in a particular context
 */
function logOrRethrowError(error, codesToCatch = []) {
    var _a;
    if (!error) {
        return;
    }
    const includesErrorCodeToCatch = codesToCatch.some((code) => { var _a; return (_a = error.message) === null || _a === void 0 ? void 0 : _a.includes(`Fetch failed with status '${code}'`); });
    if (error instanceof Error &&
        (includesErrorCodeToCatch ||
            ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('Failed to fetch')) ||
            error === TIMEOUT_ERROR)) {
        console.error(error);
    }
    else {
        throw error;
    }
}
//# sourceMappingURL=util.js.map