import {
  projectLogger
} from "./chunk-UQQWZT6C.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/gas-flows/OracleLayer1GasFeeFlow.ts
import { Common, Hardfork } from "@ethereumjs/common";
import { TransactionFactory } from "@ethereumjs/tx";
import { Contract } from "@ethersproject/contracts";
import { Web3Provider } from "@ethersproject/providers";
import { createModuleLogger } from "@metamask/utils";
import { omit } from "lodash";
var log = createModuleLogger(projectLogger, "oracle-layer1-gas-fee-flow");
var DUMMY_KEY = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
var GAS_PRICE_ORACLE_ABI = [
  {
    inputs: [{ internalType: "bytes", name: "_data", type: "bytes" }],
    name: "getL1Fee",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
];
var _oracleAddress, _signTransaction, _getOracleLayer1GasFee, getOracleLayer1GasFee_fn, _buildUnserializedTransaction, buildUnserializedTransaction_fn, _buildTransactionParams, buildTransactionParams_fn, _buildTransactionCommon, buildTransactionCommon_fn;
var OracleLayer1GasFeeFlow = class {
  constructor(oracleAddress, signTransaction) {
    __privateAdd(this, _getOracleLayer1GasFee);
    __privateAdd(this, _buildUnserializedTransaction);
    __privateAdd(this, _buildTransactionParams);
    __privateAdd(this, _buildTransactionCommon);
    __privateAdd(this, _oracleAddress, void 0);
    __privateAdd(this, _signTransaction, void 0);
    __privateSet(this, _oracleAddress, oracleAddress);
    __privateSet(this, _signTransaction, signTransaction ?? false);
  }
  async getLayer1Fee(request) {
    try {
      return await __privateMethod(this, _getOracleLayer1GasFee, getOracleLayer1GasFee_fn).call(this, request);
    } catch (error) {
      log("Failed to get oracle layer 1 gas fee", error);
      throw new Error(`Failed to get oracle layer 1 gas fee`);
    }
  }
};
_oracleAddress = new WeakMap();
_signTransaction = new WeakMap();
_getOracleLayer1GasFee = new WeakSet();
getOracleLayer1GasFee_fn = async function(request) {
  const { provider, transactionMeta } = request;
  const contract = new Contract(
    __privateGet(this, _oracleAddress),
    GAS_PRICE_ORACLE_ABI,
    // Network controller provider type is incompatible with ethers provider
    new Web3Provider(provider)
  );
  const serializedTransaction = __privateMethod(this, _buildUnserializedTransaction, buildUnserializedTransaction_fn).call(this, transactionMeta, __privateGet(this, _signTransaction)).serialize();
  const result = await contract.getL1Fee(serializedTransaction);
  if (result === void 0) {
    throw new Error("No value returned from oracle contract");
  }
  return {
    layer1Fee: result.toHexString()
  };
};
_buildUnserializedTransaction = new WeakSet();
buildUnserializedTransaction_fn = function(transactionMeta, sign) {
  const txParams = __privateMethod(this, _buildTransactionParams, buildTransactionParams_fn).call(this, transactionMeta);
  const common = __privateMethod(this, _buildTransactionCommon, buildTransactionCommon_fn).call(this, transactionMeta);
  let unserializedTransaction = TransactionFactory.fromTxData(txParams, {
    common
  });
  if (sign) {
    const keyBuffer = Buffer.from(DUMMY_KEY, "hex");
    unserializedTransaction = unserializedTransaction.sign(keyBuffer);
  }
  return unserializedTransaction;
};
_buildTransactionParams = new WeakSet();
buildTransactionParams_fn = function(transactionMeta) {
  return {
    ...omit(transactionMeta.txParams, "gas"),
    gasLimit: transactionMeta.txParams.gas
  };
};
_buildTransactionCommon = new WeakSet();
buildTransactionCommon_fn = function(transactionMeta) {
  const chainId = Number(transactionMeta.chainId);
  return Common.custom({
    chainId,
    defaultHardfork: Hardfork.London
  });
};

export {
  OracleLayer1GasFeeFlow
};
//# sourceMappingURL=chunk-FG74Z3F5.mjs.map