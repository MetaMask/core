import MetaMaskOpenRPCDocument from '@metamask/api-specs';
import type { KnownCaipNamespace } from '@metamask/utils';

// ScopeString for ecosystems that aren't chain specific
export enum KnownWalletScopeString {
  Eip155 = 'wallet:eip155',
}

// Known CAIP Namespaces excluding "wallet"
export type NonWalletKnownCaipNamespace = Exclude<
  KnownCaipNamespace,
  KnownCaipNamespace.Wallet
>;

// Methods that do not belong to an ecosystem
export const KnownWalletRpcMethods: string[] = [
  'wallet_registerOnboarding',
  'wallet_scanQRCode',
];

const WalletEip155Methods = ['wallet_addEthereumChain'];

// All MetaMask methods, except for ones we have
// specified in the constants above
const Eip155Methods = MetaMaskOpenRPCDocument.methods
  .map(({ name }: { name: string }) => name)
  .filter((method: string) => !WalletEip155Methods.includes(method))
  .filter((method: string) => !KnownWalletRpcMethods.includes(method));

// Methods for ecosystem that are chain specific
export const KnownRpcMethods: Record<NonWalletKnownCaipNamespace, string[]> = {
  eip155: Eip155Methods,
  bip122: [],
};

// Methods for ecosystems that aren't chain specific
export const KnownWalletNamespaceRpcMethods: Record<
  NonWalletKnownCaipNamespace,
  string[]
> = {
  eip155: WalletEip155Methods,
  bip122: [],
};

// Notifications
export const KnownNotifications: Record<NonWalletKnownCaipNamespace, string[]> =
  {
    eip155: ['eth_subscription'],
    bip122: [],
  };
