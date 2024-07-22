// src/utils/transaction-type.ts
import { Interface } from "@ethersproject/abi";
import { query } from "@metamask/controller-utils";
import {
  abiERC721,
  abiERC20,
  abiERC1155,
  abiFiatTokenV2
} from "@metamask/metamask-eth-abis";
var ESTIMATE_GAS_ERROR = "eth_estimateGas rpc method error";
var ERC20Interface = new Interface(abiERC20);
var ERC721Interface = new Interface(abiERC721);
var ERC1155Interface = new Interface(abiERC1155);
var USDCInterface = new Interface(abiFiatTokenV2);
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
    contractCode = await query(ethQuery, "getCode", [address]);
  } catch (e) {
    contractCode = null;
  }
  const isContractAddress = contractCode ? contractCode !== "0x" && contractCode !== "0x0" : false;
  return { contractCode, isContractAddress };
}

export {
  ESTIMATE_GAS_ERROR,
  determineTransactionType
};
//# sourceMappingURL=chunk-KG4UW4K4.mjs.map