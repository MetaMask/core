import { query } from '@metamask/controller-utils';

import {
  updatePostTransactionBalance,
  UPDATE_POST_TX_BALANCE_ATTEMPTS,
  SWAPS_CHAINID_DEFAULT_TOKEN_MAP,
} from './swaps';
import { CHAIN_IDS } from '../constants';
import type { TransactionMeta } from '../types';

jest.mock('@metamask/controller-utils');

describe('updatePostTransactionBalance', () => {
  const queryMock = jest.mocked(query);
  let transactionMeta: TransactionMeta;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let request: any;

  beforeEach(() => {
    transactionMeta = {
      id: '1',
      txParams: {
        from: '0x123',
      },
      preTxBalance: '100',
      destinationTokenAddress:
        SWAPS_CHAINID_DEFAULT_TOKEN_MAP[CHAIN_IDS.MAINNET].address,
      chainId: CHAIN_IDS.MAINNET,
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    request = {
      ethQuery: {},
      getTransaction: jest.fn().mockReturnValue(transactionMeta),
      updateTransaction: jest.fn(),
    };
  });

  it('updates post transaction balance', async () => {
    const mockPostTxBalance = '200';
    queryMock.mockResolvedValue(mockPostTxBalance);

    // First call to getTransaction returns transactionMeta
    // Second call to getTransaction returns approvalTransactionMeta
    jest
      .spyOn(request, 'getTransaction')
      .mockImplementation()
      .mockReturnValueOnce(transactionMeta)
      .mockReturnValueOnce(undefined);

    const expectedTransactionMeta = {
      ...transactionMeta,
      postTxBalance: mockPostTxBalance,
    };
    expect(
      await updatePostTransactionBalance(transactionMeta, request),
    ).toStrictEqual({
      updatedTransactionMeta: expectedTransactionMeta,
      approvalTransactionMeta: undefined,
    });

    expect(queryMock).toHaveBeenCalledWith(expect.anything(), 'getBalance', [
      transactionMeta.txParams.from,
    ]);
    expect(request.updateTransaction).toHaveBeenCalledWith(
      expectedTransactionMeta,
      'TransactionController#updatePostTransactionBalance - Add post transaction balance',
    );
  });

  it('resolves updated transaction meta and approval transaction meta', async () => {
    const mockApprovalTransactionId = '2';
    transactionMeta.approvalTxId = mockApprovalTransactionId;

    const mockPostTxBalance = '200';
    queryMock.mockResolvedValue(mockPostTxBalance);

    const mockApprovalTransactionMeta = {
      id: mockApprovalTransactionId,
      txParams: {
        from: '0x123',
      },
      preTxBalance: '100',
    };

    // First call to getTransaction returns transactionMeta
    // Second call to getTransaction returns approvalTransactionMeta
    jest
      .spyOn(request, 'getTransaction')
      .mockImplementation()
      .mockReturnValueOnce(transactionMeta)
      .mockReturnValueOnce(mockApprovalTransactionMeta);

    const expectedTransactionMeta = {
      ...transactionMeta,
      postTxBalance: mockPostTxBalance,
    };
    expect(
      await updatePostTransactionBalance(transactionMeta, request),
    ).toStrictEqual({
      updatedTransactionMeta: expectedTransactionMeta,
      approvalTransactionMeta: mockApprovalTransactionMeta,
    });

    // Make sure we check the approval transaction with the correct id
    expect(request.getTransaction.mock.calls[1][0]).toBe(
      mockApprovalTransactionId,
    );
  });

  it(`retries at least ${UPDATE_POST_TX_BALANCE_ATTEMPTS} times then updates`, async () => {
    const mockPostTxBalance = transactionMeta.preTxBalance;
    queryMock.mockResolvedValue(mockPostTxBalance);

    jest
      .spyOn(request, 'getTransaction')
      .mockImplementation(() => transactionMeta);

    // eslint-disable-next-line jest/valid-expect-in-promise
    updatePostTransactionBalance(transactionMeta, request).then(
      ({ updatedTransactionMeta }) => {
        expect(updatedTransactionMeta?.postTxBalance).toBe(mockPostTxBalance);
        expect(queryMock).toHaveBeenCalledTimes(
          UPDATE_POST_TX_BALANCE_ATTEMPTS,
        );
      },
    );
  });
});
