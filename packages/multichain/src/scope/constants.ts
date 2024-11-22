import MetaMaskOpenRPCDocument from '@metamask/api-specs';

import type { NonWalletKnownCaipNamespace } from './types';

/**
 * ScopeStrings for offchain methods that are not specific to a chainId but are specific to a CAIP namespace.
 */
export enum KnownWalletScopeString {
  Eip155 = 'wallet:eip155',
}

/**
 * Regexes defining how references must be formed for non-wallet known CAIP namespaces
 */
export const CaipReferenceRegexes: Record<NonWalletKnownCaipNamespace, RegExp> =
  {
    eip155: /^(0|[1-9][0-9]*)$/u,
    bip122: /.*/u,
  };

/**
 * Methods that do not belong exclusively to any CAIP namespace.
 */
export const KnownWalletRpcMethods: string[] = [
  'wallet_registerOnboarding',
  'wallet_scanQRCode',
];

const WalletEip155Methods = ['wallet_addEthereumChain'];

const Eip1193OnlyMethods = [
  'wallet_switchEthereumChain',
  'wallet_getPermissions',
  'wallet_requestPermissions',
  'wallet_revokePermissions',
  'eth_requestAccounts',
  'eth_accounts',
  'eth_coinbase',
  'net_version',
]

/**
 * All MetaMask methods, except for ones we have specified in the constants above.
 */
const Eip155Methods = MetaMaskOpenRPCDocument.methods
  .map(({ name }: { name: string }) => name)
  .filter((method: string) => !WalletEip155Methods.includes(method))
  .filter((method: string) => !KnownWalletRpcMethods.includes(method))
  .filter((method: string) => !Eip1193OnlyMethods.includes(method))

/**
 * Methods by ecosystem that are chain specific.
 */
export const KnownRpcMethods: Record<NonWalletKnownCaipNamespace, string[]> = {
  eip155: Eip155Methods,
  bip122: [],
};

/**
 * Methods for CAIP namespaces that aren't chain specific.
 */
export const KnownWalletNamespaceRpcMethods: Record<
  NonWalletKnownCaipNamespace,
  string[]
> = {
  eip155: WalletEip155Methods,
  bip122: [],
};

/**
 * Notifications for known CAIP namespaces.
 */
export const KnownNotifications: Record<NonWalletKnownCaipNamespace, string[]> =
  {
    eip155: ['eth_subscription'],
    bip122: [],
  };
