<<<<<<< HEAD
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

export type { Caip25Authorization } from './scope/authorization';
export {
  validateAndNormalizeScopes,
} from './scope/authorization';
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
||||||| 8fb04fc2
=======
/**
 * Example function that returns a greeting for the given name.
 *
 * @param name - The name to greet.
 * @returns The greeting.
 */
export default function greeter(name: string): string {
  return `Hello, ${name}!`;
}
>>>>>>> initialize-caip-multichain
