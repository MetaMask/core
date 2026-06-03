import { TransactionController } from '@metamask/transaction-controller';

import { defaultConfigurations } from '../../defaults';
import { transactionController } from './transaction-controller';
import type { TransactionControllerInstanceOptions } from './types';

const MOCK_STATE = {
  methodData: {},
  transactions: [],
  transactionBatches: [],
  lastFetchedBlockNumbers: {},
  submitHistory: [],
};

jest.mock('@metamask/transaction-controller', () => ({
  TransactionController: jest.fn(),
}));

function buildOptions(
  overrides: Partial<TransactionControllerInstanceOptions> = {},
): TransactionControllerInstanceOptions {
  return {
    disableSwaps: false,
    hooks: {},
    isFirstTimeInteractionEnabled: () => false,
    isSimulationEnabled: () => false,
    ...overrides,
  };
}

describe('transactionController', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(
      transactionController,
    );
  });

  it('initializes a TransactionController with the provided state', () => {
    jest.mocked(TransactionController).mockImplementation(function (this: {
      state: unknown;
    }) {
      this.state = MOCK_STATE;
    } as never);

    transactionController.init({
      state: MOCK_STATE,
      // @ts-expect-error Messenger not needed for this assertion.
      messenger: {},
      options: buildOptions(),
    });

    expect(TransactionController).toHaveBeenCalledWith(
      expect.objectContaining({ state: MOCK_STATE }),
    );
  });

  it('disables incoming transactions', () => {
    jest.mocked(TransactionController).mockImplementation(function (this: {
      state: unknown;
    }) {
      this.state = MOCK_STATE;
    } as never);

    transactionController.init({
      state: undefined,
      // @ts-expect-error Messenger not needed for this assertion.
      messenger: {},
      options: buildOptions(),
    });

    const opts = (
      TransactionController as jest.MockedClass<typeof TransactionController>
    ).mock.calls[0][0];

    expect(opts.incomingTransactions?.isEnabled?.()).toBe(false);
  });
});
