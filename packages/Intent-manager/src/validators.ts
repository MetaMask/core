import { isValidHexAddress } from '@metamask/controller-utils';
import type { Infer } from '@metamask/superstruct';
import {
  string,
  boolean,
  number,
  type,
  optional,
  enums,
  define,
  union,
  pattern,
} from '@metamask/superstruct';
import { isStrictHexString } from '@metamask/utils';

// Helper schemas for Intent validation
const HexAddressSchema = define<string>('HexAddress', (v: unknown) =>
  isValidHexAddress(v as string, { allowNonPrefixed: false }),
);

const HexStringSchema = define<string>('HexString', (v: unknown) =>
  isStrictHexString(v as string),
);

const TruthyDigitStringSchema = pattern(string(), /^\d+$/u);

// Allow digit strings for amounts/validTo for flexibility across providers
const DigitStringOrNumberSchema = union([TruthyDigitStringSchema, number()]);

// Intent support (e.g., CoW Swap EIP-712 order signing)
const IntentProtocolSchema = enums(['cowswap']);

export const IntentOrderSchema = type({
  // EIP-712 Order fields (subset required for signing/submission)
  sellToken: HexAddressSchema,
  buyToken: HexAddressSchema,
  receiver: optional(HexAddressSchema),
  validTo: DigitStringOrNumberSchema,
  appData: string(),
  appDataHash: HexStringSchema,
  feeAmount: TruthyDigitStringSchema,
  kind: enums(['sell', 'buy']),
  partiallyFillable: boolean(),
  // One of these is required by CoW depending on kind; we keep both optional here and rely on backend validation
  sellAmount: optional(TruthyDigitStringSchema),
  buyAmount: optional(TruthyDigitStringSchema),
  // Optional owner/from for convenience when building domain/message
  from: optional(HexAddressSchema),
});

export const IntentSchema = type({
  protocol: IntentProtocolSchema,
  order: IntentOrderSchema,
  // Optional metadata to aid submission/routing
  settlementContract: optional(HexAddressSchema),
  relayer: optional(HexAddressSchema),
});

// Export types for use in other modules
export type IntentOrder = Infer<typeof IntentOrderSchema>;
export type Intent = Infer<typeof IntentSchema>;
