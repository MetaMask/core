/* eslint-disable no-restricted-globals */
/**
 * E2E configuration — reads from environment variables.
 *
 * Required env vars for trading scenarios:
 *   HL_E2E_PRIVATE_KEY — hex private key for testnet wallet (0x-prefixed)
 *
 * Optional:
 *   HL_TESTNET — "true" to use testnet (default: true for safety)
 */

export type E2EConfig = {
  isTestnet: boolean;
  privateKey: `0x${string}` | undefined;
  minPositionUsd: number;
};

export function loadConfig(): E2EConfig {
  const isTestnet = process.env.HL_TESTNET !== 'false';
  const rawKey = process.env.HL_E2E_PRIVATE_KEY;
  let privateKey: `0x${string}` | undefined;
  if (rawKey?.startsWith('0x')) {
    privateKey = rawKey as `0x${string}`;
  } else if (rawKey) {
    privateKey = `0x${rawKey}`;
  }

  return {
    isTestnet,
    privateKey,
    minPositionUsd: 10,
  };
}

export function requirePrivateKey(
  config: E2EConfig,
): asserts config is E2EConfig & { privateKey: `0x${string}` } {
  if (!config.privateKey) {
    console.error(
      '[e2e] HL_E2E_PRIVATE_KEY not set — trading scenarios require a funded testnet wallet',
    );
    process.exit(1);
  }
}

export function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let idx = 0; idx < argv.length; idx++) {
    if (argv[idx].startsWith('--')) {
      const key = argv[idx].slice(2);
      if (idx + 1 < argv.length && !argv[idx + 1].startsWith('--')) {
        idx += 1;
        result[key] = argv[idx];
      } else {
        result[key] = 'true';
      }
    }
  }
  return result;
}
