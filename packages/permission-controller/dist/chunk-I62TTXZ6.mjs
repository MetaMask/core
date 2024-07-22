import {
  internalError
} from "./chunk-G4BWJ7EA.mjs";

// src/permission-middleware.ts
import { createAsyncMiddleware } from "@metamask/json-rpc-engine";
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
        res.error = internalError(
          `Request for method "${req.method}" returned undefined result.`,
          { request: req }
        );
        return void 0;
      }
      res.result = result;
      return void 0;
    };
    return createAsyncMiddleware(permissionsMiddleware);
  };
}

export {
  getPermissionMiddlewareFactory
};
//# sourceMappingURL=chunk-I62TTXZ6.mjs.map