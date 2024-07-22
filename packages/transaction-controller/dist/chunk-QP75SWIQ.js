"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }// src/utils/history.ts
var _fastjsonpatch = require('fast-json-patch'); var _fastjsonpatch2 = _interopRequireDefault(_fastjsonpatch);
var _lodash = require('lodash');
function addInitialHistorySnapshot(transactionMeta) {
  const snapshot = snapshotFromTransactionMeta(transactionMeta);
  return _lodash.merge.call(void 0, {}, transactionMeta, { history: [snapshot] });
}
function updateTransactionHistory(transactionMeta, note) {
  if (!transactionMeta.history) {
    return transactionMeta;
  }
  const currentState = snapshotFromTransactionMeta(transactionMeta);
  const previousState = replayHistory(transactionMeta.history);
  const historyEntry = generateHistoryEntry(previousState, currentState, note);
  if (historyEntry.length > 0) {
    return _lodash.merge.call(void 0, {}, transactionMeta, {
      history: [...transactionMeta.history, historyEntry]
    });
  }
  return transactionMeta;
}
function generateHistoryEntry(previousState, currentState, note) {
  const historyOperationsEntry = _fastjsonpatch2.default.compare(
    previousState,
    currentState
  );
  if (historyOperationsEntry[0]) {
    if (note) {
      historyOperationsEntry[0].note = note;
    }
    historyOperationsEntry[0].timestamp = Date.now();
  }
  return historyOperationsEntry;
}
function replayHistory(transactionHistory) {
  const shortHistory = _lodash.cloneDeep.call(void 0, transactionHistory);
  return shortHistory.reduce(
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (val, entry) => _fastjsonpatch2.default.applyPatch(val, entry).newDocument
  );
}
function snapshotFromTransactionMeta(transactionMeta) {
  const snapshot = { ...transactionMeta };
  delete snapshot.history;
  return _lodash.cloneDeep.call(void 0, snapshot);
}




exports.addInitialHistorySnapshot = addInitialHistorySnapshot; exports.updateTransactionHistory = updateTransactionHistory;
//# sourceMappingURL=chunk-QP75SWIQ.js.map