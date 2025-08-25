export { default as GatorPermissionsController } from './GatorPermissionsController';
export {
  serializeGatorPermissionsMap,
  deserializeGatorPermissionsMap,
} from './utils';
export type {
  GatorPermissionsControllerState,
  GatorPermissionsControllerMessenger,
  GatorPermissionsControllerGetStateAction,
  GatorPermissionsControllerFetchAndUpdateGatorPermissionsAction,
  GatorPermissionsControllerEnableGatorPermissionsAction,
  GatorPermissionsControllerDisableGatorPermissionsAction,
  GatorPermissionsControllerActions,
  GatorPermissionsControllerEvents,
  GatorPermissionsControllerStateChangeEvent,
} from './GatorPermissionsController';
export type {
  GatorPermissionsControllerErrorCode,
  GatorPermissionsSnapRpcMethod,
  MetaMaskBasePermissionData,
  CustomPermission,
  PermissionTypesWithCustom,
  PermissionRequest,
  PermissionResponse,
  PermissionResponseSanitized,
  StoredGatorPermission,
  StoredGatorPermissionSanitized,
  GatorPermissionsMap,
  SupportedGatorPermissionType,
  GatorPermissionsMapByPermissionType,
  GatorPermissionsListByPermissionTypeAndChainId,
} from './types';

export type {
  NativeTokenStreamPermission,
  NativeTokenPeriodicPermission,
  Erc20TokenStreamPermission,
  Erc20TokenPeriodicPermission,
  AccountSigner,
  WalletSigner,
  Signer,
} from '@metamask/7715-permission-types';
