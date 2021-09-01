import { NetworkState } from '@metamask/controllers';
import SmartTransactionsController, {
  DEFAULT_INTERVAL,
} from './SmartTransactionsController';

describe('SmartTransactionsController', () => {
  let smartTransactionsController: SmartTransactionsController;
  let networkListener: (networkState: NetworkState) => void;

  beforeEach(() => {
    smartTransactionsController = new SmartTransactionsController({
      onNetworkStateChange: (listener) => {
        networkListener = listener;
      },
    });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await smartTransactionsController.stop();
  });

  it('should initialize with default config', () => {
    expect(smartTransactionsController.config).toStrictEqual({
      interval: DEFAULT_INTERVAL,
      allowedNetworks: ['1'],
      chainId: '',
    });
  });

  it('should initialize with default state', () => {
    expect(smartTransactionsController.state).toStrictEqual({
      smartTransactions: {},
      userOptIn: undefined,
    });
  });

  describe('onNetworkChange', () => {
    it('should be triggered', () => {
      networkListener({ provider: { chainId: '52' } } as NetworkState);
      expect(smartTransactionsController.config.chainId).toBe('52');
    });

    it('should call poll', () => {
      const pollSpy = jest.spyOn(smartTransactionsController, 'poll');
      networkListener({ provider: { chainId: '2' } } as NetworkState);
      expect(pollSpy).toHaveBeenCalled();
    });
  });

  describe('poll', () => {
    it('should poll with interval', async () => {
      const interval = 35000;
      const pollSpy = jest.spyOn(smartTransactionsController, 'poll');
      const updateSmartTransactionsSpy = jest.spyOn(
        smartTransactionsController,
        'updateSmartTransactions',
      );
      expect(pollSpy).toHaveBeenCalledTimes(0);
      expect(updateSmartTransactionsSpy).toHaveBeenCalledTimes(0);
      networkListener({ provider: { chainId: '1' } } as NetworkState);
      expect(pollSpy).toHaveBeenCalledTimes(1);
      expect(updateSmartTransactionsSpy).toHaveBeenCalledTimes(1);
      await smartTransactionsController.stop();
      jest.useFakeTimers();
      await smartTransactionsController.poll(interval);
      expect(pollSpy).toHaveBeenCalledTimes(2);
      expect(updateSmartTransactionsSpy).toHaveBeenCalledTimes(2);
      jest.advanceTimersByTime(interval);
      expect(pollSpy).toHaveBeenCalledTimes(3);
      expect(updateSmartTransactionsSpy).toHaveBeenCalledTimes(3);
      await smartTransactionsController.stop();
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('should not updateSmartTransactions on unsupported networks', async () => {
      const updateSmartTransactionsSpy = jest.spyOn(
        smartTransactionsController,
        'updateSmartTransactions',
      );
      expect(updateSmartTransactionsSpy).not.toHaveBeenCalled();
      networkListener({ provider: { chainId: '56' } } as NetworkState);
      expect(updateSmartTransactionsSpy).not.toHaveBeenCalled();
    });
  });

  describe('setOptInState', () => {
    it('should set optIn state', () => {
      smartTransactionsController.setOptInState(true);
      expect(smartTransactionsController.state.userOptIn).toBe(true);
      smartTransactionsController.setOptInState(false);
      expect(smartTransactionsController.state.userOptIn).toBe(false);
      smartTransactionsController.setOptInState(undefined);
      expect(smartTransactionsController.state.userOptIn).toBeUndefined();
    });
  });
});
