import {
  MAX_SAFE_CHAIN_ID
} from "./chunk-6RUA2HGN.mjs";

// src/util.ts
import { isValidAddress, toChecksumAddress } from "@ethereumjs/util";
import { fromWei, toWei } from "@metamask/ethjs-unit";
import {
  isStrictHexString,
  add0x,
  isHexString,
  remove0x
} from "@metamask/utils";
import BN from "bn.js";
import ensNamehash from "eth-ens-namehash";
import deepEqual from "fast-deep-equal";
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
  if (!isHexString(chainId)) {
    return false;
  }
  const decimalChainId = Number.parseInt(
    chainId,
    isStrictHexString(chainId) ? 16 : 10
  );
  return Number.isSafeInteger(decimalChainId) && decimalChainId > 0 && decimalChainId <= MAX_SAFE_CHAIN_ID;
}
function BNToHex(inputBn) {
  return add0x(inputBn.toString(16));
}
function fractionBN(targetBN, numerator, denominator) {
  const numBN = new BN(numerator);
  const denomBN = new BN(denominator);
  return targetBN.mul(numBN).div(denomBN);
}
function gweiDecToWEIBN(n) {
  if (Number.isNaN(n)) {
    return new BN(0);
  }
  const parts = n.toString().split(".");
  const wholePart = parts[0] || "0";
  let decimalPart = parts[1] || "";
  if (!decimalPart) {
    return toWei(wholePart, "gwei");
  }
  if (decimalPart.length <= 9) {
    return toWei(`${wholePart}.${decimalPart}`, "gwei");
  }
  const decimalPartToRemove = decimalPart.slice(9);
  const decimalRoundingDigit = decimalPartToRemove[0];
  decimalPart = decimalPart.slice(0, 9);
  let wei = toWei(`${wholePart}.${decimalPart}`, "gwei");
  if (Number(decimalRoundingDigit) >= 5) {
    wei = wei.add(new BN(1));
  }
  return wei;
}
function weiHexToGweiDec(hex) {
  const hexWei = new BN(remove0x(hex), 16);
  return fromWei(hexWei, "gwei");
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
  return inputHex ? new BN(remove0x(inputHex), 16) : new BN(0);
}
function hexToText(hex) {
  try {
    const stripped = remove0x(hex);
    const buff = Buffer.from(stripped, "hex");
    return buff.toString("utf8");
  } catch (e) {
    return hex;
  }
}
function fromHex(value) {
  if (BN.isBN(value)) {
    return value;
  }
  return new BN(hexToBN(value).toString(10));
}
function toHex(value) {
  if (typeof value === "string" && isStrictHexString(value)) {
    return value;
  }
  const hexString = BN.isBN(value) ? value.toString(16) : new BN(value.toString(), 10).toString(16);
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
  const hexPrefixed = add0x(address);
  if (!isHexString(hexPrefixed)) {
    return hexPrefixed;
  }
  return toChecksumAddress(hexPrefixed);
}
function isValidHexAddress(possibleAddress, { allowNonPrefixed = true } = {}) {
  const addressToCheck = allowNonPrefixed ? add0x(possibleAddress) : possibleAddress;
  if (!isStrictHexString(addressToCheck)) {
    return false;
  }
  return isValidAddress(addressToCheck);
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
      const normalized = ensNamehash.normalize(ensName.trim());
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
  if (isStrictHexString(value)) {
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
    return deepEqual(value, JSON.parse(JSON.stringify(value)));
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

export {
  PROTOTYPE_POLLUTION_BLOCKLIST,
  isSafeDynamicKey,
  isSafeChainId,
  BNToHex,
  fractionBN,
  gweiDecToWEIBN,
  weiHexToGweiDec,
  getBuyURL,
  hexToBN,
  hexToText,
  fromHex,
  toHex,
  safelyExecute,
  safelyExecuteWithTimeout,
  toChecksumHexAddress,
  isValidHexAddress,
  isSmartContractCode,
  successfulFetch,
  handleFetch,
  fetchWithErrorHandling,
  timeoutFetch,
  normalizeEnsName,
  query,
  convertHexToDecimal,
  isPlainObject,
  isNonEmptyArray,
  isValidJson
};
//# sourceMappingURL=chunk-VS4MDHYH.mjs.map