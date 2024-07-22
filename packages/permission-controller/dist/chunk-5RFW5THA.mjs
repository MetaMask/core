// src/rpc-methods/getPermissions.ts
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

export {
  getPermissionsHandler
};
//# sourceMappingURL=chunk-5RFW5THA.mjs.map