import { InternalProvider } from './internal-provider';

export * from './provider-from-middleware';

/**
 * @deprecated Use {@link InternalProvider} instead.
 */
type SafeEventEmitterProvider = InternalProvider;
const SafeEventEmitterProvider = InternalProvider;

export { InternalProvider, SafeEventEmitterProvider };
