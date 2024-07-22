// src/types.ts
var InfuraNetworkType = {
  mainnet: "mainnet",
  goerli: "goerli",
  sepolia: "sepolia",
  "linea-goerli": "linea-goerli",
  "linea-sepolia": "linea-sepolia",
  "linea-mainnet": "linea-mainnet"
};
var NetworkType = {
  ...InfuraNetworkType,
  rpc: "rpc"
};
function isNetworkType(val) {
  return Object.values(NetworkType).includes(val);
}
function isInfuraNetworkType(value) {
  const infuraNetworkTypes = Object.keys(InfuraNetworkType);
  return infuraNetworkTypes.includes(value);
}
var BuiltInNetworkName = /* @__PURE__ */ ((BuiltInNetworkName2) => {
  BuiltInNetworkName2["Mainnet"] = "mainnet";
  BuiltInNetworkName2["Goerli"] = "goerli";
  BuiltInNetworkName2["Sepolia"] = "sepolia";
  BuiltInNetworkName2["LineaGoerli"] = "linea-goerli";
  BuiltInNetworkName2["LineaSepolia"] = "linea-sepolia";
  BuiltInNetworkName2["LineaMainnet"] = "linea-mainnet";
  BuiltInNetworkName2["Aurora"] = "aurora";
  return BuiltInNetworkName2;
})(BuiltInNetworkName || {});
var ChainId = {
  ["mainnet" /* Mainnet */]: "0x1",
  // toHex(1)
  ["goerli" /* Goerli */]: "0x5",
  // toHex(5)
  ["sepolia" /* Sepolia */]: "0xaa36a7",
  // toHex(11155111)
  ["aurora" /* Aurora */]: "0x4e454152",
  // toHex(1313161554)
  ["linea-goerli" /* LineaGoerli */]: "0xe704",
  // toHex(59140)
  ["linea-sepolia" /* LineaSepolia */]: "0xe705",
  // toHex(59141)
  ["linea-mainnet" /* LineaMainnet */]: "0xe708"
  // toHex(59144)
};
var NetworksTicker = /* @__PURE__ */ ((NetworksTicker2) => {
  NetworksTicker2["mainnet"] = "ETH";
  NetworksTicker2["goerli"] = "GoerliETH";
  NetworksTicker2["sepolia"] = "SepoliaETH";
  NetworksTicker2["linea-goerli"] = "LineaETH";
  NetworksTicker2["linea-sepolia"] = "LineaETH";
  NetworksTicker2["linea-mainnet"] = "ETH";
  NetworksTicker2["rpc"] = "";
  return NetworksTicker2;
})(NetworksTicker || {});

export {
  InfuraNetworkType,
  NetworkType,
  isNetworkType,
  isInfuraNetworkType,
  BuiltInNetworkName,
  ChainId,
  NetworksTicker
};
//# sourceMappingURL=chunk-SUZYJ4RW.mjs.map