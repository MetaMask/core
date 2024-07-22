import {
  Bundler
} from "./chunk-GURRJAHH.mjs";
import {
  createModuleLogger,
  projectLogger
} from "./chunk-DKF5XCNY.mjs";
import {
  VALUE_ZERO
} from "./chunk-TPPISKNS.mjs";

// src/utils/gas.ts
import { hexToBN } from "@metamask/controller-utils";
import { add0x } from "@metamask/utils";
import BN from "bn.js";
var log = createModuleLogger(projectLogger, "gas");
var GAS_ESTIMATE_MULTIPLIER = 1.5;
async function updateGas(metadata, prepareResponse, entrypoint) {
  const { userOperation } = metadata;
  if (prepareResponse.gas) {
    userOperation.callGasLimit = prepareResponse.gas.callGasLimit;
    userOperation.preVerificationGas = prepareResponse.gas.preVerificationGas;
    userOperation.verificationGasLimit = prepareResponse.gas.verificationGasLimit;
    log("Using gas values from smart contract account", {
      callGasLimit: userOperation.callGasLimit,
      preVerificationGas: userOperation.preVerificationGas,
      verificationGasLimit: userOperation.verificationGasLimit
    });
    return;
  }
  const payload = {
    ...userOperation,
    maxFeePerGas: VALUE_ZERO,
    maxPriorityFeePerGas: VALUE_ZERO,
    callGasLimit: VALUE_ZERO,
    preVerificationGas: VALUE_ZERO,
    verificationGasLimit: "0xF4240"
  };
  const bundler = new Bundler(metadata.bundlerUrl);
  const estimate = await bundler.estimateUserOperationGas(payload, entrypoint);
  userOperation.callGasLimit = normalizeGasEstimate(estimate.callGasLimit);
  userOperation.preVerificationGas = normalizeGasEstimate(
    estimate.preVerificationGas
  );
  userOperation.verificationGasLimit = normalizeGasEstimate(
    estimate.verificationGasLimit ?? estimate.verificationGas
  );
  log("Using buffered gas values from bundler estimate", {
    callGasLimit: userOperation.callGasLimit,
    preVerificationGas: userOperation.preVerificationGas,
    verificationGasLimit: userOperation.verificationGasLimit,
    multiplier: GAS_ESTIMATE_MULTIPLIER,
    estimate
  });
}
function normalizeGasEstimate(rawValue) {
  const value = typeof rawValue === "string" ? hexToBN(rawValue) : new BN(rawValue);
  const bufferedValue = value.muln(GAS_ESTIMATE_MULTIPLIER);
  return add0x(bufferedValue.toString(16));
}

export {
  updateGas
};
//# sourceMappingURL=chunk-CFYJ4HQ7.mjs.map