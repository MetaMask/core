import {
  isCaipNamespace,
  isCaipChainId,
  parseCaipChainId,
} from '@metamask/utils';
import type {
  CaipChainId,
  CaipReference,
  CaipAccountId,
  KnownCaipNamespace,
  CaipNamespace,
  Json,
} from '@metamask/utils';

/**
 * Represents a `scopeString` as defined in [CAIP-217](https://chainagnostic.org/CAIPs/caip-217).
 */
export type ExternalScopeString = CaipChainId | CaipNamespace;
/**
 * Represents a `scopeObject` as defined in [CAIP-217](https://chainagnostic.org/CAIPs/caip-217).
 */
export type ExternalScopeObject = Omit<InternalScopeObject, 'accounts'> & {
  references?: CaipReference[];
  accounts?: CaipAccountId[];
};
/**
 * Represents a `scope` as defined in [CAIP-217](https://chainagnostic.org/CAIPs/caip-217).
 * TODO update the language in CAIP-217 to use "scope" instead of "scopeObject" for this full record type.
 */
export type ExternalScopesObject = Record<
  ExternalScopeString,
  ExternalScopeObject
>;

/**
 * Represents a `scopeString` as defined in
 * [CAIP-217](https://chainagnostic.org/CAIPs/caip-217), with the exception that
 * CAIP namespaces (aside from "wallet") are disallowed for our internal representations of CAIP-25 session scopes
 */
export type InternalScopeString = CaipChainId | KnownCaipNamespace.Wallet;
/**
 * Represents a `scopeObject` as defined in
 * [CAIP-217](https://chainagnostic.org/CAIPs/caip-217), with the exception that
 * the `references` property is disallowed for our internal representations of CAIP-25 session scopes.
 * e.g. We flatten each reference into its own scopeObject before storing them in a `endowment:caip25` permission.
 */
export type InternalScopeObject = {
  methods: string[];
  notifications: string[];
  accounts: CaipAccountId[];
  rpcDocuments?: string[];
  rpcEndpoints?: string[];
};
/**
 * Represents a keyed `scopeObject` as defined in
 * [CAIP-217](https://chainagnostic.org/CAIPs/caip-217), with the exception that
 * `scopeObject`s do not contain `references` in our internal representations of CAIP-25 session scopes.
 * e.g. We flatten each reference into its own scopeObject before storing them in a `endowment:caip25` permission.
 */
export type InternalScopesObject = Record<CaipChainId, InternalScopeObject> & {
  [KnownCaipNamespace.Wallet]?: InternalScopeObject;
};

export type ScopedProperties = Record<CaipChainId, Record<string, Json>> & {
  [KnownCaipNamespace.Wallet]?: Record<string, Json>;
};

export const parseScopeString = (
  scopeString: string,
): {
  namespace?: string;
  reference?: string;
} => {
  if (isCaipNamespace(scopeString)) {
    return {
      namespace: scopeString,
    };
  }
  if (isCaipChainId(scopeString)) {
    return parseCaipChainId(scopeString);
  }

  return {};
};

// ScopeString for ecosystems that aren't chain specific
export enum KnownWalletScopeString {
  Eip155 = 'wallet:eip155',
}

// Known CAIP Namespaces excluding "wallet"
export type NonWalletKnownCaipNamespace = Exclude<
  KnownCaipNamespace,
  KnownCaipNamespace.Wallet
>;
