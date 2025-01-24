import {
  ResimulateHelper,
  type ResimulateHelperOptions,
} from './ResimulateHelper';
import type {
  BlockTracker,
  NetworkClientId,
} from '@metamask/network-controller';
import type { TransactionMeta } from '../types';
import { TransactionStatus } from '../types';

const mockTransactionMeta = {
  id: '1',
  networkClientId: 'network1' as NetworkClientId,
  isFocused: true,
  status: TransactionStatus.unapproved,
} as TransactionMeta;

describe('ResimulateHelper', () => {
  let blockTrackerMock: jest.Mocked<BlockTracker>;
  let getBlockTrackerMock: jest.Mock<
    (networkClientId: NetworkClientId) => BlockTracker
  >;
  let updateSimulationDataMock: jest.Mock<
    (transactionMeta: TransactionMeta) => void
  >;
  let getTransactionsMock: jest.Mock<() => TransactionMeta[]>;
  let onStateChangeMock: jest.Mock<(listener: () => void) => void>;

  let resimulateHelper: ResimulateHelper;

  beforeEach(() => {
    blockTrackerMock = {
      on: jest.fn(),
      removeListener: jest.fn(),
    } as unknown as jest.Mocked<BlockTracker>;

    getBlockTrackerMock = jest.fn().mockReturnValue(blockTrackerMock);
    updateSimulationDataMock = jest.fn();
    getTransactionsMock = jest.fn();
    onStateChangeMock = jest.fn();

    resimulateHelper = new ResimulateHelper({
      getBlockTracker: getBlockTrackerMock,
      getTransactions: getTransactionsMock,
      updateSimulationData: updateSimulationDataMock,
      onStateChange: onStateChangeMock,
    } as unknown as ResimulateHelperOptions);
  });

  it('assigns a block tracker listener to resimulate for a focused transaction', () => {
    resimulateHelper.start(mockTransactionMeta);

    expect(getBlockTrackerMock).toHaveBeenCalledWith(
      mockTransactionMeta.networkClientId,
    );
    expect(blockTrackerMock.on).toHaveBeenCalledWith(
      'latest',
      expect.any(Function),
    );
  });

  it('removes a block tracker listener for a transaction that is no longer focused', () => {
    resimulateHelper.start(mockTransactionMeta);

    const unfocusedTransactionMeta = {
      ...mockTransactionMeta,
      isFocused: false,
    } as TransactionMeta;

    resimulateHelper.stop(unfocusedTransactionMeta);

    expect(blockTrackerMock.removeListener).toHaveBeenCalledWith(
      'latest',
      expect.any(Function),
    );
  });

  it('does not add a block tracker listener for a transaction that is not focused', () => {
    resimulateHelper.start({
      ...mockTransactionMeta,
      isFocused: false,
    });

    expect(blockTrackerMock.on).not.toHaveBeenCalled();
  });

  it('does not add a block tracker listener for a transaction that is already resimulating', () => {
    resimulateHelper.start(mockTransactionMeta);
    resimulateHelper.start(mockTransactionMeta);

    expect(blockTrackerMock.on).toHaveBeenCalledTimes(1);
  });

  it('does not remove a block tracker listener for a transaction that is not resimulating', () => {
    resimulateHelper.stop(mockTransactionMeta);

    expect(blockTrackerMock.on).toHaveBeenCalledTimes(0);
  });

  describe('on Transaction Controller state change', () => {
    it('start and stop resimulations depending on the isFocused state', async () => {
      const firstTransactionMeta = {
        ...mockTransactionMeta,
        networkClientId: 'network1' as NetworkClientId,
        id: '1',
      } as TransactionMeta;

      const secondTransactionMeta = {
        ...mockTransactionMeta,
        networkClientId: 'network2' as NetworkClientId,
        id: '2',
      } as TransactionMeta;

      // Assume both transactions are started to put them in the activeResimulations state
      resimulateHelper.start(firstTransactionMeta);
      resimulateHelper.start(secondTransactionMeta);

      expect(getBlockTrackerMock).toHaveBeenCalledWith(
        firstTransactionMeta.networkClientId,
      );
      expect(getBlockTrackerMock).toHaveBeenCalledWith(
        secondTransactionMeta.networkClientId,
      );

      // Assume both transactions are still in the transaction list but second is not focused anymore
      getTransactionsMock.mockReturnValueOnce([
        firstTransactionMeta,
        {
          ...secondTransactionMeta,
          isFocused: false,
        },
      ] as unknown as ResimulateHelperOptions['getTransactions']);

      // Manually trigger the state change listener
      onStateChangeMock.mock.calls[0][0]();

      expect(blockTrackerMock.removeListener).toHaveBeenCalledWith(
        'latest',
        expect.any(Function),
      );

      // Manually trigger the block tracker listener
      const firstTransactionListener = blockTrackerMock.on.mock.calls[0][1];
      await firstTransactionListener();

      // Assert that first transaction is still in the activeResimulations state
      expect(updateSimulationDataMock).toHaveBeenCalledWith(
        firstTransactionMeta,
      );
    });

    it('forces to stop resimulation for a transaction that is no longer in transaction list', async () => {
      const firstTransactionMeta = {
        ...mockTransactionMeta,
        networkClientId: 'network1' as NetworkClientId,
        id: '1',
      } as TransactionMeta;

      const secondTransactionMeta = {
        ...mockTransactionMeta,
        networkClientId: 'network2' as NetworkClientId,
        id: '2',
      } as TransactionMeta;

      // Assume both transactions are started to put them in the activeResimulations state
      resimulateHelper.start(firstTransactionMeta);
      resimulateHelper.start(secondTransactionMeta);

      // On next state change, first transaction is still in the transaction list but second is not
      getTransactionsMock.mockReturnValueOnce([
        firstTransactionMeta,
      ] as unknown as ResimulateHelperOptions['getTransactions']);

      // Manually trigger the state change listener
      onStateChangeMock.mock.calls[0][0]();

      expect(blockTrackerMock.removeListener).toHaveBeenCalledWith(
        'latest',
        expect.any(Function),
      );

      // Manually trigger the block tracker listener
      const firstTransactionListener = blockTrackerMock.on.mock.calls[0][1];
      await firstTransactionListener();

      // Assert that first transaction is still in the activeResimulations state
      expect(updateSimulationDataMock).toHaveBeenCalledWith(
        firstTransactionMeta,
      );
    });
  });
});
