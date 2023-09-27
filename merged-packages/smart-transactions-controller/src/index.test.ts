import SmartTransactionsController from './SmartTransactionsController';
import DefaultExport from '.';

describe('default export', () => {
  it('exports SmartTransactionsController', () => {
    jest.useFakeTimers();
    const controller = new DefaultExport({
      onNetworkStateChange: jest.fn(),
      getNonceLock: null,
      provider: jest.fn(),
      confirmExternalTransaction: jest.fn(),
      trackMetaMetricsEvent: jest.fn(),
    });
    expect(controller).toBeInstanceOf(SmartTransactionsController);
    jest.clearAllTimers();
  });
});
