"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/controllers/user-storage/encryption/utils.ts
var byteArrayToBase64 = (byteArray) => {
  return Buffer.from(byteArray).toString("base64");
};
var base64ToByteArray = (base64) => {
  return new Uint8Array(Buffer.from(base64, "base64"));
};
var bytesToUtf8 = (byteArray) => {
  const decoder = new TextDecoder("utf-8");
  return decoder.decode(byteArray);
};





exports.byteArrayToBase64 = byteArrayToBase64; exports.base64ToByteArray = base64ToByteArray; exports.bytesToUtf8 = bytesToUtf8;
//# sourceMappingURL=chunk-PCOIRDTO.js.map