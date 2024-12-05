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
export { caipPermissionAdapterMiddleware } from './adapters/caip-permission-adapter-middleware';

export { walletGetSession } from './handlers/wallet-getSession';
export { walletInvokeMethod } from './handlers/wallet-invokeMethod';
export { walletRevokeSession } from './handlers/wallet-revokeSession';

export { multichainMethodCallValidatorMiddleware } from './middlewares/multichainMethodCallValidator';
export { MultichainMiddlewareManager } from './middlewares/MultichainMiddlewareManager';
export { MultichainSubscriptionManager } from './middlewares/MultichainSubscriptionManager';

export { assertScopeSupported, assertScopesSupported } from './scope/assert';
export type { Caip25Authorization } from './scope/authorization';
export {
  validateAndNormalizeScopes,
  bucketScopes,
} from './scope/authorization';
export { bucketScopesBySupport, filterScopesSupported } from './scope/filter';
export {
  KnownWalletRpcMethods,
  KnownRpcMethods,
  KnownWalletNamespaceRpcMethods,
  KnownNotifications,
  KnownWalletScopeString,
} from './scope/constants';
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
  mergeScopes,
  normalizeAndMergeScopes,
} from './scope/transform';

export type { Caip25CaveatValue } from './caip25Permission';
export {
  Caip25CaveatType,
  createCaip25Caveat,
  Caip25EndowmentPermissionName,
  caip25EndowmentBuilder,
  Caip25CaveatMutators,
} from './caip25Permission';
