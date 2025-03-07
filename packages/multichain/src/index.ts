export {
  getEthAccounts,
  setEthAccounts,
} from './adapters/caip-permission-adapter-eth-accounts';
export {
  getPermittedEthChainIds,
  addPermittedEthChainId,
  setPermittedEthChainIds,
} from './adapters/caip-permission-adapter-permittedChains';
export {
  getInternalScopesObject,
  getSessionScopes,
} from './adapters/caip-permission-adapter-session-scopes';

export { getPermissionsHandler } from './handlers/wallet-getPermissions';
export { requestPermissionsHandler } from './handlers/wallet-requestPermissions';
export { revokePermissionsHandler } from './handlers/wallet-revokePermissions';

export { walletGetSession } from './handlers/wallet-getSession';
export { walletInvokeMethod } from './handlers/wallet-invokeMethod';
export { walletRevokeSession } from './handlers/wallet-revokeSession';

export { multichainMethodCallValidatorMiddleware } from './middlewares/multichainMethodCallValidator';
export { MultichainMiddlewareManager } from './middlewares/MultichainMiddlewareManager';
export { MultichainSubscriptionManager } from './middlewares/MultichainSubscriptionManager';

export type { Caip25Authorization } from './scope/authorization';
export {
  validateAndNormalizeScopes,
  bucketScopes,
} from './scope/authorization';
export {
  KnownWalletRpcMethods,
  KnownRpcMethods,
  KnownWalletNamespaceRpcMethods,
  KnownNotifications,
  KnownWalletScopeString,
} from './scope/constants';
export { getSupportedScopeObjects } from './scope/filter';
export type {
  ExternalScopeString,
  ExternalScopeObject,
  ExternalScopesObject,
  InternalScopeString,
  InternalScopeObject,
  InternalScopesObject,
  NormalizedScopeObject,
  NormalizedScopesObject,
  ScopedProperties,
  NonWalletKnownCaipNamespace,
} from './scope/types';
export { parseScopeString } from './scope/types';
export {
  normalizeScope,
  mergeScopeObject,
  mergeNormalizedScopes,
  mergeInternalScopes,
  normalizeAndMergeScopes,
} from './scope/transform';

export type { Caip25CaveatValue } from './caip25Permission';
export {
  caip25CaveatBuilder,
  Caip25CaveatType,
  createCaip25Caveat,
  Caip25EndowmentPermissionName,
  caip25EndowmentBuilder,
  Caip25CaveatMutators,
} from './caip25Permission';
