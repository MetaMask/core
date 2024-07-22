// src/logger.ts
import { createProjectLogger, createModuleLogger } from "@metamask/utils";
var projectLogger = createProjectLogger("transaction-controller");
var incomingTransactionsLogger = createModuleLogger(
  projectLogger,
  "incoming-transactions"
);

export {
  createModuleLogger,
  projectLogger,
  incomingTransactionsLogger
};
//# sourceMappingURL=chunk-UQQWZT6C.mjs.map