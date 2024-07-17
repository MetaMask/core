import DefaultExport from '.';
import SmartTransactionsController from './SmartTransactionsController';

describe('default export', () => {
  it('exports SmartTransactionsController', () => {
    jest.useFakeTimers();
    const controller = new DefaultExport({
      onNetworkStateChange: jest.fn(),
      getNonceLock: null,
      provider: { sendAsync: jest.fn() },
      confirmExternalTransaction: jest.fn(),
      getTransactions: jest.fn(),
      trackMetaMetricsEvent: jest.fn(),
      getNetworkClientById: jest.fn(),
      getMetaMetricsProps: jest.fn(async () => {
        return Promise.resolve({});
      }),
    });
    expect(controller).toBeInstanceOf(SmartTransactionsController);
    jest.clearAllTimers();
  });
});
