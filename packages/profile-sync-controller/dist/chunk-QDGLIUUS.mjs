// src/sdk/utils/validate-login-response.ts
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

export {
  validateLoginResponse
};
//# sourceMappingURL=chunk-QDGLIUUS.mjs.map