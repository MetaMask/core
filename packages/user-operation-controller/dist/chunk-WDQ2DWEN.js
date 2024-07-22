"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkBTR56Y3Fjs = require('./chunk-BTR56Y3F.js');

// src/utils/validation.ts











var _superstruct = require('@metamask/superstruct');
var _transactioncontroller = require('@metamask/transaction-controller');
var _utils = require('@metamask/utils');
function validateAddUserOperationRequest(request) {
  const Hex = defineHex();
  const HexOrEmptyBytes = defineHexOrEmptyBytes();
  const ValidRequest = _superstruct.object.call(void 0, {
    data: _superstruct.optional.call(void 0, HexOrEmptyBytes),
    from: Hex,
    maxFeePerGas: _superstruct.optional.call(void 0, Hex),
    maxPriorityFeePerGas: _superstruct.optional.call(void 0, Hex),
    to: _superstruct.optional.call(void 0, Hex),
    value: _superstruct.optional.call(void 0, Hex)
  });
  validate(request, ValidRequest, "Invalid request to add user operation");
}
function validateAddUserOperationOptions(options) {
  const ValidOptions = _superstruct.object.call(void 0, {
    networkClientId: _superstruct.string.call(void 0, ),
    origin: _superstruct.string.call(void 0, ),
    requireApproval: _superstruct.optional.call(void 0, _superstruct.boolean.call(void 0, )),
    smartContractAccount: _superstruct.optional.call(void 0, 
      _superstruct.object.call(void 0, {
        prepareUserOperation: _superstruct.func.call(void 0, ),
        updateUserOperation: _superstruct.func.call(void 0, ),
        signUserOperation: _superstruct.func.call(void 0, )
      })
    ),
    swaps: _superstruct.optional.call(void 0, 
      _superstruct.object.call(void 0, {
        approvalTxId: _superstruct.optional.call(void 0, _superstruct.string.call(void 0, )),
        destinationTokenAddress: _superstruct.optional.call(void 0, _superstruct.string.call(void 0, )),
        destinationTokenDecimals: _superstruct.optional.call(void 0, _superstruct.number.call(void 0, )),
        destinationTokenSymbol: _superstruct.optional.call(void 0, _superstruct.string.call(void 0, )),
        estimatedBaseFee: _superstruct.optional.call(void 0, _superstruct.string.call(void 0, )),
        sourceTokenSymbol: _superstruct.optional.call(void 0, _superstruct.string.call(void 0, )),
        swapMetaData: _superstruct.optional.call(void 0, _superstruct.object.call(void 0, )),
        swapTokenValue: _superstruct.optional.call(void 0, _superstruct.string.call(void 0, )),
        destinationTokenAmount: _superstruct.optional.call(void 0, _superstruct.string.call(void 0, )),
        sourceTokenAddress: _superstruct.optional.call(void 0, _superstruct.string.call(void 0, )),
        sourceTokenAmount: _superstruct.optional.call(void 0, _superstruct.string.call(void 0, )),
        sourceTokenDecimals: _superstruct.optional.call(void 0, _superstruct.number.call(void 0, )),
        swapAndSendRecipient: _superstruct.optional.call(void 0, _superstruct.string.call(void 0, ))
      })
    ),
    type: _superstruct.optional.call(void 0, _superstruct.enums.call(void 0, Object.values(_transactioncontroller.TransactionType)))
  });
  validate(options, ValidOptions, "Invalid options to add user operation");
}
function validatePrepareUserOperationResponse(response) {
  const Hex = defineHex();
  const HexOrEmptyBytes = defineHexOrEmptyBytes();
  const ValidResponse = _superstruct.refine.call(void 0, 
    _superstruct.object.call(void 0, {
      bundler: _superstruct.string.call(void 0, ),
      callData: Hex,
      dummyPaymasterAndData: _superstruct.optional.call(void 0, HexOrEmptyBytes),
      dummySignature: _superstruct.optional.call(void 0, HexOrEmptyBytes),
      gas: _superstruct.optional.call(void 0, 
        _superstruct.object.call(void 0, {
          callGasLimit: Hex,
          preVerificationGas: Hex,
          verificationGasLimit: Hex
        })
      ),
      initCode: _superstruct.optional.call(void 0, HexOrEmptyBytes),
      nonce: Hex,
      sender: Hex
    }),
    "ValidPrepareUserOperationResponse",
    ({ gas, dummySignature }) => {
      if (!gas && (!dummySignature || dummySignature === _chunkBTR56Y3Fjs.EMPTY_BYTES)) {
        return "Must specify dummySignature if not specifying gas";
      }
      return true;
    }
  );
  validate(
    response,
    ValidResponse,
    "Invalid response when preparing user operation"
  );
}
function validateUpdateUserOperationResponse(response) {
  const ValidResponse = _superstruct.optional.call(void 0, 
    _superstruct.object.call(void 0, {
      paymasterAndData: _superstruct.optional.call(void 0, defineHexOrEmptyBytes()),
      callGasLimit: _superstruct.optional.call(void 0, defineHexOrEmptyBytes()),
      preVerificationGas: _superstruct.optional.call(void 0, defineHexOrEmptyBytes()),
      verificationGasLimit: _superstruct.optional.call(void 0, defineHexOrEmptyBytes())
    })
  );
  validate(
    response,
    ValidResponse,
    "Invalid response when updating user operation"
  );
}
function validateSignUserOperationResponse(response) {
  const Hex = defineHex();
  const ValidResponse = _superstruct.object.call(void 0, {
    signature: Hex
  });
  validate(
    response,
    ValidResponse,
    "Invalid response when signing user operation"
  );
}
function validate(data, struct, message) {
  try {
    _superstruct.assert.call(void 0, data, struct, message);
  } catch (error) {
    const causes = error.failures().map((failure) => {
      if (!failure.path.length) {
        return failure.message;
      }
      return `${failure.path.join(".")} - ${failure.message}`;
    }).join("\n");
    const finalMessage = `${message}
${causes}`;
    throw new Error(finalMessage);
  }
}
function defineHex() {
  return _superstruct.define.call(void 0, 
    "Hexadecimal String",
    (value) => _utils.isStrictHexString.call(void 0, value)
  );
}
function defineHexOrEmptyBytes() {
  return _superstruct.define.call(void 0, 
    "Hexadecimal String or 0x",
    (value) => _utils.isStrictHexString.call(void 0, value) || value === _chunkBTR56Y3Fjs.EMPTY_BYTES
  );
}







exports.validateAddUserOperationRequest = validateAddUserOperationRequest; exports.validateAddUserOperationOptions = validateAddUserOperationOptions; exports.validatePrepareUserOperationResponse = validatePrepareUserOperationResponse; exports.validateUpdateUserOperationResponse = validateUpdateUserOperationResponse; exports.validateSignUserOperationResponse = validateSignUserOperationResponse;
//# sourceMappingURL=chunk-WDQ2DWEN.js.map