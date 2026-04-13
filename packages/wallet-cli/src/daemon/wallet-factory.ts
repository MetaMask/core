import {
  ClientConfigApiService,
  ClientType,
  DistributionType,
  EnvironmentType,
} from '@metamask/remote-feature-flag-controller';
import { Wallet } from '@metamask/wallet';

/**
 * Create a configured Wallet instance for daemon use.
 *
 * @param config - Wallet configuration.
 * @param config.infuraProjectId - The Infura project ID for network access.
 * @returns A new Wallet instance.
 */
export function createWallet({
  infuraProjectId,
}: {
  infuraProjectId: string;
}): Wallet {
  return new Wallet({
    options: {
      infuraProjectId,
      clientVersion: '0.0.0',
      // TODO: Implement showApprovalRequest
      showApprovalRequest: () => undefined,
      clientConfigApiService: new ClientConfigApiService({
        fetch: globalThis.fetch,
        config: {
          client: ClientType.Extension,
          distribution: DistributionType.Main,
          environment: EnvironmentType.Production,
        },
      }),
      getMetaMetricsId: () => 'cli',
    },
  });
}
