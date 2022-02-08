import SmartTransactionsController from './SmartTransactionsController';
import DefaultExport from '.';

describe('default export', () => {
  it('exports SmartTransactionsController', () => {
    jest.useFakeTimers();
    const controller = new DefaultExport({
      onNetworkStateChange: jest.fn(),
      getNonceLock: null,
      provider: jest.fn(),
      getNetwork: jest.fn(() => '1'),
      txController: {},
      trackMetaMetricsEvent: jest.fn(),
    });
    expect(controller).toBeInstanceOf(SmartTransactionsController);
    jest.clearAllTimers();
  });
});
