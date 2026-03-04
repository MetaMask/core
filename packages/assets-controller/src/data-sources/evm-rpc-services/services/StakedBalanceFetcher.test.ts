import { defaultAbiCoder } from '@ethersproject/abi';
import type { Web3Provider } from '@ethersproject/providers';

import type {
  StakedBalanceFetcherConfig,
  StakedBalancePollingInput,
} from './StakedBalanceFetcher';
import {
  StakedBalanceFetcher,
  isStakingContractAssetId,
} from './StakedBalanceFetcher';

const TEST_ADDRESS = '0x9bed78535d6a03a955f1504aadba974d9a29e292';
const MAINNET_CHAIN_ID = '0x1';
const INPUT: StakedBalancePollingInput = {
  chainId: MAINNET_CHAIN_ID,
  accountId: 'test-account-id',
  accountAddress: TEST_ADDRESS as StakedBalancePollingInput['accountAddress'],
};

/**
 * Creates a mock Web3Provider that returns the specified shares and assets when called.
 *
 * @param options - The options for the mock provider.
 * @param options.sharesWei - The shares to return when the provider is called.
 * @param options.assetsWei - The assets to return when the provider is called.
 * @returns A mock Web3Provider.
 */
function createMockProvider(options: {
  sharesWei?: string;
  assetsWei?: string;
}): jest.Mocked<Web3Provider> {
  const { sharesWei = '0', assetsWei = '0' } = options;
  let callCount = 0;

  const mockCall = jest.fn().mockImplementation(async () => {
    callCount += 1;
    if (callCount === 1) {
      return defaultAbiCoder.encode(['uint256'], [sharesWei]);
    }
    return defaultAbiCoder.encode(['uint256'], [assetsWei]);
  });

  return {
    call: mockCall,
  } as unknown as jest.Mocked<Web3Provider>;
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
      const provider = createMockProvider({});
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
      const provider = createMockProvider({ sharesWei: '100' });
      const fetcher = createFetcher({
        getNetworkProvider: () => provider,
      });

      const result = await fetcher.fetchStakedBalance({
        ...INPUT,
        chainId: '0x999' as StakedBalancePollingInput['chainId'],
      });

      expect(result).toStrictEqual({ amount: '0' });
      expect(provider.call).not.toHaveBeenCalled();
    });

    it('returns amount "0" when getShares returns zero', async () => {
      const provider = createMockProvider({ sharesWei: '0' });
      const fetcher = createFetcher({
        getNetworkProvider: () => provider,
      });

      const result = await fetcher.fetchStakedBalance(INPUT);

      expect(result).toStrictEqual({ amount: '0' });
      expect(provider.call).toHaveBeenCalledTimes(1);
    });

    it('returns human-readable amount when shares and assets are non-zero', async () => {
      const provider = createMockProvider({
        sharesWei: '1000000000000000000',
        assetsWei: '1500000000000000000', // 1.5 ETH
      });
      const fetcher = createFetcher({
        getNetworkProvider: () => provider,
      });

      const result = await fetcher.fetchStakedBalance(INPUT);

      expect(result).toStrictEqual({ amount: '1.5' });
      expect(provider.call).toHaveBeenCalledTimes(2);
    });

    it('throws on provider or contract error so callers do not persist false zero', async () => {
      const provider = createMockProvider({
        sharesWei: '1000000000000000000',
        assetsWei: '1500000000000000000',
      });
      (provider.call as jest.Mock).mockRejectedValueOnce(
        new Error('RPC error'),
      );

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
      const provider = createMockProvider({
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
      expect(provider.call).toHaveBeenCalledTimes(1);
    });

    it('returns whole number when assets have no fractional part', async () => {
      const provider = createMockProvider({
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
      const provider = createMockProvider({ sharesWei: '0' });
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
