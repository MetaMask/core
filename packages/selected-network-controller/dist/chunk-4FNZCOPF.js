"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkMQYWK4KPjs = require('./chunk-MQYWK4KP.js');

// src/SelectedNetworkMiddleware.ts
var createSelectedNetworkMiddleware = (messenger) => {
  const getNetworkClientIdForDomain = (origin) => messenger.call(
    _chunkMQYWK4KPjs.SelectedNetworkControllerActionTypes.getNetworkClientIdForDomain,
    origin
  );
  return (req, _, next) => {
    if (!req.origin) {
      throw new Error("Request object is lacking an 'origin'");
    }
    req.networkClientId = getNetworkClientIdForDomain(req.origin);
    return next();
  };
};



exports.createSelectedNetworkMiddleware = createSelectedNetworkMiddleware;
//# sourceMappingURL=chunk-4FNZCOPF.js.map