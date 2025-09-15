export {
  getEthAccounts,
  setEthAccounts,
  setNonSCACaipAccountIdsInCaip25CaveatValue,
  getCaipAccountIdsFromScopesObjects,
  getCaipAccountIdsFromCaip25CaveatValue,
  isInternalAccountInPermittedAccountIds,
  isCaipAccountIdInPermittedAccountIds,
} from './operators/caip-permission-operator-accounts';
export {
  getPermittedEthChainIds,
  addPermittedEthChainId,
  setPermittedEthChainIds,
  setChainIdsInCaip25CaveatValue,
  addCaipChainIdInCaip25CaveatValue,
  getAllNamespacesFromCaip25CaveatValue,
  getAllScopesFromPermission,
  getAllScopesFromCaip25CaveatValue,
  getAllScopesFromScopesObjects,
} from './operators/caip-permission-operator-permittedChains';
export {
  getInternalScopesObject,
  getSessionScopes,
  getPermittedAccountsForScopes,
} from './operators/caip-permission-operator-session-scopes';
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
  getCaip25PermissionFromLegacyPermissions,
  requestPermittedChainsPermissionIncremental,
} from './caip25Permission';
export { KnownSessionProperties } from './scope/constants';
export { Caip25Errors } from './scope/errors';
