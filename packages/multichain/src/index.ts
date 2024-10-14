export { getEthAccounts, setEthAccounts } from './adapters/caip-permission-adapter-eth-accounts'
export { caipPermissionAdapterMiddleware } from './adapters/caip-permission-adapter-middleware'
export { getPermittedEthChainIds, addPermittedEthChainId, setPermittedEthChainIds} from './adapters/caip-permission-adapter-permittedChains'

export { walletGetSessionHandler } from './handlers/wallet-getSession'
export { walletInvokeMethodHandler } from './handlers/wallet-invokeMethod'
export { walletRevokeSessionHandler } from './handlers/wallet-revokeSession'

export { multichainMethodCallValidatorMiddleware } from './middlewares/multichainMethodCallValidator'
export { MultichainMiddlewareManager } from './middlewares/MultichainMiddlewareManager'
export { MultichainSubscriptionManager } from './middlewares/MultichainSubscriptionManager'

export {assertScopeSupported, assertScopesSupported} from './scope/assert'
export { Caip25Authorization, validateAndFlattenScopes, bucketScopes } from './scope/authorization'
export {bucketScopesBySupport, filterScopesSupported} from './scope/filter'
export * from './scope/types'
export {isSupportedScopeString, isSupportedAccount, isSupportedMethod, isSupportedNotification} from './scope/supported'
export {flattenScope, mergeScopeObject, mergeScopes, flattenMergeScopes } from './scope/transform'
export {isValidScope, validateScopes} from './scope/validation'

export { Caip25CaveatValue, Caip25CaveatType, Caip25CaveatFactoryFn, Caip25EndowmentPermissionName, caip25EndowmentBuilder, Caip25CaveatMutatorFactories, removeScope }  from './caip25Permission'
