import {
  SelectedNetworkControllerActionTypes
} from "./chunk-L5BCB47G.mjs";

// src/SelectedNetworkMiddleware.ts
var createSelectedNetworkMiddleware = (messenger) => {
  const getNetworkClientIdForDomain = (origin) => messenger.call(
    SelectedNetworkControllerActionTypes.getNetworkClientIdForDomain,
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

export {
  createSelectedNetworkMiddleware
};
//# sourceMappingURL=chunk-ME37HLWC.mjs.map