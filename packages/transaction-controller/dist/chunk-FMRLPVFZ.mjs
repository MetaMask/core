import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/gas-flows/TestGasFeeFlow.ts
import { toHex } from "@metamask/controller-utils";
var INCREMENT = 1e15;
var LEVEL_DIFFERENCE = 0.5;
var _counter, _getValueForTotalFee, getValueForTotalFee_fn;
var TestGasFeeFlow = class {
  constructor() {
    __privateAdd(this, _getValueForTotalFee);
    __privateAdd(this, _counter, 1);
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
    const mediumMaxTarget = (__privateGet(this, _counter) + 1) * INCREMENT;
    const mediumPriorityTarget = __privateGet(this, _counter) * INCREMENT;
    const lowMaxTarget = mediumMaxTarget - difference;
    const lowPriorityTarget = mediumPriorityTarget - difference;
    const highMaxTarget = mediumMaxTarget + difference;
    const highPriorityTarget = mediumPriorityTarget + difference;
    __privateSet(this, _counter, __privateGet(this, _counter) + 1);
    return {
      estimates: {
        type: "fee-market" /* FeeMarket */,
        low: {
          maxFeePerGas: __privateMethod(this, _getValueForTotalFee, getValueForTotalFee_fn).call(this, lowMaxTarget, gasDecimal),
          maxPriorityFeePerGas: __privateMethod(this, _getValueForTotalFee, getValueForTotalFee_fn).call(this, lowPriorityTarget, gasDecimal)
        },
        medium: {
          maxFeePerGas: __privateMethod(this, _getValueForTotalFee, getValueForTotalFee_fn).call(this, mediumMaxTarget, gasDecimal),
          maxPriorityFeePerGas: __privateMethod(this, _getValueForTotalFee, getValueForTotalFee_fn).call(this, mediumPriorityTarget, gasDecimal)
        },
        high: {
          maxFeePerGas: __privateMethod(this, _getValueForTotalFee, getValueForTotalFee_fn).call(this, highMaxTarget, gasDecimal),
          maxPriorityFeePerGas: __privateMethod(this, _getValueForTotalFee, getValueForTotalFee_fn).call(this, highPriorityTarget, gasDecimal)
        }
      }
    };
  }
};
_counter = new WeakMap();
_getValueForTotalFee = new WeakSet();
getValueForTotalFee_fn = function(totalFee, gas) {
  const feeDecimal = Math.ceil(totalFee / gas);
  return toHex(feeDecimal);
};

export {
  TestGasFeeFlow
};
//# sourceMappingURL=chunk-FMRLPVFZ.mjs.map