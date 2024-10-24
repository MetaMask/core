export {
  getEthAccounts,
  setEthAccounts,
} from './adapters/caip-permission-adapter-eth-accounts';
export { caipPermissionAdapterMiddleware } from './adapters/caip-permission-adapter-middleware';
export {
  getPermittedEthChainIds,
  addPermittedEthChainId,
  setPermittedEthChainIds,
} from './adapters/caip-permission-adapter-permittedChains';

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
} from './scope/constants';
export type {
  ExternalScopeString,
  ExternalScopeObject,
  ExternalScopesObject,
  ScopeString,
  ScopeObject,
  ScopesObject,
  ScopedProperties,
  NonWalletKnownCaipNamespace,
} from './scope/types';
export { parseScopeString, KnownWalletScopeString } from './scope/types';
export {
  isSupportedScopeString,
  isSupportedAccount,
  isSupportedMethod,
  isSupportedNotification,
} from './scope/supported';
export {
  normalizeScope,
  mergeScopeObject,
  mergeScopes,
  normalizeAndMergeScopes,
} from './scope/transform';
export { isValidScope, validateScopes } from './scope/validation';

export type { Caip25CaveatValue } from './caip25Permission';
export {
  Caip25CaveatType,
  Caip25CaveatFactoryFn,
  Caip25EndowmentPermissionName,
  caip25EndowmentBuilder,
  Caip25CaveatMutatorFactories,
  removeScope,
} from './caip25Permission';
