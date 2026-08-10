import {
  getMultichainAccountServiceMessenger,
  getRootMessenger,
  MOCK_WALLET_1_ENTROPY_SOURCE,
} from '../tests/index.js';
import { AccountProviderWrapper } from './AccountProviderWrapper.js';
import { EvmAccountProvider } from './EvmAccountProvider.js';

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
  describe('ensureReady', () => {
    it('delegates to the inner provider when enabled', async () => {
      const { wrapper, innerProvider } = setup();
      const ensureReadySpy = jest.spyOn(innerProvider, 'ensureReady');

      await wrapper.ensureReady();

      expect(ensureReadySpy).toHaveBeenCalledTimes(1);
    });

    it('returns immediately without calling the inner provider when disabled', async () => {
      const { wrapper, innerProvider } = setup();
      wrapper.setEnabled(false);
      const ensureReadySpy = jest.spyOn(innerProvider, 'ensureReady');

      await wrapper.ensureReady();

      expect(ensureReadySpy).not.toHaveBeenCalled();
    });
  });

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
