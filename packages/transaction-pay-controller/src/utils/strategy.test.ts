import { getStrategiesByName, getStrategyByName } from './strategy';
import { TransactionPayStrategy } from '../constants';
import { BridgeStrategy } from '../strategy/bridge/BridgeStrategy';
import { RelayStrategy } from '../strategy/relay/RelayStrategy';
import { TestStrategy } from '../strategy/test/TestStrategy';

describe('Strategy Utils', () => {
  describe('getStrategyByName', () => {
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
      ]);

      expect(strategies).toHaveLength(3);
      expect(strategies[0].name).toBe(TransactionPayStrategy.Test);
      expect(strategies[1].name).toBe(TransactionPayStrategy.Bridge);
      expect(strategies[2].name).toBe(TransactionPayStrategy.Relay);
      expect(strategies[0].strategy).toBeInstanceOf(TestStrategy);
      expect(strategies[1].strategy).toBeInstanceOf(BridgeStrategy);
      expect(strategies[2].strategy).toBeInstanceOf(RelayStrategy);
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
