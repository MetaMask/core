import { Messenger } from '@metamask/base-controller';
import type { Hex } from '@metamask/utils';

import { getTokenBalance, getTokenInfo, getTokenFiatRate } from './token';
import type { TransactionPayControllerMessenger } from '..';
import type { AllowedActions } from '../types';

const TOKEN_ADDRESS_MOCK = '0x559B65722aD62AD6DAC4Fa5a1c6B23A2e8ce57Ec';
const CHAIN_ID_MOCK = '0x1';
const DECIMALS_MOCK = 6;
const BALANCE_MOCK = '0x123';
const FROM_MOCK = '0x456';
const NETWORK_CLIENT_ID_MOCK = '123-456';
const TICKER_MOCK = 'TST';
const SYMBOL_MOCK = 'TEST';

describe('Token Utils', () => {
  let baseMessenger: Messenger<AllowedActions, never>;
  let messengerMock: TransactionPayControllerMessenger;

  const getTokensControllerStateMock = jest.fn();
  const getTokenBalanceControllerStateMock = jest.fn();
  const findNetworkClientIdByChainIdMock = jest.fn();
  const getNetworkClientByIdMock = jest.fn();
  const getTokenRatesControllerStateMock = jest.fn();
  const getCurrencyRateControllerStateMock = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();

    baseMessenger = new Messenger();

    baseMessenger.registerActionHandler(
      'TokensController:getState',
      getTokensControllerStateMock,
    );

    baseMessenger.registerActionHandler(
      'TokenBalancesController:getState',
      getTokenBalanceControllerStateMock,
    );

    baseMessenger.registerActionHandler(
      'NetworkController:findNetworkClientIdByChainId',
      findNetworkClientIdByChainIdMock,
    );

    baseMessenger.registerActionHandler(
      'NetworkController:getNetworkClientById',
      getNetworkClientByIdMock,
    );

    baseMessenger.registerActionHandler(
      'TokenRatesController:getState',
      getTokenRatesControllerStateMock,
    );

    baseMessenger.registerActionHandler(
      'CurrencyRateController:getState',
      getCurrencyRateControllerStateMock,
    );

    messengerMock = baseMessenger.getRestricted({
      name: 'TransactionPayController',
      allowedActions: [
        'CurrencyRateController:getState',
        'NetworkController:findNetworkClientIdByChainId',
        'NetworkController:getNetworkClientById',
        'TokenBalancesController:getState',
        'TokenRatesController:getState',
        'TokensController:getState',
      ],
      allowedEvents: [],
    });
  });

  describe('getTokenInfo', () => {
    it('returns decimals and symbol from controller state', () => {
      getTokensControllerStateMock.mockReturnValue({
        allTokens: {
          [CHAIN_ID_MOCK]: {
            test123: [
              {
                address: TOKEN_ADDRESS_MOCK.toLowerCase(),
                decimals: DECIMALS_MOCK,
                symbol: SYMBOL_MOCK,
              },
            ],
          },
        },
      });

      const result = getTokenInfo(
        messengerMock,
        TOKEN_ADDRESS_MOCK,
        CHAIN_ID_MOCK,
      );

      expect(result).toStrictEqual({
        decimals: DECIMALS_MOCK,
        symbol: SYMBOL_MOCK,
      });
    });

    it('returns undefined if token is not found', () => {
      getTokensControllerStateMock.mockReturnValue({});

      const result = getTokenInfo(
        messengerMock,
        TOKEN_ADDRESS_MOCK,
        CHAIN_ID_MOCK,
      );

      expect(result).toBeUndefined();
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
        messengerMock,
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
        messengerMock,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK.toLowerCase() as Hex,
      );

      expect(result).toBe('0');
    });
  });

  describe('getTokenFiatRate', () => {
    it('returns fiat rates', () => {
      findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);

      getNetworkClientByIdMock.mockReturnValue({
        configuration: { ticker: TICKER_MOCK },
      });

      getTokenRatesControllerStateMock.mockReturnValue({
        marketData: {
          [CHAIN_ID_MOCK]: {
            [TOKEN_ADDRESS_MOCK]: {
              price: 2.0,
            },
          },
        },
      });

      getCurrencyRateControllerStateMock.mockReturnValue({
        currencyRates: {
          [TICKER_MOCK]: {
            conversionRate: 3.0,
            usdConversionRate: 4.0,
          },
        },
      });

      const result = getTokenFiatRate(
        messengerMock,
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

      getNetworkClientByIdMock.mockReturnValue(undefined);

      const result = getTokenFiatRate(
        messengerMock,
        TOKEN_ADDRESS_MOCK as Hex,
        CHAIN_ID_MOCK,
      );

      expect(result).toBeUndefined();
    });

    it('returns undefined if no price', () => {
      findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);

      getNetworkClientByIdMock.mockReturnValue({
        configuration: { ticker: TICKER_MOCK },
      });

      getTokenRatesControllerStateMock.mockReturnValue({
        marketData: {
          [CHAIN_ID_MOCK]: {},
        },
      });

      const result = getTokenFiatRate(
        messengerMock,
        TOKEN_ADDRESS_MOCK as Hex,
        CHAIN_ID_MOCK,
      );

      expect(result).toBeUndefined();
    });

    it('returns undefined if no currency rate', () => {
      findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);

      getNetworkClientByIdMock.mockReturnValue({
        configuration: { ticker: TICKER_MOCK },
      });

      getTokenRatesControllerStateMock.mockReturnValue({
        marketData: {
          [CHAIN_ID_MOCK]: {
            [TOKEN_ADDRESS_MOCK]: {
              price: 2.0,
            },
          },
        },
      });

      getCurrencyRateControllerStateMock.mockReturnValue({
        currencyRates: {},
      });

      const result = getTokenFiatRate(
        messengerMock,
        TOKEN_ADDRESS_MOCK as Hex,
        CHAIN_ID_MOCK,
      );

      expect(result).toBeUndefined();
    });
  });
});
