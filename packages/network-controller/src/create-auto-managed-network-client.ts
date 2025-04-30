import type { PollingBlockTrackerOptions } from '@metamask/eth-block-tracker';

import type { NetworkClient } from './create-network-client';
import { createNetworkClient } from './create-network-client';
import type { NetworkControllerMessenger } from './NetworkController';
import type { RpcServiceOptions } from './rpc-service/rpc-service';
import type {
  BlockTracker,
  NetworkClientConfiguration,
  Provider,
} from './types';

/**
 * The name of the method on both the provider and block tracker proxy which can
 * be used to get the underlying provider or block tracker from the network
 * client, when it is initialized.
 */
const REFLECTIVE_PROPERTY_NAME = '__target__';

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
export type AutoManagedNetworkClient<
  Configuration extends NetworkClientConfiguration,
> = {
  configuration: Configuration;
  provider: ProxyWithAccessibleTarget<Provider>;
  blockTracker: ProxyWithAccessibleTarget<BlockTracker>;
  destroy: () => void;
  enableRpcFailover: () => void;
  disableRpcFailover: () => void;
};

/**
 * By default, the provider and block provider proxies will point to nothing.
 * This is impossible when using the Proxy API, as the target object has to be
 * something, so this object represents that "something".
 */
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
const UNINITIALIZED_TARGET = { __UNINITIALIZED__: true };

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
 * @param args - The arguments.
 * @param args.networkClientConfiguration - The configuration object that will be
 * used to instantiate the network client when it is needed.
 * @param args.getRpcServiceOptions - Factory for constructing RPC service
 * options. See {@link NetworkControllerOptions.getRpcServiceOptions}.
 * @param args.getBlockTrackerOptions - Factory for constructing block tracker
 * options. See {@link NetworkControllerOptions.getBlockTrackerOptions}.
 * @param args.messenger - The network controller messenger.
 * @param args.isRpcFailoverEnabled - Whether or not requests sent to the
 * primary RPC endpoint for this network should be automatically diverted to
 * provided failover endpoints if the primary is unavailable.
 * @returns The auto-managed network client.
 */
export function createAutoManagedNetworkClient<
  Configuration extends NetworkClientConfiguration,
>({
  networkClientConfiguration,
  getRpcServiceOptions,
  getBlockTrackerOptions = () => ({}),
  messenger,
  isRpcFailoverEnabled: givenIsRpcFailoverEnabled,
}: {
  networkClientConfiguration: Configuration;
  getRpcServiceOptions: (
    rpcEndpointUrl: string,
  ) => Omit<RpcServiceOptions, 'failoverService' | 'endpointUrl'>;
  getBlockTrackerOptions?: (
    rpcEndpointUrl: string,
  ) => Omit<PollingBlockTrackerOptions, 'provider'>;
  messenger: NetworkControllerMessenger;
  isRpcFailoverEnabled: boolean;
}): AutoManagedNetworkClient<Configuration> {
  let isRpcFailoverEnabled = givenIsRpcFailoverEnabled;
  let networkClient: NetworkClient | undefined;

  const ensureNetworkClientCreated = (): NetworkClient => {
    networkClient ??= createNetworkClient({
      configuration: networkClientConfiguration,
      getRpcServiceOptions,
      getBlockTrackerOptions,
      messenger,
      isRpcFailoverEnabled,
    });

    if (networkClient === undefined) {
      throw new Error(
        "It looks like `createNetworkClient` didn't return anything. Perhaps it's being mocked?",
      );
    }

    return networkClient;
  };

  const providerProxy = new Proxy(UNINITIALIZED_TARGET, {
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get(_target: any, propertyName: PropertyKey, receiver: unknown) {
      if (propertyName === REFLECTIVE_PROPERTY_NAME) {
        return networkClient?.provider;
      }

      const { provider } = ensureNetworkClientCreated();

      if (propertyName in provider) {
        // Typecast: We know that `[propertyName]` is a propertyName on
        // `provider`.
        const value = provider[propertyName as keyof typeof provider];
        if (typeof value === 'function') {
          // Ensure that the method on the provider is called with `this` as
          // the target, *not* the proxy (which happens by default) —
          // this allows private properties to be accessed
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return function (this: unknown, ...args: any[]) {
            // @ts-expect-error We don't care that `this` may not be compatible
            // with the signature of the method being called, as technically
            // it can be anything.
            return value.apply(this === receiver ? provider : this, args);
          };
        }
        return value;
      }

      return undefined;
    },

    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    has(_target: any, propertyName: PropertyKey) {
      if (propertyName === REFLECTIVE_PROPERTY_NAME) {
        return true;
      }
      const { provider } = ensureNetworkClientCreated();
      return propertyName in provider;
    },
  });

  const blockTrackerProxy: ProxyWithAccessibleTarget<BlockTracker> = new Proxy(
    UNINITIALIZED_TARGET,
    {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get(_target: any, propertyName: PropertyKey, receiver: unknown) {
        if (propertyName === REFLECTIVE_PROPERTY_NAME) {
          return networkClient?.blockTracker;
        }

        const { blockTracker } = ensureNetworkClientCreated();

        if (propertyName in blockTracker) {
          // Typecast: We know that `[propertyName]` is a propertyName on
          // `provider`.
          const value = blockTracker[propertyName as keyof typeof blockTracker];
          if (typeof value === 'function') {
            // Ensure that the method on the provider is called with `this` as
            // the target, *not* the proxy (which happens by default) —
            // this allows private properties to be accessed
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return function (this: unknown, ...args: any[]) {
              // @ts-expect-error We don't care that `this` may not be
              // compatible with the signature of the method being called, as
              // technically it can be anything.
              return value.apply(this === receiver ? blockTracker : this, args);
            };
          }
          return value;
        }

        return undefined;
      },

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      has(_target: any, propertyName: PropertyKey) {
        if (propertyName === REFLECTIVE_PROPERTY_NAME) {
          return true;
        }
        const { blockTracker } = ensureNetworkClientCreated();
        return propertyName in blockTracker;
      },
    },
  );

  const destroy = () => {
    networkClient?.destroy();
  };

  const enableRpcFailover = () => {
    isRpcFailoverEnabled = true;
    destroy();
    networkClient = undefined;
  };

  const disableRpcFailover = () => {
    isRpcFailoverEnabled = false;
    destroy();
    networkClient = undefined;
  };

  return {
    configuration: networkClientConfiguration,
    provider: providerProxy,
    blockTracker: blockTrackerProxy,
    destroy,
    enableRpcFailover,
    disableRpcFailover,
  };
}
