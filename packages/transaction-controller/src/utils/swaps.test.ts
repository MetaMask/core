import { ControllerMessenger } from '@metamask/base-controller';
import { query } from '@metamask/controller-utils';

import { CHAIN_IDS } from '../constants';
import type {
  AllowedActions,
  AllowedEvents,
  TransactionControllerActions,
  TransactionControllerEvents,
  TransactionControllerMessenger,
} from '../TransactionController';
import type { TransactionMeta } from '../types';
import { TransactionType, TransactionStatus } from '../types';
import {
  updateSwapsTransaction,
  updatePostTransactionBalance,
  UPDATE_POST_TX_BALANCE_ATTEMPTS,
  SWAPS_CHAINID_DEFAULT_TOKEN_MAP,
} from './swaps';

jest.mock('@metamask/controller-utils');

describe('updateSwapsTransaction', () => {
  let transactionMeta: TransactionMeta;
  let transactionType: TransactionType;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let swaps: any;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let request: any;
  let messenger: TransactionControllerMessenger;

  beforeEach(() => {
    transactionMeta = {
      id: '1',
      simulationFails: undefined,
      status: TransactionStatus.unapproved,
    } as TransactionMeta;
    transactionType = TransactionType.swap;
    swaps = {
      hasApproveTx: false,
      meta: {
        sourceTokenSymbol: 'ETH',
        destinationTokenSymbol: 'DAI',
      },
    };
    messenger = new ControllerMessenger<
      TransactionControllerActions | AllowedActions,
      TransactionControllerEvents | AllowedEvents
    >().getRestricted({
      name: 'TransactionController',
      allowedActions: [
        'ApprovalController:addRequest',
        'NetworkController:getNetworkClientById',
        'NetworkController:findNetworkClientIdByChainId',
      ],
      allowedEvents: [],
    });
    request = {
      isSwapsDisabled: false,
      cancelTransaction: jest.fn(),
      messenger,
    };
  });

  it('should not update if swaps are disabled', async () => {
    request.isSwapsDisabled = true;
    jest.spyOn(messenger, 'call');
    updateSwapsTransaction(transactionMeta, transactionType, swaps, request);
    expect(request.cancelTransaction).not.toHaveBeenCalled();
    expect(messenger.call).not.toHaveBeenCalled();
  });

  it('should not update if transaction type is not swap, swapAndSend, swapApproval', async () => {
    transactionType = TransactionType.deployContract;
    jest.spyOn(messenger, 'call');
    updateSwapsTransaction(transactionMeta, transactionType, swaps, request);
    expect(request.cancelTransaction).not.toHaveBeenCalled();
    expect(messenger.call).not.toHaveBeenCalled();
  });

  it('should cancel transaction if simulation fails', async () => {
    transactionMeta.simulationFails = {
      reason: 'Simulation failed',
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(() =>
      updateSwapsTransaction(transactionMeta, transactionType, swaps, request),
    ).toThrow('Simulation failed');
    expect(request.cancelTransaction).toHaveBeenCalledWith(transactionMeta.id);
  });

  it('should not update or call swap events if swaps meta is not defined', async () => {
    swaps.meta = undefined;
    jest.spyOn(messenger, 'call');
    updateSwapsTransaction(transactionMeta, transactionType, swaps, request);
    expect(request.cancelTransaction).not.toHaveBeenCalled();
    expect(messenger.call).not.toHaveBeenCalled();
  });

  it('should update swap transaction and publish TransactionController:transactionNewSwap', async () => {
    const sourceTokenSymbol = 'ETH';
    const destinationTokenSymbol = 'DAI';
    const type = TransactionType.swap;
    const destinationTokenDecimals = '18';
    const destinationTokenAddress = '0x0';
    const swapMetaData = {
      meta: 'data',
    };
    const swapTokenValue = '0x123';
    const estimatedBaseFee = '0x123';
    const approvalTxId = '0x123';

    swaps.meta = {
      sourceTokenSymbol,
      destinationTokenSymbol,
      type,
      destinationTokenDecimals,
      destinationTokenAddress,
      swapMetaData,
      swapTokenValue,
      estimatedBaseFee,
      approvalTxId,
    };

    const transactionNewSwapEventListener = jest.fn();
    messenger.subscribe(
      'TransactionController:transactionNewSwap',
      transactionNewSwapEventListener,
    );

    updateSwapsTransaction(transactionMeta, transactionType, swaps, request);

    expect(transactionNewSwapEventListener).toHaveBeenCalledWith({
      transactionMeta: {
        ...transactionMeta,
        sourceTokenSymbol,
        destinationTokenSymbol,
        type,
        destinationTokenDecimals,
        destinationTokenAddress,
        swapMetaData,
        swapTokenValue,
        estimatedBaseFee,
        approvalTxId,
      },
    });
  });

  it('should return the swap transaction updated with information', () => {
    const sourceTokenSymbol = 'ETH';
    const destinationTokenSymbol = 'DAI';
    const type = TransactionType.swap;
    const destinationTokenDecimals = '18';
    const destinationTokenAddress = '0x0';
    const swapMetaData = {
      meta: 'data',
    };
    const swapTokenValue = '0x123';
    const estimatedBaseFee = '0x123';
    const approvalTxId = '0x123';

    swaps.meta = {
      sourceTokenSymbol,
      destinationTokenSymbol,
      type,
      destinationTokenDecimals,
      destinationTokenAddress,
      swapMetaData,
      swapTokenValue,
      estimatedBaseFee,
      approvalTxId,
    };

    const updatedSwapsTransaction = updateSwapsTransaction(
      transactionMeta,
      transactionType,
      swaps,
      request,
    );
    expect(updatedSwapsTransaction).toStrictEqual({
      ...transactionMeta,
      sourceTokenSymbol,
      destinationTokenSymbol,
      type,
      destinationTokenDecimals,
      destinationTokenAddress,
      swapMetaData,
      swapTokenValue,
      estimatedBaseFee,
      approvalTxId,
    });
  });

  it('should update swap approval transaction and publish TransactionController:transactionNewSwapApproval', async () => {
    const sourceTokenSymbol = 'ETH';
    const type = TransactionType.swapApproval;

    swaps.meta = {
      sourceTokenSymbol,
      type,
    };
    transactionType = TransactionType.swapApproval;

    const transactionNewSwapApprovalEventListener = jest.fn();
    messenger.subscribe(
      'TransactionController:transactionNewSwapApproval',
      transactionNewSwapApprovalEventListener,
    );

    updateSwapsTransaction(transactionMeta, transactionType, swaps, request);
    expect(transactionNewSwapApprovalEventListener).toHaveBeenCalledTimes(1);
    expect(transactionNewSwapApprovalEventListener).toHaveBeenCalledWith({
      transactionMeta: {
        ...transactionMeta,
        sourceTokenSymbol,
        type,
      },
    });
  });

  it('should return the swap approval transaction updated with information', async () => {
    const sourceTokenSymbol = 'ETH';
    const type = TransactionType.swapApproval;

    swaps.meta = {
      sourceTokenSymbol,
      type,
    };
    transactionType = TransactionType.swapApproval;

    const updatedSwapsTransaction = updateSwapsTransaction(
      transactionMeta,
      transactionType,
      swaps,
      request,
    );
    expect(updatedSwapsTransaction).toStrictEqual({
      ...transactionMeta,
      sourceTokenSymbol,
      type,
    });
  });

  it('should update swap and send transaction and publish TransactionController:transactionNewSwapAndSend', async () => {
    const sourceTokenSymbol = 'ETH';
    const destinationTokenSymbol = 'DAI';
    const type = TransactionType.swapAndSend;
    transactionType = TransactionType.swapAndSend;
    const destinationTokenDecimals = '18';
    const destinationTokenAddress = '0x0';
    const swapMetaData = {
      meta: 'data',
    };
    const swapTokenValue = '0x123';
    const estimatedBaseFee = '0x123';
    const approvalTxId = '0x123';

    // swap + send properties
    const destinationTokenAmount = '0x123';
    const sourceTokenAddress = '0x123';
    const sourceTokenAmount = '0x123';
    const sourceTokenDecimals = '12';

    const swapAndSendRecipient = '0x123';

    swaps.meta = {
      sourceTokenSymbol,
      destinationTokenSymbol,
      type,
      destinationTokenDecimals,
      destinationTokenAddress,
      swapMetaData,
      swapTokenValue,
      estimatedBaseFee,
      approvalTxId,
      destinationTokenAmount,
      sourceTokenAddress,
      sourceTokenAmount,
      sourceTokenDecimals,
      swapAndSendRecipient,
    };

    const transactionNewSwapAndSendEventListener = jest.fn();
    messenger.subscribe(
      'TransactionController:transactionNewSwapAndSend',
      transactionNewSwapAndSendEventListener,
    );

    updateSwapsTransaction(transactionMeta, transactionType, swaps, request);

    expect(transactionNewSwapAndSendEventListener).toHaveBeenCalledWith({
      transactionMeta: {
        ...transactionMeta,
        sourceTokenSymbol,
        destinationTokenSymbol,
        type,
        destinationTokenDecimals,
        destinationTokenAddress,
        swapMetaData,
        swapTokenValue,
        estimatedBaseFee,
        approvalTxId,
        destinationTokenAmount,
        sourceTokenAddress,
        sourceTokenAmount,
        sourceTokenDecimals,
        swapAndSendRecipient,
      },
    });
  });

  it('should return the swap and send transaction updated with information', () => {
    const sourceTokenSymbol = 'ETH';
    const destinationTokenSymbol = 'DAI';
    const type = TransactionType.swapAndSend;
    transactionType = TransactionType.swapAndSend;
    const destinationTokenDecimals = '18';
    const destinationTokenAddress = '0x0';
    const swapMetaData = {
      meta: 'data',
    };
    const swapTokenValue = '0x123';
    const estimatedBaseFee = '0x123';
    const approvalTxId = '0x123';

    // swap + send properties
    const destinationTokenAmount = '0x123';
    const sourceTokenAddress = '0x123';
    const sourceTokenAmount = '0x123';
    const sourceTokenDecimals = '12';

    const swapAndSendRecipient = '0x123';

    swaps.meta = {
      sourceTokenSymbol,
      destinationTokenSymbol,
      type,
      destinationTokenDecimals,
      destinationTokenAddress,
      swapMetaData,
      swapTokenValue,
      estimatedBaseFee,
      approvalTxId,
      destinationTokenAmount,
      sourceTokenAddress,
      sourceTokenAmount,
      sourceTokenDecimals,
      swapAndSendRecipient,
    };

    const updatedSwapsTransaction = updateSwapsTransaction(
      transactionMeta,
      transactionType,
      swaps,
      request,
    );
    expect(updatedSwapsTransaction).toStrictEqual({
      ...transactionMeta,
      sourceTokenSymbol,
      destinationTokenSymbol,
      type,
      destinationTokenDecimals,
      destinationTokenAddress,
      swapMetaData,
      swapTokenValue,
      estimatedBaseFee,
      approvalTxId,
      destinationTokenAmount,
      sourceTokenAddress,
      sourceTokenAmount,
      sourceTokenDecimals,
      swapAndSendRecipient,
    });
  });
});

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

    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line jest/valid-expect-in-promise, @typescript-eslint/no-floating-promises
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
