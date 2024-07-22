var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};

// src/constants.ts
var ETHERSCAN_SUPPORTED_CHAIN_IDS = {
  MAINNET: "0x1",
  GOERLI: "0x5",
  BSC: "0x38",
  BSC_TESTNET: "0x61",
  OPTIMISM: "0xa",
  OPTIMISM_SEPOLIA: "0xaa37dc",
  POLYGON: "0x89",
  POLYGON_TESTNET: "0x13881",
  AVALANCHE: "0xa86a",
  AVALANCHE_TESTNET: "0xa869",
  FANTOM: "0xfa",
  FANTOM_TESTNET: "0xfa2",
  SEPOLIA: "0xaa36a7",
  LINEA_GOERLI: "0xe704",
  LINEA_SEPOLIA: "0xe705",
  LINEA_MAINNET: "0xe708",
  MOONBEAM: "0x504",
  MOONBEAM_TESTNET: "0x507",
  MOONRIVER: "0x505",
  GNOSIS: "0x64"
};

export {
  __privateAdd,
  __privateMethod,
  ETHERSCAN_SUPPORTED_CHAIN_IDS
};
//# sourceMappingURL=chunk-FT2APC4J.mjs.map