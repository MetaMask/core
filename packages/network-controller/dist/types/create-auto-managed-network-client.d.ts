import type { BlockTracker, NetworkClientConfiguration, Provider } from './types';
/**
 * The name of the method on both the provider and block tracker proxy which can
 * be used to get the underlying provider or block tracker from the network
 * client, when it is initialized.
 */
declare const REFLECTIVE_PROPERTY_NAME = "__target__";
/**
 * Represents a proxy object which wraps a target object. As a proxy, it allows
 * for accessing and setting all of the properties that the target object
 * supports, but also supports an extra propertyName (`__target__`) to access
 * the target itself.
 *
 * @template Type - The type of the target object. It is assumed that this type
 * will be constant even when the target is swapped.
 */
export type ProxyWithAccessibleTarget<TargetType> = TargetType & {
    [REFLECTIVE_PROPERTY_NAME]: TargetType;
};
/**
 * An object that provides the same interface as a network client but where the
 * network client is not initialized until either the provider or block tracker
 * is first accessed.
 */
export type AutoManagedNetworkClient<Configuration extends NetworkClientConfiguration> = {
    configuration: Configuration;
    provider: ProxyWithAccessibleTarget<Provider>;
    blockTracker: ProxyWithAccessibleTarget<BlockTracker>;
    destroy: () => void;
};
/**
 * This function creates two proxies, one that wraps a provider and another that
 * wraps a block tracker. These proxies are unique in that both will be "empty"
 * at first; that is, neither will point to a functional provider or block
 * tracker. Instead, as soon as a method or event is accessed on either object
 * that requires a network request to function, a network client is created on
 * the fly and the method or event in question is then forwarded to whichever
 * part of the network client is serving as the receiver. The network client is
 * then cached for subsequent usages.
 *
 * @param networkClientConfiguration - The configuration object that will be
 * used to instantiate the network client when it is needed.
 * @returns The auto-managed network client.
 */
export declare function createAutoManagedNetworkClient<Configuration extends NetworkClientConfiguration>(networkClientConfiguration: Configuration): AutoManagedNetworkClient<Configuration>;
export {};
//# sourceMappingURL=create-auto-managed-network-client.d.ts.map