import type {
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
