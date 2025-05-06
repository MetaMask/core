import { rpcErrors } from '@metamask/rpc-errors';

import { addTransactionBatch, isAtomicBatchSupported } from './batch';
import {
  doesChainSupportEIP7702,
  generateEIP7702BatchTransaction,
  isAccountUpgradedToEIP7702,
} from './eip7702';
import {
  getEIP7702SupportedChains,
  getEIP7702UpgradeContractAddress,
} from './feature-flags';
import { validateBatchRequest } from './validation';
import {
  TransactionEnvelopeType,
  type TransactionControllerMessenger,
  type TransactionMeta,
  determineTransactionType,
  TransactionType,
} from '..';
import { flushPromises } from '../../../../tests/helpers';
import type { PublishBatchHook } from '../types';

jest.mock('./eip7702');
jest.mock('./feature-flags');
jest.mock('./transaction-type');

jest.mock('./validation', () => ({
  ...jest.requireActual('./validation'),
  validateBatchRequest: jest.fn(),
}));

type AddBatchTransactionOptions = Parameters<typeof addTransactionBatch>[0];

const CHAIN_ID_MOCK = '0x123';
const CHAIN_ID_2_MOCK = '0xabc';
const FROM_MOCK = '0x1234567890123456789012345678901234567890';
const CONTRACT_ADDRESS_MOCK = '0xabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd';
const TO_MOCK = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef';
const DATA_MOCK = '0xabcdef';
const VALUE_MOCK = '0x1234';
const MESSENGER_MOCK = {} as TransactionControllerMessenger;
const NETWORK_CLIENT_ID_MOCK = 'testNetworkClientId';
const PUBLIC_KEY_MOCK = '0x112233';
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

describe('Batch Utils', () => {
  const doesChainSupportEIP7702Mock = jest.mocked(doesChainSupportEIP7702);
  const getEIP7702SupportedChainsMock = jest.mocked(getEIP7702SupportedChains);
  const validateBatchRequestMock = jest.mocked(validateBatchRequest);
  const determineTransactionTypeMock = jest.mocked(determineTransactionType);

  const isAccountUpgradedToEIP7702Mock = jest.mocked(
    isAccountUpgradedToEIP7702,
  );

  const getEIP7702UpgradeContractAddressMock = jest.mocked(
    getEIP7702UpgradeContractAddress,
  );

  const generateEIP7702BatchTransactionMock = jest.mocked(
    generateEIP7702BatchTransaction,
  );

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

    let request: AddBatchTransactionOptions;

    beforeEach(() => {
      jest.resetAllMocks();
      addTransactionMock = jest.fn();
      getChainIdMock = jest.fn();
      updateTransactionMock = jest.fn();
      publishTransactionMock = jest.fn();

      determineTransactionTypeMock.mockResolvedValue({
        type: TransactionType.simpleSend,
      });

      getChainIdMock.mockReturnValue(CHAIN_ID_MOCK);

      request = {
        addTransaction: addTransactionMock,
        getChainId: getChainIdMock,
        getEthQuery: GET_ETH_QUERY_MOCK,
        getInternalAccounts: GET_INTERNAL_ACCOUNTS_MOCK,
        getTransaction: jest.fn(),
        messenger: MESSENGER_MOCK,
        publicKeyEIP7702: PUBLIC_KEY_MOCK,
        request: {
          from: FROM_MOCK,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          requireApproval: true,
          transactions: [
            {
              params: {
                to: TO_MOCK,
                data: DATA_MOCK,
                value: VALUE_MOCK,
              },
            },
            {
              params: {
                to: TO_MOCK,
                data: DATA_MOCK,
                value: VALUE_MOCK,
              },
            },
          ],
        },
        updateTransaction: updateTransactionMock,
        publishTransaction: publishTransactionMock,
      };
    });

    it('returns generated batch ID', async () => {
      doesChainSupportEIP7702Mock.mockReturnValueOnce(true);

      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        delegationAddress: undefined,
        isSupported: true,
      });

      addTransactionMock.mockResolvedValueOnce({
        transactionMeta: TRANSACTION_META_MOCK,
        result: Promise.resolve(''),
      });

      generateEIP7702BatchTransactionMock.mockReturnValueOnce({
        to: TO_MOCK,
        data: DATA_MOCK,
        value: VALUE_MOCK,
      });

      const result = await addTransactionBatch(request);

      expect(result.batchId).toMatch(/^0x[0-9a-f]{32}$/u);
    });

    it('returns provided batch ID', async () => {
      doesChainSupportEIP7702Mock.mockReturnValueOnce(true);

      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        delegationAddress: undefined,
        isSupported: true,
      });

      addTransactionMock.mockResolvedValueOnce({
        transactionMeta: TRANSACTION_META_MOCK,
        result: Promise.resolve(''),
      });

      generateEIP7702BatchTransactionMock.mockReturnValueOnce({
        to: TO_MOCK,
        data: DATA_MOCK,
        value: VALUE_MOCK,
      });

      request.request.batchId = BATCH_ID_CUSTOM_MOCK;

      const result = await addTransactionBatch(request);

      expect(result.batchId).toBe(BATCH_ID_CUSTOM_MOCK);
    });

    it('adds generated EIP-7702 transaction', async () => {
      doesChainSupportEIP7702Mock.mockReturnValueOnce(true);

      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        delegationAddress: undefined,
        isSupported: true,
      });

      addTransactionMock.mockResolvedValueOnce({
        transactionMeta: TRANSACTION_META_MOCK,
        result: Promise.resolve(''),
      });

      generateEIP7702BatchTransactionMock.mockReturnValueOnce({
        to: TO_MOCK,
        data: DATA_MOCK,
        value: VALUE_MOCK,
      });

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
          requireApproval: true,
        }),
      );
    });

    it('uses type 4 transaction if not upgraded', async () => {
      doesChainSupportEIP7702Mock.mockReturnValueOnce(true);

      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        delegationAddress: undefined,
        isSupported: false,
      });

      addTransactionMock.mockResolvedValueOnce({
        transactionMeta: TRANSACTION_META_MOCK,
        result: Promise.resolve(''),
      });

      generateEIP7702BatchTransactionMock.mockReturnValueOnce({
        to: TO_MOCK,
        data: DATA_MOCK,
        value: VALUE_MOCK,
      });

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
      doesChainSupportEIP7702Mock.mockReturnValueOnce(true);

      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        delegationAddress: undefined,
        isSupported: true,
      });

      addTransactionMock.mockResolvedValueOnce({
        transactionMeta: TRANSACTION_META_MOCK,
        result: Promise.resolve(''),
      });

      generateEIP7702BatchTransactionMock.mockReturnValueOnce({
        to: TO_MOCK,
        data: DATA_MOCK,
        value: VALUE_MOCK,
      });

      await addTransactionBatch(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          nestedTransactions: [
            expect.objectContaining({
              to: TO_MOCK,
              data: DATA_MOCK,
              value: VALUE_MOCK,
            }),
            expect.objectContaining({
              to: TO_MOCK,
              data: DATA_MOCK,
              value: VALUE_MOCK,
            }),
          ],
        }),
      );
    });

    it('determines transaction type for nested transactions', async () => {
      doesChainSupportEIP7702Mock.mockReturnValueOnce(true);

      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        delegationAddress: undefined,
        isSupported: true,
      });

      addTransactionMock.mockResolvedValueOnce({
        transactionMeta: TRANSACTION_META_MOCK,
        result: Promise.resolve(''),
      });

      generateEIP7702BatchTransactionMock.mockReturnValueOnce({
        to: TO_MOCK,
        data: DATA_MOCK,
        value: VALUE_MOCK,
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
      doesChainSupportEIP7702Mock.mockReturnValueOnce(false);

      await expect(addTransactionBatch(request)).rejects.toThrow(
        rpcErrors.internal('Chain does not support EIP-7702'),
      );
    });

    it('throws if no public key', async () => {
      doesChainSupportEIP7702Mock.mockReturnValueOnce(true);

      await expect(
        addTransactionBatch({ ...request, publicKeyEIP7702: undefined }),
      ).rejects.toThrow(
        rpcErrors.internal('EIP-7702 public key not specified'),
      );
    });

    it('throws if account upgraded to unsupported contract', async () => {
      doesChainSupportEIP7702Mock.mockReturnValueOnce(true);
      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        delegationAddress: CONTRACT_ADDRESS_MOCK,
        isSupported: false,
      });

      await expect(addTransactionBatch(request)).rejects.toThrow(
        rpcErrors.internal('Account upgraded to unsupported contract'),
      );
    });

    it('throws if account not upgraded and no upgrade address', async () => {
      doesChainSupportEIP7702Mock.mockReturnValueOnce(true);

      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        delegationAddress: undefined,
        isSupported: false,
      });

      getEIP7702UpgradeContractAddressMock.mockReturnValueOnce(undefined);

      await expect(addTransactionBatch(request)).rejects.toThrow(
        rpcErrors.internal('Upgrade contract address not found'),
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
      doesChainSupportEIP7702Mock.mockReturnValueOnce(true);

      isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
        delegationAddress: undefined,
        isSupported: true,
      });

      addTransactionMock.mockResolvedValueOnce({
        transactionMeta: TRANSACTION_META_MOCK,
        result: Promise.resolve(''),
      });

      generateEIP7702BatchTransactionMock.mockReturnValueOnce({
        to: TO_MOCK,
        data: DATA_MOCK,
        value: VALUE_MOCK,
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
        doesChainSupportEIP7702Mock.mockReturnValueOnce(true);

        isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
          delegationAddress: undefined,
          isSupported: true,
        });

        addTransactionMock.mockResolvedValueOnce({
          transactionMeta: TRANSACTION_META_MOCK,
          result: Promise.resolve(''),
        });

        generateEIP7702BatchTransactionMock.mockReturnValueOnce({
          to: TO_MOCK,
          data: DATA_MOCK,
          value: VALUE_MOCK,
        });

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
          },
          CHAIN_ID_MOCK,
        );
      });

      it('using delegation mock if not upgraded', async () => {
        doesChainSupportEIP7702Mock.mockReturnValueOnce(true);

        isAccountUpgradedToEIP7702Mock.mockResolvedValueOnce({
          delegationAddress: undefined,
          isSupported: false,
        });

        addTransactionMock.mockResolvedValueOnce({
          transactionMeta: TRANSACTION_META_MOCK,
          result: Promise.resolve(''),
        });

        generateEIP7702BatchTransactionMock.mockReturnValueOnce({
          to: TO_MOCK,
          data: DATA_MOCK,
          value: VALUE_MOCK,
        });

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
          },
          CHAIN_ID_MOCK,
        );
      });
    });

    describe('with publish batch hook', () => {
      it('adds each nested transaction', async () => {
        const publishBatchHook = jest.fn();

        addTransactionMock.mockResolvedValueOnce({
          transactionMeta: TRANSACTION_META_MOCK,
          result: Promise.resolve(''),
        });

        addTransactionBatch({
          ...request,
          publishBatchHook,
          request: { ...request.request, useHook: true },
        }).catch(() => {
          // Intentionally empty
        });

        await flushPromises();

        expect(addTransactionMock).toHaveBeenCalledTimes(2);
        expect(addTransactionMock).toHaveBeenCalledWith(
          {
            data: DATA_MOCK,
            from: FROM_MOCK,
            to: TO_MOCK,
            value: VALUE_MOCK,
          },
          {
            batchId: expect.any(String),
            disableGasBuffer: true,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
            publishHook: expect.any(Function),
            requireApproval: false,
          },
        );
      });

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
          request: { ...request.request, useHook: true },
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
        expect(publishBatchHook).toHaveBeenCalledWith({
          from: FROM_MOCK,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          transactions: [
            {
              id: TRANSACTION_ID_MOCK,
              params: { data: DATA_MOCK, to: TO_MOCK, value: VALUE_MOCK },
              signedTx: TRANSACTION_SIGNATURE_MOCK,
            },
            {
              id: TRANSACTION_ID_2_MOCK,
              params: { data: DATA_MOCK, to: TO_MOCK, value: VALUE_MOCK },
              signedTx: TRANSACTION_SIGNATURE_2_MOCK,
            },
          ],
        });
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
          request: { ...request.request, useHook: true },
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
            useHook: true,
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
              params: { data: DATA_MOCK, to: TO_MOCK, value: VALUE_MOCK },
              signedTx: TRANSACTION_SIGNATURE_2_MOCK,
            },
            {
              id: TRANSACTION_ID_MOCK,
              params: { data: DATA_MOCK, to: TO_MOCK, value: VALUE_MOCK },
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
            useHook: true,
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

        publishBatchHook.mockResolvedValue(undefined);

        const resultPromise = addTransactionBatch({
          ...request,
          publishBatchHook,
          request: { ...request.request, useHook: true },
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

      it('throws if no publish batch hook', async () => {
        await expect(
          addTransactionBatch({
            ...request,
            request: { ...request.request, useHook: true },
          }),
        ).rejects.toThrow(rpcErrors.internal('No publish batch hook provided'));
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
          request: { ...request.request, useHook: true },
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
          request: { ...request.request, useHook: true },
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
  });

  describe('isAtomicBatchSupported', () => {
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
      ).rejects.toThrow(
        rpcErrors.internal('EIP-7702 public key not specified'),
      );
    });

    it('does not throw if error getting provider', async () => {
      getEIP7702SupportedChainsMock.mockReturnValueOnce([
        CHAIN_ID_MOCK,
        CHAIN_ID_2_MOCK,
      ]);

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
