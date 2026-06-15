import {
  getMultichainAccountServiceMessenger,
  getRootMessenger,
  MOCK_WALLET_1_ENTROPY_SOURCE,
} from '../tests';
import { AccountProviderWrapper } from './AccountProviderWrapper';
import { EvmAccountProvider } from './EvmAccountProvider';

function setup(): {
  wrapper: AccountProviderWrapper;
  innerProvider: EvmAccountProvider;
} {
  const messenger = getRootMessenger();
  const serviceMessenger = getMultichainAccountServiceMessenger(messenger);
  const innerProvider = new EvmAccountProvider(serviceMessenger);
  const wrapper = new AccountProviderWrapper(serviceMessenger, innerProvider);
  return { wrapper, innerProvider };
}

describe('AccountProviderWrapper', () => {
  describe('isAligned', () => {
    it('returns true unconditionally when the wrapper is disabled', () => {
      const { wrapper } = setup();
      wrapper.setEnabled(false);

      expect(
        wrapper.isAligned(
          { entropySource: MOCK_WALLET_1_ENTROPY_SOURCE, groupIndex: 0 },
          [],
        ),
      ).toBe(true);

      expect(
        wrapper.isAligned(
          { entropySource: MOCK_WALLET_1_ENTROPY_SOURCE, groupIndex: 0 },
          ['some-id'],
        ),
      ).toBe(true);
    });

    it('delegates to the inner provider when enabled and accounts are owned', () => {
      const { wrapper, innerProvider } = setup();
      const accountId = 'owned-id';
      innerProvider.init([accountId]);

      expect(
        wrapper.isAligned(
          { entropySource: MOCK_WALLET_1_ENTROPY_SOURCE, groupIndex: 0 },
          [accountId],
        ),
      ).toBe(true);
    });

    it('delegates to the inner provider when enabled and accounts are not owned', () => {
      const { wrapper } = setup();

      expect(
        wrapper.isAligned(
          { entropySource: MOCK_WALLET_1_ENTROPY_SOURCE, groupIndex: 0 },
          [],
        ),
      ).toBe(false);
    });
  });
});
