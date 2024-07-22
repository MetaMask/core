// src/controllers/user-storage/encryption/utils.ts
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

export {
  byteArrayToBase64,
  base64ToByteArray,
  bytesToUtf8
};
//# sourceMappingURL=chunk-76VRE4BI.mjs.map