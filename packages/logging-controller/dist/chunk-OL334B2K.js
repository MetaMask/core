"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/logTypes/EthSignLog.ts
var SigningMethod = /* @__PURE__ */ ((SigningMethod2) => {
  SigningMethod2["PersonalSign"] = "personal_sign";
  SigningMethod2["EthSignTypedData"] = "eth_signTypedData";
  SigningMethod2["EthSignTypedDataV3"] = "eth_signTypedData_v3";
  SigningMethod2["EthSignTypedDataV4"] = "eth_signTypedData_v4";
  return SigningMethod2;
})(SigningMethod || {});
var SigningStage = /* @__PURE__ */ ((SigningStage2) => {
  SigningStage2["Proposed"] = "proposed";
  SigningStage2["Rejected"] = "rejected";
  SigningStage2["Signed"] = "signed";
  return SigningStage2;
})(SigningStage || {});




exports.SigningMethod = SigningMethod; exports.SigningStage = SigningStage;
//# sourceMappingURL=chunk-OL334B2K.js.map