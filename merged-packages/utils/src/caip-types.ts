import type { Infer, Struct } from '@metamask/superstruct';
import { is, pattern, string } from '@metamask/superstruct';

export const CAIP_CHAIN_ID_REGEX =
  /^(?<namespace>[-a-z0-9]{3,8}):(?<reference>[-_a-zA-Z0-9]{1,32})$/u;

export const CAIP_NAMESPACE_REGEX = /^[-a-z0-9]{3,8}$/u;

export const CAIP_REFERENCE_REGEX = /^[-_a-zA-Z0-9]{1,32}$/u;

export const CAIP_ACCOUNT_ID_REGEX =
  /^(?<chainId>(?<namespace>[-a-z0-9]{3,8}):(?<reference>[-_a-zA-Z0-9]{1,32})):(?<accountAddress>[-.%a-zA-Z0-9]{1,128})$/u;

export const CAIP_ACCOUNT_ADDRESS_REGEX = /^[-.%a-zA-Z0-9]{1,128}$/u;

export const CAIP_ASSET_NAMESPACE_REGEX = /^[-a-z0-9]{3,8}$/u;

export const CAIP_ASSET_REFERENCE_REGEX = /^[-.%a-zA-Z0-9]{1,128}$/u;

export const CAIP_TOKEN_ID_REGEX = /^[-.%a-zA-Z0-9]{1,78}$/u;

export const CAIP_ASSET_TYPE_REGEX =
  /^(?<chainId>(?<namespace>[-a-z0-9]{3,8}):(?<reference>[-_a-zA-Z0-9]{1,32}))\/(?<assetNamespace>[-a-z0-9]{3,8}):(?<assetReference>[-.%a-zA-Z0-9]{1,128})$/u;

export const CAIP_ASSET_ID_REGEX =
  /^(?<chainId>(?<namespace>[-a-z0-9]{3,8}):(?<reference>[-_a-zA-Z0-9]{1,32}))\/(?<assetNamespace>[-a-z0-9]{3,8}):(?<assetReference>[-.%a-zA-Z0-9]{1,128})\/(?<tokenId>[-.%a-zA-Z0-9]{1,78})$/u;

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

/**
 * A CAIP-19 asset namespace, i.e., a namespace domain of an asset.
 */
export const CaipAssetNamespaceStruct = pattern(
  string(),
  CAIP_ASSET_NAMESPACE_REGEX,
);
export type CaipAssetNamespace = Infer<typeof CaipAssetNamespaceStruct>;

/**
 * A CAIP-19 asset reference, i.e., an identifier for an asset within a given namespace.
 */
export const CaipAssetReferenceStruct = pattern(
  string(),
  CAIP_ASSET_REFERENCE_REGEX,
);
export type CaipAssetReference = Infer<typeof CaipAssetReferenceStruct>;

/**
 * A CAIP-19 asset token ID, i.e., a unique identifier for an addressable asset of a given type
 */
export const CaipTokenIdStruct = pattern(string(), CAIP_TOKEN_ID_REGEX);
export type CaipTokenId = Infer<typeof CaipTokenIdStruct>;

/**
 * A CAIP-19 asset type identifier, i.e., a human-readable type of asset identifier.
 */
export const CaipAssetTypeStruct = pattern(
  string(),
  CAIP_ASSET_TYPE_REGEX,
) as Struct<CaipAssetType, null>;
export type CaipAssetType = `${string}:${string}/${string}:${string}`;

/**
 * A CAIP-19 asset ID identifier, i.e., a human-readable type of asset ID.
 */
export const CaipAssetIdStruct = pattern(
  string(),
  CAIP_ASSET_ID_REGEX,
) as Struct<CaipAssetId, null>;
export type CaipAssetId = `${string}:${string}/${string}:${string}/${string}`;

/** Known CAIP namespaces. */
export enum KnownCaipNamespace {
  /** BIP-122 (Bitcoin) compatible chains. */
  Bip122 = 'bip122',
  /** Solana compatible chains */
  Solana = 'solana',
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
 * Check if the given value is a {@link CaipAssetNamespace}.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link CaipAssetNamespace}.
 */
export function isCaipAssetNamespace(
  value: unknown,
): value is CaipAssetNamespace {
  return is(value, CaipAssetNamespaceStruct);
}

/**
 * Check if the given value is a {@link CaipAssetReference}.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link CaipAssetReference}.
 */
export function isCaipAssetReference(
  value: unknown,
): value is CaipAssetReference {
  return is(value, CaipAssetReferenceStruct);
}

/**
 * Check if the given value is a {@link CaipTokenId}.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link CaipTokenId}.
 */
export function isCaipTokenId(value: unknown): value is CaipTokenId {
  return is(value, CaipTokenIdStruct);
}

/**
 * Check if the given value is a {@link CaipAssetType}.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link CaipAssetType}.
 */
export function isCaipAssetType(value: unknown): value is CaipAssetType {
  return is(value, CaipAssetTypeStruct);
}

/**
 * Check if the given value is a {@link CaipAssetId}.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link CaipAssetId}.
 */
export function isCaipAssetId(value: unknown): value is CaipAssetId {
  return is(value, CaipAssetIdStruct);
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
 * Parse a CAIP-19 asset type to an object containing the chain ID, parsed chain ID,
 * asset namespace, and asset reference
 *
 * This validates the CAIP-19 asset type before parsing it.
 *
 * @param caipAssetType - The CAIP-19 asset type to validate and parse.
 * @returns The parsed CAIP-19 asset type.
 */
export function parseCaipAssetType(caipAssetType: CaipAssetType): {
  assetNamespace: CaipAssetNamespace;
  assetReference: CaipAssetReference;
  chainId: CaipChainId;
  chain: { namespace: CaipNamespace; reference: CaipReference };
} {
  const match = CAIP_ASSET_TYPE_REGEX.exec(caipAssetType);
  if (!match?.groups) {
    throw new Error('Invalid CAIP asset type.');
  }

  return {
    assetNamespace: match.groups.assetNamespace as CaipAssetNamespace,
    assetReference: match.groups.assetReference as CaipAssetReference,
    chainId: match.groups.chainId as CaipChainId,
    chain: {
      namespace: match.groups.namespace as CaipNamespace,
      reference: match.groups.reference as CaipReference,
    },
  };
}

/**
 * Parse a CAIP-19 asset ID to an object containing the chain ID, parsed chain ID,
 * asset namespace, asset reference, and token ID.
 *
 * This validates the CAIP-19 asset ID before parsing it.
 *
 * @param caipAssetId - The CAIP-19 asset ID to validate and parse.
 * @returns The parsed CAIP-19 asset ID.
 */
export function parseCaipAssetId(caipAssetId: CaipAssetId): {
  assetNamespace: CaipAssetNamespace;
  assetReference: CaipAssetReference;
  tokenId: CaipTokenId;
  chainId: CaipChainId;
  chain: { namespace: CaipNamespace; reference: CaipReference };
} {
  const match = CAIP_ASSET_ID_REGEX.exec(caipAssetId);
  if (!match?.groups) {
    throw new Error('Invalid CAIP asset ID.');
  }

  return {
    assetNamespace: match.groups.assetNamespace as CaipAssetNamespace,
    assetReference: match.groups.assetReference as CaipAssetReference,
    tokenId: match.groups.tokenId as CaipTokenId,
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

/**
 * Account ID as defined per the CAIP-10
 * {@link https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-10.md}.
 *
 * It defines a way to uniquely identify any blockchain account in a human-readable
 * way.
 *
 * @param namespace - The standard (ecosystem) of similar blockchains.
 * @param reference - Identity of a blockchain within a given namespace.
 * @param accountAddress - The address of the blockchain account.
 * @throws {@link Error}
 * This exception is thrown if the inputs do not comply with the CAIP-10
 * syntax specification
 * {@link https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-10.md#syntax}.
 * @returns A CAIP account ID.
 */
export function toCaipAccountId(
  namespace: CaipNamespace,
  reference: CaipReference,
  accountAddress: CaipAccountAddress,
): CaipAccountId {
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

  if (!isCaipAccountAddress(accountAddress)) {
    throw new Error(
      `Invalid "accountAddress", must match: ${CAIP_ACCOUNT_ADDRESS_REGEX.toString()}`,
    );
  }

  return `${namespace}:${reference}:${accountAddress}`;
}

/**
 * Asset Type as defined per the CAIP-19
 * {@link https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-19.md}.
 *
 * It defines a way to uniquely identify any blockchain asset in a human-readable
 * way.
 *
 * @param namespace - The standard (ecosystem) of similar blockchains.
 * @param reference - Identity of a blockchain within a given namespace.
 * @param assetNamespace - The namespace domain of an asset.
 * @param assetReference - The identity of an asset within a given namespace.
 * @throws {@link Error}
 * This exception is thrown if the inputs do not comply with the CAIP-19
 * syntax specification
 * {@link https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-19.md#syntax}.
 * @returns A CAIP asset type.
 */
export function toCaipAssetType(
  namespace: CaipNamespace,
  reference: CaipReference,
  assetNamespace: CaipAssetNamespace,
  assetReference: CaipAssetReference,
): CaipAssetType {
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

  if (!isCaipAssetNamespace(assetNamespace)) {
    throw new Error(
      `Invalid "assetNamespace", must match: ${CAIP_ASSET_NAMESPACE_REGEX.toString()}`,
    );
  }

  if (!isCaipAssetReference(assetReference)) {
    throw new Error(
      `Invalid "assetReference", must match: ${CAIP_ASSET_REFERENCE_REGEX.toString()}`,
    );
  }

  return `${namespace}:${reference}/${assetNamespace}:${assetReference}`;
}

/**
 * Asset ID as defined per the CAIP-19
 * {@link https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-19.md}.
 *
 * It defines a way to uniquely identify any blockchain asset in a human-readable
 * way.
 *
 * @param namespace - The standard (ecosystem) of similar blockchains.
 * @param reference - Identity of a blockchain within a given namespace.
 * @param assetNamespace - The namespace domain of an asset.
 * @param assetReference - The identity of an asset within a given namespace.
 * @param tokenId - The unique identifier for an addressable asset of a given type.
 * @throws {@link Error}
 * This exception is thrown if the inputs do not comply with the CAIP-19
 * syntax specification
 * {@link https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-19.md#syntax}.
 * @returns A CAIP asset ID.
 */
export function toCaipAssetId(
  namespace: CaipNamespace,
  reference: CaipReference,
  assetNamespace: CaipAssetNamespace,
  assetReference: CaipAssetReference,
  tokenId: CaipTokenId,
): CaipAssetId {
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

  if (!isCaipAssetNamespace(assetNamespace)) {
    throw new Error(
      `Invalid "assetNamespace", must match: ${CAIP_ASSET_NAMESPACE_REGEX.toString()}`,
    );
  }

  if (!isCaipAssetReference(assetReference)) {
    throw new Error(
      `Invalid "assetReference", must match: ${CAIP_ASSET_REFERENCE_REGEX.toString()}`,
    );
  }

  if (!isCaipTokenId(tokenId)) {
    throw new Error(
      `Invalid "tokenId", must match: ${CAIP_TOKEN_ID_REGEX.toString()}`,
    );
  }

  return `${namespace}:${reference}/${assetNamespace}:${assetReference}/${tokenId}`;
}
