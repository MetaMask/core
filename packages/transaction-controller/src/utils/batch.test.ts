import { rpcErrors } from '@metamask/rpc-errors';

import { addTransactionBatch } from './batch';
import {
  doesChainSupportEIP7702,
  generateEIP7702BatchTransaction,
  isAccountUpgradedToEIP7702,
} from './eip7702';
import { getEIP7702UpgradeContractAddress } from './feature-flags';
import {
  TransactionEnvelopeType,
  type TransactionControllerMessenger,
  type TransactionMeta,
} from '..';

jest.mock('./eip7702');
jest.mock('./feature-flags');

type AddBatchTransactionOptions = Parameters<typeof addTransactionBatch>[0];

const FROM_MOCK = '0x1234567890123456789012345678901234567890';
const CONTRACT_ADDRESS_MOCK = '0xabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd';
const TO_MOCK = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef';
const DATA_MOCK = '0xabcdef';
const VALUE_MOCK = '0x1234';
const MESSENGER_MOCK = {} as TransactionControllerMessenger;
const NETWORK_CLIENT_ID_MOCK = 'testNetworkClientId';
const BATCH_ID_MOCK = 'testBatchId';
const GET_ETH_QUERY_MOCK = jest.fn();

const TRANSACTION_META_MOCK = {
  id: BATCH_ID_MOCK,
} as TransactionMeta;

describe('Batch Utils', () => {
  let addTransactionMock: jest.MockedFn<
    AddBatchTransactionOptions['addTransaction']
  >;

  let getChainIdMock: jest.MockedFunction<
    AddBatchTransactionOptions['getChainId']
  >;

  let request: AddBatchTransactionOptions;

  const doesChainSupportEIP7702Mock = jest.mocked(doesChainSupportEIP7702);
  const isAccountUpgradedToEIP7702Mock = jest.mocked(
    isAccountUpgradedToEIP7702,
  );
  const getEIP7702UpgradeContractAddressMock = jest.mocked(
    getEIP7702UpgradeContractAddress,
  );
  const generateEIP7702BatchTransactionMock = jest.mocked(
    generateEIP7702BatchTransaction,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    addTransactionMock = jest.fn();
    getChainIdMock = jest.fn();

    request = {
      addTransaction: addTransactionMock,
      getChainId: getChainIdMock,
      getEthQuery: GET_ETH_QUERY_MOCK,
      messenger: MESSENGER_MOCK,
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
    };
  });

  describe('addTransactionBatch', () => {
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
            {
              to: TO_MOCK,
              data: DATA_MOCK,
              value: VALUE_MOCK,
            },
            {
              to: TO_MOCK,
              data: DATA_MOCK,
              value: VALUE_MOCK,
            },
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
  });
});
