"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTypedSignMessageDataV3 = exports.validateTypedSignMessageDataV1 = exports.validateSignMessageData = exports.normalizeMessageData = void 0;
const ethereumjs_util_1 = require("ethereumjs-util");
const eth_sig_util_1 = require("eth-sig-util");
const jsonschema_1 = require("jsonschema");
const controller_utils_1 = require("@metamask/controller-utils");
const hexRe = /^[0-9A-Fa-f]+$/gu;
/**
 * A helper function that converts rawmessageData buffer data to a hex, or just returns the data if
 * it is already formatted as a hex.
 *
 * @param data - The buffer data to convert to a hex.
 * @returns A hex string conversion of the buffer data.
 */
function normalizeMessageData(data) {
    try {
        const stripped = (0, ethereumjs_util_1.stripHexPrefix)(data);
        if (stripped.match(hexRe)) {
            return (0, ethereumjs_util_1.addHexPrefix)(stripped);
        }
    }
    catch (e) {
        /* istanbul ignore next */
    }
    return (0, ethereumjs_util_1.bufferToHex)(Buffer.from(data, 'utf8'));
}
exports.normalizeMessageData = normalizeMessageData;
/**
 * Validates a PersonalMessageParams and MessageParams objects for required properties and throws in
 * the event of any validation error.
 *
 * @param messageData - PersonalMessageParams object to validate.
 */
function validateSignMessageData(messageData) {
    const { from, data } = messageData;
    if (!from || typeof from !== 'string' || !(0, controller_utils_1.isValidHexAddress)(from)) {
        throw new Error(`Invalid "from" address: ${from} must be a valid string.`);
    }
    if (!data || typeof data !== 'string') {
        throw new Error(`Invalid message "data": ${data} must be a valid string.`);
    }
}
exports.validateSignMessageData = validateSignMessageData;
/**
 * Validates a TypedMessageParams object for required properties and throws in
 * the event of any validation error for eth_signTypedMessage_V1.
 *
 * @param messageData - TypedMessageParams object to validate.
 */
function validateTypedSignMessageDataV1(messageData) {
    if (!messageData.from ||
        typeof messageData.from !== 'string' ||
        !(0, controller_utils_1.isValidHexAddress)(messageData.from)) {
        throw new Error(`Invalid "from" address: ${messageData.from} must be a valid string.`);
    }
    if (!messageData.data || !Array.isArray(messageData.data)) {
        throw new Error(`Invalid message "data": ${messageData.data} must be a valid array.`);
    }
    try {
        // typedSignatureHash will throw if the data is invalid.
        (0, eth_sig_util_1.typedSignatureHash)(messageData.data);
    }
    catch (e) {
        throw new Error(`Expected EIP712 typed data.`);
    }
}
exports.validateTypedSignMessageDataV1 = validateTypedSignMessageDataV1;
/**
 * Validates a TypedMessageParams object for required properties and throws in
 * the event of any validation error for eth_signTypedMessage_V3.
 *
 * @param messageData - TypedMessageParams object to validate.
 */
function validateTypedSignMessageDataV3(messageData) {
    if (!messageData.from ||
        typeof messageData.from !== 'string' ||
        !(0, controller_utils_1.isValidHexAddress)(messageData.from)) {
        throw new Error(`Invalid "from" address: ${messageData.from} must be a valid string.`);
    }
    if (!messageData.data || typeof messageData.data !== 'string') {
        throw new Error(`Invalid message "data": ${messageData.data} must be a valid array.`);
    }
    let data;
    try {
        data = JSON.parse(messageData.data);
    }
    catch (e) {
        throw new Error('Data must be passed as a valid JSON string.');
    }
    const validation = (0, jsonschema_1.validate)(data, eth_sig_util_1.TYPED_MESSAGE_SCHEMA);
    if (validation.errors.length > 0) {
        throw new Error('Data must conform to EIP-712 schema. See https://git.io/fNtcx.');
    }
}
exports.validateTypedSignMessageDataV3 = validateTypedSignMessageDataV3;
//# sourceMappingURL=utils.js.map