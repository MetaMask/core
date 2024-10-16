import MetaMaskOpenRPCDocument from '@metamask/api-specs';
import type {
  CaipChainId,
  CaipReference,
  CaipAccountId,
  KnownCaipNamespace,
  CaipNamespace,
} from '@metamask/utils';
import {
  isCaipNamespace,
  isCaipChainId,
  parseCaipChainId,
} from '@metamask/utils';

export enum KnownWalletScopeString {
  Eip155 = 'wallet:eip155',
}

export type NonWalletKnownCaipNamespace = Extract<
  KnownCaipNamespace,
  KnownCaipNamespace.Eip155
>;

export const KnownWalletRpcMethods: string[] = [
  'wallet_registerOnboarding',
  'wallet_scanQRCode',
];
const WalletEip155Methods = ['wallet_addEthereumChain'];

const Eip155Methods = MetaMaskOpenRPCDocument.methods
  .map(({ name }: { name: string }) => name)
  .filter((method: string) => !WalletEip155Methods.includes(method))
  .filter((method: string) => !KnownWalletRpcMethods.includes(method));

export const KnownRpcMethods: Record<NonWalletKnownCaipNamespace, string[]> = {
  eip155: Eip155Methods,
};

export const KnownWalletNamespaceRpcMethods: Record<
  NonWalletKnownCaipNamespace,
  string[]
> = {
  eip155: WalletEip155Methods,
};

export const KnownNotifications: Record<NonWalletKnownCaipNamespace, string[]> =
  {
    eip155: ['accountsChanged', 'chainChanged', 'eth_subscription'],
  };

// These External prefixed types represent the CAIP-217
// Scope and ScopeObject as defined in the spec.
export type ExternalScopeString = CaipChainId | CaipNamespace;
export type ExternalScopeObject = Omit<ScopeObject, 'accounts'> & {
  references?: CaipReference[];
  accounts?: CaipAccountId[];
};
export type ExternalScopesObject = Record<
  ExternalScopeString,
  ExternalScopeObject
>;

// These non-prefixed types represent CAIP-217 Scope and
// ScopeObject as defined by the spec but without
// namespace-only Scopes (except for "wallet") and without
// the `references` array of CAIP References on the ScopeObject.
// These deviations from the spec are necessary as MetaMask
// does not support wildcarded Scopes, i.e. Scopes that only
// specify a namespace but no specific reference.
export type ScopeString = CaipChainId | KnownCaipNamespace.Wallet;
export type ScopeObject = {
  methods: string[];
  notifications: string[];
  accounts: CaipAccountId[];
  rpcDocuments?: string[];
  rpcEndpoints?: string[];
};
export type ScopesObject = Record<CaipChainId, ScopeObject> & {
  [KnownCaipNamespace.Wallet]?: ScopeObject;
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

export type ScopedProperties = Record<
  ExternalScopeString,
  Record<string, unknown>
>;
