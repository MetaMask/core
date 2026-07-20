import { TransactionPayStrategy } from '../constants';
import { AcrossStrategy } from '../strategy/across/AcrossStrategy';
import { FiatStrategy } from '../strategy/fiat/FiatStrategy';
import { RelayStrategy } from '../strategy/relay/RelayStrategy';
import { ServerStrategy } from '../strategy/server/ServerStrategy';
import type { PayStrategyGetQuotesRequest } from '../types';
import {
  checkStrategyQuoteSupport,
  checkStrategySupport,
  getStrategiesByName,
  getStrategyByName,
} from './strategy';

describe('Strategy Utils', () => {
  describe('getStrategyByName', () => {
    it('returns AcrossStrategy if strategy name is Across', () => {
      const strategy = getStrategyByName(TransactionPayStrategy.Across);
      expect(strategy).toBeInstanceOf(AcrossStrategy);
    });

    it('returns RelayStrategy if strategy name is Relay', () => {
      const strategy = getStrategyByName(TransactionPayStrategy.Relay);
      expect(strategy).toBeInstanceOf(RelayStrategy);
    });

    it('returns FiatStrategy if strategy name is Fiat', () => {
      const strategy = getStrategyByName(TransactionPayStrategy.Fiat);
      expect(strategy).toBeInstanceOf(FiatStrategy);
    });

    it('returns ServerStrategy if strategy name is Server', () => {
      const strategy = getStrategyByName(TransactionPayStrategy.Server);
      expect(strategy).toBeInstanceOf(ServerStrategy);
    });

    it('throws if strategy name is unknown', () => {
      expect(() => getStrategyByName('UnknownStrategy' as never)).toThrow(
        'Unknown strategy: UnknownStrategy',
      );
    });
  });

  describe('getStrategiesByName', () => {
    it('returns strategies in input order', () => {
      const strategies = getStrategiesByName([
        TransactionPayStrategy.Across,
        TransactionPayStrategy.Relay,
        TransactionPayStrategy.Fiat,
        TransactionPayStrategy.Server,
      ]);

      expect(strategies).toHaveLength(4);
      expect(strategies[0].name).toBe(TransactionPayStrategy.Across);
      expect(strategies[1].name).toBe(TransactionPayStrategy.Relay);
      expect(strategies[2].name).toBe(TransactionPayStrategy.Fiat);
      expect(strategies[3].name).toBe(TransactionPayStrategy.Server);
      expect(strategies[0].strategy).toBeInstanceOf(AcrossStrategy);
      expect(strategies[1].strategy).toBeInstanceOf(RelayStrategy);
      expect(strategies[2].strategy).toBeInstanceOf(FiatStrategy);
      expect(strategies[3].strategy).toBeInstanceOf(ServerStrategy);
    });

    it('skips unknown strategies and calls callback', () => {
      const onUnknownStrategy = jest.fn();

      const strategies = getStrategiesByName(
        [
          TransactionPayStrategy.Across,
          'UnknownStrategy' as TransactionPayStrategy,
          TransactionPayStrategy.Relay,
        ],
        onUnknownStrategy,
      );

      expect(strategies.map(({ name }) => name)).toStrictEqual([
        TransactionPayStrategy.Across,
        TransactionPayStrategy.Relay,
      ]);
      expect(onUnknownStrategy).toHaveBeenCalledWith('UnknownStrategy');
    });
  });

  describe('checkStrategySupport', () => {
    const request = {} as PayStrategyGetQuotesRequest;

    it('uses supports when available', async () => {
      const strategy = {
        getQuotes: jest.fn(),
        execute: jest.fn(),
        supports: jest.fn().mockReturnValue(true),
      };

      expect(await checkStrategySupport(strategy, request)).toBe(true);
      expect(strategy.supports).toHaveBeenCalledWith(request);
    });

    it('supports async supports checks', async () => {
      const strategy = {
        getQuotes: jest.fn(),
        execute: jest.fn(),
        supports: jest.fn().mockResolvedValue(false),
      };

      expect(await checkStrategySupport(strategy, request)).toBe(false);
      expect(strategy.supports).toHaveBeenCalledWith(request);
    });

    it('defaults to supported when no support check is provided', async () => {
      const strategy = {
        getQuotes: jest.fn(),
        execute: jest.fn(),
      };

      expect(await checkStrategySupport(strategy, request)).toBe(true);
    });
  });

  describe('checkStrategyQuoteSupport', () => {
    const request = {
      quotes: [],
    } as never;

    it('uses checkQuoteSupport when available', async () => {
      const strategy = {
        checkQuoteSupport: jest.fn().mockReturnValue(false),
        getQuotes: jest.fn(),
        execute: jest.fn(),
      };

      expect(await checkStrategyQuoteSupport(strategy, request)).toBe(false);
      expect(strategy.checkQuoteSupport).toHaveBeenCalledWith(request);
    });

    it('defaults to supported when no post-quote support check is provided', async () => {
      const strategy = {
        getQuotes: jest.fn(),
        execute: jest.fn(),
      };

      expect(await checkStrategyQuoteSupport(strategy, request)).toBe(true);
    });
  });
});
