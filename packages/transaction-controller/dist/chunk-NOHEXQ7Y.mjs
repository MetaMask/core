import {
  projectLogger
} from "./chunk-UQQWZT6C.mjs";

// src/utils/layer1-gas-fee-flow.ts
import { createModuleLogger } from "@metamask/utils";
var log = createModuleLogger(projectLogger, "layer-1-gas-fee-flow");
async function updateTransactionLayer1GasFee(request) {
  const layer1GasFee = await getTransactionLayer1GasFee(request);
  if (!layer1GasFee) {
    return;
  }
  const { transactionMeta } = request;
  transactionMeta.layer1GasFee = layer1GasFee;
  log("Updated layer 1 gas fee", layer1GasFee, transactionMeta.id);
}
function getLayer1GasFeeFlow(transactionMeta, layer1GasFeeFlows) {
  return layer1GasFeeFlows.find(
    (layer1GasFeeFlow) => layer1GasFeeFlow.matchesTransaction(transactionMeta)
  );
}
async function getTransactionLayer1GasFee({
  layer1GasFeeFlows,
  provider,
  transactionMeta
}) {
  const layer1GasFeeFlow = getLayer1GasFeeFlow(
    transactionMeta,
    layer1GasFeeFlows
  );
  if (!layer1GasFeeFlow) {
    return void 0;
  }
  log(
    "Found layer 1 gas fee flow",
    layer1GasFeeFlow.constructor.name,
    transactionMeta.id
  );
  try {
    const { layer1Fee } = await layer1GasFeeFlow.getLayer1Fee({
      provider,
      transactionMeta
    });
    return layer1Fee;
  } catch (error) {
    log("Failed to get layer 1 gas fee", transactionMeta.id, error);
    return void 0;
  }
}

export {
  updateTransactionLayer1GasFee,
  getTransactionLayer1GasFee
};
//# sourceMappingURL=chunk-NOHEXQ7Y.mjs.map