"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/rpc-methods/getPermissions.ts
var getPermissionsHandler = {
  methodNames: ["wallet_getPermissions" /* GetPermissions */],
  implementation: getPermissionsImplementation,
  hookNames: {
    getPermissionsForOrigin: true
  }
};
async function getPermissionsImplementation(_req, res, _next, end, { getPermissionsForOrigin }) {
  res.result = Object.values(getPermissionsForOrigin() || {});
  return end();
}



exports.getPermissionsHandler = getPermissionsHandler;
//# sourceMappingURL=chunk-VBIZGGQL.js.map