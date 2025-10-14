import type {
  Caip25CaveatType,
  Caip25CaveatValue,
} from '@metamask/chain-agnostic-permission';
import type {
  Caveat,
  CaveatSpecificationConstraint,
  PermissionController,
  PermissionSpecificationConstraint,
} from '@metamask/permission-controller';

/**
 * Multichain API notifications currently supported by/known to the wallet.
 */
export enum MultichainApiNotifications {
  sessionChanged = 'wallet_sessionChanged',
  walletNotify = 'wallet_notify',
}
type AbstractPermissionController = PermissionController<
  PermissionSpecificationConstraint,
  CaveatSpecificationConstraint
>;

export type GrantedPermissions = Awaited<
  ReturnType<AbstractPermissionController['requestPermissions']>
>[0];

export type WalletRevokeSessionHooks = {
  revokePermissionForOrigin: (permissionName: string) => void;
  updateCaveat: (
    target: string,
    caveatType: string,
    caveatValue: Caip25CaveatValue,
  ) => void;
  getCaveatForOrigin: (
    endowmentPermissionName: string,
    caveatType: string,
  ) => Caveat<typeof Caip25CaveatType, Caip25CaveatValue>;
};
