import {
  intersection,
  type,
  array,
  enums,
  optional,
  assert,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { StrictHexStruct } from '@metamask/utils';

import { BridgeAssetSchema } from './bridge-asset';
import { NumberStringSchema } from './number';
import { GaslessPropertiesSchema } from './quote';
import { TxDataSchema } from './trade';

export enum BatchSellTransactionType {
  TRADE = 'trade',
  APPROVAL = 'approval',
  TRANSFER = 'transfer',
}

export const SimulatedGasFeeLimitsSchema = type({
  maxFeePerGas: StrictHexStruct,
  maxPriorityFeePerGas: StrictHexStruct,
});

export const BatchSellTradesResponseSchema = intersection([
  type({
    transactions: array(
      intersection([
        TxDataSchema,
        SimulatedGasFeeLimitsSchema,
        type({ type: enums(Object.values(BatchSellTransactionType)) }),
      ]),
    ),
    fee: optional(
      type({
        asset: BridgeAssetSchema,
        amount: NumberStringSchema,
      }),
    ),
  }),
  GaslessPropertiesSchema,
]);

export const validateBatchSellTradesResponse = (
  data: unknown,
): data is Infer<typeof BatchSellTradesResponseSchema> => {
  assert(data, BatchSellTradesResponseSchema);
  return true;
};
