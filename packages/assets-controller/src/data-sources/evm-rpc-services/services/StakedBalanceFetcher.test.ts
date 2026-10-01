import { defaultAbiCoder, Interface } from '@ethersproject/abi';
import type { Web3Provider } from '@ethersproject/providers';

import type {
  StakedBalanceFetcherConfig,
  StakedBalancePollingInput,
} from './StakedBalanceFetcher.js';
import {
  STAKING_INTERFACE,
  StakedBalanceFetcher,
  isStakingContractAssetId,
} from './StakedBalanceFetcher.js';

const TEST_ADDRESS = '0x9bed78535d6a03a955f1504aadba974d9a29e292';
const MAINNET_CHAIN_ID = '0x1';
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
const INPUT: StakedBalancePollingInput = {
  chainId: MAINNET_CHAIN_ID,
  accountId: 'test-account-id',
  accountAddress: TEST_ADDRESS,
};

const AGGREGATE3_INTERFACE = new Interface([
  {
    name: 'aggregate3',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'allowFailure', type: 'bool' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
  },
]);

function encodeUint(value: string): string {
  return defaultAbiCoder.encode(['uint256'], [value]);
}

/**
 * Answers one staking sub-call inside the Multicall3 batch.
 * `totalShares` defaults to `sharesWei` (or 1 when shares are zero) and
 * `totalAssets` defaults to `assetsWei`, so client-side conversion reproduces
 * `assetsWei`.
 *
 * @param callData - Encoded staking function calldata.
 * @param options - Shares and vault totals to return.
 * @param options.sharesWei - `getShares` response.
 * @param options.assetsWei - Asset value those shares should convert to.
 * @param options.totalAssetsWei - Override for `totalAssets`.
 * @param options.totalSharesWei - Override for `totalShares`.
 * @returns ABI-encoded uint256 return data.
 */
function answerStakingSubcall(
  callData: string,
  options: {
    sharesWei: string;
    assetsWei: string;
    totalAssetsWei?: string;
    totalSharesWei?: string;
  },
): string {
  const totalSharesWei =
    options.totalSharesWei ??
    (options.sharesWei === '0' ? '1' : options.sharesWei);
  const totalAssetsWei = options.totalAssetsWei ?? options.assetsWei;

  try {
    STAKING_INTERFACE.decodeFunctionData('getShares', callData);
    return encodeUint(options.sharesWei);
  } catch {
    // Not getShares.
  }
  try {
    STAKING_INTERFACE.decodeFunctionData('totalAssets', callData);
    return encodeUint(totalAssetsWei);
  } catch {
    // Not totalAssets.
  }
  try {
    STAKING_INTERFACE.decodeFunctionData('totalShares', callData);
    return encodeUint(totalSharesWei);
  } catch {
    // Not totalShares.
  }
  throw new Error('Unexpected staking call');
}

/**
 * Creates a mock Web3Provider that answers one Multicall3 staking read.
 *
 * @param options - The options for the mock provider.
 * @param options.sharesWei - The shares to return for `getShares`.
 * @param options.assetsWei - The asset amount those shares should be worth.
 * @param options.totalAssetsWei - Override for `totalAssets`.
 * @param options.totalSharesWei - Override for `totalShares`.
 * @returns A mock Web3Provider.
 */
function createMockProvider(options: {
  sharesWei?: string;
  assetsWei?: string;
  totalAssetsWei?: string;
  totalSharesWei?: string;
}): { provider: Web3Provider; call: jest.Mock } {
  const sharesWei = options.sharesWei ?? '0';
  const assetsWei = options.assetsWei ?? '0';

  const call = jest.fn().mockImplementation(async (tx: { data: string }) => {
    const [calls] = AGGREGATE3_INTERFACE.decodeFunctionData(
      'aggregate3',
      tx.data,
    ) as [{ callData: string }[]];
    const results = calls.map((subcall) => ({
      success: true,
      returnData: answerStakingSubcall(subcall.callData, {
        sharesWei,
        assetsWei,
        totalAssetsWei: options.totalAssetsWei,
        totalSharesWei: options.totalSharesWei,
      }),
    }));
    return AGGREGATE3_INTERFACE.encodeFunctionResult('aggregate3', [results]);
  });

  return {
    call,
    provider: { call } as unknown as Web3Provider,
  };
}

function createFetcher(
  config?: StakedBalanceFetcherConfig,
): StakedBalanceFetcher {
  return new StakedBalanceFetcher(config);
}

describe('isStakingContractAssetId', () => {
  it('returns true for mainnet staking contract asset ID', () => {
    expect(
      isStakingContractAssetId(
        'eip155:1/erc20:0x4fef9d741011476750a243ac70b9789a63dd47df',
      ),
    ).toBe(true);
    expect(
      isStakingContractAssetId(
        'eip155:1/erc20:0x4FEF9D741011476750A243aC70b9789a63dd47Df',
      ),
    ).toBe(true);
  });

  it('returns true for Hoodi staking contract asset ID', () => {
    expect(
      isStakingContractAssetId(
        'eip155:560048/erc20:0xe96ac18cfe5a7af8fe1fe7bc37ff110d88bc67ff',
      ),
    ).toBe(true);
  });

  it('returns false for other ERC20 asset IDs', () => {
    expect(
      isStakingContractAssetId(
        'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      ),
    ).toBe(false);
    expect(isStakingContractAssetId('eip155:1/slip44:60')).toBe(false);
  });

  it('returns false for malformed asset IDs', () => {
    expect(isStakingContractAssetId('eip155:1')).toBe(false);
    expect(isStakingContractAssetId('')).toBe(false);
  });
});

describe('StakedBalanceFetcher', () => {
  describe('constructor', () => {
    it('accepts empty config', () => {
      expect(() => createFetcher()).not.toThrow();
    });

    it('accepts config with getNetworkProvider and pollingInterval', () => {
      const { provider } = createMockProvider({});
      expect(() =>
        createFetcher({
          getNetworkProvider: () => provider,
          pollingInterval: 60_000,
        }),
      ).not.toThrow();
    });
  });

  describe('fetchStakedBalance', () => {
    it('returns amount "0" when chain has no staking contract', async () => {
      const { provider, call } = createMockProvider({ sharesWei: '100' });
      const fetcher = createFetcher({
        getNetworkProvider: () => provider,
      });

      const result = await fetcher.fetchStakedBalance({
        ...INPUT,
        chainId: '0x999',
      });

      expect(result).toStrictEqual({ amount: '0' });
      expect(call).not.toHaveBeenCalled();
    });

    it('returns amount "0" when getShares returns zero', async () => {
      const { provider, call } = createMockProvider({ sharesWei: '0' });
      const fetcher = createFetcher({
        getNetworkProvider: () => provider,
      });

      const result = await fetcher.fetchStakedBalance(INPUT);

      expect(result).toStrictEqual({ amount: '0' });
      expect(call).toHaveBeenCalledTimes(1);
    });

    it('returns human-readable amount when shares and assets are non-zero', async () => {
      const { provider, call } = createMockProvider({
        sharesWei: '1000000000000000000',
        assetsWei: '1500000000000000000', // 1.5 ETH
      });
      const fetcher = createFetcher({
        getNetworkProvider: () => provider,
      });

      const result = await fetcher.fetchStakedBalance(INPUT);

      expect(result).toStrictEqual({ amount: '1.5' });
      expect(call).toHaveBeenCalledTimes(1);
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ to: MULTICALL3_ADDRESS }),
      );
    });

    it('converts shares with the vault exchange rate from the same call', async () => {
      const { provider, call } = createMockProvider({
        sharesWei: '2000000000000000000',
        totalAssetsWei: '3000000000000000000',
        totalSharesWei: '2000000000000000000',
      });
      const fetcher = createFetcher({
        getNetworkProvider: () => provider,
      });

      const result = await fetcher.fetchStakedBalance(INPUT);

      expect(result).toStrictEqual({ amount: '3' });
      expect(call).toHaveBeenCalledTimes(1);
    });

    it('returns the shares themselves when the vault has no total shares', async () => {
      const { provider } = createMockProvider({
        sharesWei: '5',
        totalAssetsWei: '0',
        totalSharesWei: '0',
      });
      const fetcher = createFetcher({
        getNetworkProvider: () => provider,
      });

      const result = await fetcher.fetchStakedBalance(INPUT);

      expect(result).toStrictEqual({ amount: '0.000000000000000005' });
    });

    it('throws on provider or contract error so callers do not persist false zero', async () => {
      const { provider, call } = createMockProvider({
        sharesWei: '1000000000000000000',
        assetsWei: '1500000000000000000',
      });
      call.mockRejectedValueOnce(new Error('RPC error'));

      const fetcher = createFetcher({
        getNetworkProvider: () => provider,
      });

      await expect(fetcher.fetchStakedBalance(INPUT)).rejects.toThrow(
        'RPC error',
      );
    });

    it('throws when getNetworkProvider is not set', async () => {
      const fetcher = createFetcher();

      await expect(fetcher.fetchStakedBalance(INPUT)).rejects.toThrow(
        'no provider available',
      );
    });

    it('throws when getNetworkProvider returns undefined', async () => {
      const fetcher = createFetcher({
        getNetworkProvider: () => undefined,
      });

      await expect(fetcher.fetchStakedBalance(INPUT)).rejects.toThrow(
        'no provider available',
      );
    });

    it('works with CAIP-2 chain ID (eip155:1)', async () => {
      const { provider, call } = createMockProvider({
        sharesWei: '0',
      });
      const fetcher = createFetcher({
        getNetworkProvider: () => provider,
      });

      const result = await fetcher.fetchStakedBalance({
        ...INPUT,
        chainId: 'eip155:1' as StakedBalancePollingInput['chainId'],
      });

      expect(result).toStrictEqual({ amount: '0' });
      expect(call).toHaveBeenCalledTimes(1);
    });

    it('returns whole number when assets have no fractional part', async () => {
      const { provider } = createMockProvider({
        sharesWei: '1',
        assetsWei: '2000000000000000000', // 2 ETH
      });
      const fetcher = createFetcher({
        getNetworkProvider: () => provider,
      });

      const result = await fetcher.fetchStakedBalance(INPUT);

      expect(result).toStrictEqual({ amount: '2' });
    });
  });

  describe('_executePoll', () => {
    it('calls fetchStakedBalance with input', async () => {
      const { provider } = createMockProvider({ sharesWei: '0' });
      const fetcher = createFetcher({
        getNetworkProvider: () => provider,
      });
      const fetchSpy = jest.spyOn(fetcher, 'fetchStakedBalance');

      await fetcher._executePoll(INPUT);

      expect(fetchSpy).toHaveBeenCalledWith(INPUT);
    });

    it('does not call the update callback when fetchStakedBalance throws', async () => {
      const fetcher = createFetcher({
        getNetworkProvider: () => undefined,
      });
      const callback = jest.fn();
      fetcher.setOnStakedBalanceUpdate(callback);

      await fetcher._executePoll(INPUT);

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
