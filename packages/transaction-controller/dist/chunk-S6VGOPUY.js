"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/logger.ts
var _utils = require('@metamask/utils');
var projectLogger = _utils.createProjectLogger.call(void 0, "transaction-controller");
var incomingTransactionsLogger = _utils.createModuleLogger.call(void 0, 
  projectLogger,
  "incoming-transactions"
);





exports.createModuleLogger = _utils.createModuleLogger; exports.projectLogger = projectLogger; exports.incomingTransactionsLogger = incomingTransactionsLogger;
//# sourceMappingURL=chunk-S6VGOPUY.js.map