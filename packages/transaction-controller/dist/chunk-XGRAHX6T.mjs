// src/utils/history.ts
import jsonDiffer from "fast-json-patch";
import { cloneDeep, merge } from "lodash";
function addInitialHistorySnapshot(transactionMeta) {
  const snapshot = snapshotFromTransactionMeta(transactionMeta);
  return merge({}, transactionMeta, { history: [snapshot] });
}
function updateTransactionHistory(transactionMeta, note) {
  if (!transactionMeta.history) {
    return transactionMeta;
  }
  const currentState = snapshotFromTransactionMeta(transactionMeta);
  const previousState = replayHistory(transactionMeta.history);
  const historyEntry = generateHistoryEntry(previousState, currentState, note);
  if (historyEntry.length > 0) {
    return merge({}, transactionMeta, {
      history: [...transactionMeta.history, historyEntry]
    });
  }
  return transactionMeta;
}
function generateHistoryEntry(previousState, currentState, note) {
  const historyOperationsEntry = jsonDiffer.compare(
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
  const shortHistory = cloneDeep(transactionHistory);
  return shortHistory.reduce(
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (val, entry) => jsonDiffer.applyPatch(val, entry).newDocument
  );
}
function snapshotFromTransactionMeta(transactionMeta) {
  const snapshot = { ...transactionMeta };
  delete snapshot.history;
  return cloneDeep(snapshot);
}

export {
  addInitialHistorySnapshot,
  updateTransactionHistory
};
//# sourceMappingURL=chunk-XGRAHX6T.mjs.map