import { is, pattern, string } from '@metamask/superstruct';
import type { Infer, Struct } from '@metamask/superstruct';

export const CAIP_CHAIN_ID_REGEX =
  /^(?<namespace>[-a-z0-9]{3,8}):(?<reference>[-_a-zA-Z0-9]{1,32})$/u;

export const CAIP_NAMESPACE_REGEX = /^[-a-z0-9]{3,8}$/u;

export const CAIP_REFERENCE_REGEX = /^[-_a-zA-Z0-9]{1,32}$/u;

export const CAIP_ACCOUNT_ID_REGEX =
  /^(?<chainId>(?<namespace>[-a-z0-9]{3,8}):(?<reference>[-_a-zA-Z0-9]{1,32})):(?<accountAddress>[-.%a-zA-Z0-9]{1,128})$/u;

export const CAIP_ACCOUNT_ADDRESS_REGEX = /^[-.%a-zA-Z0-9]{1,128}$/u;

/**
 * A CAIP-2 chain ID, i.e., a human-readable namespace and reference.
 */
export const CaipChainIdStruct = pattern(
  string(),
  CAIP_CHAIN_ID_REGEX,
) as Struct<CaipChainId, null>;
export type CaipChainId = `${string}:${string}`;

/**
 * A CAIP-2 namespace, i.e., the first part of a CAIP chain ID.
 */
export const CaipNamespaceStruct = pattern(string(), CAIP_NAMESPACE_REGEX);
export type CaipNamespace = Infer<typeof CaipNamespaceStruct>;

/**
 * A CAIP-2 reference, i.e., the second part of a CAIP chain ID.
 */
export const CaipReferenceStruct = pattern(string(), CAIP_REFERENCE_REGEX);
export type CaipReference = Infer<typeof CaipReferenceStruct>;

/**
 * A CAIP-10 account ID, i.e., a human-readable namespace, reference, and account address.
 */
export const CaipAccountIdStruct = pattern(
  string(),
  CAIP_ACCOUNT_ID_REGEX,
) as Struct<CaipAccountId, null>;
export type CaipAccountId = `${string}:${string}:${string}`;

/**
 * A CAIP-10 account address, i.e., the third part of the CAIP account ID.
 */
export const CaipAccountAddressStruct = pattern(
  string(),
  CAIP_ACCOUNT_ADDRESS_REGEX,
);
export type CaipAccountAddress = Infer<typeof CaipAccountAddressStruct>;

/** Known CAIP namespaces. */
export enum KnownCaipNamespace {
  /** EIP-155 compatible chains. */
  Eip155 = 'eip155',
  Wallet = 'wallet',
}

/**
 * Check if the given value is a {@link CaipChainId}.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link CaipChainId}.
 */
export function isCaipChainId(value: unknown): value is CaipChainId {
  return is(value, CaipChainIdStruct);
}

/**
 * Check if the given value is a {@link CaipNamespace}.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link CaipNamespace}.
 */
export function isCaipNamespace(value: unknown): value is CaipNamespace {
  return is(value, CaipNamespaceStruct);
}

/**
 * Check if the given value is a {@link CaipReference}.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link CaipReference}.
 */
export function isCaipReference(value: unknown): value is CaipReference {
  return is(value, CaipReferenceStruct);
}

/**
 * Check if the given value is a {@link CaipAccountId}.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link CaipAccountId}.
 */
export function isCaipAccountId(value: unknown): value is CaipAccountId {
  return is(value, CaipAccountIdStruct);
}

/**
 * Check if a value is a {@link CaipAccountAddress}.
 *
 * @param value - The value to validate.
 * @returns True if the value is a valid {@link CaipAccountAddress}.
 */
export function isCaipAccountAddress(
  value: unknown,
): value is CaipAccountAddress {
  return is(value, CaipAccountAddressStruct);
}

/**
 * Parse a CAIP-2 chain ID to an object containing the namespace and reference.
 * This validates the CAIP-2 chain ID before parsing it.
 *
 * @param caipChainId - The CAIP-2 chain ID to validate and parse.
 * @returns The parsed CAIP-2 chain ID.
 */
export function parseCaipChainId(caipChainId: CaipChainId): {
  namespace: CaipNamespace;
  reference: CaipReference;
} {
  const match = CAIP_CHAIN_ID_REGEX.exec(caipChainId);
  if (!match?.groups) {
    throw new Error('Invalid CAIP chain ID.');
  }

  return {
    namespace: match.groups.namespace as CaipNamespace,
    reference: match.groups.reference as CaipReference,
  };
}

/**
 * Parse an CAIP-10 account ID to an object containing the chain ID, parsed chain ID, and account address.
 * This validates the CAIP-10 account ID before parsing it.
 *
 * @param caipAccountId - The CAIP-10 account ID to validate and parse.
 * @returns The parsed CAIP-10 account ID.
 */
export function parseCaipAccountId(caipAccountId: CaipAccountId): {
  address: CaipAccountAddress;
  chainId: CaipChainId;
  chain: { namespace: CaipNamespace; reference: CaipReference };
} {
  const match = CAIP_ACCOUNT_ID_REGEX.exec(caipAccountId);
  if (!match?.groups) {
    throw new Error('Invalid CAIP account ID.');
  }

  return {
    address: match.groups.accountAddress as CaipAccountAddress,
    chainId: match.groups.chainId as CaipChainId,
    chain: {
      namespace: match.groups.namespace as CaipNamespace,
      reference: match.groups.reference as CaipReference,
    },
  };
}

/**
 * Chain ID as defined per the CAIP-2
 * {@link https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md}.
 *
 * It defines a way to uniquely identify any blockchain in a human-readable
 * way.
 *
 * @param namespace - The standard (ecosystem) of similar blockchains.
 * @param reference - Identify of a blockchain within a given namespace.
 * @throws {@link Error}
 * This exception is thrown if the inputs does not comply with the CAIP-2
 * syntax specification
 * {@link https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md#syntax}.
 * @returns A CAIP chain ID.
 */
export function toCaipChainId(
  namespace: CaipNamespace,
  reference: CaipReference,
): CaipChainId {
  if (!isCaipNamespace(namespace)) {
    throw new Error(
      `Invalid "namespace", must match: ${CAIP_NAMESPACE_REGEX.toString()}`,
    );
  }

  if (!isCaipReference(reference)) {
    throw new Error(
      `Invalid "reference", must match: ${CAIP_REFERENCE_REGEX.toString()}`,
    );
  }

  return `${namespace}:${reference}`;
}
