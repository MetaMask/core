import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import { ZeroAddress } from 'ethers';
import { BrowserProvider, Contract } from 'ethers';

import * as balanceUtils from './balance';
import { fetchTokenBalance } from './balance';
import { FakeProvider } from '../../../../tests/fake-provider';

declare global {
  // eslint-disable-next-line no-var
  var ethereumProvider: SafeEventEmitterProvider;
}

jest.mock('ethers', () => {
  return {
    ...jest.requireActual('ethers'),
    Contract: jest.fn(),
    BrowserProvider: jest.fn(),
  };
});

describe('balance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.ethereumProvider = new FakeProvider();
  });

  describe('calcLatestSrcBalance', () => {
    it('should return the ERC20 token balance', async () => {
      const mockBalanceOf = jest.fn().mockResolvedValueOnce(BigInt(100));
      (Contract as unknown as jest.Mock).mockImplementation(() => ({
        balanceOf: mockBalanceOf,
      }));

      expect(
        await balanceUtils.calcLatestSrcBalance(
          global.ethereumProvider,
          '0x123',
          '0x456',
          '0x789',
        ),
      ).toStrictEqual(BigInt(100));
      expect(mockBalanceOf).toHaveBeenCalledTimes(1);
      expect(mockBalanceOf).toHaveBeenCalledWith('0x123');
    });

    it('should return the native asset balance', async () => {
      const mockGetBalance = jest.fn().mockImplementation(() => {
        return BigInt(100);
      });
      (BrowserProvider as unknown as jest.Mock).mockImplementation(() => {
        return {
          getBalance: mockGetBalance,
        };
      });

      expect(
        await balanceUtils.calcLatestSrcBalance(
          global.ethereumProvider,
          '0x141d32a89a1e0a5Ef360034a2f60a4B917c18838',
          ZeroAddress,
          '0x789',
        ),
      ).toStrictEqual(BigInt(100));
      expect(mockGetBalance).toHaveBeenCalledTimes(1);
      expect(mockGetBalance).toHaveBeenCalledWith(
        '0x141d32a89a1e0a5Ef360034a2f60a4B917c18838',
      );
    });

    it('should return undefined if token address and chainId are undefined', async () => {
      const mockGetBalance = jest.fn();
      (BrowserProvider as unknown as jest.Mock).mockImplementation(() => {
        return {
          getBalance: mockGetBalance,
        };
      });

      const mockFetchTokenBalance = jest.spyOn(
        balanceUtils,
        'fetchTokenBalance',
      );
      expect(
        await balanceUtils.calcLatestSrcBalance(
          global.ethereumProvider,
          '0x141d32a89a1e0a5Ef360034a2f60a4B917c18838',
          undefined as never,
          undefined as never,
        ),
      ).toBeUndefined();
      expect(mockFetchTokenBalance).not.toHaveBeenCalled();
      expect(mockGetBalance).not.toHaveBeenCalled();
    });
  });

  describe('hasSufficientBalance', () => {
    it('should return true if user has sufficient balance', async () => {
      const mockGetBalance = jest.fn();
      (BrowserProvider as unknown as jest.Mock).mockImplementation(() => {
        return {
          getBalance: mockGetBalance,
        };
      });

      mockGetBalance.mockImplementation(() => {
        return BigInt(10000000000000000000);
      });

      const mockBalanceOf = jest
        .fn()
        .mockResolvedValueOnce(BigInt('10000000000000000001'));
      (Contract as unknown as jest.Mock).mockImplementation(() => ({
        balanceOf: mockBalanceOf,
      }));

      expect(
        await balanceUtils.hasSufficientBalance(
          global.ethereumProvider,
          '0x141d32a89a1e0a5ef360034a2f60a4b917c18838',
          ZeroAddress,
          '10000000000000000000',
          '0x1',
        ),
      ).toBe(true);

      expect(
        await balanceUtils.hasSufficientBalance(
          global.ethereumProvider,
          '0x141d32a89a1e0a5ef360034a2f60a4b917c18838',
          '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
          '10000000000000000000',
          '0x1',
        ),
      ).toBe(true);
    });

    it('should return false if user has native assets but insufficient ERC20 src tokens', async () => {
      const mockGetBalance = jest.fn();
      (BrowserProvider as unknown as jest.Mock).mockImplementation(() => {
        return {
          getBalance: mockGetBalance,
        };
      });

      mockGetBalance.mockImplementation(() => {
        return BigInt(10000000000000000000);
      });
      const mockFetchTokenBalance = jest.spyOn(
        balanceUtils,
        'fetchTokenBalance',
      );
      mockFetchTokenBalance.mockResolvedValueOnce(BigInt(9000000000000000000));

      expect(
        await balanceUtils.hasSufficientBalance(
          global.ethereumProvider,
          '0x141d32a89a1e0a5ef360034a2f60a4b917c18838',
          '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
          '10000000000000000000',
          '0x1',
        ),
      ).toBe(false);
    });

    it('should return false if source token balance is undefined', async () => {
      const mockBalanceOf = jest.fn().mockResolvedValueOnce(undefined);
      (Contract as unknown as jest.Mock).mockImplementation(() => ({
        balanceOf: mockBalanceOf,
      }));

      expect(
        await balanceUtils.hasSufficientBalance(
          global.ethereumProvider,
          '0x141d32a89a1e0a5ef360034a2f60a4b917c18838',
          '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
          '10000000000000000000',
          '0x1',
        ),
      ).toBe(false);

      expect(mockBalanceOf).toHaveBeenCalledTimes(1);
      expect(mockBalanceOf).toHaveBeenCalledWith(
        '0x141d32a89a1e0a5ef360034a2f60a4b917c18838',
      );
    });
  });
});

describe('fetchTokenBalance', () => {
  let mockProvider: SafeEventEmitterProvider;
  const mockAddress = '0x1234567890123456789012345678901234567890';
  const mockUserAddress = '0x9876543210987654321098765432109876543210';
  const mockBalance = BigInt(1000);

  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider = new FakeProvider();

    // Mock BrowserProvider
    (BrowserProvider as jest.Mock).mockImplementation(() => ({
      // Add any provider methods needed
    }));
  });

  it('should fetch token balance when contract is valid', async () => {
    // Mock Contract
    const mockBalanceOf = jest.fn().mockResolvedValue(mockBalance);
    (Contract as jest.Mock).mockImplementation(() => ({
      balanceOf: mockBalanceOf,
    }));

    const result = await fetchTokenBalance(
      mockAddress,
      mockUserAddress,
      mockProvider,
    );

    expect(BrowserProvider).toHaveBeenCalledWith(mockProvider);
    expect(Contract).toHaveBeenCalledWith(
      mockAddress,
      abiERC20,
      expect.anything(),
    );
    expect(mockBalanceOf).toHaveBeenCalledWith(mockUserAddress);
    expect(result).toBe(mockBalance);
  });

  it('should return undefined when contract is invalid', async () => {
    // Mock Contract to return an object without balanceOf method
    (Contract as jest.Mock).mockImplementation(() => ({
      // Empty object without balanceOf method
    }));

    const result = await fetchTokenBalance(
      mockAddress,
      mockUserAddress,
      mockProvider,
    );

    expect(BrowserProvider).toHaveBeenCalledWith(mockProvider);
    expect(Contract).toHaveBeenCalledWith(
      mockAddress,
      abiERC20,
      expect.anything(),
    );
    expect(result).toBeUndefined();
  });
});
