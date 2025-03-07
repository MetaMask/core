export * from './Caveat';
export * from './errors';
export * from './Permission';
export * from './PermissionController';
export type {
  ExtractSpecifications,
  HandlerMiddlewareFunction,
  HookNames,
  PermittedHandlerExport,
} from './utils';
export { MethodNames } from './utils';
export * as legacyPermissionRpcMethods from './rpc-methods/legacy';
export * from './SubjectMetadataController';

export { getPermissionsHandler } from './rpc-methods/caip-25/wallet-getPermissions';
export { requestPermissionsHandler } from './rpc-methods/caip-25/wallet-requestPermissions';
export { revokePermissionsHandler } from './rpc-methods/caip-25/wallet-revokePermissions';
