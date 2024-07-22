import {
  invalidParams
} from "./chunk-G4BWJ7EA.mjs";

// src/rpc-methods/requestPermissions.ts
import { isPlainObject } from "@metamask/controller-utils";
var requestPermissionsHandler = {
  methodNames: ["wallet_requestPermissions" /* RequestPermissions */],
  implementation: requestPermissionsImplementation,
  hookNames: {
    requestPermissionsForOrigin: true
  }
};
async function requestPermissionsImplementation(req, res, _next, end, { requestPermissionsForOrigin }) {
  const { params } = req;
  if (!Array.isArray(params) || !isPlainObject(params[0])) {
    return end(invalidParams({ data: { request: req } }));
  }
  const [requestedPermissions] = params;
  const [grantedPermissions] = await requestPermissionsForOrigin(
    requestedPermissions
  );
  res.result = Object.values(grantedPermissions);
  return end();
}

export {
  requestPermissionsHandler
};
//# sourceMappingURL=chunk-OCLNDUYO.mjs.map