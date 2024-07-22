"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkUASER35Fjs = require('./chunk-UASER35F.js');

// src/provider-from-middleware.ts
var _jsonrpcengine = require('@metamask/json-rpc-engine');
function providerFromMiddleware(middleware) {
  const engine = new (0, _jsonrpcengine.JsonRpcEngine)();
  engine.push(middleware);
  const provider = _chunkUASER35Fjs.providerFromEngine.call(void 0, engine);
  return provider;
}



exports.providerFromMiddleware = providerFromMiddleware;
//# sourceMappingURL=chunk-D7LFQMKU.js.map