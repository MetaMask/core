"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/utils/transaction-type.ts
var _abi = require('@ethersproject/abi');
var _controllerutils = require('@metamask/controller-utils');





var _metamaskethabis = require('@metamask/metamask-eth-abis');
var ESTIMATE_GAS_ERROR = "eth_estimateGas rpc method error";
var ERC20Interface = new (0, _abi.Interface)(_metamaskethabis.abiERC20);
var ERC721Interface = new (0, _abi.Interface)(_metamaskethabis.abiERC721);
var ERC1155Interface = new (0, _abi.Interface)(_metamaskethabis.abiERC1155);
var USDCInterface = new (0, _abi.Interface)(_metamaskethabis.abiFiatTokenV2);
async function determineTransactionType(txParams, ethQuery) {
  const { data, to } = txParams;
  if (data && !to) {
    return { type: "contractDeployment" /* deployContract */, getCodeResponse: void 0 };
  }
  const { contractCode: getCodeResponse, isContractAddress } = await readAddressAsContract(ethQuery, to);
  if (!isContractAddress) {
    return { type: "simpleSend" /* simpleSend */, getCodeResponse };
  }
  const hasValue = Number(txParams.value ?? "0") !== 0;
  const contractInteractionResult = {
    type: "contractInteraction" /* contractInteraction */,
    getCodeResponse
  };
  if (!data || hasValue) {
    return contractInteractionResult;
  }
  const name = parseStandardTokenTransactionData(data)?.name;
  if (!name) {
    return contractInteractionResult;
  }
  const tokenMethodName = [
    "approve" /* tokenMethodApprove */,
    "setapprovalforall" /* tokenMethodSetApprovalForAll */,
    "transfer" /* tokenMethodTransfer */,
    "transferfrom" /* tokenMethodTransferFrom */,
    "safetransferfrom" /* tokenMethodSafeTransferFrom */,
    "increaseAllowance" /* tokenMethodIncreaseAllowance */
  ].find(
    (methodName) => methodName.toLowerCase() === name.toLowerCase()
  );
  if (tokenMethodName) {
    return { type: tokenMethodName, getCodeResponse };
  }
  return contractInteractionResult;
}
function parseStandardTokenTransactionData(data) {
  if (!data) {
    return void 0;
  }
  try {
    return ERC20Interface.parseTransaction({ data });
  } catch {
  }
  try {
    return ERC721Interface.parseTransaction({ data });
  } catch {
  }
  try {
    return ERC1155Interface.parseTransaction({ data });
  } catch {
  }
  try {
    return USDCInterface.parseTransaction({ data });
  } catch {
  }
  return void 0;
}
async function readAddressAsContract(ethQuery, address) {
  let contractCode;
  try {
    contractCode = await _controllerutils.query.call(void 0, ethQuery, "getCode", [address]);
  } catch (e) {
    contractCode = null;
  }
  const isContractAddress = contractCode ? contractCode !== "0x" && contractCode !== "0x0" : false;
  return { contractCode, isContractAddress };
}




exports.ESTIMATE_GAS_ERROR = ESTIMATE_GAS_ERROR; exports.determineTransactionType = determineTransactionType;
//# sourceMappingURL=chunk-SD6CWFDF.js.map