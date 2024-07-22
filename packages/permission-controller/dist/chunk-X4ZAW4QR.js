"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkFYADAA2Gjs = require('./chunk-FYADAA2G.js');

// src/rpc-methods/revokePermissions.ts


var _utils = require('@metamask/utils');
var revokePermissionsHandler = {
  methodNames: ["wallet_revokePermissions" /* RevokePermissions */],
  implementation: revokePermissionsImplementation,
  hookNames: {
    revokePermissionsForOrigin: true
  }
};
async function revokePermissionsImplementation(req, res, _next, end, { revokePermissionsForOrigin }) {
  const { params } = req;
  const param = params?.[0];
  if (!param) {
    return end(_chunkFYADAA2Gjs.invalidParams.call(void 0, { data: { request: req } }));
  }
  const permissionKeys = Object.keys(param);
  if (!_utils.isNonEmptyArray.call(void 0, permissionKeys)) {
    return end(_chunkFYADAA2Gjs.invalidParams.call(void 0, { data: { request: req } }));
  }
  revokePermissionsForOrigin(permissionKeys);
  res.result = null;
  return end();
}



exports.revokePermissionsHandler = revokePermissionsHandler;
//# sourceMappingURL=chunk-X4ZAW4QR.js.map