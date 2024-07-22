"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkFYADAA2Gjs = require('./chunk-FYADAA2G.js');

// src/rpc-methods/requestPermissions.ts
var _controllerutils = require('@metamask/controller-utils');
var requestPermissionsHandler = {
  methodNames: ["wallet_requestPermissions" /* RequestPermissions */],
  implementation: requestPermissionsImplementation,
  hookNames: {
    requestPermissionsForOrigin: true
  }
};
async function requestPermissionsImplementation(req, res, _next, end, { requestPermissionsForOrigin }) {
  const { params } = req;
  if (!Array.isArray(params) || !_controllerutils.isPlainObject.call(void 0, params[0])) {
    return end(_chunkFYADAA2Gjs.invalidParams.call(void 0, { data: { request: req } }));
  }
  const [requestedPermissions] = params;
  const [grantedPermissions] = await requestPermissionsForOrigin(
    requestedPermissions
  );
  res.result = Object.values(grantedPermissions);
  return end();
}



exports.requestPermissionsHandler = requestPermissionsHandler;
//# sourceMappingURL=chunk-7A3VYLCK.js.map