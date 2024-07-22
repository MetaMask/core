"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkFYADAA2Gjs = require('./chunk-FYADAA2G.js');

// src/permission-middleware.ts
var _jsonrpcengine = require('@metamask/json-rpc-engine');
function getPermissionMiddlewareFactory({
  executeRestrictedMethod,
  getRestrictedMethod,
  isUnrestrictedMethod
}) {
  return function createPermissionMiddleware(subject) {
    const { origin } = subject;
    if (typeof origin !== "string" || !origin) {
      throw new Error('The subject "origin" must be a non-empty string.');
    }
    const permissionsMiddleware = async (req, res, next) => {
      const { method, params } = req;
      if (isUnrestrictedMethod(method)) {
        return next();
      }
      const methodImplementation = getRestrictedMethod(method, origin);
      const result = await executeRestrictedMethod(
        methodImplementation,
        subject,
        method,
        params
      );
      if (result === void 0) {
        res.error = _chunkFYADAA2Gjs.internalError.call(void 0, 
          `Request for method "${req.method}" returned undefined result.`,
          { request: req }
        );
        return void 0;
      }
      res.result = result;
      return void 0;
    };
    return _jsonrpcengine.createAsyncMiddleware.call(void 0, permissionsMiddleware);
  };
}



exports.getPermissionMiddlewareFactory = getPermissionMiddlewareFactory;
//# sourceMappingURL=chunk-F5TBMVWC.js.map