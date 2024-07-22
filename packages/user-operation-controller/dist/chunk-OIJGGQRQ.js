"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/utils/chain-id.ts
function toEip155ChainId(chainId) {
  const chainIdNumber = Number(chainId);
  return Number.isInteger(chainIdNumber) ? chainIdNumber.toString() : chainId;
}



exports.toEip155ChainId = toEip155ChainId;
//# sourceMappingURL=chunk-OIJGGQRQ.js.map