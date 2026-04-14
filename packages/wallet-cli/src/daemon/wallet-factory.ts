import {
  ClientConfigApiService,
  ClientType,
  DistributionType,
  EnvironmentType,
} from '@metamask/remote-feature-flag-controller';
import { importSecretRecoveryPhrase, Wallet } from '@metamask/wallet';

/**
 * Create a configured Wallet instance for daemon use.
 *
 * @param config - Wallet configuration.
 * @param config.infuraProjectId - The Infura project ID for network access.
 * @param config.password - The wallet password.
 * @param config.srp - The secret recovery phrase (BIP-39 mnemonic).
 * @returns A new Wallet instance with the SRP imported.
 */
export async function createWallet({
  infuraProjectId,
  password,
  srp,
}: {
  infuraProjectId: string;
  password: string;
  srp: string;
}): Promise<Wallet> {
  const wallet = new Wallet({
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

  await importSecretRecoveryPhrase(wallet, password, srp);

  return wallet;
}
