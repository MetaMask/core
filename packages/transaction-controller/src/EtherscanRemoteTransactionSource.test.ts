import { EtherscanRemoteTransactionSource } from './EtherscanRemoteTransactionSource';
import {
  EtherscanTransactionMeta,
  EtherscanTransactionResponse,
  fetchEtherscanTokenTransactions,
  fetchEtherscanTransactions,
} from './etherscan';
import { v1 as random } from 'uuid';
import { TransactionStatus } from './types';

jest.mock('./etherscan', () => ({
  fetchEtherscanTransactions: jest.fn(),
  fetchEtherscanTokenTransactions: jest.fn(),
}));

jest.mock('uuid');

const ID_MOCK = '6843ba00-f4bf-11e8-a715-5f2fff84549d';

const ETHERSCAN_TRANSACTION_SUCCESS_MOCK: EtherscanTransactionMeta = {
  blockNumber: '4535105',
  confirmations: '4',
  contractAddress: '',
  cumulativeGasUsed: '693910',
  from: '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207',
  gas: '335208',
  gasPrice: '20000000000',
  gasUsed: '21000',
  hash: '0x342e9d73e10004af41d04973339fc7219dbadcbb5629730cfe65e9f9cb15ff91',
  input: '0x',
  isError: '0',
  nonce: '1',
  timeStamp: '1543596356',
  transactionIndex: '13',
  txreceipt_status: '1',
  value: '50000000000000000',
  blockHash: '0x0000000001',
  to: '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207',
  tokenDecimal: '456',
  tokenSymbol: 'ABC',
};

const ETHERSCAN_TRANSACTION_ERROR_MOCK: EtherscanTransactionMeta = {
  ...ETHERSCAN_TRANSACTION_SUCCESS_MOCK,
  isError: '1',
};

const ETHERSCAN_RESPONSE_MOCK: EtherscanTransactionResponse = {
  status: '1',
  result: [
    ETHERSCAN_TRANSACTION_SUCCESS_MOCK,
    ETHERSCAN_TRANSACTION_ERROR_MOCK,
  ],
};

const ETHERSCAN_RESPONSE_EMPTY_MOCK: EtherscanTransactionResponse = {
  status: '0',
  result: [],
};

const EXPECTED_NORMALISED_TRANSACTION_SUCCESS = {
  blockNumber: ETHERSCAN_TRANSACTION_SUCCESS_MOCK.blockNumber,
  chainId: undefined,
  id: ID_MOCK,
  networkID: undefined,
  status: TransactionStatus.confirmed,
  time: 1543596356000,
  transaction: {
    data: ETHERSCAN_TRANSACTION_SUCCESS_MOCK.input,
    from: ETHERSCAN_TRANSACTION_SUCCESS_MOCK.from,
    gas: '0x51d68',
    gasPrice: '0x4a817c800',
    gasUsed: '0x5208',
    nonce: '0x1',
    to: ETHERSCAN_TRANSACTION_SUCCESS_MOCK.to,
    value: '0xb1a2bc2ec50000',
  },
  transactionHash: ETHERSCAN_TRANSACTION_SUCCESS_MOCK.hash,
  verifiedOnBlockchain: false,
};

const EXPECTED_NORMALISED_TRANSACTION_ERROR = {
  ...EXPECTED_NORMALISED_TRANSACTION_SUCCESS,
  error: new Error('Transaction failed'),
  status: TransactionStatus.failed,
};

const EXPECTED_NORMALISED_TOKEN_TRANSACTION = {
  chainId: undefined,
  id: ID_MOCK,
  isTransfer: true,
  networkID: undefined,
  status: 'confirmed',
  time: 1543596356000,
  transaction: {
    from: ETHERSCAN_TRANSACTION_SUCCESS_MOCK.from,
    gas: ETHERSCAN_TRANSACTION_SUCCESS_MOCK.gas,
    gasPrice: ETHERSCAN_TRANSACTION_SUCCESS_MOCK.gasPrice,
    gasUsed: ETHERSCAN_TRANSACTION_SUCCESS_MOCK.gasUsed,
    to: ETHERSCAN_TRANSACTION_SUCCESS_MOCK.to,
    value: ETHERSCAN_TRANSACTION_SUCCESS_MOCK.value,
  },
  transferInformation: {
    contractAddress: '',
    decimals: Number(ETHERSCAN_TRANSACTION_SUCCESS_MOCK.tokenDecimal),
    symbol: ETHERSCAN_TRANSACTION_SUCCESS_MOCK.tokenSymbol,
  },
  transactionHash: ETHERSCAN_TRANSACTION_SUCCESS_MOCK.hash,
  verifiedOnBlockchain: false,
};

describe('EtherscanRemoteTransactionSource', () => {
  const fetchEtherscanTransactionsMock =
    fetchEtherscanTransactions as jest.MockedFn<
      typeof fetchEtherscanTransactions
    >;

  const fetchEtherscanTokenTransactionsMock =
    fetchEtherscanTokenTransactions as jest.MockedFn<
      typeof fetchEtherscanTokenTransactions
    >;

  const randomMock = random as jest.MockedFn<typeof random>;

  beforeEach(() => {
    jest.resetAllMocks();

    fetchEtherscanTransactionsMock.mockResolvedValue(
      ETHERSCAN_RESPONSE_EMPTY_MOCK,
    );

    fetchEtherscanTokenTransactionsMock.mockResolvedValue(
      ETHERSCAN_RESPONSE_EMPTY_MOCK,
    );

    randomMock.mockReturnValue(ID_MOCK);
  });

  describe('fetchTransactions', () => {
    it('returns normalized transactions fetched from Etherscan', async () => {
      fetchEtherscanTransactionsMock.mockResolvedValueOnce(
        ETHERSCAN_RESPONSE_MOCK,
      );

      const transactions =
        await new EtherscanRemoteTransactionSource().fetchTransactions(
          {} as any,
        );

      expect(transactions).toEqual([
        EXPECTED_NORMALISED_TRANSACTION_SUCCESS,
        EXPECTED_NORMALISED_TRANSACTION_ERROR,
      ]);
    });

    it('returns normalized token transactions fetched from Etherscan', async () => {
      fetchEtherscanTokenTransactionsMock.mockResolvedValueOnce(
        ETHERSCAN_RESPONSE_MOCK,
      );

      const transactions =
        await new EtherscanRemoteTransactionSource().fetchTransactions(
          {} as any,
        );

      expect(transactions).toEqual([
        EXPECTED_NORMALISED_TOKEN_TRANSACTION,
        EXPECTED_NORMALISED_TOKEN_TRANSACTION,
      ]);
    });
  });
});
