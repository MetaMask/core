import { ORIGIN_METAMASK, type AddResult } from '@metamask/approval-controller';
import { ApprovalType } from '@metamask/controller-utils';
import { rpcErrors, errorCodes } from '@metamask/rpc-errors';

import {
  ERROR_MESSAGE_NO_UPGRADE_CONTRACT,
  addTransactionBatch,
  isAtomicBatchSupported,
} from './batch';
import {
  ERROR_MESSGE_PUBLIC_KEY,
  doesChainSupportEIP7702,
  generateEIP7702BatchTransaction,
  isAccountUpgradedToEIP7702,
} from './eip7702';
import {
  getEIP7702SupportedChains,
  getEIP7702UpgradeContractAddress,
} from './feature-flags';
import { simulateGasBatch } from './gas';
import { validateBatchRequest } from './validation';
import type { TransactionControllerState } from '..';
import {
  TransactionEnvelopeType,
  type TransactionControllerMessenger,
  type TransactionMeta,
  determineTransactionType,
  TransactionType,
  GasFeeEstimateLevel,
  GasFeeEstimateType,
  TransactionStatus,
} from '..';
import { flushPromises } from '../../../../tests/helpers';
import { DefaultGasFeeFlow } from '../gas-flows/DefaultGasFeeFlow';
import { SequentialPublishBatchHook } from '../hooks/SequentialPublishBatchHook';
import type {
  GasFeeFlow,
  PublishBatchHook,
  TransactionBatchSingleRequest,
} from '../types';

jest.mock('./eip7702');
jest.mock('./feature-flags');
jest.mock('./transaction-type');

jest.mock('./validation', () => ({
  ...jest.requireActual('./validation'),
  validateBatchRequest: jest.fn(),
}));

jest.mock('../hooks/SequentialPublishBatchHook');
jest.mock('./gas');

type AddBatchTransactionOptions = Parameters<typeof addTransactionBatch>[0];

const CHAIN_ID_MOCK = '0x123';
const CHAIN_ID_2_MOCK = '0xabc';
const FROM_MOCK = '0x1234567890123456789012345678901234567890';
const CONTRACT_ADDRESS_MOCK = '0xabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd';
const TO_MOCK = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef';
const DATA_MOCK = '0xabcdef';
const GAS_TOTAL_MOCK = '0x100000';
const VALUE_MOCK = '0x1234';
const MAX_FEE_PER_GAS_MOCK = '0x2';
const MAX_PRIORITY_FEE_PER_GAS_MOCK = '0x1';
const MESSENGER_MOCK = {
  call: jest.fn().mockResolvedValue({}),
} as unknown as TransactionControllerMessenger;
const NETWORK_CLIENT_ID_MOCK = 'testNetworkClientId';
const PUBLIC_KEY_MOCK = '0x112233';
const BATCH_ID_MOCK = '0x654321';
const BATCH_ID_CUSTOM_MOCK = '0x123456';
const GET_ETH_QUERY_MOCK = jest.fn();
const GET_INTERNAL_ACCOUNTS_MOCK = jest.fn().mockReturnValue([]);
const TRANSACTION_ID_MOCK = 'testTransactionId';
const TRANSACTION_ID_2_MOCK = 'testTransactionId2';
const TRANSACTION_HASH_MOCK = '0x123';
const TRANSACTION_HASH_2_MOCK = '0x456';
const TRANSACTION_SIGNATURE_MOCK = '0xabc';
const TRANSACTION_SIGNATURE_2_MOCK = '0xdef';
const ERROR_MESSAGE_MOCK = 'Test error';
const SECURITY_ALERT_ID_MOCK = '123-456';
const ORIGIN_MOCK = 'test.com';
const UPGRADE_CONTRACT_ADDRESS_MOCK =
  '0xfedfedfedfedfedfedfedfedfedfedfedfedfedf';

const TRANSACTION_META_MOCK = {
  id: BATCH_ID_CUSTOM_MOCK,
  txParams: {
    from: FROM_MOCK,
    to: TO_MOCK,
    data: DATA_MOCK,
    value: VALUE_MOCK,
  },
} as unknown as TransactionMeta;

const TRANSACTION_BATCH_PARAMS_MOCK = {
  to: TO_MOCK,
  data: DATA_MOCK,
  value: VALUE_MOCK,
} as TransactionBatchSingleRequest['params'];

const ADD_APPROVAL_REQUEST_MOCK = {
  id: expect.any(String),
  origin: ORIGIN_MOCK,
  requestData: { txBatchId: expect.any(String) },
  expectsResult: true,
  type: ApprovalType.TransactionBatch,
};

const TRANSACTIONS_BATCH_MOCK = [
  {
    params: TRANSACTION_BATCH_PARAMS_MOCK,
  },
  {
    params: TRANSACTION_BATCH_PARAMS_MOCK,
  },
];

const PUBLISH_BATCH_HOOK_PARAMS = {
  from: FROM_MOCK,
  networkClientId: NETWORK_CLIENT_ID_MOCK,
  transactions: [
    {
      id: TRANSACTION_ID_MOCK,
      params: TRANSACTION_BATCH_PARAMS_MOCK,
      signedTx: TRANSACTION_SIGNATURE_MOCK,
    },
    {
      id: TRANSACTION_ID_2_MOCK,
      params: TRANSACTION_BATCH_PARAMS_MOCK,
      signedTx: TRANSACTION_SIGNATURE_2_MOCK,
    },
  ],
};

/**
 * Mocks the `ApprovalController:addRequest` action for the `requestApproval` function in `batch.ts`.
 *
 * @param messenger - The mocked messenger instance.
 * @param options - An options bag which will be used to create an action
 * handler that places the approval request in a certain state.
 * @returns An object which contains the mocked promise, functions to
 * manually approve or reject the approval (and therefore the promise), and
 * finally the mocked version of the action handler itself.
 */
function mockRequestApproval(
  messenger: TransactionControllerMessenger,
  options:
    | {
        state: 'approved';
        result?: Partial<AddResult>;
      }
    | {
        state: 'rejected';
        error?: unknown;
      }
    | {
        state: 'pending';
      },
): {
  promise: Promise<AddResult>;
  approve: (approvalResult?: Partial<AddResult>) => void;
  reject: (rejectionError: unknown) => void;
  actionHandlerMock: jest.Mock<
    ReturnType<typeof messenger.call>,
    Parameters<typeof messenger.call>
  >;
} {
  let resolvePromise: (value: AddResult) => void;
  let rejectPromise: (reason?: unknown) => void;
  const promise = new Promise<AddResult>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  const approveTransaction = (approvalResult?: Partial<AddResult>) => {
    resolvePromise({
      resultCallbacks: {
        success() {
          // Mock success callback
        },
        error() {
          // Mock error callback
        },
      },
      ...approvalResult,
    });
  };

  const rejectTransaction = (
    rejectionError: unknown = {
      code: errorCodes.provider.userRejectedRequest,
    },
  ) => {
    rejectPromise(rejectionError);
  };

  const actionHandlerMock = jest.fn().mockReturnValue(promise);

  if (options.state === 'approved') {
    approveTransaction(options.result);
  } else if (options.state === 'rejected') {
    rejectTransaction(options.error);
  }

  messenger.call = actionHandlerMock;

  return {
    promise,
    approve: approveTransaction,
    reject: rejectTransaction,
    actionHandlerMock,
  };
}

/**
 * Creates a mock GasFeeFlow.
 *
 * @returns The mock GasFeeFlow.
 */
function createGasFeeFlowMock(): jest.Mocked<GasFeeFlow> {
  return {
    matchesTransaction: jest.fn(),
    getGasFees: jest.fn(),
  };
}

describe('Batch Utils', () => {
  const doesChainSupportEIP7702Mock = jest.mocked(doesChainSupportEIP7702);
  const getEIP7702SupportedChainsMock = jest.mocked(getEIP7702SupportedChains);
  const validateBatchRequestMock = jest.mocked(validateBatchRequest);
  const determineTransactionTypeMock = jest.mocked(determineTransactionType);
  const sequentialPublishBatchHookMock = jest.mocked(
    SequentialPublishBatchHook,
  );

  const isAccountUpgradedToEIP7702Mock = jest.mocked(
    isAccountUpgradedToEIP7702,
  );

  const getEIP7702UpgradeContractAddressMock = jest.mocked(
    getEIP7702UpgradeContractAddress,
  );

  const generateEIP7702BatchTransactionMock = jest.mocked(
    generateEIP7702BatchTransaction,
  );

  const simulateGasBatchMock = jest.mocked(simulateGasBatch);

  describe('addTransactionBatch', () => {
    let addTransactionMock: jest.MockedFn<
      AddBatchTransactionOptions['addTransaction']
    >;

    let getChainIdMock: jest.MockedFunction<
      AddBatchTransactionOptions['getChainId']
    >;

    let updateTransactionMock: jest.MockedFn<
      AddBatchTransactionOptions['updateTransaction']
    >;

    let publishTransactionMock: jest.MockedFn<
      AddBatchTransactionOptions['publishTransaction']
    >;

    let getPendingTransactionTrackerMock: jest.MockedFn<
      AddBatchTransactionOptions['getPendingTransactionTracker']
    >;

    let updateMock: jest.MockedFn<AddBatchTransactionOptions['update']>;

    let getGasFeeEstimatesMock: jest.MockedFn<
      AddBatchTransactionOptions['getGasFeeEstimates']
    >;

    let getGasFeesMock: jest.Mock;

    let request: AddBatchTransactionOptions;

    beforeEach(() => {
      jest.resetAllMocks();
      addTransactionMock = jest.fn();
      getChainIdMock = jest.fn();
      updateTransactionMock = jest.fn();
      publishTransactionMock = jest.fn();
      getPendingTransactionTrackerMock = jest.fn();
      updateMock = jest.fn();

      getGasFeeEstimatesMock = jest
        .fn()
        .mockResolvedValue(createGasFeeFlowMock());

      getGasFeesMock = jest.fn().mockResolvedValue({
        estimates: {
          type: GasFeeEstimateType.FeeMarket,
          [GasFeeEstimateLevel.Low]: {
            maxFeePerGas: '0x1',
            maxPriorityFeePerGas: '0x1',
          },
          [GasFeeEstimateLevel.Medium]: {
            maxFeePerGas: '0x2',
            maxPriorityFeePerGas: '0x1',
          },
          [GasFeeEstimateLevel.High]: {
            maxFeePerGas: '0x3',
            maxPriorityFeePerGas: '0x1',
          },
        },
      });

      jest
        .spyOn(DefaultGasFeeFlow.prototype, 'getGasFees')
        .mockImplementation(getGasFeesMock);

      determineTransactionTypeMock.mockResolvedValue({
        type: TransactionType.simpleSend,
      });

      getChainIdMock.mockReturnValue(CHAIN_ID_MOCK);

      simulateGasBatchMock.mockResolvedValue({
        gasLimit: GAS_TOTAL_MOCK,
      });

      doesChainSupportEIP7702Mock.mockReturnValue(true);

      request = {
        addTransaction: addTransactionMock,
        getChainId: getChainIdMock,
        getEthQuery: GET_ETH_QUERY_MOCK,
        getInternalAccounts: GET_INTERNAL_ACCOUNTS_MOCK,
        getTransaction: jest.fn(),
        isSimulationEnabled: jest.fn().mockReturnValue(true),
        messenger: MESSENGER_MOCK,
        publicKeyEIP7702: PUBLIC_KEY_MOCK,
        request: {
          from: FROM_MOCK,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          origin: ORIGIN_MOCK,
          requireApproval: true,
          transactions: TRANSACTIONS_BATCH_MOCK,
          disable7702: false,
          disableHook: false,
          disableSequential: false,
        },
        updateTransaction: updateTransactionMock,
        publishTransaction: publishTransactionMock,
        getPendingTransactionTracker: getPendingTransactionTrackerMock,
        update: updateMock,
        getGasFeeEstimates: getGasFeeEstimatesMock,
      };
    });

    it('returns generated batch ID', async () => {
      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        delegationAddress: undefined,
        isSupported: true,
      });

      addTransactionMock.mockResolvedValueOnce({
        transactionMeta: TRANSACTION_META_MOCK,
        result: Promise.resolve(''),
      });

      const result = await addTransactionBatch(request);

      expect(result.batchId).toMatch(/^0x[0-9a-f]{32}$/u);
    });

    it('preserves nested transaction types when disable7702 is true', async () => {
      const publishBatchHook: jest.MockedFn<PublishBatchHook> = jest.fn();
      mockRequestApproval(MESSENGER_MOCK, {
        state: 'approved',
      });

      addTransactionMock
        .mockResolvedValueOnce({
          transactionMeta: {
            ...TRANSACTION_META_MOCK,
            id: TRANSACTION_ID_MOCK,
          },
          result: Promise.resolve(''),
        })
        .mockResolvedValueOnce({
          transactionMeta: {
            ...TRANSACTION_META_MOCK,
            id: TRANSACTION_ID_2_MOCK,
          },
          result: Promise.resolve(''),
        });
      addTransactionBatch({
        ...request,
        publishBatchHook,
        request: {
          ...request.request,
          transactions: [
            {
              ...request.request.transactions[0],
              type: TransactionType.swap,
            },
            {
              ...request.request.transactions[1],
              type: TransactionType.bridge,
            },
          ],
          disable7702: true,
        },
      }).catch(() => {
        // Intentionally empty
      });

      await flushPromises();

      expect(addTransactionMock).toHaveBeenCalledTimes(2);
      expect(addTransactionMock.mock.calls[0][1].type).toBe('swap');
      expect(addTransactionMock.mock.calls[1][1].type).toBe('bridge');
    });

    it('preserves nested transaction types when disable7702 is false', async () => {
      const publishBatchHook: jest.MockedFn<PublishBatchHook> = jest.fn();

      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        delegationAddress: undefined,
        isSupported: true,
      });

      addTransactionMock.mockResolvedValueOnce({
        transactionMeta: TRANSACTION_META_MOCK,
        result: Promise.resolve(''),
      });

      const result = await addTransactionBatch({
        ...request,
        publishBatchHook,
        request: {
          ...request.request,
          transactions: [
            {
              ...request.request.transactions[0],
              type: TransactionType.swapApproval,
            },
            {
              ...request.request.transactions[1],
              type: TransactionType.bridgeApproval,
            },
          ],
          disable7702: false,
        },
      });

      expect(result.batchId).toMatch(/^0x[0-9a-f]{32}$/u);
      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock.mock.calls[0][1].type).toStrictEqual(
        TransactionType.batch,
      );

      expect(
        addTransactionMock.mock.calls[0][1].nestedTransactions?.[0].type,
      ).toBe(TransactionType.swapApproval);
      expect(
        addTransactionMock.mock.calls[0][1].nestedTransactions?.[1].type,
      ).toBe(TransactionType.bridgeApproval);
    });

    it('returns provided batch ID', async () => {
      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        delegationAddress: undefined,
        isSupported: true,
      });

      addTransactionMock.mockResolvedValueOnce({
        transactionMeta: TRANSACTION_META_MOCK,
        result: Promise.resolve(''),
      });

      request.request.batchId = BATCH_ID_CUSTOM_MOCK;

      const result = await addTransactionBatch(request);

      expect(result.batchId).toBe(BATCH_ID_CUSTOM_MOCK);
    });

    it('adds generated EIP-7702 transaction', async () => {
      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        delegationAddress: undefined,
        isSupported: true,
      });

      addTransactionMock.mockResolvedValueOnce({
        transactionMeta: TRANSACTION_META_MOCK,
        result: Promise.resolve(''),
      });

      generateEIP7702BatchTransactionMock.mockReturnValueOnce(
        TRANSACTION_BATCH_PARAMS_MOCK,
      );

      await addTransactionBatch(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        {
          from: FROM_MOCK,
          to: TO_MOCK,
          data: DATA_MOCK,
          value: VALUE_MOCK,
        },
        expect.objectContaining({
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          origin: ORIGIN_MOCK,
          requireApproval: true,
        }),
      );
    });

    it('uses type 4 transaction if not upgraded', async () => {
      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        delegationAddress: undefined,
        isSupported: false,
      });

      addTransactionMock.mockResolvedValueOnce({
        transactionMeta: TRANSACTION_META_MOCK,
        result: Promise.resolve(''),
      });

      generateEIP7702BatchTransactionMock.mockReturnValueOnce(
        TRANSACTION_BATCH_PARAMS_MOCK,
      );

      getEIP7702UpgradeContractAddressMock.mockReturnValueOnce(
        CONTRACT_ADDRESS_MOCK,
      );

      await addTransactionBatch(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        {
          from: FROM_MOCK,
          to: TO_MOCK,
          data: DATA_MOCK,
          value: VALUE_MOCK,
          type: TransactionEnvelopeType.setCode,
          authorizationList: [{ address: CONTRACT_ADDRESS_MOCK }],
        },
        expect.objectContaining({
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          requireApproval: true,
        }),
      );
    });

    it('passes nested transactions to add transaction', async () => {
      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        delegationAddress: undefined,
        isSupported: true,
      });

      addTransactionMock.mockResolvedValueOnce({
        transactionMeta: TRANSACTION_META_MOCK,
        result: Promise.resolve(''),
      });

      await addTransactionBatch(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          nestedTransactions: [
            expect.objectContaining(TRANSACTION_BATCH_PARAMS_MOCK),
            expect.objectContaining(TRANSACTION_BATCH_PARAMS_MOCK),
          ],
        }),
      );
    });

    it('determines transaction type for nested transactions', async () => {
      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        delegationAddress: undefined,
        isSupported: true,
      });

      addTransactionMock.mockResolvedValueOnce({
        transactionMeta: TRANSACTION_META_MOCK,
        result: Promise.resolve(''),
      });

      determineTransactionTypeMock
        .mockResolvedValueOnce({
          type: TransactionType.tokenMethodSafeTransferFrom,
        })
        .mockResolvedValueOnce({
          type: TransactionType.simpleSend,
        });

      await addTransactionBatch(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          nestedTransactions: [
            expect.objectContaining({
              type: TransactionType.tokenMethodSafeTransferFrom,
            }),
            expect.objectContaining({
              type: TransactionType.simpleSend,
            }),
          ],
        }),
      );
    });

    it('throws if chain not supported', async () => {
      doesChainSupportEIP7702Mock.mockReturnValue(false);

      await expect(addTransactionBatch(request)).rejects.toThrow(
        rpcErrors.internal("Can't process batch"),
      );
    });

    it('throws if no public key', async () => {
      await expect(
        addTransactionBatch({ ...request, publicKeyEIP7702: undefined }),
      ).rejects.toThrow(rpcErrors.internal(ERROR_MESSGE_PUBLIC_KEY));
    });

    it('throws if account upgraded to unsupported contract', async () => {
      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        delegationAddress: CONTRACT_ADDRESS_MOCK,
        isSupported: false,
      });

      await expect(addTransactionBatch(request)).rejects.toThrow(
        rpcErrors.internal('Account upgraded to unsupported contract'),
      );
    });

    it('throws if account not upgraded and no upgrade address', async () => {
      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        delegationAddress: undefined,
        isSupported: false,
      });

      getEIP7702UpgradeContractAddressMock.mockReturnValueOnce(undefined);

      await expect(addTransactionBatch(request)).rejects.toThrow(
        rpcErrors.internal(ERROR_MESSAGE_NO_UPGRADE_CONTRACT),
      );
    });

    it('validates request', async () => {
      validateBatchRequestMock.mockImplementationOnce(() => {
        throw new Error('Validation Error');
      });

      await expect(addTransactionBatch(request)).rejects.toThrow(
        'Validation Error',
      );
    });

    it('adds security alert ID to transaction', async () => {
      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        delegationAddress: undefined,
        isSupported: true,
      });

      addTransactionMock.mockResolvedValueOnce({
        transactionMeta: TRANSACTION_META_MOCK,
        result: Promise.resolve(''),
      });

      request.request.securityAlertId = SECURITY_ALERT_ID_MOCK;

      await addTransactionBatch(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          securityAlertResponse: {
            securityAlertId: SECURITY_ALERT_ID_MOCK,
          },
        }),
      );
    });

    describe('validates security', () => {
      it('using transaction params', async () => {
        isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
          delegationAddress: undefined,
          isSupported: true,
        });

        addTransactionMock.mockResolvedValueOnce({
          transactionMeta: TRANSACTION_META_MOCK,
          result: Promise.resolve(''),
        });

        generateEIP7702BatchTransactionMock.mockReturnValueOnce(
          TRANSACTION_BATCH_PARAMS_MOCK,
        );

        const validateSecurityMock = jest.fn();
        validateSecurityMock.mockResolvedValueOnce({});

        request.request.validateSecurity = validateSecurityMock;

        await addTransactionBatch(request);

        expect(validateSecurityMock).toHaveBeenCalledTimes(1);
        expect(validateSecurityMock).toHaveBeenCalledWith(
          {
            delegationMock: undefined,
            method: 'eth_sendTransaction',
            params: [
              {
                authorizationList: undefined,
                data: DATA_MOCK,
                from: FROM_MOCK,
                to: TO_MOCK,
                type: TransactionEnvelopeType.feeMarket,
                value: VALUE_MOCK,
              },
            ],
            origin: ORIGIN_MOCK,
          },
          CHAIN_ID_MOCK,
        );
      });

      it('using delegation mock if not upgraded', async () => {
        isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
          delegationAddress: undefined,
          isSupported: false,
        });

        addTransactionMock.mockResolvedValueOnce({
          transactionMeta: TRANSACTION_META_MOCK,
          result: Promise.resolve(''),
        });

        generateEIP7702BatchTransactionMock.mockReturnValueOnce(
          TRANSACTION_BATCH_PARAMS_MOCK,
        );

        getEIP7702UpgradeContractAddressMock.mockReturnValue(
          CONTRACT_ADDRESS_MOCK,
        );

        const validateSecurityMock = jest.fn();
        validateSecurityMock.mockResolvedValueOnce({});

        request.request.validateSecurity = validateSecurityMock;

        await addTransactionBatch(request);

        expect(validateSecurityMock).toHaveBeenCalledTimes(1);
        expect(validateSecurityMock).toHaveBeenCalledWith(
          {
            delegationMock: CONTRACT_ADDRESS_MOCK,
            method: 'eth_sendTransaction',
            params: [
              {
                authorizationList: undefined,
                data: DATA_MOCK,
                from: FROM_MOCK,
                to: TO_MOCK,
                type: TransactionEnvelopeType.feeMarket,
                value: VALUE_MOCK,
              },
            ],
            origin: ORIGIN_MOCK,
          },
          CHAIN_ID_MOCK,
        );
      });
    });

    describe('with publish batch hook', () => {
      beforeEach(() => {
        mockRequestApproval(MESSENGER_MOCK, {
          state: 'approved',
        });
        doesChainSupportEIP7702Mock.mockReturnValueOnce(false);
      });

      it('adds each nested transaction', async () => {
        const publishBatchHook = jest.fn();

        addTransactionMock.mockResolvedValueOnce({
          transactionMeta: TRANSACTION_META_MOCK,
          result: Promise.resolve(''),
        });

        addTransactionBatch({
          ...request,
          publishBatchHook,
          request: { ...request.request, disable7702: true },
        }).catch(() => {
          // Intentionally empty
        });

        await flushPromises();

        expect(addTransactionMock).toHaveBeenCalledTimes(2);
        expect(addTransactionMock).toHaveBeenCalledWith(
          {
            ...TRANSACTION_BATCH_PARAMS_MOCK,
            from: FROM_MOCK,
            gas: GAS_TOTAL_MOCK,
            maxFeePerGas: MAX_FEE_PER_GAS_MOCK,
            maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS_MOCK,
          },
          {
            assetsFiatValues: undefined,
            batchId: expect.any(String),
            disableGasBuffer: true,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
            origin: ORIGIN_MOCK,
            publishHook: expect.any(Function),
            requireApproval: false,
            type: undefined,
          },
        );
      });

      it.each([
        {
          origin: ORIGIN_MOCK,
          description: 'with defined origin',
          expectedOrigin: ORIGIN_MOCK,
        },
        {
          origin: undefined,
          description: 'with undefined origin',
          expectedOrigin: ORIGIN_METAMASK,
        },
      ])(
        'requests approval for batch transactions $description',
        async ({ origin, expectedOrigin }) => {
          addTransactionMock.mockResolvedValueOnce({
            transactionMeta: TRANSACTION_META_MOCK,
            result: Promise.resolve(''),
          });

          addTransactionBatch({
            ...request,
            publishBatchHook: jest.fn(),
            request: { ...request.request, origin, disable7702: true },
            messenger: MESSENGER_MOCK,
          }).catch(() => {
            // Intentionally empty
          });

          await flushPromises();

          expect(MESSENGER_MOCK.call).toHaveBeenCalledWith(
            'ApprovalController:addRequest',
            { ...ADD_APPROVAL_REQUEST_MOCK, origin: expectedOrigin },
            true,
          );
          expect(simulateGasBatchMock).toHaveBeenCalledTimes(1);
          expect(getGasFeesMock).toHaveBeenCalledTimes(1);
        },
      );

      it('calls publish batch hook', async () => {
        const publishBatchHook: jest.MockedFn<PublishBatchHook> = jest.fn();

        addTransactionMock
          .mockResolvedValueOnce({
            transactionMeta: {
              ...TRANSACTION_META_MOCK,
              id: TRANSACTION_ID_MOCK,
            },
            result: Promise.resolve(''),
          })
          .mockResolvedValueOnce({
            transactionMeta: {
              ...TRANSACTION_META_MOCK,
              id: TRANSACTION_ID_2_MOCK,
            },
            result: Promise.resolve(''),
          });

        publishBatchHook.mockResolvedValue({
          results: [
            {
              transactionHash: TRANSACTION_HASH_MOCK,
            },
            {
              transactionHash: TRANSACTION_HASH_2_MOCK,
            },
          ],
        });

        addTransactionBatch({
          ...request,
          publishBatchHook,
          request: { ...request.request, disable7702: true },
        }).catch(() => {
          // Intentionally empty
        });

        await flushPromises();

        const publishHooks = addTransactionMock.mock.calls.map(
          ([, options]) => options.publishHook,
        );

        publishHooks[0]?.(
          TRANSACTION_META_MOCK,
          TRANSACTION_SIGNATURE_MOCK,
        ).catch(() => {
          // Intentionally empty
        });

        publishHooks[1]?.(
          TRANSACTION_META_MOCK,
          TRANSACTION_SIGNATURE_2_MOCK,
        ).catch(() => {
          // Intentionally empty
        });

        await flushPromises();

        expect(publishBatchHook).toHaveBeenCalledTimes(1);
        expect(publishBatchHook).toHaveBeenCalledWith(
          PUBLISH_BATCH_HOOK_PARAMS,
        );
      });

      it('resolves individual publish hooks with transaction hashes from publish batch hook', async () => {
        const publishBatchHook: jest.MockedFn<PublishBatchHook> = jest.fn();

        addTransactionMock
          .mockResolvedValueOnce({
            transactionMeta: {
              ...TRANSACTION_META_MOCK,
              id: TRANSACTION_ID_MOCK,
            },
            result: Promise.resolve(''),
          })
          .mockResolvedValueOnce({
            transactionMeta: {
              ...TRANSACTION_META_MOCK,
              id: TRANSACTION_ID_2_MOCK,
            },
            result: Promise.resolve(''),
          });

        publishBatchHook.mockResolvedValue({
          results: [
            {
              transactionHash: TRANSACTION_HASH_MOCK,
            },
            {
              transactionHash: TRANSACTION_HASH_2_MOCK,
            },
          ],
        });

        addTransactionBatch({
          ...request,
          publishBatchHook,
          request: { ...request.request, disable7702: true },
        }).catch(() => {
          // Intentionally empty
        });

        await flushPromises();

        const publishHooks = addTransactionMock.mock.calls.map(
          ([, options]) => options.publishHook,
        );

        const publishHookPromise1 = publishHooks[0]?.(
          TRANSACTION_META_MOCK,
          TRANSACTION_SIGNATURE_MOCK,
        ).catch(() => {
          // Intentionally empty
        });

        const publishHookPromise2 = publishHooks[1]?.(
          TRANSACTION_META_MOCK,
          TRANSACTION_SIGNATURE_2_MOCK,
        ).catch(() => {
          // Intentionally empty
        });

        await flushPromises();

        expect(await publishHookPromise1).toStrictEqual({
          transactionHash: TRANSACTION_HASH_MOCK,
        });

        expect(await publishHookPromise2).toStrictEqual({
          transactionHash: TRANSACTION_HASH_2_MOCK,
        });
      });

      it('handles existing transactions', async () => {
        const publishBatchHook: jest.MockedFn<PublishBatchHook> = jest.fn();
        const onPublish = jest.fn();

        const EXISTING_TRANSACTION_MOCK = {
          id: TRANSACTION_ID_2_MOCK,
          onPublish,
          signedTransaction: TRANSACTION_SIGNATURE_2_MOCK,
        } as TransactionBatchSingleRequest['existingTransaction'];

        simulateGasBatchMock.mockResolvedValueOnce({
          gasLimit: GAS_TOTAL_MOCK,
        });

        addTransactionMock
          .mockResolvedValueOnce({
            transactionMeta: {
              ...TRANSACTION_META_MOCK,
              id: TRANSACTION_ID_MOCK,
            },
            result: Promise.resolve(''),
          })
          .mockResolvedValueOnce({
            transactionMeta: {
              ...TRANSACTION_META_MOCK,
              id: TRANSACTION_ID_2_MOCK,
            },
            result: Promise.resolve(''),
          });

        publishBatchHook.mockResolvedValue({
          results: [
            {
              transactionHash: TRANSACTION_HASH_MOCK,
            },
            {
              transactionHash: TRANSACTION_HASH_2_MOCK,
            },
          ],
        });

        addTransactionBatch({
          ...request,
          publishBatchHook,
          request: {
            ...request.request,
            disable7702: true,
            transactions: [
              {
                ...request.request.transactions[0],
                existingTransaction: EXISTING_TRANSACTION_MOCK,
              },
              request.request.transactions[1],
            ],
          },
        }).catch(() => {
          // Intentionally empty
        });

        await flushPromises();

        const publishHooks = addTransactionMock.mock.calls.map(
          ([, options]) => options.publishHook,
        );

        publishHooks[0]?.(
          TRANSACTION_META_MOCK,
          TRANSACTION_SIGNATURE_MOCK,
        ).catch(() => {
          // Intentionally empty
        });

        await flushPromises();

        expect(addTransactionMock).toHaveBeenCalledTimes(1);

        expect(publishBatchHook).toHaveBeenCalledTimes(1);
        expect(publishBatchHook).toHaveBeenCalledWith({
          from: FROM_MOCK,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          transactions: [
            {
              id: TRANSACTION_ID_2_MOCK,
              params: TRANSACTION_BATCH_PARAMS_MOCK,
              signedTx: TRANSACTION_SIGNATURE_2_MOCK,
            },
            {
              id: TRANSACTION_ID_MOCK,
              params: TRANSACTION_BATCH_PARAMS_MOCK,
              signedTx: TRANSACTION_SIGNATURE_MOCK,
            },
          ],
        });

        expect(onPublish).toHaveBeenCalledTimes(1);
        expect(onPublish).toHaveBeenCalledWith({
          transactionHash: TRANSACTION_HASH_MOCK,
        });
      });

      it('adds batch ID to existing transaction', async () => {
        const publishBatchHook: jest.MockedFn<PublishBatchHook> = jest.fn();
        const onPublish = jest.fn();
        const existingTransactionMock = {};

        simulateGasBatchMock.mockResolvedValueOnce({
          gasLimit: GAS_TOTAL_MOCK,
        });

        addTransactionMock
          .mockResolvedValueOnce({
            transactionMeta: {
              ...TRANSACTION_META_MOCK,
              id: TRANSACTION_ID_MOCK,
            },
            result: Promise.resolve(''),
          })
          .mockResolvedValueOnce({
            transactionMeta: {
              ...TRANSACTION_META_MOCK,
              id: TRANSACTION_ID_2_MOCK,
            },
            result: Promise.resolve(''),
          });

        updateTransactionMock.mockImplementation((_id, update) => {
          update(existingTransactionMock as TransactionMeta);
        });

        publishBatchHook.mockResolvedValue({
          results: [
            {
              transactionHash: TRANSACTION_HASH_MOCK,
            },
            {
              transactionHash: TRANSACTION_HASH_2_MOCK,
            },
          ],
        });

        addTransactionBatch({
          ...request,
          publishBatchHook,
          request: {
            ...request.request,
            disable7702: true,
            transactions: [
              {
                ...request.request.transactions[0],
                existingTransaction: {
                  id: TRANSACTION_ID_2_MOCK,
                  onPublish,
                  signedTransaction: TRANSACTION_SIGNATURE_2_MOCK,
                },
              },
              request.request.transactions[1],
            ],
          },
        }).catch(() => {
          // Intentionally empty
        });

        await flushPromises();

        const publishHooks = addTransactionMock.mock.calls.map(
          ([, options]) => options.publishHook,
        );

        publishHooks[0]?.(
          TRANSACTION_META_MOCK,
          TRANSACTION_SIGNATURE_MOCK,
        ).catch(() => {
          // Intentionally empty
        });

        await flushPromises();

        expect(updateTransactionMock).toHaveBeenCalledTimes(1);
        expect(existingTransactionMock).toStrictEqual({
          batchId: expect.any(String),
        });
      });

      it('throws if publish batch hook does not return result', async () => {
        addTransactionMock
          .mockResolvedValueOnce({
            transactionMeta: {
              ...TRANSACTION_META_MOCK,
              id: TRANSACTION_ID_MOCK,
            },
            result: Promise.resolve(''),
          })
          .mockResolvedValueOnce({
            transactionMeta: {
              ...TRANSACTION_META_MOCK,
              id: TRANSACTION_ID_2_MOCK,
            },
            result: Promise.resolve(''),
          });

        const publishBatchHookMock = jest.fn().mockResolvedValue(undefined);
        sequentialPublishBatchHookMock.mockReturnValue({
          getHook: () => publishBatchHookMock,
        } as unknown as SequentialPublishBatchHook);

        const resultPromise = addTransactionBatch({
          ...request,
          publishBatchHook: publishBatchHookMock,
          request: { ...request.request, disable7702: true },
        });

        resultPromise.catch(() => {
          // Intentionally empty
        });

        await flushPromises();

        const publishHooks = addTransactionMock.mock.calls.map(
          ([, options]) => options.publishHook,
        );

        publishHooks[0]?.(
          TRANSACTION_META_MOCK,
          TRANSACTION_SIGNATURE_MOCK,
        ).catch(() => {
          // Intentionally empty
        });

        publishHooks[1]?.(
          TRANSACTION_META_MOCK,
          TRANSACTION_SIGNATURE_2_MOCK,
        ).catch(() => {
          // Intentionally empty
        });

        await flushPromises();

        await expect(resultPromise).rejects.toThrow(
          'Publish batch hook did not return a result',
        );
      });

      it('rejects individual publish hooks if batch hook throws', async () => {
        const publishBatchHook: jest.MockedFn<PublishBatchHook> = jest.fn();

        addTransactionMock
          .mockResolvedValueOnce({
            transactionMeta: {
              ...TRANSACTION_META_MOCK,
              id: TRANSACTION_ID_MOCK,
            },
            result: Promise.resolve(''),
          })
          .mockResolvedValueOnce({
            transactionMeta: {
              ...TRANSACTION_META_MOCK,
              id: TRANSACTION_ID_2_MOCK,
            },
            result: Promise.resolve(''),
          });

        publishBatchHook.mockImplementationOnce(() => {
          throw new Error(ERROR_MESSAGE_MOCK);
        });

        addTransactionBatch({
          ...request,
          publishBatchHook,
          request: {
            ...request.request,
            requireApproval: false,
            disable7702: true,
          },
        }).catch(() => {
          // Intentionally empty
        });

        await flushPromises();

        const publishHooks = addTransactionMock.mock.calls.map(
          ([, options]) => options.publishHook,
        );

        const publishHookPromise1 = publishHooks[0]?.(
          TRANSACTION_META_MOCK,
          TRANSACTION_SIGNATURE_MOCK,
        );

        publishHookPromise1?.catch(() => {
          // Intentionally empty
        });

        const publishHookPromise2 = publishHooks[1]?.(
          TRANSACTION_META_MOCK,
          TRANSACTION_SIGNATURE_2_MOCK,
        );

        publishHookPromise2?.catch(() => {
          // Intentionally empty
        });

        await flushPromises();

        await expect(publishHookPromise1).rejects.toThrow(ERROR_MESSAGE_MOCK);
        await expect(publishHookPromise2).rejects.toThrow(ERROR_MESSAGE_MOCK);
      });

      it('rejects individual publish hooks if add transaction throws', async () => {
        const publishBatchHook: jest.MockedFn<PublishBatchHook> = jest.fn();

        addTransactionMock
          .mockResolvedValueOnce({
            transactionMeta: {
              ...TRANSACTION_META_MOCK,
              id: TRANSACTION_ID_MOCK,
            },
            result: Promise.resolve(''),
          })
          .mockImplementationOnce(() => {
            throw new Error(ERROR_MESSAGE_MOCK);
          });

        addTransactionBatch({
          ...request,
          publishBatchHook,
          request: {
            ...request.request,
            requireApproval: false,
            disable7702: true,
          },
        }).catch(() => {
          // Intentionally empty
        });

        const publishHooks = addTransactionMock.mock.calls.map(
          ([, options]) => options.publishHook,
        );

        const publishHookPromise1 = publishHooks[0]?.(
          TRANSACTION_META_MOCK,
          TRANSACTION_SIGNATURE_MOCK,
        );

        publishHookPromise1?.catch(() => {
          // Intentionally empty
        });

        await flushPromises();

        await expect(publishHookPromise1).rejects.toThrow(ERROR_MESSAGE_MOCK);
      });
    });

    describe('with sequential publish batch hook', () => {
      let sequentialPublishBatchHook: jest.MockedFn<PublishBatchHook>;

      beforeEach(() => {
        doesChainSupportEIP7702Mock.mockReturnValue(false);

        sequentialPublishBatchHook = jest.fn();

        addTransactionMock
          .mockResolvedValueOnce({
            transactionMeta: {
              ...TRANSACTION_META_MOCK,
              id: TRANSACTION_ID_MOCK,
            },
            result: Promise.resolve(''),
          })
          .mockResolvedValueOnce({
            transactionMeta: {
              ...TRANSACTION_META_MOCK,
              id: TRANSACTION_ID_2_MOCK,
            },
            result: Promise.resolve(''),
          });
      });

      const setupSequentialPublishBatchHookMock = (
        hookImplementation: () => PublishBatchHook | undefined,
      ) => {
        sequentialPublishBatchHookMock.mockReturnValue({
          getHook: hookImplementation,
        } as unknown as SequentialPublishBatchHook);
      };

      const executePublishHooks = async () => {
        const publishHooks = addTransactionMock.mock.calls.map(
          ([, options]) => options.publishHook,
        );

        for (const [index, publishHook] of publishHooks.entries()) {
          publishHook?.(
            TRANSACTION_META_MOCK,
            index === 0
              ? TRANSACTION_SIGNATURE_MOCK
              : TRANSACTION_SIGNATURE_2_MOCK,
          ).catch(() => {
            // Intentionally empty
          });
        }

        await flushPromises();
      };

      const mockSequentialPublishBatchHookResults = () => {
        sequentialPublishBatchHook.mockResolvedValueOnce({
          results: [
            { transactionHash: TRANSACTION_HASH_MOCK },
            { transactionHash: TRANSACTION_HASH_2_MOCK },
          ],
        });
      };

      const assertSequentialPublishBatchHookCalled = () => {
        expect(sequentialPublishBatchHookMock).toHaveBeenCalledTimes(1);
        expect(sequentialPublishBatchHook).toHaveBeenCalledTimes(1);
        expect(sequentialPublishBatchHook).toHaveBeenCalledWith(
          PUBLISH_BATCH_HOOK_PARAMS,
        );
      };

      it('throws if simulation is not supported', async () => {
        const isSimulationSupportedMock = jest.fn().mockReturnValue(false);
        setupSequentialPublishBatchHookMock(() => sequentialPublishBatchHook);

        await expect(
          addTransactionBatch({
            ...request,
            publishBatchHook: undefined,
            isSimulationEnabled: () => isSimulationSupportedMock(),
            request: {
              ...request.request,
              disableHook: true,
              disableSequential: false,
            },
          }),
        ).rejects.toThrow(
          `Cannot create transaction batch as simulation not supported`,
        );
      });

      it('throws if no supported methods found', async () => {
        const isSimulationSupportedMock = jest.fn().mockReturnValue(false);
        setupSequentialPublishBatchHookMock(() => sequentialPublishBatchHook);

        await expect(
          addTransactionBatch({
            ...request,
            publishBatchHook: undefined,
            isSimulationEnabled: () => isSimulationSupportedMock(),
            request: {
              ...request.request,
              useHook: true,
            },
          }),
        ).rejects.toThrow(`Can't process batch`);
      });

      it('invokes sequentialPublishBatchHook when publishBatchHook is undefined', async () => {
        mockSequentialPublishBatchHookResults();
        setupSequentialPublishBatchHookMock(() => sequentialPublishBatchHook);

        const resultPromise = addTransactionBatch({
          ...request,
          publishBatchHook: undefined,
          request: {
            ...request.request,
            requireApproval: false,
            disable7702: true,
            disableHook: true,
            disableSequential: false,
          },
        }).catch(() => {
          // Intentionally empty
        });

        await flushPromises();
        await executePublishHooks();

        assertSequentialPublishBatchHookCalled();

        const result = await resultPromise;
        expect(result?.batchId).toMatch(/^0x[0-9a-f]{32}$/u);
      });

      it('throws an error when sequentialPublishBatchHook fails', async () => {
        setupSequentialPublishBatchHookMock(() => {
          throw new Error('Test error');
        });

        await expect(
          addTransactionBatch({
            ...request,
            publishBatchHook: undefined,
            request: {
              ...request.request,
              disable7702: true,
              disableHook: true,
              disableSequential: false,
            },
          }),
        ).rejects.toThrow('Test error');

        expect(sequentialPublishBatchHookMock).toHaveBeenCalledTimes(1);
      });

      it('creates an approval request for sequential publish batch hook', async () => {
        const { approve } = mockRequestApproval(MESSENGER_MOCK, {
          state: 'approved',
        });
        mockSequentialPublishBatchHookResults();
        setupSequentialPublishBatchHookMock(() => sequentialPublishBatchHook);

        const resultPromise = addTransactionBatch({
          ...request,
          publishBatchHook: undefined,
          messenger: MESSENGER_MOCK,
          request: {
            ...request.request,
            origin: ORIGIN_MOCK,
            disable7702: true,
            disableHook: true,
            disableSequential: false,
          },
        }).catch(() => {
          // Intentionally empty
        });

        await flushPromises();
        approve();
        await executePublishHooks();

        expect(MESSENGER_MOCK.call).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          ADD_APPROVAL_REQUEST_MOCK,
          true,
        );

        assertSequentialPublishBatchHookCalled();

        const result = await resultPromise;
        expect(result?.batchId).toMatch(/^0x[0-9a-f]{32}$/u);
      });

      it('falls back sequentialPublishBatchHook when publishBatchHook returns undefined', async () => {
        const { approve } = mockRequestApproval(MESSENGER_MOCK, {
          state: 'approved',
        });
        mockSequentialPublishBatchHookResults();
        setupSequentialPublishBatchHookMock(() => sequentialPublishBatchHook);
        const publishBatchHookMock = jest.fn().mockResolvedValue(undefined);

        const resultPromise = addTransactionBatch({
          ...request,
          publishBatchHook: publishBatchHookMock,
          messenger: MESSENGER_MOCK,
          request: {
            ...request.request,
            origin: ORIGIN_MOCK,
            disable7702: true,
            disableHook: false,
            disableSequential: false,
          },
        }).catch(() => {
          // Intentionally empty
        });

        await flushPromises();
        approve();
        await executePublishHooks();

        assertSequentialPublishBatchHookCalled();
        expect(publishBatchHookMock).toHaveBeenCalledTimes(1);
        expect(publishBatchHookMock).toHaveBeenCalledWith(
          PUBLISH_BATCH_HOOK_PARAMS,
        );

        const result = await resultPromise;
        expect(result?.batchId).toMatch(/^0x[0-9a-f]{32}$/u);
      });

      it('updates gas properties', async () => {
        const { approve } = mockRequestApproval(MESSENGER_MOCK, {
          state: 'approved',
        });
        mockSequentialPublishBatchHookResults();
        setupSequentialPublishBatchHookMock(() => sequentialPublishBatchHook);

        const resultPromise = addTransactionBatch({
          ...request,
          publishBatchHook: undefined,
          messenger: MESSENGER_MOCK,
          request: {
            ...request.request,
            origin: ORIGIN_MOCK,
            disable7702: true,
            disableHook: true,
          },
        }).catch(() => {
          // Intentionally empty
        });

        await flushPromises();
        approve();
        await executePublishHooks();

        await resultPromise;

        expect(simulateGasBatchMock).toHaveBeenCalledTimes(1);
        expect(simulateGasBatchMock).toHaveBeenCalledWith({
          chainId: CHAIN_ID_MOCK,
          from: FROM_MOCK,
          transactions: TRANSACTIONS_BATCH_MOCK,
        });
        expect(getGasFeesMock).toHaveBeenCalledTimes(1);
        expect(getGasFeesMock).toHaveBeenCalledWith(
          expect.objectContaining({
            gasFeeControllerData: expect.any(Object),
            messenger: MESSENGER_MOCK,
            transactionMeta: {
              chainId: CHAIN_ID_MOCK,
              gas: GAS_TOTAL_MOCK,
              from: FROM_MOCK,
              networkClientId: NETWORK_CLIENT_ID_MOCK,
              txParams: { from: FROM_MOCK, gas: GAS_TOTAL_MOCK },
              origin: ORIGIN_MOCK,
              id: expect.any(String),
              status: TransactionStatus.unapproved,
              time: expect.any(Number),
              transactions: TRANSACTIONS_BATCH_MOCK,
            },
          }),
        );
      });

      it('saves a transaction batch and then cleans the specific batch by ID', async () => {
        const { approve } = mockRequestApproval(MESSENGER_MOCK, {
          state: 'approved',
        });
        mockSequentialPublishBatchHookResults();
        setupSequentialPublishBatchHookMock(() => sequentialPublishBatchHook);

        const resultPromise = addTransactionBatch({
          ...request,
          publishBatchHook: undefined,
          messenger: MESSENGER_MOCK,
          request: {
            ...request.request,
            origin: ORIGIN_MOCK,
            disable7702: true,
            disableHook: true,
            disableSequential: false,
          },
        }).catch(() => {
          // Intentionally empty
        });

        await flushPromises();
        approve();
        await executePublishHooks();

        expect(MESSENGER_MOCK.call).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          ADD_APPROVAL_REQUEST_MOCK,
          true,
        );

        expect(updateMock).toHaveBeenCalledTimes(2);
        expect(updateMock).toHaveBeenCalledWith(expect.any(Function));

        const BATCH_TRANSACTION_MOCK = {
          id: BATCH_ID_MOCK,
          chainId: CHAIN_ID_MOCK,
          transactions: [],
        };
        // Simulate the state update for adding the batch
        const state = {
          transactionBatches: [BATCH_TRANSACTION_MOCK],
        } as unknown as TransactionControllerState;

        // Simulate adding the batch
        updateMock.mock.calls[0][0](state);

        expect(state.transactionBatches).toStrictEqual([
          BATCH_TRANSACTION_MOCK,
          expect.objectContaining({
            id: expect.any(String),
            chainId: CHAIN_ID_MOCK,
            gas: GAS_TOTAL_MOCK,
            from: FROM_MOCK,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
            transactions: TRANSACTIONS_BATCH_MOCK,
            origin: ORIGIN_MOCK,
          }),
        ]);

        await resultPromise;

        // Simulate cleaning the specific batch by ID
        updateMock.mock.calls[1][0](state);

        expect(state.transactionBatches).toStrictEqual([
          BATCH_TRANSACTION_MOCK,
        ]);
        expect(simulateGasBatchMock).toHaveBeenCalledTimes(1);
        expect(getGasFeesMock).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('isAtomicBatchSupported', () => {
    beforeEach(() => {
      jest.resetAllMocks();
    });

    it('includes all feature flag chains if chain IDs not specified', async () => {
      getEIP7702SupportedChainsMock.mockReturnValueOnce([
        CHAIN_ID_MOCK,
        CHAIN_ID_2_MOCK,
      ]);

      getEIP7702UpgradeContractAddressMock.mockReturnValue(
        UPGRADE_CONTRACT_ADDRESS_MOCK,
      );

      isAccountUpgradedToEIP7702Mock
        .mockResolvedValueOnce({
          isSupported: false,
          delegationAddress: undefined,
        })
        .mockResolvedValueOnce({
          isSupported: true,
          delegationAddress: CONTRACT_ADDRESS_MOCK,
        });

      const result = await isAtomicBatchSupported({
        address: FROM_MOCK,
        getEthQuery: GET_ETH_QUERY_MOCK,
        messenger: MESSENGER_MOCK,
        publicKeyEIP7702: PUBLIC_KEY_MOCK,
      });

      expect(result).toStrictEqual([
        {
          chainId: CHAIN_ID_MOCK,
          delegationAddress: undefined,
          isSupported: false,
          upgradeContractAddress: UPGRADE_CONTRACT_ADDRESS_MOCK,
        },
        {
          chainId: CHAIN_ID_2_MOCK,
          delegationAddress: CONTRACT_ADDRESS_MOCK,
          isSupported: true,
          upgradeContractAddress: UPGRADE_CONTRACT_ADDRESS_MOCK,
        },
      ]);
    });

    it('includes only specified chain IDs', async () => {
      getEIP7702SupportedChainsMock.mockReturnValueOnce([
        CHAIN_ID_MOCK,
        CHAIN_ID_2_MOCK,
      ]);

      getEIP7702UpgradeContractAddressMock.mockReturnValue(
        UPGRADE_CONTRACT_ADDRESS_MOCK,
      );

      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        isSupported: true,
        delegationAddress: CONTRACT_ADDRESS_MOCK,
      });

      const result = await isAtomicBatchSupported({
        address: FROM_MOCK,
        chainIds: [CHAIN_ID_2_MOCK, '0xabcdef'],
        getEthQuery: GET_ETH_QUERY_MOCK,
        messenger: MESSENGER_MOCK,
        publicKeyEIP7702: PUBLIC_KEY_MOCK,
      });

      expect(result).toStrictEqual([
        {
          chainId: CHAIN_ID_2_MOCK,
          delegationAddress: CONTRACT_ADDRESS_MOCK,
          isSupported: true,
          upgradeContractAddress: UPGRADE_CONTRACT_ADDRESS_MOCK,
        },
      ]);
    });

    it('throws if no public key', async () => {
      await expect(
        isAtomicBatchSupported({
          address: FROM_MOCK,
          getEthQuery: GET_ETH_QUERY_MOCK,
          messenger: MESSENGER_MOCK,
          publicKeyEIP7702: undefined,
        }),
      ).rejects.toThrow(rpcErrors.internal(ERROR_MESSGE_PUBLIC_KEY));
    });

    it('does not throw if error getting provider', async () => {
      getEIP7702UpgradeContractAddressMock.mockReturnValue(undefined);
      getEIP7702SupportedChainsMock.mockReturnValueOnce([
        CHAIN_ID_MOCK,
        CHAIN_ID_2_MOCK,
      ]);
      getEIP7702UpgradeContractAddressMock.mockReturnValueOnce(undefined);

      isAccountUpgradedToEIP7702Mock.mockResolvedValue({
        isSupported: false,
        delegationAddress: undefined,
      });

      const results = await isAtomicBatchSupported({
        address: FROM_MOCK,
        getEthQuery: jest
          .fn()
          .mockImplementationOnce(() => {
            throw new Error(ERROR_MESSAGE_MOCK);
          })
          .mockReturnValueOnce({}),
        messenger: MESSENGER_MOCK,
        publicKeyEIP7702: PUBLIC_KEY_MOCK,
      });

      expect(results).toStrictEqual([
        {
          chainId: CHAIN_ID_2_MOCK,
          delegationAddress: undefined,
          isSupported: false,
          upgradeContractAddress: undefined,
        },
      ]);
    });
  });
});
