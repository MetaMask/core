import {
  fetchEtherscanTokenTransactions,
  fetchEtherscanTransactions
} from "./chunk-EGQCE3FK.mjs";
import {
  ETHERSCAN_SUPPORTED_NETWORKS
} from "./chunk-O6ZZVIFH.mjs";
import {
  incomingTransactionsLogger
} from "./chunk-UQQWZT6C.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/helpers/EtherscanRemoteTransactionSource.ts
import { BNToHex } from "@metamask/controller-utils";
import { Mutex } from "async-mutex";
import BN from "bn.js";
import { v1 as random } from "uuid";
var ETHERSCAN_RATE_LIMIT_INTERVAL = 5e3;
var _includeTokenTransfers, _isTokenRequestPending, _mutex, _releaseLockAfterInterval, releaseLockAfterInterval_fn, _fetchNormalTransactions, _fetchTokenTransactions, _getResponseTransactions, getResponseTransactions_fn, _normalizeTransaction, normalizeTransaction_fn, _normalizeTokenTransaction, normalizeTokenTransaction_fn, _normalizeTransactionBase, normalizeTransactionBase_fn;
var EtherscanRemoteTransactionSource = class {
  constructor({
    includeTokenTransfers
  } = {}) {
    __privateAdd(this, _releaseLockAfterInterval);
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __privateAdd(this, _getResponseTransactions);
    __privateAdd(this, _normalizeTransaction);
    __privateAdd(this, _normalizeTokenTransaction);
    __privateAdd(this, _normalizeTransactionBase);
    __privateAdd(this, _includeTokenTransfers, void 0);
    __privateAdd(this, _isTokenRequestPending, void 0);
    __privateAdd(this, _mutex, new Mutex());
    __privateAdd(this, _fetchNormalTransactions, async (request, etherscanRequest) => {
      const { currentChainId } = request;
      const etherscanTransactions = await fetchEtherscanTransactions(
        etherscanRequest
      );
      return __privateMethod(this, _getResponseTransactions, getResponseTransactions_fn).call(this, etherscanTransactions).map(
        (tx) => __privateMethod(this, _normalizeTransaction, normalizeTransaction_fn).call(this, tx, currentChainId)
      );
    });
    __privateAdd(this, _fetchTokenTransactions, async (request, etherscanRequest) => {
      const { currentChainId } = request;
      const etherscanTransactions = await fetchEtherscanTokenTransactions(
        etherscanRequest
      );
      return __privateMethod(this, _getResponseTransactions, getResponseTransactions_fn).call(this, etherscanTransactions).map(
        (tx) => __privateMethod(this, _normalizeTokenTransaction, normalizeTokenTransaction_fn).call(this, tx, currentChainId)
      );
    });
    __privateSet(this, _includeTokenTransfers, includeTokenTransfers ?? true);
    __privateSet(this, _isTokenRequestPending, false);
  }
  isSupportedNetwork(chainId) {
    return Object.keys(ETHERSCAN_SUPPORTED_NETWORKS).includes(chainId);
  }
  getLastBlockVariations() {
    return [__privateGet(this, _isTokenRequestPending) ? "token" : "normal"];
  }
  async fetchTransactions(request) {
    const releaseLock = await __privateGet(this, _mutex).acquire();
    const acquiredTime = Date.now();
    const etherscanRequest = {
      ...request,
      chainId: request.currentChainId
    };
    try {
      const transactions = __privateGet(this, _isTokenRequestPending) ? await __privateGet(this, _fetchTokenTransactions).call(this, request, etherscanRequest) : await __privateGet(this, _fetchNormalTransactions).call(this, request, etherscanRequest);
      if (__privateGet(this, _includeTokenTransfers)) {
        __privateSet(this, _isTokenRequestPending, !__privateGet(this, _isTokenRequestPending));
      }
      return transactions;
    } finally {
      __privateMethod(this, _releaseLockAfterInterval, releaseLockAfterInterval_fn).call(this, acquiredTime, releaseLock);
    }
  }
};
_includeTokenTransfers = new WeakMap();
_isTokenRequestPending = new WeakMap();
_mutex = new WeakMap();
_releaseLockAfterInterval = new WeakSet();
releaseLockAfterInterval_fn = function(acquireTime, releaseLock) {
  const elapsedTime = Date.now() - acquireTime;
  const remainingTime = Math.max(
    0,
    ETHERSCAN_RATE_LIMIT_INTERVAL - elapsedTime
  );
  if (remainingTime > 0) {
    setTimeout(releaseLock, remainingTime);
  } else {
    releaseLock();
  }
};
_fetchNormalTransactions = new WeakMap();
_fetchTokenTransactions = new WeakMap();
_getResponseTransactions = new WeakSet();
getResponseTransactions_fn = function(response) {
  let result = response.result;
  if (response.status === "0") {
    result = [];
    if (response.result.length) {
      incomingTransactionsLogger("Ignored Etherscan request error", {
        message: response.result,
        type: __privateGet(this, _isTokenRequestPending) ? "token" : "normal"
      });
    }
  }
  return result;
};
_normalizeTransaction = new WeakSet();
normalizeTransaction_fn = function(txMeta, currentChainId) {
  const base = __privateMethod(this, _normalizeTransactionBase, normalizeTransactionBase_fn).call(this, txMeta, currentChainId);
  return {
    ...base,
    txParams: {
      ...base.txParams,
      data: txMeta.input
    },
    ...txMeta.isError === "0" ? { status: "confirmed" /* confirmed */ } : {
      error: new Error("Transaction failed"),
      status: "failed" /* failed */
    }
  };
};
_normalizeTokenTransaction = new WeakSet();
normalizeTokenTransaction_fn = function(txMeta, currentChainId) {
  const base = __privateMethod(this, _normalizeTransactionBase, normalizeTransactionBase_fn).call(this, txMeta, currentChainId);
  return {
    ...base,
    isTransfer: true,
    transferInformation: {
      contractAddress: txMeta.contractAddress,
      decimals: Number(txMeta.tokenDecimal),
      symbol: txMeta.tokenSymbol
    }
  };
};
_normalizeTransactionBase = new WeakSet();
normalizeTransactionBase_fn = function(txMeta, currentChainId) {
  const time = parseInt(txMeta.timeStamp, 10) * 1e3;
  return {
    blockNumber: txMeta.blockNumber,
    chainId: currentChainId,
    hash: txMeta.hash,
    id: random({ msecs: time }),
    status: "confirmed" /* confirmed */,
    time,
    txParams: {
      chainId: currentChainId,
      from: txMeta.from,
      gas: BNToHex(new BN(txMeta.gas)),
      gasPrice: BNToHex(new BN(txMeta.gasPrice)),
      gasUsed: BNToHex(new BN(txMeta.gasUsed)),
      nonce: BNToHex(new BN(txMeta.nonce)),
      to: txMeta.to,
      value: BNToHex(new BN(txMeta.value))
    },
    type: "incoming" /* incoming */,
    verifiedOnBlockchain: false
  };
};

export {
  EtherscanRemoteTransactionSource
};
//# sourceMappingURL=chunk-EKJXGERC.mjs.map