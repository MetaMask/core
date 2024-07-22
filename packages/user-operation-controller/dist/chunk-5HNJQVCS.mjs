import {
  EMPTY_BYTES
} from "./chunk-TPPISKNS.mjs";

// src/utils/validation.ts
import {
  assert,
  boolean,
  define,
  enums,
  func,
  number,
  object,
  optional,
  refine,
  string
} from "@metamask/superstruct";
import { TransactionType } from "@metamask/transaction-controller";
import { isStrictHexString } from "@metamask/utils";
function validateAddUserOperationRequest(request) {
  const Hex = defineHex();
  const HexOrEmptyBytes = defineHexOrEmptyBytes();
  const ValidRequest = object({
    data: optional(HexOrEmptyBytes),
    from: Hex,
    maxFeePerGas: optional(Hex),
    maxPriorityFeePerGas: optional(Hex),
    to: optional(Hex),
    value: optional(Hex)
  });
  validate(request, ValidRequest, "Invalid request to add user operation");
}
function validateAddUserOperationOptions(options) {
  const ValidOptions = object({
    networkClientId: string(),
    origin: string(),
    requireApproval: optional(boolean()),
    smartContractAccount: optional(
      object({
        prepareUserOperation: func(),
        updateUserOperation: func(),
        signUserOperation: func()
      })
    ),
    swaps: optional(
      object({
        approvalTxId: optional(string()),
        destinationTokenAddress: optional(string()),
        destinationTokenDecimals: optional(number()),
        destinationTokenSymbol: optional(string()),
        estimatedBaseFee: optional(string()),
        sourceTokenSymbol: optional(string()),
        swapMetaData: optional(object()),
        swapTokenValue: optional(string()),
        destinationTokenAmount: optional(string()),
        sourceTokenAddress: optional(string()),
        sourceTokenAmount: optional(string()),
        sourceTokenDecimals: optional(number()),
        swapAndSendRecipient: optional(string())
      })
    ),
    type: optional(enums(Object.values(TransactionType)))
  });
  validate(options, ValidOptions, "Invalid options to add user operation");
}
function validatePrepareUserOperationResponse(response) {
  const Hex = defineHex();
  const HexOrEmptyBytes = defineHexOrEmptyBytes();
  const ValidResponse = refine(
    object({
      bundler: string(),
      callData: Hex,
      dummyPaymasterAndData: optional(HexOrEmptyBytes),
      dummySignature: optional(HexOrEmptyBytes),
      gas: optional(
        object({
          callGasLimit: Hex,
          preVerificationGas: Hex,
          verificationGasLimit: Hex
        })
      ),
      initCode: optional(HexOrEmptyBytes),
      nonce: Hex,
      sender: Hex
    }),
    "ValidPrepareUserOperationResponse",
    ({ gas, dummySignature }) => {
      if (!gas && (!dummySignature || dummySignature === EMPTY_BYTES)) {
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
  const ValidResponse = optional(
    object({
      paymasterAndData: optional(defineHexOrEmptyBytes()),
      callGasLimit: optional(defineHexOrEmptyBytes()),
      preVerificationGas: optional(defineHexOrEmptyBytes()),
      verificationGasLimit: optional(defineHexOrEmptyBytes())
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
  const ValidResponse = object({
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
    assert(data, struct, message);
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
  return define(
    "Hexadecimal String",
    (value) => isStrictHexString(value)
  );
}
function defineHexOrEmptyBytes() {
  return define(
    "Hexadecimal String or 0x",
    (value) => isStrictHexString(value) || value === EMPTY_BYTES
  );
}

export {
  validateAddUserOperationRequest,
  validateAddUserOperationOptions,
  validatePrepareUserOperationResponse,
  validateUpdateUserOperationResponse,
  validateSignUserOperationResponse
};
//# sourceMappingURL=chunk-5HNJQVCS.mjs.map