export {
  getEthAccounts,
  setEthAccounts,
  setNonSCACaipAccountIdsInCaip25CaveatValue,
  getCaipAccountIdsFromScopesObjects,
  getCaipAccountIdsFromCaip25CaveatValue,
  isInternalAccountInPermittedAccountIds,
  isCaipAccountIdInPermittedAccountIds,
} from './operators/caip-permission-operator-accounts.js';
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
} from './operators/caip-permission-operator-permittedChains.js';
export {
  getInternalScopesObject,
  getSessionScopes,
  getSessionProperties,
  getPermittedAccountsForScopes,
} from './operators/caip-permission-operator-session-scopes.js';
export type { Caip25Authorization } from './scope/authorization.js';
export {
  validateAndNormalizeScopes,
  bucketScopes,
  isNamespaceInScopesObject,
} from './scope/authorization.js';
export { assertIsInternalScopeString } from './scope/assert.js';
export {
  KnownWalletRpcMethods,
  KnownRpcMethods,
  KnownWalletNamespaceRpcMethods,
  KnownNotifications,
  KnownWalletScopeString,
  isKnownSessionPropertyValue,
} from './scope/constants.js';
export { getSupportedScopeObjects } from './scope/filter.js';
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
} from './scope/types.js';
export { parseScopeString } from './scope/types.js';
export {
  getUniqueArrayItems,
  normalizeScope,
  mergeScopeObject,
  mergeNormalizedScopes,
  mergeInternalScopes,
  normalizeAndMergeScopes,
} from './scope/transform.js';

export type { Caip25CaveatValue } from './caip25Permission.js';
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
} from './caip25Permission.js';
export { KnownSessionProperties } from './scope/constants.js';
export { Caip25Errors } from './scope/errors.js';
