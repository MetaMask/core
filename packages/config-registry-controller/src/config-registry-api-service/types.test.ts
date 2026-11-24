import { is } from '@metamask/superstruct';
import { describe, expect, it } from 'vitest';

import { createMockNetworkConfig } from '../../tests/helpers.js';
import { RegistryNetworkConfigSchema } from './types.js';

describe('RegistryNetworkConfigSchema', () => {
  const isValidChain = (chain: unknown): boolean =>
    is(chain, RegistryNetworkConfigSchema);

  it('accepts object-form RPC fallback providers', () => {
    expect(
      isValidChain(
        createMockNetworkConfig({
          chainId: 'eip155:1672',
          rpcProviders: {
            default: {
              url: 'https://rpc.pharos.xyz',
              type: 'custom',
              networkClientId: 'pharos-mainnet',
            },
            fallbacks: [
              {
                url: 'https://infra.originstake.com/pharos/evm',
                type: 'custom',
                networkClientId: 'pharos-mainnet-fallback',
              },
            ],
          },
        }),
      ),
    ).toBe(true);
  });

  it('still accepts string-form RPC fallbacks', () => {
    expect(
      isValidChain(
        createMockNetworkConfig({
          rpcProviders: {
            default: {
              url: 'https://mainnet.infura.io/v3/{infuraProjectId}',
              type: 'infura',
              networkClientId: 'mainnet',
            },
            fallbacks: ['https://mainnet.example.com'],
          },
        }),
      ),
    ).toBe(true);
  });

  it('rejects RPC fallback entries that are neither strings nor provider objects', () => {
    const validChain = createMockNetworkConfig();
    const invalidChain = {
      ...validChain,
      rpcProviders: { ...validChain.rpcProviders, fallbacks: [42] },
    };

    expect(isValidChain(invalidChain)).toBe(false);
  });
});
