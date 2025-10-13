import { Messenger } from '@metamask/base-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

import { getStrategy } from './strategy';
import type { TransactionPayPublishHookMessenger } from '..';
import { TransactionPayStrategy } from '../constants';
import { BridgeStrategy } from '../strategy/bridge/BridgeStrategy';
import { TestStrategy } from '../strategy/test/TestStrategy';

const TRANSACTION_META_MOCK = {} as TransactionMeta;

describe('Strategy Utils', () => {
  let messenger: TransactionPayPublishHookMessenger;
  const getStrategyMessengerMock = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();

    messenger = new Messenger();

    messenger.registerActionHandler(
      'TransactionPayController:getStrategy',
      getStrategyMessengerMock as never,
    );
  });

  describe('getStrategy', () => {
    it('returns TestStrategy if strategy name is Test', async () => {
      getStrategyMessengerMock.mockResolvedValue(TransactionPayStrategy.Test);

      const strategy = await getStrategy(messenger, TRANSACTION_META_MOCK);

      expect(strategy).toBeInstanceOf(TestStrategy);
    });

    it('returns BridgeStrategy if strategy name is Bridge', async () => {
      getStrategyMessengerMock.mockResolvedValue(TransactionPayStrategy.Bridge);

      const strategy = await getStrategy(messenger, TRANSACTION_META_MOCK);

      expect(strategy).toBeInstanceOf(BridgeStrategy);
    });

    it('throws if strategy name is unknown', async () => {
      getStrategyMessengerMock.mockResolvedValue('UnknownStrategy');

      await expect(
        getStrategy(messenger, TRANSACTION_META_MOCK),
      ).rejects.toThrow('Unknown strategy: UnknownStrategy');
    });
  });
});
