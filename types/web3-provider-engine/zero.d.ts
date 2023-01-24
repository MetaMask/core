declare module 'web3-provider-engine/zero' {
  import type { Provider, ProviderEngine } from 'web3-provider-engine';

  // NOTE: This doesn't include the complete set of properties that
  // `createMetamaskProvider` takes, but only the properties that
  // NetworkController passes
  type ProviderOptions = {
    rpcUrl?: string;
    engineParams?: {
      blockTrackerProvider?: Provider;
      pollingInterval?: number;
    };
    // This isn't quite right, but is close enough
    dataSubprovider?: Provider;
    stopped?: boolean;
  };

  export default function createMetamaskProvider(
    options: ProviderOptions,
  ): ProviderEngine;
}
