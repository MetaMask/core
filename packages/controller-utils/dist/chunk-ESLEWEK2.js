"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _chunkA6HTYCV2js = require('./chunk-A6HTYCV2.js');

// src/util.ts
var _util = require('@ethereumjs/util');
var _ethjsunit = require('@metamask/ethjs-unit');





var _utils = require('@metamask/utils');
var _bnjs = require('bn.js'); var _bnjs2 = _interopRequireDefault(_bnjs);
var _ethensnamehash = require('eth-ens-namehash'); var _ethensnamehash2 = _interopRequireDefault(_ethensnamehash);
var _fastdeepequal = require('fast-deep-equal'); var _fastdeepequal2 = _interopRequireDefault(_fastdeepequal);
var TIMEOUT_ERROR = new Error("timeout");
var PROTOTYPE_POLLUTION_BLOCKLIST = [
  "__proto__",
  "constructor",
  "prototype"
];
function isSafeDynamicKey(key) {
  return typeof key === "string" && !PROTOTYPE_POLLUTION_BLOCKLIST.some((blockedKey) => key === blockedKey);
}
function isSafeChainId(chainId) {
  if (!_utils.isHexString.call(void 0, chainId)) {
    return false;
  }
  const decimalChainId = Number.parseInt(
    chainId,
    _utils.isStrictHexString.call(void 0, chainId) ? 16 : 10
  );
  return Number.isSafeInteger(decimalChainId) && decimalChainId > 0 && decimalChainId <= _chunkA6HTYCV2js.MAX_SAFE_CHAIN_ID;
}
function BNToHex(inputBn) {
  return _utils.add0x.call(void 0, inputBn.toString(16));
}
function fractionBN(targetBN, numerator, denominator) {
  const numBN = new (0, _bnjs2.default)(numerator);
  const denomBN = new (0, _bnjs2.default)(denominator);
  return targetBN.mul(numBN).div(denomBN);
}
function gweiDecToWEIBN(n) {
  if (Number.isNaN(n)) {
    return new (0, _bnjs2.default)(0);
  }
  const parts = n.toString().split(".");
  const wholePart = parts[0] || "0";
  let decimalPart = parts[1] || "";
  if (!decimalPart) {
    return _ethjsunit.toWei.call(void 0, wholePart, "gwei");
  }
  if (decimalPart.length <= 9) {
    return _ethjsunit.toWei.call(void 0, `${wholePart}.${decimalPart}`, "gwei");
  }
  const decimalPartToRemove = decimalPart.slice(9);
  const decimalRoundingDigit = decimalPartToRemove[0];
  decimalPart = decimalPart.slice(0, 9);
  let wei = _ethjsunit.toWei.call(void 0, `${wholePart}.${decimalPart}`, "gwei");
  if (Number(decimalRoundingDigit) >= 5) {
    wei = wei.add(new (0, _bnjs2.default)(1));
  }
  return wei;
}
function weiHexToGweiDec(hex) {
  const hexWei = new (0, _bnjs2.default)(_utils.remove0x.call(void 0, hex), 16);
  return _ethjsunit.fromWei.call(void 0, hexWei, "gwei");
}
function getBuyURL(networkCode = "1", address, amount = 5) {
  switch (networkCode) {
    case "1":
      return `https://buy.coinbase.com/?code=9ec56d01-7e81-5017-930c-513daa27bb6a&amount=${amount}&address=${address}&crypto_currency=ETH`;
    case "5":
      return "https://goerli-faucet.slock.it/";
    case "11155111":
      return "https://sepoliafaucet.net/";
    default:
      return void 0;
  }
}
function hexToBN(inputHex) {
  return inputHex ? new (0, _bnjs2.default)(_utils.remove0x.call(void 0, inputHex), 16) : new (0, _bnjs2.default)(0);
}
function hexToText(hex) {
  try {
    const stripped = _utils.remove0x.call(void 0, hex);
    const buff = Buffer.from(stripped, "hex");
    return buff.toString("utf8");
  } catch (e) {
    return hex;
  }
}
function fromHex(value) {
  if (_bnjs2.default.isBN(value)) {
    return value;
  }
  return new (0, _bnjs2.default)(hexToBN(value).toString(10));
}
function toHex(value) {
  if (typeof value === "string" && _utils.isStrictHexString.call(void 0, value)) {
    return value;
  }
  const hexString = _bnjs2.default.isBN(value) ? value.toString(16) : new (0, _bnjs2.default)(value.toString(), 10).toString(16);
  return `0x${hexString}`;
}
async function safelyExecute(operation, logError = false) {
  try {
    return await operation();
  } catch (error) {
    if (logError) {
      console.error(error);
    }
    return void 0;
  }
}
async function safelyExecuteWithTimeout(operation, logError = false, timeout = 500) {
  try {
    return await Promise.race([
      operation(),
      new Promise(
        (_, reject) => setTimeout(() => {
          reject(TIMEOUT_ERROR);
        }, timeout)
      )
    ]);
  } catch (error) {
    if (logError) {
      console.error(error);
    }
    return void 0;
  }
}
function toChecksumHexAddress(address) {
  if (typeof address !== "string") {
    return address;
  }
  const hexPrefixed = _utils.add0x.call(void 0, address);
  if (!_utils.isHexString.call(void 0, hexPrefixed)) {
    return hexPrefixed;
  }
  return _util.toChecksumAddress.call(void 0, hexPrefixed);
}
function isValidHexAddress(possibleAddress, { allowNonPrefixed = true } = {}) {
  const addressToCheck = allowNonPrefixed ? _utils.add0x.call(void 0, possibleAddress) : possibleAddress;
  if (!_utils.isStrictHexString.call(void 0, addressToCheck)) {
    return false;
  }
  return _util.isValidAddress.call(void 0, addressToCheck);
}
function isSmartContractCode(code) {
  if (!code) {
    return false;
  }
  const smartContractCode = code !== "0x" && code !== "0x0";
  return smartContractCode;
}
async function successfulFetch(request, options) {
  const response = await fetch(request, options);
  if (!response.ok) {
    throw new Error(
      `Fetch failed with status '${response.status}' for request '${String(
        request
      )}'`
    );
  }
  return response;
}
async function handleFetch(request, options) {
  const response = await successfulFetch(request, options);
  const object = await response.json();
  return object;
}
async function fetchWithErrorHandling({
  url,
  options,
  timeout,
  errorCodesToCatch
}) {
  let result;
  try {
    if (timeout) {
      result = Promise.race([
        await handleFetch(url, options),
        new Promise(
          (_, reject) => setTimeout(() => {
            reject(TIMEOUT_ERROR);
          }, timeout)
        )
      ]);
    } else {
      result = await handleFetch(url, options);
    }
  } catch (e) {
    logOrRethrowError(e, errorCodesToCatch);
  }
  return result;
}
async function timeoutFetch(url, options, timeout = 500) {
  return Promise.race([
    successfulFetch(url, options),
    new Promise(
      (_, reject) => setTimeout(() => {
        reject(TIMEOUT_ERROR);
      }, timeout)
    )
  ]);
}
function normalizeEnsName(ensName) {
  if (ensName === ".") {
    return ensName;
  }
  if (ensName && typeof ensName === "string") {
    try {
      const normalized = _ethensnamehash2.default.normalize(ensName.trim());
      if (normalized.match(/^(([\w\d-]+)\.)*[\w\d-]{7,}\.(eth|test)$/u)) {
        return normalized;
      }
    } catch (_) {
    }
  }
  return null;
}
function query(ethQuery, method, args = []) {
  return new Promise((resolve, reject) => {
    const cb = (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    };
    if (method in ethQuery && typeof ethQuery[method] === "function") {
      ethQuery[method](...args, cb);
    } else {
      ethQuery.sendAsync({ method, params: args }, cb);
    }
  });
}
var convertHexToDecimal = (value = "0x0") => {
  if (_utils.isStrictHexString.call(void 0, value)) {
    return parseInt(value, 16);
  }
  return Number(value) ? Number(value) : 0;
};
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}
function isValidJson(value) {
  try {
    return _fastdeepequal2.default.call(void 0, value, JSON.parse(JSON.stringify(value)));
  } catch (_) {
    return false;
  }
}
function logOrRethrowError(error, codesToCatch = []) {
  if (!error) {
    return;
  }
  if (error instanceof Error) {
    const includesErrorCodeToCatch = codesToCatch.some(
      (code) => error.message.includes(`Fetch failed with status '${code}'`)
    );
    if (includesErrorCodeToCatch || error.message.includes("Failed to fetch") || error === TIMEOUT_ERROR) {
      console.error(error);
    } else {
      throw error;
    }
  } else {
    throw error;
  }
}





























exports.PROTOTYPE_POLLUTION_BLOCKLIST = PROTOTYPE_POLLUTION_BLOCKLIST; exports.isSafeDynamicKey = isSafeDynamicKey; exports.isSafeChainId = isSafeChainId; exports.BNToHex = BNToHex; exports.fractionBN = fractionBN; exports.gweiDecToWEIBN = gweiDecToWEIBN; exports.weiHexToGweiDec = weiHexToGweiDec; exports.getBuyURL = getBuyURL; exports.hexToBN = hexToBN; exports.hexToText = hexToText; exports.fromHex = fromHex; exports.toHex = toHex; exports.safelyExecute = safelyExecute; exports.safelyExecuteWithTimeout = safelyExecuteWithTimeout; exports.toChecksumHexAddress = toChecksumHexAddress; exports.isValidHexAddress = isValidHexAddress; exports.isSmartContractCode = isSmartContractCode; exports.successfulFetch = successfulFetch; exports.handleFetch = handleFetch; exports.fetchWithErrorHandling = fetchWithErrorHandling; exports.timeoutFetch = timeoutFetch; exports.normalizeEnsName = normalizeEnsName; exports.query = query; exports.convertHexToDecimal = convertHexToDecimal; exports.isPlainObject = isPlainObject; exports.isNonEmptyArray = isNonEmptyArray; exports.isValidJson = isValidJson;
//# sourceMappingURL=chunk-ESLEWEK2.js.map