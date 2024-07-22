"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/sdk/utils/validate-login-response.ts
function validateLoginResponse(input) {
  const assumedInput = input;
  if (!assumedInput) {
    return false;
  }
  if (!assumedInput?.token || !assumedInput?.profile) {
    return false;
  }
  return true;
}



exports.validateLoginResponse = validateLoginResponse;
//# sourceMappingURL=chunk-DRB2MN4T.js.map