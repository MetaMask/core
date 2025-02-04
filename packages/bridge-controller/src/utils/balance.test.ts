import { BigNumber } from 'ethers';
import { zeroAddress } from 'ethereumjs-util';
import { Contract } from '@ethersproject/contracts';
import { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import * as balanceUtils from './balance';
import { createMockProvider } from '../test/provider';

declare global {
  var ethereumProvider: SafeEventEmitterProvider;
}

const mockGetBalance = jest.fn();
jest.mock('@ethersproject/providers', () => {
  return {
    Web3Provider: jest.fn().mockImplementation(() => {
      return {
        getBalance: mockGetBalance,
      };
    }),
  };
});

jest.mock('@ethersproject/contracts');

describe('balance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.ethereumProvider = createMockProvider();
  });

  describe('calcLatestSrcBalance', () => {
    it('should return the ERC20 token balance', async () => {
      const mockBalanceOf = jest.fn().mockResolvedValueOnce(BigNumber.from('100'));
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
      ).toStrictEqual(BigNumber.from(100));
      expect(mockBalanceOf).toHaveBeenCalledTimes(1);
      expect(mockBalanceOf).toHaveBeenCalledWith(
        '0x123',
      );
    });

    it('should return the native asset balance', async () => {
      mockGetBalance.mockImplementation(() => {
        return BigNumber.from(100);
      });

      expect(
        await balanceUtils.calcLatestSrcBalance(
          global.ethereumProvider,
          '0x141d32a89a1e0a5Ef360034a2f60a4B917c18838',
          zeroAddress(),
          '0x789',
        ),
      ).toStrictEqual(BigNumber.from(100));
      expect(mockGetBalance).toHaveBeenCalledTimes(1);
      expect(mockGetBalance).toHaveBeenCalledWith(
        '0x141d32a89a1e0a5Ef360034a2f60a4B917c18838',
      );
    });

    it('should return undefined if token address and chainId are undefined', async () => {
      const mockFetchTokenBalance = jest.spyOn(balanceUtils, 'fetchTokenBalance');
      expect(
        await balanceUtils.calcLatestSrcBalance(
          global.ethereumProvider,
          '0x141d32a89a1e0a5Ef360034a2f60a4B917c18838',
          undefined as never,
          undefined as never,
        ),
      ).toStrictEqual(undefined);
      expect(mockFetchTokenBalance).not.toHaveBeenCalled();
      expect(mockGetBalance).not.toHaveBeenCalled();
    });
  });

  describe('hasSufficientBalance', () => {
    it('should return true if user has sufficient balance', async () => {
      mockGetBalance.mockImplementation(() => {
        return BigNumber.from('10000000000000000000');
      });

      const mockBalanceOf = jest.fn().mockResolvedValueOnce(BigNumber.from('10000000000000000001'));
      (Contract as unknown as jest.Mock).mockImplementation(() => ({
        balanceOf: mockBalanceOf,
      }));

      expect(
        await balanceUtils.hasSufficientBalance(
          global.ethereumProvider,
          '0x141d32a89a1e0a5ef360034a2f60a4b917c18838',
          zeroAddress(),
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
      mockGetBalance.mockImplementation(() => {
        return BigNumber.from('10000000000000000000');
      });
      const mockFetchTokenBalance = jest.spyOn(balanceUtils, 'fetchTokenBalance');
      mockFetchTokenBalance.mockResolvedValueOnce(
        BigNumber.from('9000000000000000000'),
      );

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
  });
});
