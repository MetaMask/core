// src/utils/chain-id.ts
function toEip155ChainId(chainId) {
  const chainIdNumber = Number(chainId);
  return Number.isInteger(chainIdNumber) ? chainIdNumber.toString() : chainId;
}

export {
  toEip155ChainId
};
//# sourceMappingURL=chunk-TEVOXQEH.mjs.map