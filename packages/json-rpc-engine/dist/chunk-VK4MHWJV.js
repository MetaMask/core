"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunk2LXAFMJDjs = require('./chunk-2LXAFMJD.js');

// src/mergeMiddleware.ts
function mergeMiddleware(middlewareStack) {
  const engine = new (0, _chunk2LXAFMJDjs.JsonRpcEngine)();
  middlewareStack.forEach((middleware) => engine.push(middleware));
  return engine.asMiddleware();
}



exports.mergeMiddleware = mergeMiddleware;
//# sourceMappingURL=chunk-VK4MHWJV.js.map