"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkOZ6UB42Cjs = require('./chunk-OZ6UB42C.js');

// src/utils/validation.ts
var _abi = require('@ethersproject/abi');
var _controllerutils = require('@metamask/controller-utils');
var _metamaskethabis = require('@metamask/metamask-eth-abis');
var _rpcerrors = require('@metamask/rpc-errors');
async function validateTransactionOrigin(permittedAddresses, selectedAddress, from, origin) {
  if (origin === _controllerutils.ORIGIN_METAMASK) {
    if (from !== selectedAddress) {
      throw _rpcerrors.rpcErrors.internal({
        message: `Internally initiated transaction is using invalid account.`,
        data: {
          origin,
          fromAddress: from,
          selectedAddress
        }
      });
    }
    return;
  }
  if (!permittedAddresses.includes(from)) {
    throw _rpcerrors.providerErrors.unauthorized({ data: { origin } });
  }
}
function validateTxParams(txParams, isEIP1559Compatible = true) {
  validateEIP1559Compatibility(txParams, isEIP1559Compatible);
  validateParamFrom(txParams.from);
  validateParamRecipient(txParams);
  validateParamValue(txParams.value);
  validateParamData(txParams.data);
  validateParamChainId(txParams.chainId);
  validateGasFeeParams(txParams);
}
function validateEIP1559Compatibility(txParams, isEIP1559Compatible) {
  if (_chunkOZ6UB42Cjs.isEIP1559Transaction.call(void 0, txParams) && !isEIP1559Compatible) {
    throw _rpcerrors.rpcErrors.invalidParams(
      "Invalid transaction params: params specify an EIP-1559 transaction but the current network does not support EIP-1559"
    );
  }
}
function validateParamValue(value) {
  if (value !== void 0) {
    if (value.includes("-")) {
      throw _rpcerrors.rpcErrors.invalidParams(
        `Invalid transaction value "${value}": not a positive number.`
      );
    }
    if (value.includes(".")) {
      throw _rpcerrors.rpcErrors.invalidParams(
        `Invalid transaction value "${value}": number must be in wei.`
      );
    }
    const intValue = parseInt(value, 10);
    const isValid = Number.isFinite(intValue) && !Number.isNaN(intValue) && !isNaN(Number(value)) && Number.isSafeInteger(intValue);
    if (!isValid) {
      throw _rpcerrors.rpcErrors.invalidParams(
        `Invalid transaction value ${value}: number must be a valid number.`
      );
    }
  }
}
function validateParamRecipient(txParams) {
  if (txParams.to === "0x" || txParams.to === void 0) {
    if (txParams.data) {
      delete txParams.to;
    } else {
      throw _rpcerrors.rpcErrors.invalidParams(`Invalid "to" address.`);
    }
  } else if (txParams.to !== void 0 && !_controllerutils.isValidHexAddress.call(void 0, txParams.to)) {
    throw _rpcerrors.rpcErrors.invalidParams(`Invalid "to" address.`);
  }
}
function validateParamFrom(from) {
  if (!from || typeof from !== "string") {
    throw _rpcerrors.rpcErrors.invalidParams(
      `Invalid "from" address ${from}: not a string.`
    );
  }
  if (!_controllerutils.isValidHexAddress.call(void 0, from)) {
    throw _rpcerrors.rpcErrors.invalidParams('Invalid "from" address.');
  }
}
function validateParamData(value) {
  if (value) {
    const ERC20Interface = new (0, _abi.Interface)(_metamaskethabis.abiERC20);
    try {
      ERC20Interface.parseTransaction({ data: value });
    } catch (error) {
      if (error.message.match(/BUFFER_OVERRUN/u)) {
        throw _rpcerrors.rpcErrors.invalidParams(
          "Invalid transaction params: data out-of-bounds, BUFFER_OVERRUN."
        );
      }
    }
  }
}
function validateParamChainId(chainId) {
  if (chainId !== void 0 && typeof chainId !== "number" && typeof chainId !== "string") {
    throw _rpcerrors.rpcErrors.invalidParams(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `Invalid transaction params: chainId is not a Number or hex string. got: (${chainId})`
    );
  }
}
function validateGasFeeParams(txParams) {
  if (txParams.gasPrice) {
    ensureProperTransactionEnvelopeTypeProvided(txParams, "gasPrice");
    ensureMutuallyExclusiveFieldsNotProvided(
      txParams,
      "gasPrice",
      "maxFeePerGas"
    );
    ensureMutuallyExclusiveFieldsNotProvided(
      txParams,
      "gasPrice",
      "maxPriorityFeePerGas"
    );
    ensureFieldIsString(txParams, "gasPrice");
  }
  if (txParams.maxFeePerGas) {
    ensureProperTransactionEnvelopeTypeProvided(txParams, "maxFeePerGas");
    ensureMutuallyExclusiveFieldsNotProvided(
      txParams,
      "maxFeePerGas",
      "gasPrice"
    );
    ensureFieldIsString(txParams, "maxFeePerGas");
  }
  if (txParams.maxPriorityFeePerGas) {
    ensureProperTransactionEnvelopeTypeProvided(
      txParams,
      "maxPriorityFeePerGas"
    );
    ensureMutuallyExclusiveFieldsNotProvided(
      txParams,
      "maxPriorityFeePerGas",
      "gasPrice"
    );
    ensureFieldIsString(txParams, "maxPriorityFeePerGas");
  }
}
function ensureProperTransactionEnvelopeTypeProvided(txParams, field) {
  switch (field) {
    case "maxFeePerGas":
    case "maxPriorityFeePerGas":
      if (txParams.type && txParams.type !== "0x2" /* feeMarket */) {
        throw _rpcerrors.rpcErrors.invalidParams(
          `Invalid transaction envelope type: specified type "${txParams.type}" but including maxFeePerGas and maxPriorityFeePerGas requires type: "${"0x2" /* feeMarket */}"`
        );
      }
      break;
    case "gasPrice":
    default:
      if (txParams.type && txParams.type === "0x2" /* feeMarket */) {
        throw _rpcerrors.rpcErrors.invalidParams(
          `Invalid transaction envelope type: specified type "${txParams.type}" but included a gasPrice instead of maxFeePerGas and maxPriorityFeePerGas`
        );
      }
  }
}
function ensureMutuallyExclusiveFieldsNotProvided(txParams, fieldBeingValidated, mutuallyExclusiveField) {
  if (typeof txParams[mutuallyExclusiveField] !== "undefined") {
    throw _rpcerrors.rpcErrors.invalidParams(
      `Invalid transaction params: specified ${fieldBeingValidated} but also included ${mutuallyExclusiveField}, these cannot be mixed`
    );
  }
}
function ensureFieldIsString(txParams, field) {
  if (typeof txParams[field] !== "string") {
    throw _rpcerrors.rpcErrors.invalidParams(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `Invalid transaction params: ${field} is not a string. got: (${txParams[field]})`
    );
  }
}




exports.validateTransactionOrigin = validateTransactionOrigin; exports.validateTxParams = validateTxParams;
//# sourceMappingURL=chunk-RXIUMVA5.js.map