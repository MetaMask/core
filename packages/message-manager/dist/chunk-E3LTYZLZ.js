"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/utils.ts
var _controllerutils = require('@metamask/controller-utils');



var _ethsigutil = require('@metamask/eth-sig-util');
var _utils = require('@metamask/utils');
var _jsonschema = require('jsonschema');
var hexRe = /^[0-9A-Fa-f]+$/gu;
function validateAddress(address, propertyName) {
  if (!address || typeof address !== "string" || !_controllerutils.isValidHexAddress.call(void 0, address)) {
    throw new Error(
      `Invalid "${propertyName}" address: ${address} must be a valid string.`
    );
  }
}
function normalizeMessageData(data) {
  try {
    const stripped = _utils.remove0x.call(void 0, data);
    if (stripped.match(hexRe)) {
      return _utils.add0x.call(void 0, stripped);
    }
  } catch (e) {
  }
  return _utils.bytesToHex.call(void 0, Buffer.from(data, "utf8"));
}
function validateSignMessageData(messageData) {
  const { from, data } = messageData;
  validateAddress(from, "from");
  if (!data || typeof data !== "string") {
    throw new Error(`Invalid message "data": ${data} must be a valid string.`);
  }
}
function validateTypedSignMessageDataV1(messageData) {
  validateAddress(messageData.from, "from");
  if (!messageData.data || !Array.isArray(messageData.data)) {
    throw new Error(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `Invalid message "data": ${messageData.data} must be a valid array.`
    );
  }
  try {
    _ethsigutil.typedSignatureHash.call(void 0, messageData.data);
  } catch (e) {
    throw new Error(`Expected EIP712 typed data.`);
  }
}
function validateTypedSignMessageDataV3V4(messageData, currentChainId) {
  validateAddress(messageData.from, "from");
  if (!messageData.data || Array.isArray(messageData.data) || typeof messageData.data !== "object" && typeof messageData.data !== "string") {
    throw new Error(
      `Invalid message "data": Must be a valid string or object.`
    );
  }
  let data;
  if (typeof messageData.data === "object") {
    data = messageData.data;
  } else {
    try {
      data = JSON.parse(messageData.data);
    } catch (e) {
      throw new Error("Data must be passed as a valid JSON string.");
    }
  }
  const validation = _jsonschema.validate.call(void 0, data, _ethsigutil.TYPED_MESSAGE_SCHEMA);
  if (validation.errors.length > 0) {
    throw new Error(
      "Data must conform to EIP-712 schema. See https://git.io/fNtcx."
    );
  }
  if (!currentChainId) {
    throw new Error("Current chainId cannot be null or undefined.");
  }
  let { chainId } = data.domain;
  if (chainId) {
    if (typeof chainId === "string") {
      chainId = parseInt(chainId, chainId.startsWith("0x") ? 16 : 10);
    }
    const activeChainId = parseInt(currentChainId, 16);
    if (Number.isNaN(activeChainId)) {
      throw new Error(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Cannot sign messages for chainId "${chainId}", because MetaMask is switching networks.`
      );
    }
    if (chainId !== activeChainId) {
      throw new Error(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Provided chainId "${chainId}" must match the active chainId "${activeChainId}"`
      );
    }
  }
}
function validateEncryptionPublicKeyMessageData(messageData) {
  const { from } = messageData;
  validateAddress(from, "from");
}
function validateDecryptedMessageData(messageData) {
  const { from } = messageData;
  validateAddress(from, "from");
}








exports.normalizeMessageData = normalizeMessageData; exports.validateSignMessageData = validateSignMessageData; exports.validateTypedSignMessageDataV1 = validateTypedSignMessageDataV1; exports.validateTypedSignMessageDataV3V4 = validateTypedSignMessageDataV3V4; exports.validateEncryptionPublicKeyMessageData = validateEncryptionPublicKeyMessageData; exports.validateDecryptedMessageData = validateDecryptedMessageData;
//# sourceMappingURL=chunk-E3LTYZLZ.js.map