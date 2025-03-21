import { BigNumber } from '@ethersproject/bignumber';
import { AddressZero } from '@ethersproject/constants';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcProvider } from '@ethersproject/providers';

import * as balanceUtils from './balance';

jest.mock('@ethersproject/contracts', () => {
  return {
    ...jest.requireActual('@ethersproject/contracts'),
    Contract: jest.fn(),
  };
});

jest.mock('@ethersproject/providers', () => {
  return {
    ...jest.requireActual('@ethersproject/providers'),
    JsonRpcProvider: jest.fn(),
  };
});

const providerRpcUrl = 'https://provider.rpc.url/v3/1234567890';

describe('balance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calcLatestSrcBalance', () => {
    it('should return the ERC20 token balance', async () => {
      const mockGetBalance = jest.fn();
      (JsonRpcProvider as unknown as jest.Mock).mockImplementation(() => {
        return {
          getBalance: mockGetBalance,
        };
      });
      const mockBalanceOf = jest
        .fn()
        .mockResolvedValueOnce(BigNumber.from(100));
      (Contract as unknown as jest.Mock).mockImplementation(() => ({
        balanceOf: mockBalanceOf,
      }));

      expect(
        await balanceUtils.calcLatestSrcBalance(
          providerRpcUrl,
          '0x123',
          '0x456',
        ),
      ).toBe('100');
      expect(mockBalanceOf).toHaveBeenCalledTimes(1);
      expect(mockGetBalance).not.toHaveBeenCalled();
      expect(mockBalanceOf).toHaveBeenCalledWith('0x123');
    });

    it('should return the native asset balance', async () => {
      const mockGetBalance = jest.fn().mockImplementation(() => {
        return BigNumber.from(100);
      });
      (JsonRpcProvider as unknown as jest.Mock).mockImplementation(() => {
        return {
          getBalance: mockGetBalance,
        };
      });
      const mockBalanceOf = jest.fn();
      (Contract as unknown as jest.Mock).mockImplementation(() => ({
        balanceOf: mockBalanceOf,
      }));

      expect(
        await balanceUtils.calcLatestSrcBalance(
          providerRpcUrl,
          '0x141d32a89a1e0a5Ef360034a2f60a4B917c18838',
          AddressZero,
        ),
      ).toBe('100');
      expect(mockGetBalance).toHaveBeenCalledTimes(1);
      expect(mockBalanceOf).not.toHaveBeenCalled();
      expect(mockGetBalance).toHaveBeenCalledWith(
        '0x141d32a89a1e0a5Ef360034a2f60a4B917c18838',
      );
    });

    it('should return undefined if token address and chainId are undefined', async () => {
      const mockGetBalance = jest.fn();
      (JsonRpcProvider as unknown as jest.Mock).mockImplementation(() => {
        return {
          getBalance: mockGetBalance,
        };
      });
      const mockBalanceOf = jest.fn();
      (Contract as unknown as jest.Mock).mockImplementation(() => ({
        balanceOf: mockBalanceOf,
      }));

      expect(
        await balanceUtils.calcLatestSrcBalance(
          providerRpcUrl,
          '0x141d32a89a1e0a5Ef360034a2f60a4B917c18838',
          undefined as never,
        ),
      ).toBeUndefined();
      expect(mockBalanceOf).not.toHaveBeenCalled();
      expect(mockGetBalance).not.toHaveBeenCalled();
    });
  });

  describe('hasSufficientBalance', () => {
    it('should return true if user has sufficient balance', async () => {
      const mockGetBalance = jest.fn();
      (JsonRpcProvider as unknown as jest.Mock).mockImplementation(() => {
        return {
          getBalance: mockGetBalance,
        };
      });

      mockGetBalance.mockImplementation(() => {
        return BigNumber.from('10000000000000000000');
      });

      const mockBalanceOf = jest
        .fn()
        .mockResolvedValueOnce(BigNumber.from('10000000000000000001'));
      (Contract as unknown as jest.Mock).mockImplementation(() => ({
        balanceOf: mockBalanceOf,
      }));

      expect(
        await balanceUtils.hasSufficientBalance(
          providerRpcUrl,
          '0x141d32a89a1e0a5ef360034a2f60a4b917c18838',
          AddressZero,
          '10000000000000000000',
        ),
      ).toBe(true);

      expect(
        await balanceUtils.hasSufficientBalance(
          providerRpcUrl,
          '0x141d32a89a1e0a5ef360034a2f60a4b917c18838',
          '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
          '10000000000000000000',
        ),
      ).toBe(true);
    });

    it('should return false if user has native assets but insufficient ERC20 src tokens', async () => {
      const mockGetBalance = jest.fn();
      (JsonRpcProvider as unknown as jest.Mock).mockImplementation(() => {
        return {
          getBalance: mockGetBalance,
        };
      });
      const mockBalanceOf = jest.fn();
      (Contract as unknown as jest.Mock).mockImplementation(() => ({
        balanceOf: mockBalanceOf,
      }));

      mockGetBalance.mockImplementation(() => {
        return BigNumber.from('10000000000000000000');
      });
      mockBalanceOf.mockResolvedValueOnce(
        BigNumber.from('9000000000000000000'),
      );

      expect(
        await balanceUtils.hasSufficientBalance(
          providerRpcUrl,
          '0x141d32a89a1e0a5ef360034a2f60a4b917c18838',
          '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
          '10000000000000000000',
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
          providerRpcUrl,
          '0x141d32a89a1e0a5ef360034a2f60a4b917c18838',
          '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
          '10000000000000000000',
        ),
      ).toBe(false);

      expect(mockBalanceOf).toHaveBeenCalledTimes(1);
      expect(mockBalanceOf).toHaveBeenCalledWith(
        '0x141d32a89a1e0a5ef360034a2f60a4b917c18838',
      );
    });
  });
});
