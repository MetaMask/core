History transition table
Transaction listener should match post-txMeta success/failure with the history key

init = pre-confirmation until right before TransactionController adds the tx to state

| submission strategy         | phase                                 | history key    | listener matches |
| --------------------------- | ------------------------------------- | -------------- | ---------------- |
| batch-sell 7702             | init                                  | batchId        | yes              |
| batch-sell 7702 child swaps | success/failure                       | quoteId        | no               |
| batch-sell 7702             | success/failure                       | txMetaId       | yes              |
| batch-sell STX              | init                                  | batchId        | no               |
| batch-sell STX child swaps  | success/failure                       | txMetaId       | yes              |
| non-evm                     | init/success/failure                  | txHash         | no               |
| batch                       | init                                  | batchId        | yes              |
| batch                       | success/failure                       | txMetaId       | yes              |
| evm                         | init                                  | actionId       | yes              |
| evm                         | approval success                      | trade actionId | yes              |
| evm                         | trade success                         | trade txMetaId | yes              |
| evm                         | post-txMeta trade failure             | trade txMetaId | yes              |
| intent                      | init/approval/order/synthetic success | orderId        | yes, but noop    |
