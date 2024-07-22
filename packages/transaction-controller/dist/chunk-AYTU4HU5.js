"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/types.ts
var TransactionStatus = /* @__PURE__ */ ((TransactionStatus2) => {
  TransactionStatus2["unapproved"] = "unapproved";
  TransactionStatus2["approved"] = "approved";
  TransactionStatus2["signed"] = "signed";
  TransactionStatus2["submitted"] = "submitted";
  TransactionStatus2["confirmed"] = "confirmed";
  TransactionStatus2["failed"] = "failed";
  TransactionStatus2["dropped"] = "dropped";
  TransactionStatus2["rejected"] = "rejected";
  TransactionStatus2["cancelled"] = "cancelled";
  return TransactionStatus2;
})(TransactionStatus || {});
var WalletDevice = /* @__PURE__ */ ((WalletDevice2) => {
  WalletDevice2["MM_MOBILE"] = "metamask_mobile";
  WalletDevice2["MM_EXTENSION"] = "metamask_extension";
  WalletDevice2["OTHER"] = "other_device";
  return WalletDevice2;
})(WalletDevice || {});
var TransactionType = /* @__PURE__ */ ((TransactionType2) => {
  TransactionType2["cancel"] = "cancel";
  TransactionType2["contractInteraction"] = "contractInteraction";
  TransactionType2["deployContract"] = "contractDeployment";
  TransactionType2["ethDecrypt"] = "eth_decrypt";
  TransactionType2["ethGetEncryptionPublicKey"] = "eth_getEncryptionPublicKey";
  TransactionType2["incoming"] = "incoming";
  TransactionType2["personalSign"] = "personal_sign";
  TransactionType2["retry"] = "retry";
  TransactionType2["simpleSend"] = "simpleSend";
  TransactionType2["signTypedData"] = "eth_signTypedData";
  TransactionType2["smart"] = "smart";
  TransactionType2["swap"] = "swap";
  TransactionType2["swapAndSend"] = "swapAndSend";
  TransactionType2["swapApproval"] = "swapApproval";
  TransactionType2["tokenMethodApprove"] = "approve";
  TransactionType2["tokenMethodSafeTransferFrom"] = "safetransferfrom";
  TransactionType2["tokenMethodTransfer"] = "transfer";
  TransactionType2["tokenMethodTransferFrom"] = "transferfrom";
  TransactionType2["tokenMethodSetApprovalForAll"] = "setapprovalforall";
  TransactionType2["tokenMethodIncreaseAllowance"] = "increaseAllowance";
  return TransactionType2;
})(TransactionType || {});
var TransactionEnvelopeType = /* @__PURE__ */ ((TransactionEnvelopeType2) => {
  TransactionEnvelopeType2["legacy"] = "0x0";
  TransactionEnvelopeType2["accessList"] = "0x1";
  TransactionEnvelopeType2["feeMarket"] = "0x2";
  return TransactionEnvelopeType2;
})(TransactionEnvelopeType || {});
var UserFeeLevel = /* @__PURE__ */ ((UserFeeLevel2) => {
  UserFeeLevel2["CUSTOM"] = "custom";
  UserFeeLevel2["DAPP_SUGGESTED"] = "dappSuggested";
  UserFeeLevel2["MEDIUM"] = "medium";
  return UserFeeLevel2;
})(UserFeeLevel || {});
var GasFeeEstimateLevel = /* @__PURE__ */ ((GasFeeEstimateLevel2) => {
  GasFeeEstimateLevel2["Low"] = "low";
  GasFeeEstimateLevel2["Medium"] = "medium";
  GasFeeEstimateLevel2["High"] = "high";
  return GasFeeEstimateLevel2;
})(GasFeeEstimateLevel || {});
var GasFeeEstimateType = /* @__PURE__ */ ((GasFeeEstimateType2) => {
  GasFeeEstimateType2["FeeMarket"] = "fee-market";
  GasFeeEstimateType2["Legacy"] = "legacy";
  GasFeeEstimateType2["GasPrice"] = "eth_gasPrice";
  return GasFeeEstimateType2;
})(GasFeeEstimateType || {});
var SimulationTokenStandard = /* @__PURE__ */ ((SimulationTokenStandard2) => {
  SimulationTokenStandard2["erc20"] = "erc20";
  SimulationTokenStandard2["erc721"] = "erc721";
  SimulationTokenStandard2["erc1155"] = "erc1155";
  return SimulationTokenStandard2;
})(SimulationTokenStandard || {});
var SimulationErrorCode = /* @__PURE__ */ ((SimulationErrorCode2) => {
  SimulationErrorCode2["ChainNotSupported"] = "chain-not-supported";
  SimulationErrorCode2["Disabled"] = "disabled";
  SimulationErrorCode2["InvalidResponse"] = "invalid-response";
  SimulationErrorCode2["Reverted"] = "reverted";
  return SimulationErrorCode2;
})(SimulationErrorCode || {});











exports.TransactionStatus = TransactionStatus; exports.WalletDevice = WalletDevice; exports.TransactionType = TransactionType; exports.TransactionEnvelopeType = TransactionEnvelopeType; exports.UserFeeLevel = UserFeeLevel; exports.GasFeeEstimateLevel = GasFeeEstimateLevel; exports.GasFeeEstimateType = GasFeeEstimateType; exports.SimulationTokenStandard = SimulationTokenStandard; exports.SimulationErrorCode = SimulationErrorCode;
//# sourceMappingURL=chunk-AYTU4HU5.js.map