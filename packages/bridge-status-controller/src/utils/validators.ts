import { StatusTypes, BridgeAssetSchema } from '@metamask/bridge-controller';
import type { Infer } from '@metamask/superstruct';
import {
  string,
  boolean,
  number,
  optional,
  enums,
  union,
  type,
  assert,
  array,
  is,
} from '@metamask/superstruct';

import {
  QuoteStatusUpdateErrorType,
  QuoteStatusUpdateStatus,
} from '../constants';

const ChainIdSchema = number();

const EmptyObjectSchema = type({});

const SrcChainStatusSchema = type({
  chainId: ChainIdSchema,
  /**
   * The txHash of the transaction on the source chain.
   * This might be undefined for smart transactions (STX)
   */
  txHash: optional(string()),
  /**
   * The atomic amount of the token sent minus fees on the source chain
   */
  amount: optional(string()),
  token: optional(union([EmptyObjectSchema, BridgeAssetSchema])),
});

const DestChainStatusSchema = type({
  chainId: ChainIdSchema,
  txHash: optional(string()),
  /**
   * The atomic amount of the token received on the destination chain
   */
  amount: optional(string()),
  token: optional(union([EmptyObjectSchema, BridgeAssetSchema])),
});

const RefuelStatusResponseSchema = type({});

export const StatusResponseSchema = type({
  status: enums(Object.values(StatusTypes)),
  srcChain: SrcChainStatusSchema,
  destChain: optional(DestChainStatusSchema),
  bridge: optional(string()),
  isExpectedToken: optional(boolean()),
  isUnrecognizedRouterAddress: optional(boolean()),
  refuel: optional(RefuelStatusResponseSchema),
});

export const validateBridgeStatusResponse = (
  data: unknown,
): data is Infer<typeof StatusResponseSchema> => {
  assert(data, StatusResponseSchema);
  return true;
};

export enum IntentOrderStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

const IntentStatusResponseSchema = type({
  id: string(),
  status: enums(Object.values(IntentOrderStatus)),
  txHash: optional(string()),
  metadata: type({
    txHashes: optional(union([array(string()), string()])),
  }),
});

export type IntentStatusResponse = Infer<typeof IntentStatusResponseSchema>;

export const validateIntentStatusResponse = (
  data: unknown,
): data is IntentStatusResponse => {
  return is(data, IntentStatusResponseSchema);
};

const onChainMismatchTypes = [
  QuoteStatusUpdateErrorType.InvalidStatusTransaction,
  QuoteStatusUpdateErrorType.QuoteStatusOnChainMismatch,
] as const;

const baseErrorTypes = [
  QuoteStatusUpdateErrorType.QuoteNotFound,
  QuoteStatusUpdateErrorType.ConcurrentUpdate,
  QuoteStatusUpdateErrorType.SrcTxHashRequiredForFinalized,
  QuoteStatusUpdateErrorType.PersistQuoteStatusFailed,
  QuoteStatusUpdateErrorType.TransactionNotIndexed,
  QuoteStatusUpdateErrorType.TxDataMissingHash,
  QuoteStatusUpdateErrorType.TxDataMissingTrade,
  QuoteStatusUpdateErrorType.TxDataMismatch,
  QuoteStatusUpdateErrorType.SvmTradeDeserializeFailed,
] as const;

const quoteStatusUpdateStatusValues = [
  QuoteStatusUpdateStatus.Served,
  QuoteStatusUpdateStatus.Submitted,
  QuoteStatusUpdateStatus.FinalizedSuccess,
  QuoteStatusUpdateStatus.FinalizedFailed,
] as const;

const QuoteStatusUpdateResponseWithCurrentStatusSchema = type({
  statusCode: number(),
  message: string(),
  type: enums(onChainMismatchTypes),
  currentStatus: enums(quoteStatusUpdateStatusValues),
  newStatus: enums(quoteStatusUpdateStatusValues),
});

const QuoteStatusUpdateResponseBaseSchema = type({
  statusCode: number(),
  message: string(),
  type: enums(baseErrorTypes),
});

export const QuoteStatusUpdateResponseSchema = union([
  QuoteStatusUpdateResponseWithCurrentStatusSchema,
  QuoteStatusUpdateResponseBaseSchema,
]);

export type QuoteStatusUpdateResponse = Infer<
  typeof QuoteStatusUpdateResponseSchema
>;

export function validateQuoteStatusUpdateResponse(
  data: unknown,
): asserts data is QuoteStatusUpdateResponse {
  assert(data, QuoteStatusUpdateResponseSchema);
}
