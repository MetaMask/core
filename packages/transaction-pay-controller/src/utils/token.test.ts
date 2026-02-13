import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import type { TokensControllerState } from '@metamask/assets-controllers';
import type { AccountTrackerControllerState } from '@metamask/assets-controllers';
import type { TokenRatesControllerState } from '@metamask/assets-controllers';
import type { Hex } from '@metamask/utils';

import {
  computeTokenAmounts,
  getTokenBalance,
  getTokenInfo,
  getTokenFiatRate,
  getAllTokenBalances,
  getNativeToken,
  isSameToken,
  getLiveTokenBalance,
} from './token';
import {
  CHAIN_ID_POLYGON,
  NATIVE_TOKEN_ADDRESS,
  POLYGON_USDCE_ADDRESS,
} from '../constants';
import { getMessengerMock } from '../tests/messenger-mock';

jest.mock('@ethersproject/contracts', () => ({
  ...jest.requireActual('@ethersproject/contracts'),
  Contract: jest.fn(),
}));

jest.mock('@ethersproject/providers', () => ({
  ...jest.requireActual('@ethersproject/providers'),
  Web3Provider: jest.fn(),
}));

const TOKEN_ADDRESS_MOCK = '0x559B65722aD62AD6DAC4Fa5a1c6B23A2e8ce57Ec' as Hex;
const TOKEN_ADDRESS_2_MOCK = '0x123456789abcdef1234567890abcdef12345678' as Hex;
const CHAIN_ID_MOCK = '0x1' as Hex;
const DECIMALS_MOCK = 6;
const BALANCE_MOCK = '0x123' as Hex;
const FROM_MOCK = '0x456' as Hex;
const NETWORK_CLIENT_ID_MOCK = '123-456';
const TICKER_MOCK = 'TST';
const SYMBOL_MOCK = 'TEST';
const ACCOUNT_MOCK = '0x1234567890abcdef1234567890abcdef12345678' as Hex;
const ERC20_ADDRESS_MOCK = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex;
const PROVIDER_MOCK = { request: jest.fn() };

describe('Token Utils', () => {
  const {
    messenger,
    getTokensControllerStateMock,
    getNetworkClientByIdMock,
    getTokenBalanceControllerStateMock,
    getAccountTrackerControllerStateMock,
    getTokenRatesControllerStateMock,
    getCurrencyRateControllerStateMock,
    findNetworkClientIdByChainIdMock,
  } = getMessengerMock();

  let mockBalanceOf: jest.Mock;
  let mockGetBalance: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();

    mockBalanceOf = jest.fn();
    mockGetBalance = jest.fn();

    findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);

    getNetworkClientByIdMock.mockReturnValue({
      configuration: { ticker: TICKER_MOCK },
      provider: PROVIDER_MOCK,
    } as never);

    (Contract as unknown as jest.Mock).mockImplementation(() => ({
      balanceOf: mockBalanceOf,
    }));

    (Web3Provider as unknown as jest.Mock).mockImplementation(() => ({
      getBalance: mockGetBalance,
    }));
  });

  describe('getTokenInfo', () => {
    it('returns decimals and symbol from controller state', () => {
      getTokensControllerStateMock.mockReturnValue({
        allTokens: {
          [CHAIN_ID_MOCK]: {
            test123: [
              {
                address: TOKEN_ADDRESS_MOCK.toLowerCase() as Hex,
                decimals: DECIMALS_MOCK,
                symbol: SYMBOL_MOCK,
              },
            ],
          },
        },
      } as never);

      const result = getTokenInfo(messenger, TOKEN_ADDRESS_MOCK, CHAIN_ID_MOCK);

      expect(result).toStrictEqual({
        decimals: DECIMALS_MOCK,
        symbol: SYMBOL_MOCK,
      });
    });

    it('returns normalized decimals', () => {
      getTokensControllerStateMock.mockReturnValue({
        allTokens: {
          [CHAIN_ID_MOCK]: {
            test123: [
              {
                address: TOKEN_ADDRESS_MOCK.toLowerCase() as Hex,
                decimals: '6',
                symbol: SYMBOL_MOCK,
              },
            ],
          },
        },
      } as never);

      const result = getTokenInfo(messenger, TOKEN_ADDRESS_MOCK, CHAIN_ID_MOCK);

      expect(result).toStrictEqual({
        decimals: DECIMALS_MOCK,
        symbol: SYMBOL_MOCK,
      });
    });

    it('returns undefined if token is not found', () => {
      getTokensControllerStateMock.mockReturnValue({} as TokensControllerState);

      const result = getTokenInfo(messenger, TOKEN_ADDRESS_MOCK, CHAIN_ID_MOCK);

      expect(result).toBeUndefined();
    });

    it('returns native token info', () => {
      getTokensControllerStateMock.mockReturnValue({} as TokensControllerState);

      getNetworkClientByIdMock.mockReturnValue({
        configuration: { ticker: TICKER_MOCK },
      } as never);

      const result = getTokenInfo(
        messenger,
        NATIVE_TOKEN_ADDRESS,
        CHAIN_ID_MOCK,
      );

      expect(result).toStrictEqual({
        decimals: 18,
        symbol: TICKER_MOCK,
      });
    });

    it('returns undefined if native ticker is not found', () => {
      getTokensControllerStateMock.mockReturnValue({} as TokensControllerState);
      getNetworkClientByIdMock.mockReturnValue(undefined as never);

      const result = getTokenInfo(
        messenger,
        NATIVE_TOKEN_ADDRESS,
        CHAIN_ID_MOCK,
      );

      expect(result).toBeUndefined();
    });

    it('supports non-standard native token address', () => {
      getTokensControllerStateMock.mockReturnValue({} as TokensControllerState);

      getNetworkClientByIdMock.mockReturnValue({
        configuration: { ticker: TICKER_MOCK },
      } as never);

      const result = getTokenInfo(
        messenger,
        '0x0000000000000000000000000000000000001010',
        '0x89',
      );

      expect(result).toStrictEqual({
        decimals: 18,
        symbol: TICKER_MOCK,
      });
    });
  });

  describe('getTokenBalance', () => {
    it('returns balance from controller state', () => {
      getTokenBalanceControllerStateMock.mockReturnValue({
        tokenBalances: {
          [FROM_MOCK]: {
            [CHAIN_ID_MOCK]: {
              [TOKEN_ADDRESS_MOCK]: BALANCE_MOCK,
            },
          },
        },
      });

      const result = getTokenBalance(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK.toLowerCase() as Hex,
      );

      expect(result).toBe('291');
    });

    it('returns zero if token not found', () => {
      getTokenBalanceControllerStateMock.mockReturnValue({
        tokenBalances: {},
      });

      const result = getTokenBalance(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK.toLowerCase() as Hex,
      );

      expect(result).toBe('0');
    });

    it('returns native balance', () => {
      getTokenBalanceControllerStateMock.mockReturnValue({
        tokenBalances: {},
      });

      getAccountTrackerControllerStateMock.mockReturnValue({
        accountsByChainId: {
          [CHAIN_ID_MOCK]: {
            [FROM_MOCK]: {
              balance: '0x123',
            },
          },
        },
      });

      const result = getTokenBalance(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        NATIVE_TOKEN_ADDRESS,
      );

      expect(result).toBe('291');
    });

    it('returns zero if native balance not found', () => {
      getTokenBalanceControllerStateMock.mockReturnValue({
        tokenBalances: {},
      });

      getAccountTrackerControllerStateMock.mockReturnValue({
        accountsByChainId: {
          [CHAIN_ID_MOCK]: {
            [FROM_MOCK]: {},
          },
        },
      } as AccountTrackerControllerState);

      const result = getTokenBalance(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        NATIVE_TOKEN_ADDRESS,
      );

      expect(result).toBe('0');
    });
  });

  describe('getTokenFiatRate', () => {
    it('returns fiat rates', () => {
      findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);

      getNetworkClientByIdMock.mockReturnValue({
        configuration: { ticker: TICKER_MOCK },
      } as never);

      getTokenRatesControllerStateMock.mockReturnValue({
        marketData: {
          [CHAIN_ID_MOCK]: {
            [TOKEN_ADDRESS_MOCK]: {
              price: 2.0,
            },
          },
        },
      } as TokenRatesControllerState);

      getCurrencyRateControllerStateMock.mockReturnValue({
        currencyRates: {
          [TICKER_MOCK]: {
            conversionRate: 3.0,
            usdConversionRate: 4.0,
          },
        },
      });

      const result = getTokenFiatRate(
        messenger,
        TOKEN_ADDRESS_MOCK,
        CHAIN_ID_MOCK,
      );

      expect(result).toStrictEqual({
        fiatRate: '6',
        usdRate: '8',
      });
    });

    it('returns undefined if no network configuration', () => {
      findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);
      getNetworkClientByIdMock.mockReturnValue(undefined as never);

      const result = getTokenFiatRate(
        messenger,
        TOKEN_ADDRESS_MOCK,
        CHAIN_ID_MOCK,
      );

      expect(result).toBeUndefined();
    });

    it('returns undefined if no price', () => {
      findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);

      getNetworkClientByIdMock.mockReturnValue({
        configuration: { ticker: TICKER_MOCK },
      } as never);

      getTokenRatesControllerStateMock.mockReturnValue({
        marketData: {
          [CHAIN_ID_MOCK]: {},
        },
      });

      const result = getTokenFiatRate(
        messenger,
        TOKEN_ADDRESS_MOCK,
        CHAIN_ID_MOCK,
      );

      expect(result).toBeUndefined();
    });

    it('returns undefined if no currency rate', () => {
      findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);

      getNetworkClientByIdMock.mockReturnValue({
        configuration: { ticker: TICKER_MOCK },
      } as never);

      getTokenRatesControllerStateMock.mockReturnValue({
        marketData: {
          [CHAIN_ID_MOCK]: {
            [TOKEN_ADDRESS_MOCK]: {
              price: 2.0,
            },
          },
        },
      } as TokenRatesControllerState);

      getCurrencyRateControllerStateMock.mockReturnValue({
        currencyRates: {},
      });

      const result = getTokenFiatRate(
        messenger,
        TOKEN_ADDRESS_MOCK,
        CHAIN_ID_MOCK,
      );

      expect(result).toBeUndefined();
    });

    it('returns native rate if native token', () => {
      findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);

      getNetworkClientByIdMock.mockReturnValue({
        configuration: { ticker: TICKER_MOCK },
      } as never);

      getCurrencyRateControllerStateMock.mockReturnValue({
        currencyRates: {
          [TICKER_MOCK]: {
            conversionRate: 3.0,
            usdConversionRate: 4.0,
          },
        },
      });

      getTokenRatesControllerStateMock.mockReturnValue({
        marketData: {},
      });

      const result = getTokenFiatRate(
        messenger,
        NATIVE_TOKEN_ADDRESS,
        CHAIN_ID_MOCK,
      );

      expect(result).toStrictEqual({
        fiatRate: '3',
        usdRate: '4',
      });
    });

    it('returns fixed usd rate for stablecoins', () => {
      findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);

      getNetworkClientByIdMock.mockReturnValue({
        configuration: { ticker: TICKER_MOCK },
      } as never);

      getTokenRatesControllerStateMock.mockReturnValue({
        marketData: {
          [CHAIN_ID_POLYGON]: {
            [POLYGON_USDCE_ADDRESS]: {
              price: 1.0,
            },
          },
        },
      } as TokenRatesControllerState);

      getCurrencyRateControllerStateMock.mockReturnValue({
        currencyRates: {
          [TICKER_MOCK]: {
            conversionRate: 3.0,
            usdConversionRate: 4.0,
          },
        },
      });

      const result = getTokenFiatRate(
        messenger,
        POLYGON_USDCE_ADDRESS,
        CHAIN_ID_POLYGON,
      );

      expect(result).toStrictEqual({
        fiatRate: '3',
        usdRate: '1',
      });
    });
  });

  describe('getNativeToken', () => {
    it('returns alternate address for polygon', () => {
      expect(getNativeToken('0x89')).toBe(
        '0x0000000000000000000000000000000000001010',
      );
    });

    it('returns zero address for other chains', () => {
      expect(getNativeToken('0x1')).toBe(NATIVE_TOKEN_ADDRESS);
    });
  });

  describe('getLiveTokenBalance', () => {
    it('returns ERC-20 balance via contract balanceOf', async () => {
      mockBalanceOf.mockResolvedValue({ toString: () => '5000000' });

      const result = await getLiveTokenBalance(
        messenger,
        ACCOUNT_MOCK,
        CHAIN_ID_MOCK,
        ERC20_ADDRESS_MOCK,
      );

      expect(result).toBe('5000000');
      expect(findNetworkClientIdByChainIdMock).toHaveBeenCalledWith(
        CHAIN_ID_MOCK,
      );
      expect(getNetworkClientByIdMock).toHaveBeenCalledWith(
        NETWORK_CLIENT_ID_MOCK,
      );
      expect(Web3Provider).toHaveBeenCalledWith(PROVIDER_MOCK);
      expect(Contract).toHaveBeenCalledWith(
        ERC20_ADDRESS_MOCK,
        expect.anything(),
        expect.anything(),
      );
      expect(mockBalanceOf).toHaveBeenCalledWith(ACCOUNT_MOCK);
    });

    it('returns native balance via ethersProvider.getBalance', async () => {
      mockGetBalance.mockResolvedValue({
        toString: () => '1000000000000000000',
      });

      const result = await getLiveTokenBalance(
        messenger,
        ACCOUNT_MOCK,
        CHAIN_ID_MOCK,
        NATIVE_TOKEN_ADDRESS,
      );

      expect(result).toBe('1000000000000000000');
      expect(mockGetBalance).toHaveBeenCalledWith(ACCOUNT_MOCK);
      expect(Contract).not.toHaveBeenCalled();
    });

    it('returns native balance for polygon native address', async () => {
      mockGetBalance.mockResolvedValue({
        toString: () => '2000000000000000000',
      });

      const result = await getLiveTokenBalance(
        messenger,
        ACCOUNT_MOCK,
        '0x89' as Hex,
        '0x0000000000000000000000000000000000001010' as Hex,
      );

      expect(result).toBe('2000000000000000000');
      expect(mockGetBalance).toHaveBeenCalledWith(ACCOUNT_MOCK);
      expect(Contract).not.toHaveBeenCalled();
    });

    it('treats native address comparison as case-insensitive', async () => {
      mockGetBalance.mockResolvedValue({ toString: () => '500' });

      const result = await getLiveTokenBalance(
        messenger,
        ACCOUNT_MOCK,
        CHAIN_ID_MOCK,
        NATIVE_TOKEN_ADDRESS.toUpperCase() as Hex,
      );

      expect(result).toBe('500');
      expect(mockGetBalance).toHaveBeenCalledWith(ACCOUNT_MOCK);
      expect(Contract).not.toHaveBeenCalled();
    });
  });

  describe('computeTokenAmounts', () => {
    it('computes amount fields from raw value, decimals, and fiat rates', () => {
      const result = computeTokenAmounts('1230000', 6, {
        usdRate: '3.0',
        fiatRate: '2.0',
      });

      expect(result).toStrictEqual({
        raw: '1230000',
        human: '1.23',
        usd: '3.69',
        fiat: '2.46',
      });
    });

    it('handles zero balance', () => {
      const result = computeTokenAmounts('0', 18, {
        usdRate: '2000',
        fiatRate: '1500',
      });

      expect(result).toStrictEqual({
        raw: '0',
        human: '0',
        usd: '0',
        fiat: '0',
      });
    });

    it('accepts BigNumber.Value input types', () => {
      const result = computeTokenAmounts('0x12d687', 6, {
        usdRate: '1.0',
        fiatRate: '0.85',
      });

      expect(result).toStrictEqual({
        raw: '1234567',
        human: '1.234567',
        usd: '1.234567',
        fiat: '1.04938195',
      });
    });
  });

  describe('getAllTokenBalances', () => {
    it('returns all token balances including native token', () => {
      getTokenBalanceControllerStateMock.mockReturnValue({
        tokenBalances: {
          [FROM_MOCK]: {
            '0x1': {
              [TOKEN_ADDRESS_MOCK]: '0x10',
              [TOKEN_ADDRESS_2_MOCK]: '0x20',
            },
            '0x2': {
              [TOKEN_ADDRESS_MOCK]: '0x30',
            },
          },
        },
      });

      getAccountTrackerControllerStateMock.mockReturnValue({
        accountsByChainId: {
          '0x1': {
            [FROM_MOCK]: {
              balance: '0x40',
            },
          },
          '0x2': {
            [FROM_MOCK]: {
              balance: '0x50',
            },
          },
          '0x3': {
            [FROM_MOCK]: {
              balance: '0x60',
            },
          },
        },
      });

      const result = getAllTokenBalances(messenger, FROM_MOCK);

      expect(result).toStrictEqual([
        { chainId: '0x1', tokenAddress: TOKEN_ADDRESS_MOCK, balance: '16' },
        { chainId: '0x1', tokenAddress: TOKEN_ADDRESS_2_MOCK, balance: '32' },
        { chainId: '0x1', tokenAddress: NATIVE_TOKEN_ADDRESS, balance: '64' },
        { chainId: '0x2', tokenAddress: TOKEN_ADDRESS_MOCK, balance: '48' },
        { chainId: '0x2', tokenAddress: NATIVE_TOKEN_ADDRESS, balance: '80' },
        { chainId: '0x3', tokenAddress: NATIVE_TOKEN_ADDRESS, balance: '96' },
      ]);
    });
  });

  describe('isSameToken', () => {
    it('returns true for same address and chain', () => {
      const token1 = { address: TOKEN_ADDRESS_MOCK, chainId: CHAIN_ID_MOCK };
      const token2 = { address: TOKEN_ADDRESS_MOCK, chainId: CHAIN_ID_MOCK };

      expect(isSameToken(token1, token2)).toBe(true);
    });

    it('returns true for same address with different case', () => {
      const token1 = {
        address: TOKEN_ADDRESS_MOCK.toLowerCase() as Hex,
        chainId: CHAIN_ID_MOCK,
      };
      const token2 = {
        address: TOKEN_ADDRESS_MOCK.toUpperCase() as Hex,
        chainId: CHAIN_ID_MOCK,
      };

      expect(isSameToken(token1, token2)).toBe(true);
    });

    it('returns false for different addresses', () => {
      const token1 = { address: TOKEN_ADDRESS_MOCK, chainId: CHAIN_ID_MOCK };
      const token2 = { address: TOKEN_ADDRESS_2_MOCK, chainId: CHAIN_ID_MOCK };

      expect(isSameToken(token1, token2)).toBe(false);
    });

    it('returns false for different chains', () => {
      const token1 = { address: TOKEN_ADDRESS_MOCK, chainId: CHAIN_ID_MOCK };
      const token2 = { address: TOKEN_ADDRESS_MOCK, chainId: '0x89' as Hex };

      expect(isSameToken(token1, token2)).toBe(false);
    });

    it('returns false for different address and chain', () => {
      const token1 = { address: TOKEN_ADDRESS_MOCK, chainId: CHAIN_ID_MOCK };
      const token2 = { address: TOKEN_ADDRESS_2_MOCK, chainId: '0x89' as Hex };

      expect(isSameToken(token1, token2)).toBe(false);
    });
  });
});
