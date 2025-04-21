export {
  getEthAccounts,
  setEthAccounts,
  setNonSCACaipAccountIdsInCaip25CaveatValue,
  getCaipAccountIdsFromScopesObjects,
  isInternalAccountInPermittedAccountIds,
  isCaipAccountIdInPermittedAccountIds,
} from './adapters/caip-permission-adapter-accounts';
export {
  getPermittedEthChainIds,
  addPermittedEthChainId,
  setPermittedEthChainIds,
  overwriteCaipChainIdsInCaip25CaveatValue,
  addCaipChainIdInCaip25CaveatValue,
  getAllNonWalletNamespacesFromCaip25CaveatValue,
  getAllScopesFromPermission,
  getAllScopesFromCaip25CaveatValue,
} from './adapters/caip-permission-adapter-permittedChains';
export {
  getInternalScopesObject,
  getSessionScopes,
  getPermittedAccountsForScopes,
} from './adapters/caip-permission-adapter-session-scopes';

export type { Caip25Authorization } from './scope/authorization';
export {
  validateAndNormalizeScopes,
  bucketScopes,
  isNamespaceInScopesObject,
} from './scope/authorization';
export { assertIsInternalScopeString } from './scope/assert';
export {
  KnownWalletRpcMethods,
  KnownRpcMethods,
  KnownWalletNamespaceRpcMethods,
  KnownNotifications,
  KnownWalletScopeString,
  isKnownSessionPropertyValue,
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
  getUniqueArrayItems,
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
  generateCaip25Caveat,
  getCaip25CaveatFromPermission,
} from './caip25Permission';
export { KnownSessionProperties } from './scope/constants';
export { Caip25Errors } from './scope/errors';
