"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkOZ6UB42Cjs = require('./chunk-OZ6UB42C.js');


var _chunkUGN7PBONjs = require('./chunk-UGN7PBON.js');



var _chunkS6VGOPUYjs = require('./chunk-S6VGOPUY.js');

// src/utils/swaps.ts
var _controllerutils = require('@metamask/controller-utils');
var _lodash = require('lodash');
var log = _chunkS6VGOPUYjs.createModuleLogger.call(void 0, _chunkS6VGOPUYjs.projectLogger, "swaps");
var UPDATE_POST_TX_BALANCE_TIMEOUT = 5e3;
var UPDATE_POST_TX_BALANCE_ATTEMPTS = 6;
var SWAPS_TESTNET_CHAIN_ID = "0x539";
var DEFAULT_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000";
var ETH_SWAPS_TOKEN_OBJECT = {
  name: "Ether",
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18
};
var BNB_SWAPS_TOKEN_OBJECT = {
  name: "Binance Coin",
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18
};
var MATIC_SWAPS_TOKEN_OBJECT = {
  name: "Matic",
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18
};
var AVAX_SWAPS_TOKEN_OBJECT = {
  name: "Avalanche",
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18
};
var TEST_ETH_SWAPS_TOKEN_OBJECT = {
  name: "Test Ether",
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18
};
var GOERLI_SWAPS_TOKEN_OBJECT = {
  name: "Ether",
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18
};
var ARBITRUM_SWAPS_TOKEN_OBJECT = {
  ...ETH_SWAPS_TOKEN_OBJECT
};
var OPTIMISM_SWAPS_TOKEN_OBJECT = {
  ...ETH_SWAPS_TOKEN_OBJECT
};
var ZKSYNC_ERA_SWAPS_TOKEN_OBJECT = {
  ...ETH_SWAPS_TOKEN_OBJECT
};
var SWAPS_CHAINID_DEFAULT_TOKEN_MAP = {
  [_chunkUGN7PBONjs.CHAIN_IDS.MAINNET]: ETH_SWAPS_TOKEN_OBJECT,
  [SWAPS_TESTNET_CHAIN_ID]: TEST_ETH_SWAPS_TOKEN_OBJECT,
  [_chunkUGN7PBONjs.CHAIN_IDS.BSC]: BNB_SWAPS_TOKEN_OBJECT,
  [_chunkUGN7PBONjs.CHAIN_IDS.POLYGON]: MATIC_SWAPS_TOKEN_OBJECT,
  [_chunkUGN7PBONjs.CHAIN_IDS.GOERLI]: GOERLI_SWAPS_TOKEN_OBJECT,
  [_chunkUGN7PBONjs.CHAIN_IDS.AVALANCHE]: AVAX_SWAPS_TOKEN_OBJECT,
  [_chunkUGN7PBONjs.CHAIN_IDS.OPTIMISM]: OPTIMISM_SWAPS_TOKEN_OBJECT,
  [_chunkUGN7PBONjs.CHAIN_IDS.ARBITRUM]: ARBITRUM_SWAPS_TOKEN_OBJECT,
  [_chunkUGN7PBONjs.CHAIN_IDS.ZKSYNC_ERA]: ZKSYNC_ERA_SWAPS_TOKEN_OBJECT
};
var SWAP_TRANSACTION_TYPES = [
  "swap" /* swap */,
  "swapAndSend" /* swapAndSend */,
  "swapApproval" /* swapApproval */
];
function updateSwapsTransaction(transactionMeta, transactionType, swaps, {
  isSwapsDisabled,
  cancelTransaction,
  messenger
}) {
  if (isSwapsDisabled || !SWAP_TRANSACTION_TYPES.includes(transactionType)) {
    return transactionMeta;
  }
  if (transactionType === "swap" /* swap */ && swaps?.hasApproveTx === false && transactionMeta.simulationFails) {
    cancelTransaction(transactionMeta.id);
    throw new Error("Simulation failed");
  }
  const swapsMeta = swaps?.meta;
  if (!swapsMeta) {
    return transactionMeta;
  }
  let updatedTransactionMeta = transactionMeta;
  if (transactionType === "swapApproval" /* swapApproval */) {
    updatedTransactionMeta = updateSwapApprovalTransaction(
      transactionMeta,
      swapsMeta
    );
    messenger.publish("TransactionController:transactionNewSwapApproval", {
      transactionMeta: updatedTransactionMeta
    });
  }
  if (transactionType === "swapAndSend" /* swapAndSend */) {
    updatedTransactionMeta = updateSwapAndSendTransaction(
      transactionMeta,
      swapsMeta
    );
    messenger.publish("TransactionController:transactionNewSwapAndSend", {
      transactionMeta: updatedTransactionMeta
    });
  }
  if (transactionType === "swap" /* swap */) {
    updatedTransactionMeta = updateSwapTransaction(transactionMeta, swapsMeta);
    messenger.publish("TransactionController:transactionNewSwap", {
      transactionMeta: updatedTransactionMeta
    });
  }
  return updatedTransactionMeta;
}
async function updatePostTransactionBalance(transactionMeta, {
  ethQuery,
  getTransaction,
  updateTransaction
}) {
  log("Updating post transaction balance", transactionMeta.id);
  const transactionId = transactionMeta.id;
  let latestTransactionMeta;
  let approvalTransactionMeta;
  for (let i = 0; i < UPDATE_POST_TX_BALANCE_ATTEMPTS; i++) {
    log("Querying balance", { attempt: i });
    const postTransactionBalance = await _controllerutils.query.call(void 0, ethQuery, "getBalance", [
      transactionMeta.txParams.from
    ]);
    latestTransactionMeta = {
      ...getTransaction(transactionId) ?? {}
    };
    approvalTransactionMeta = latestTransactionMeta.approvalTxId ? getTransaction(latestTransactionMeta.approvalTxId) : void 0;
    latestTransactionMeta.postTxBalance = postTransactionBalance.toString(16);
    const isDefaultTokenAddress = isSwapsDefaultTokenAddress(
      transactionMeta.destinationTokenAddress,
      transactionMeta.chainId
    );
    if (!isDefaultTokenAddress || transactionMeta.preTxBalance !== latestTransactionMeta.postTxBalance) {
      log("Finishing post balance update", {
        isDefaultTokenAddress,
        preTxBalance: transactionMeta.preTxBalance,
        postTxBalance: latestTransactionMeta.postTxBalance
      });
      break;
    }
    log("Waiting for balance to update", {
      delay: UPDATE_POST_TX_BALANCE_TIMEOUT
    });
    await sleep(UPDATE_POST_TX_BALANCE_TIMEOUT);
  }
  updateTransaction(
    latestTransactionMeta,
    "TransactionController#updatePostTransactionBalance - Add post transaction balance"
  );
  log("Completed post balance update", latestTransactionMeta?.postTxBalance);
  return {
    updatedTransactionMeta: latestTransactionMeta,
    approvalTransactionMeta
  };
}
function updateSwapTransaction(transactionMeta, {
  sourceTokenSymbol,
  destinationTokenSymbol,
  type,
  destinationTokenDecimals,
  destinationTokenAddress,
  swapMetaData,
  swapTokenValue,
  estimatedBaseFee,
  approvalTxId
}) {
  _chunkOZ6UB42Cjs.validateIfTransactionUnapproved.call(void 0, transactionMeta, "updateSwapTransaction");
  let swapTransaction = {
    sourceTokenSymbol,
    destinationTokenSymbol,
    type,
    destinationTokenDecimals,
    destinationTokenAddress,
    swapMetaData,
    swapTokenValue,
    estimatedBaseFee,
    approvalTxId
  };
  swapTransaction = _lodash.pickBy.call(void 0, swapTransaction);
  return _lodash.merge.call(void 0, {}, transactionMeta, swapTransaction);
}
function updateSwapAndSendTransaction(transactionMeta, {
  approvalTxId,
  destinationTokenAddress,
  destinationTokenAmount,
  destinationTokenDecimals,
  destinationTokenSymbol,
  estimatedBaseFee,
  sourceTokenAddress,
  sourceTokenAmount,
  sourceTokenDecimals,
  sourceTokenSymbol,
  swapAndSendRecipient,
  swapMetaData,
  swapTokenValue,
  type
}) {
  _chunkOZ6UB42Cjs.validateIfTransactionUnapproved.call(void 0, transactionMeta, "updateSwapTransaction");
  let swapTransaction = {
    approvalTxId,
    destinationTokenAddress,
    destinationTokenAmount,
    destinationTokenDecimals,
    destinationTokenSymbol,
    estimatedBaseFee,
    sourceTokenAddress,
    sourceTokenAmount,
    sourceTokenDecimals,
    sourceTokenSymbol,
    swapAndSendRecipient,
    swapMetaData,
    swapTokenValue,
    type
  };
  swapTransaction = _lodash.pickBy.call(void 0, swapTransaction);
  return _lodash.merge.call(void 0, {}, transactionMeta, swapTransaction);
}
function updateSwapApprovalTransaction(transactionMeta, { type, sourceTokenSymbol }) {
  _chunkOZ6UB42Cjs.validateIfTransactionUnapproved.call(void 0, 
    transactionMeta,
    "updateSwapApprovalTransaction"
  );
  let swapApprovalTransaction = { type, sourceTokenSymbol };
  swapApprovalTransaction = _lodash.pickBy.call(void 0, {
    type,
    sourceTokenSymbol
  });
  return _lodash.merge.call(void 0, {}, transactionMeta, swapApprovalTransaction);
}
function isSwapsDefaultTokenAddress(address, chainId) {
  if (!address || !chainId) {
    return false;
  }
  return address === SWAPS_CHAINID_DEFAULT_TOKEN_MAP[chainId]?.address;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}









exports.UPDATE_POST_TX_BALANCE_TIMEOUT = UPDATE_POST_TX_BALANCE_TIMEOUT; exports.UPDATE_POST_TX_BALANCE_ATTEMPTS = UPDATE_POST_TX_BALANCE_ATTEMPTS; exports.DEFAULT_TOKEN_ADDRESS = DEFAULT_TOKEN_ADDRESS; exports.SWAPS_CHAINID_DEFAULT_TOKEN_MAP = SWAPS_CHAINID_DEFAULT_TOKEN_MAP; exports.SWAP_TRANSACTION_TYPES = SWAP_TRANSACTION_TYPES; exports.updateSwapsTransaction = updateSwapsTransaction; exports.updatePostTransactionBalance = updatePostTransactionBalance;
//# sourceMappingURL=chunk-QH2H4W3N.js.map