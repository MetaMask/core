import { TransactionPayStrategy } from '../constants';
import { AcrossStrategy } from '../strategy/across/AcrossStrategy';
import { BridgeStrategy } from '../strategy/bridge/BridgeStrategy';
import { FiatStrategy } from '../strategy/fiat/FiatStrategy';
import { RelayStrategy } from '../strategy/relay/RelayStrategy';
import { TestStrategy } from '../strategy/test/TestStrategy';
import { getStrategiesByName, getStrategyByName } from './strategy';

describe('Strategy Utils', () => {
  describe('getStrategyByName', () => {
    it('returns AcrossStrategy if strategy name is Across', () => {
      const strategy = getStrategyByName(TransactionPayStrategy.Across);
      expect(strategy).toBeInstanceOf(AcrossStrategy);
    });

    it('returns TestStrategy if strategy name is Test', () => {
      const strategy = getStrategyByName(TransactionPayStrategy.Test);
      expect(strategy).toBeInstanceOf(TestStrategy);
    });

    it('returns BridgeStrategy if strategy name is Bridge', () => {
      const strategy = getStrategyByName(TransactionPayStrategy.Bridge);
      expect(strategy).toBeInstanceOf(BridgeStrategy);
    });

    it('returns RelayStrategy if strategy name is Relay', () => {
      const strategy = getStrategyByName(TransactionPayStrategy.Relay);
      expect(strategy).toBeInstanceOf(RelayStrategy);
    });

    it('returns FiatStrategy if strategy name is Fiat', () => {
      const strategy = getStrategyByName(TransactionPayStrategy.Fiat);
      expect(strategy).toBeInstanceOf(FiatStrategy);
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
        TransactionPayStrategy.Test,
        TransactionPayStrategy.Bridge,
        TransactionPayStrategy.Relay,
        TransactionPayStrategy.Fiat,
      ]);

      expect(strategies).toHaveLength(4);
      expect(strategies[0].name).toBe(TransactionPayStrategy.Test);
      expect(strategies[1].name).toBe(TransactionPayStrategy.Bridge);
      expect(strategies[2].name).toBe(TransactionPayStrategy.Relay);
      expect(strategies[3].name).toBe(TransactionPayStrategy.Fiat);
      expect(strategies[0].strategy).toBeInstanceOf(TestStrategy);
      expect(strategies[1].strategy).toBeInstanceOf(BridgeStrategy);
      expect(strategies[2].strategy).toBeInstanceOf(RelayStrategy);
      expect(strategies[3].strategy).toBeInstanceOf(FiatStrategy);
    });

    it('skips unknown strategies and calls callback', () => {
      const onUnknownStrategy = jest.fn();

      const strategies = getStrategiesByName(
        [
          TransactionPayStrategy.Test,
          'UnknownStrategy' as TransactionPayStrategy,
          TransactionPayStrategy.Relay,
        ],
        onUnknownStrategy,
      );

      expect(strategies.map(({ name }) => name)).toStrictEqual([
        TransactionPayStrategy.Test,
        TransactionPayStrategy.Relay,
      ]);
      expect(onUnknownStrategy).toHaveBeenCalledWith('UnknownStrategy');
    });
  });
});
