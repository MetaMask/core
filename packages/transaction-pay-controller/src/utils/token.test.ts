import type { TokensControllerState } from '@metamask/assets-controllers';
import type { AccountTrackerControllerState } from '@metamask/assets-controllers';
import type { TokenRatesControllerState } from '@metamask/assets-controllers';
import type { Hex } from '@metamask/utils';

import {
  getTokenBalance,
  getTokenInfo,
  getTokenFiatRate,
  getAllTokenBalances,
  getNativeToken,
} from './token';
import { NATIVE_TOKEN_ADDRESS } from '../constants';
import { getMessengerMock } from '../tests/messenger-mock';

const TOKEN_ADDRESS_MOCK = '0x559B65722aD62AD6DAC4Fa5a1c6B23A2e8ce57Ec' as Hex;
const TOKEN_ADDRESS_2_MOCK = '0x123456789abcdef1234567890abcdef12345678' as Hex;
const CHAIN_ID_MOCK = '0x1' as Hex;
const DECIMALS_MOCK = 6;
const BALANCE_MOCK = '0x123' as Hex;
const FROM_MOCK = '0x456' as Hex;
const NETWORK_CLIENT_ID_MOCK = '123-456';
const TICKER_MOCK = 'TST';
const SYMBOL_MOCK = 'TEST';

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

  beforeEach(() => {
    jest.resetAllMocks();
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
        TOKEN_ADDRESS_MOCK as Hex,
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
        TOKEN_ADDRESS_MOCK as Hex,
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
        TOKEN_ADDRESS_MOCK as Hex,
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
        TOKEN_ADDRESS_MOCK as Hex,
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
});
