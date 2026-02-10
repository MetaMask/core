import type { TransactionMeta } from '@metamask/transaction-controller';

import { getStrategies, getStrategyByName } from './strategy';
import { TransactionPayStrategy } from '../constants';
import { AcrossStrategy } from '../strategy/across/AcrossStrategy';
import { BridgeStrategy } from '../strategy/bridge/BridgeStrategy';
import { RelayStrategy } from '../strategy/relay/RelayStrategy';
import { TestStrategy } from '../strategy/test/TestStrategy';
import { getMessengerMock } from '../tests/messenger-mock';

const TRANSACTION_META_MOCK = {} as TransactionMeta;

describe('Strategy Utils', () => {
  const { messenger, getStrategiesMock } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getStrategies', () => {
    it('returns ordered strategies for provided names', () => {
      getStrategiesMock.mockReturnValue([
        TransactionPayStrategy.Test,
        TransactionPayStrategy.Relay,
      ]);

      const strategies = getStrategies(messenger, TRANSACTION_META_MOCK);

      expect(strategies[0]).toBeInstanceOf(TestStrategy);
      expect(strategies[1]).toBeInstanceOf(RelayStrategy);
    });

    it('filters unknown strategies', () => {
      getStrategiesMock.mockReturnValue([
        'UnknownStrategy' as never,
        TransactionPayStrategy.Bridge,
      ]);

      const strategies = getStrategies(messenger, TRANSACTION_META_MOCK);

      expect(strategies).toHaveLength(1);
      expect(strategies[0]).toBeInstanceOf(BridgeStrategy);
    });

    it('returns empty list if no strategies are configured', () => {
      getStrategiesMock.mockReturnValue(undefined as never);

      const strategies = getStrategies(messenger, TRANSACTION_META_MOCK);

      expect(strategies).toStrictEqual([]);
    });
  });

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

    it('throws if strategy name is unknown', () => {
      expect(() => getStrategyByName('UnknownStrategy' as never)).toThrow(
        'Unknown strategy: UnknownStrategy',
      );
    });
  });
});
