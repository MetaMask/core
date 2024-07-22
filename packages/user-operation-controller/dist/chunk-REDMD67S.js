"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _chunkU7OA6TZZjs = require('./chunk-U7OA6TZZ.js');



var _chunkKQMYR73Xjs = require('./chunk-KQMYR73X.js');


var _chunkBTR56Y3Fjs = require('./chunk-BTR56Y3F.js');

// src/utils/gas.ts
var _controllerutils = require('@metamask/controller-utils');
var _utils = require('@metamask/utils');
var _bnjs = require('bn.js'); var _bnjs2 = _interopRequireDefault(_bnjs);
var log = _chunkKQMYR73Xjs.createModuleLogger.call(void 0, _chunkKQMYR73Xjs.projectLogger, "gas");
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
    maxFeePerGas: _chunkBTR56Y3Fjs.VALUE_ZERO,
    maxPriorityFeePerGas: _chunkBTR56Y3Fjs.VALUE_ZERO,
    callGasLimit: _chunkBTR56Y3Fjs.VALUE_ZERO,
    preVerificationGas: _chunkBTR56Y3Fjs.VALUE_ZERO,
    verificationGasLimit: "0xF4240"
  };
  const bundler = new (0, _chunkU7OA6TZZjs.Bundler)(metadata.bundlerUrl);
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
  const value = typeof rawValue === "string" ? _controllerutils.hexToBN.call(void 0, rawValue) : new (0, _bnjs2.default)(rawValue);
  const bufferedValue = value.muln(GAS_ESTIMATE_MULTIPLIER);
  return _utils.add0x.call(void 0, bufferedValue.toString(16));
}



exports.updateGas = updateGas;
//# sourceMappingURL=chunk-REDMD67S.js.map