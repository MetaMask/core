import SmartTransactionsController from './SmartTransactionsController';
import DefaultExport from '.';

describe('default export', () => {
  it('exports SmartTransactionsController', () => {
    expect(
      new DefaultExport({
        onNetworkStateChange: jest.fn(),
      }),
    ).toBeInstanceOf(SmartTransactionsController);
  });
});
