"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }


var _chunkXVYXRCRLjs = require('./chunk-XVYXRCRL.js');


var _chunkUGN7PBONjs = require('./chunk-UGN7PBON.js');


var _chunkS6VGOPUYjs = require('./chunk-S6VGOPUY.js');





var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/helpers/EtherscanRemoteTransactionSource.ts
var _controllerutils = require('@metamask/controller-utils');
var _asyncmutex = require('async-mutex');
var _bnjs = require('bn.js'); var _bnjs2 = _interopRequireDefault(_bnjs);
var _uuid = require('uuid');
var ETHERSCAN_RATE_LIMIT_INTERVAL = 5e3;
var _includeTokenTransfers, _isTokenRequestPending, _mutex, _releaseLockAfterInterval, releaseLockAfterInterval_fn, _fetchNormalTransactions, _fetchTokenTransactions, _getResponseTransactions, getResponseTransactions_fn, _normalizeTransaction, normalizeTransaction_fn, _normalizeTokenTransaction, normalizeTokenTransaction_fn, _normalizeTransactionBase, normalizeTransactionBase_fn;
var EtherscanRemoteTransactionSource = class {
  constructor({
    includeTokenTransfers
  } = {}) {
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _releaseLockAfterInterval);
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getResponseTransactions);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _normalizeTransaction);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _normalizeTokenTransaction);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _normalizeTransactionBase);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _includeTokenTransfers, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isTokenRequestPending, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _mutex, new (0, _asyncmutex.Mutex)());
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _fetchNormalTransactions, async (request, etherscanRequest) => {
      const { currentChainId } = request;
      const etherscanTransactions = await _chunkXVYXRCRLjs.fetchEtherscanTransactions.call(void 0, 
        etherscanRequest
      );
      return _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getResponseTransactions, getResponseTransactions_fn).call(this, etherscanTransactions).map(
        (tx) => _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _normalizeTransaction, normalizeTransaction_fn).call(this, tx, currentChainId)
      );
    });
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _fetchTokenTransactions, async (request, etherscanRequest) => {
      const { currentChainId } = request;
      const etherscanTransactions = await _chunkXVYXRCRLjs.fetchEtherscanTokenTransactions.call(void 0, 
        etherscanRequest
      );
      return _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getResponseTransactions, getResponseTransactions_fn).call(this, etherscanTransactions).map(
        (tx) => _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _normalizeTokenTransaction, normalizeTokenTransaction_fn).call(this, tx, currentChainId)
      );
    });
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _includeTokenTransfers, includeTokenTransfers ?? true);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _isTokenRequestPending, false);
  }
  isSupportedNetwork(chainId) {
    return Object.keys(_chunkUGN7PBONjs.ETHERSCAN_SUPPORTED_NETWORKS).includes(chainId);
  }
  getLastBlockVariations() {
    return [_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _isTokenRequestPending) ? "token" : "normal"];
  }
  async fetchTransactions(request) {
    const releaseLock = await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _mutex).acquire();
    const acquiredTime = Date.now();
    const etherscanRequest = {
      ...request,
      chainId: request.currentChainId
    };
    try {
      const transactions = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _isTokenRequestPending) ? await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _fetchTokenTransactions).call(this, request, etherscanRequest) : await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _fetchNormalTransactions).call(this, request, etherscanRequest);
      if (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _includeTokenTransfers)) {
        _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _isTokenRequestPending, !_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _isTokenRequestPending));
      }
      return transactions;
    } finally {
      _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _releaseLockAfterInterval, releaseLockAfterInterval_fn).call(this, acquiredTime, releaseLock);
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
      _chunkS6VGOPUYjs.incomingTransactionsLogger.call(void 0, "Ignored Etherscan request error", {
        message: response.result,
        type: _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _isTokenRequestPending) ? "token" : "normal"
      });
    }
  }
  return result;
};
_normalizeTransaction = new WeakSet();
normalizeTransaction_fn = function(txMeta, currentChainId) {
  const base = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _normalizeTransactionBase, normalizeTransactionBase_fn).call(this, txMeta, currentChainId);
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
  const base = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _normalizeTransactionBase, normalizeTransactionBase_fn).call(this, txMeta, currentChainId);
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
    id: _uuid.v1.call(void 0, { msecs: time }),
    status: "confirmed" /* confirmed */,
    time,
    txParams: {
      chainId: currentChainId,
      from: txMeta.from,
      gas: _controllerutils.BNToHex.call(void 0, new (0, _bnjs2.default)(txMeta.gas)),
      gasPrice: _controllerutils.BNToHex.call(void 0, new (0, _bnjs2.default)(txMeta.gasPrice)),
      gasUsed: _controllerutils.BNToHex.call(void 0, new (0, _bnjs2.default)(txMeta.gasUsed)),
      nonce: _controllerutils.BNToHex.call(void 0, new (0, _bnjs2.default)(txMeta.nonce)),
      to: txMeta.to,
      value: _controllerutils.BNToHex.call(void 0, new (0, _bnjs2.default)(txMeta.value))
    },
    type: "incoming" /* incoming */,
    verifiedOnBlockchain: false
  };
};



exports.EtherscanRemoteTransactionSource = EtherscanRemoteTransactionSource;
//# sourceMappingURL=chunk-7NMV2NPM.js.map