import {
  invalidParams
} from "./chunk-G4BWJ7EA.mjs";

// src/rpc-methods/revokePermissions.ts
import {
  isNonEmptyArray
} from "@metamask/utils";
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
    return end(invalidParams({ data: { request: req } }));
  }
  const permissionKeys = Object.keys(param);
  if (!isNonEmptyArray(permissionKeys)) {
    return end(invalidParams({ data: { request: req } }));
  }
  revokePermissionsForOrigin(permissionKeys);
  res.result = null;
  return end();
}

export {
  revokePermissionsHandler
};
//# sourceMappingURL=chunk-74H4CVH7.mjs.map