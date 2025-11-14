import type { TransactionMeta } from '@metamask/transaction-controller';

import { getStrategy, getStrategyByName } from './strategy';
import { TransactionPayStrategy } from '../constants';
import { BridgeStrategy } from '../strategy/bridge/BridgeStrategy';
import { RelayStrategy } from '../strategy/relay/RelayStrategy';
import { TestStrategy } from '../strategy/test/TestStrategy';
import { getMessengerMock } from '../tests/messenger-mock';

const TRANSACTION_META_MOCK = {} as TransactionMeta;

describe('Strategy Utils', () => {
  const { messenger, getStrategyMock } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getStrategy', () => {
    it('returns TestStrategy if strategy name is Test', async () => {
      getStrategyMock.mockReturnValue(TransactionPayStrategy.Test);

      const strategy = getStrategy(messenger, TRANSACTION_META_MOCK);

      expect(strategy).toBeInstanceOf(TestStrategy);
    });

    it('returns BridgeStrategy if strategy name is Bridge', async () => {
      getStrategyMock.mockReturnValue(TransactionPayStrategy.Bridge);

      const strategy = getStrategy(messenger, TRANSACTION_META_MOCK);

      expect(strategy).toBeInstanceOf(BridgeStrategy);
    });

    it('returns RelayStrategy if strategy name is Relay', async () => {
      getStrategyMock.mockReturnValue(TransactionPayStrategy.Relay);

      const strategy = getStrategy(messenger, TRANSACTION_META_MOCK);

      expect(strategy).toBeInstanceOf(RelayStrategy);
    });

    it('throws if strategy name is unknown', async () => {
      getStrategyMock.mockReturnValue('UnknownStrategy' as never);

      expect(() => getStrategy(messenger, TRANSACTION_META_MOCK)).toThrow(
        'Unknown strategy: UnknownStrategy',
      );
    });
  });

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
});
