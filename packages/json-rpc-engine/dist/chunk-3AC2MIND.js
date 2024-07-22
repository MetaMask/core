"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/createScaffoldMiddleware.ts
function createScaffoldMiddleware(handlers) {
  return (req, res, next, end) => {
    const handler = handlers[req.method];
    if (handler === void 0) {
      return next();
    }
    if (typeof handler === "function") {
      return handler(req, res, next, end);
    }
    res.result = handler;
    return end();
  };
}



exports.createScaffoldMiddleware = createScaffoldMiddleware;
//# sourceMappingURL=chunk-3AC2MIND.js.map