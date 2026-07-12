import {
  union,
  number,
  string,
  type,
  optional,
  enums,
  boolean,
  record,
  array,
  any,
} from '@metamask/superstruct';

import { TruthyDigitStringSchema } from './number';
import { HexString } from './trade';

// Allow digit strings for amounts/validTo for flexibility across providers
const DigitStringOrNumberSchema = union([TruthyDigitStringSchema, number()]);
/**
 * Identifier of the intent protocol used for order creation and submission.
 *
 * Examples:
 * - CoW Swap
 * - Other EIP-712–based intent protocols
 */
const IntentProtocolSchema = string();
/**
 * Schema for an intent-based order used for EIP-712 signing and submission.
 *
 * This represents the minimal subset of fields required by intent-based
 * protocols (e.g. CoW Swap) to build, sign, and submit an order.
 */

export const IntentOrderSchema = type({
  /**
   * Address of the token being sold.
   */
  sellToken: HexString,

  /**
   * Address of the token being bought.
   */
  buyToken: HexString,

  /**
   * Optional receiver of the bought tokens.
   * If omitted, defaults to the signer / order owner.
   */
  receiver: optional(HexString),

  /**
   * Order expiration time.
   *
   * Can be provided as a UNIX timestamp in seconds, either as a number
   * or as a digit string, depending on provider requirements.
   */
  validTo: DigitStringOrNumberSchema,

  /**
   * Arbitrary application-specific data attached to the order.
   */
  appData: string(),

  /**
   * Hash of the `appData` field, used for EIP-712 signing.
   */
  appDataHash: HexString,

  /**
   * Fee amount paid for order execution, expressed as a digit string.
   */
  feeAmount: TruthyDigitStringSchema,

  /**
   * Order kind.
   *
   * - `sell`: exact sell amount, variable buy amount
   * - `buy`: exact buy amount, variable sell amount
   */
  kind: enums(['sell', 'buy']),

  /**
   * Whether the order can be partially filled.
   */
  partiallyFillable: boolean(),

  /**
   * Exact amount of the sell token.
   *
   * Required for `sell` orders.
   */
  sellAmount: optional(TruthyDigitStringSchema),

  /**
   * Exact amount of the buy token.
   *
   * Required for `buy` orders.
   */
  buyAmount: optional(TruthyDigitStringSchema),

  /**
   * Optional order owner / sender address.
   *
   * Provided for convenience when building the EIP-712 domain and message.
   */
  from: optional(HexString),
});
/**
 * Schema representing an intent submission payload.
 *
 * Wraps the intent order along with protocol and optional routing metadata
 * required by the backend or relayer infrastructure.
 */

export const IntentSchema = type({
  /**
   * Identifier of the intent protocol used to interpret the order.
   */
  protocol: IntentProtocolSchema,

  /**
   * The intent order to be signed and submitted.
   */
  order: IntentOrderSchema,

  /**
   * Optional settlement contract address used for execution.
   */
  settlementContract: optional(HexString),

  /**
   * Optional EIP-712 typed data payload for signing.
   * Must be JSON-serializable and include required EIP-712 fields.
   */
  typedData: type({
    // Keep values as `any()` here. Using `unknown()` in this record causes
    // TS2321/TS2589 (excessive type instantiation depth) in bridge state
    // inference during build.
    types: record(
      string(),
      array(
        type({
          name: string(),
          type: string(),
        }),
      ),
    ),
    primaryType: string(),
    domain: record(string(), any()),
    message: record(string(), any()),
  }),
});
