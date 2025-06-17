import type { SIWEMessage } from '@metamask/controller-utils';

/**
 * AbstractMessageParams
 *
 * Represents the parameters to pass to the signing method once the signature request is approved.
 *
 * from - Address from which the message is processed
 * origin? - Added for request origin identification
 * requestId? - Original request id
 * deferSetAsSigned? - Whether to defer setting the message as signed immediately after the keyring is told to sign it
 */
export type AbstractMessageParams = {
  from: string;
  origin?: string;
  requestId?: number;
  deferSetAsSigned?: boolean;
};

/**
 * Eip7702AuthorizationParams
 *
 * Represents the parameters for EIP-7702 authorization signing requests.
 *
 * chainId - The chain ID
 * contractAddress - The contract address
 * nonce - The nonce
 */
export type Eip7702AuthorizationParams = {
  chainId: number;
  contractAddress: string;
  nonce: number;
} & AbstractMessageParams;

/**
 * PersonalMessageParams
 *
 * Represents the parameters for personal signing messages.
 *
 * data - The data to sign
 * siwe? - The SIWE message
 */
export type PersonalMessageParams = {
  data: string;
  siwe?: SIWEMessage;
} & AbstractMessageParams;

/**
 * SignTypedDataMessageV3V4
 *
 * Represents the structure of a typed data message for EIP-712 signing requests.
 *
 * types - The types of the message
 * domain - The domain of the message
 * primaryType - The primary type of the message
 * message - The message
 */
export type SignTypedDataMessageV3V4 = {
  types: Record<string, unknown>;
  domain: Record<string, unknown>;
  primaryType: string;
  message: unknown;
};

/**
 * TypedMessageParams
 *
 * Represents the parameters for typed signing messages.
 *
 * data - The data to sign
 */
export type TypedMessageParams = {
  data: Record<string, unknown>[] | string | SignTypedDataMessageV3V4;
} & AbstractMessageParams;
