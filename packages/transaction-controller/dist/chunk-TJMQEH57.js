"use strict";Object.defineProperty(exports, "__esModule", {value: true});




var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/gas-flows/TestGasFeeFlow.ts
var _controllerutils = require('@metamask/controller-utils');
var INCREMENT = 1e15;
var LEVEL_DIFFERENCE = 0.5;
var _counter, _getValueForTotalFee, getValueForTotalFee_fn;
var TestGasFeeFlow = class {
  constructor() {
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getValueForTotalFee);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _counter, 1);
  }
  matchesTransaction(_transactionMeta) {
    return true;
  }
  async getGasFees(request) {
    const { transactionMeta } = request;
    const { txParams } = transactionMeta;
    const { gas: gasHex } = txParams;
    if (!gasHex) {
      throw new Error("Cannot estimate fee without gas value");
    }
    const gasDecimal = parseInt(gasHex, 16);
    const difference = INCREMENT * LEVEL_DIFFERENCE;
    const mediumMaxTarget = (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _counter) + 1) * INCREMENT;
    const mediumPriorityTarget = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _counter) * INCREMENT;
    const lowMaxTarget = mediumMaxTarget - difference;
    const lowPriorityTarget = mediumPriorityTarget - difference;
    const highMaxTarget = mediumMaxTarget + difference;
    const highPriorityTarget = mediumPriorityTarget + difference;
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _counter, _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _counter) + 1);
    return {
      estimates: {
        type: "fee-market" /* FeeMarket */,
        low: {
          maxFeePerGas: _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getValueForTotalFee, getValueForTotalFee_fn).call(this, lowMaxTarget, gasDecimal),
          maxPriorityFeePerGas: _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getValueForTotalFee, getValueForTotalFee_fn).call(this, lowPriorityTarget, gasDecimal)
        },
        medium: {
          maxFeePerGas: _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getValueForTotalFee, getValueForTotalFee_fn).call(this, mediumMaxTarget, gasDecimal),
          maxPriorityFeePerGas: _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getValueForTotalFee, getValueForTotalFee_fn).call(this, mediumPriorityTarget, gasDecimal)
        },
        high: {
          maxFeePerGas: _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getValueForTotalFee, getValueForTotalFee_fn).call(this, highMaxTarget, gasDecimal),
          maxPriorityFeePerGas: _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getValueForTotalFee, getValueForTotalFee_fn).call(this, highPriorityTarget, gasDecimal)
        }
      }
    };
  }
};
_counter = new WeakMap();
_getValueForTotalFee = new WeakSet();
getValueForTotalFee_fn = function(totalFee, gas) {
  const feeDecimal = Math.ceil(totalFee / gas);
  return _controllerutils.toHex.call(void 0, feeDecimal);
};



exports.TestGasFeeFlow = TestGasFeeFlow;
//# sourceMappingURL=chunk-TJMQEH57.js.map