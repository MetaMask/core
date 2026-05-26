import { ExchangeClient, HttpTransport, InfoClient } from '@nktkas/hyperliquid';
/**
 * Creates an ExchangeClient + InfoClient pair for trading e2e tests.
 * Uses viem's privateKeyToAccount for EIP-712 signing.
 */
import { privateKeyToAccount } from 'viem/accounts';

import type { E2EConfig } from './config';
import { requirePrivateKey } from './config';

export type TradingClients = {
  exchange: ExchangeClient;
  info: InfoClient;
  address: `0x${string}`;
};

export function createTradingClients(config: E2EConfig): TradingClients {
  requirePrivateKey(config);

  const wallet = privateKeyToAccount(config.privateKey);
  const transport = new HttpTransport({
    isTestnet: config.isTestnet,
    timeout: 30000,
  });

  const exchange = new ExchangeClient({ wallet, transport });
  const info = new InfoClient({ transport });

  return { exchange, info, address: wallet.address };
}
