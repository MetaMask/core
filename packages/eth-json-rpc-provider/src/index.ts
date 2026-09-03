import { InternalProvider } from './internal-provider.js';

export { MockInternalProvider } from './mock-internal-provider.js';
export type { MockInternalProviderStub } from './mock-internal-provider.js';

export * from './provider-from-middleware.js';

/**
 * @deprecated Use {@link InternalProvider} instead.
 */
type SafeEventEmitterProvider = InternalProvider;
const SafeEventEmitterProvider = InternalProvider;

export { InternalProvider, SafeEventEmitterProvider };
