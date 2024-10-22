export {
  getEthAccounts,
  setEthAccounts,
} from './adapters/caip-permission-adapter-eth-accounts';
export {
  getPermittedEthChainIds,
  addPermittedEthChainId,
  setPermittedEthChainIds,
} from './adapters/caip-permission-adapter-permittedChains';

export type { Caip25Authorization } from './scope/authorization';
export { validateAndNormalizeScopes } from './scope/authorization';
export * from './scope/types';
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