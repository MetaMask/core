import { TransactionStatus, TransactionType } from '../src/types';
import type {
  EtherscanTokenTransactionMeta,
  EtherscanTransactionMeta,
  EtherscanTransactionMetaBase,
  EtherscanTransactionResponse,
} from '../src/utils/etherscan';

export const ID_MOCK = '6843ba00-f4bf-11e8-a715-5f2fff84549d';

export const ETHERSCAN_TRANSACTION_BASE_MOCK: EtherscanTransactionMetaBase = {
  blockNumber: '4535105',
  confirmations: '4',
  contractAddress: '',
  cumulativeGasUsed: '693910',
  from: '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207',
  gas: '335208',
  gasPrice: '20000000000',
  gasUsed: '21000',
  hash: '0x342e9d73e10004af41d04973339fc7219dbadcbb5629730cfe65e9f9cb15ff91',
  nonce: '1',
  timeStamp: '1543596356',
  transactionIndex: '13',
  value: '50000000000000000',
  blockHash: '0x0000000001',
  to: '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207',
};

export const ETHERSCAN_TRANSACTION_SUCCESS_MOCK: EtherscanTransactionMeta = {
  ...ETHERSCAN_TRANSACTION_BASE_MOCK,
  functionName: 'testFunction',
  input: '0x',
  isError: '0',
  methodId: 'testId',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  txreceipt_status: '1',
};

const ETHERSCAN_TRANSACTION_ERROR_MOCK: EtherscanTransactionMeta = {
  ...ETHERSCAN_TRANSACTION_SUCCESS_MOCK,
  isError: '1',
};

export const ETHERSCAN_TOKEN_TRANSACTION_MOCK: EtherscanTokenTransactionMeta = {
  ...ETHERSCAN_TRANSACTION_BASE_MOCK,
  tokenDecimal: '456',
  tokenName: 'TestToken',
  tokenSymbol: 'ABC',
};

export const ETHERSCAN_TRANSACTION_RESPONSE_MOCK: EtherscanTransactionResponse<EtherscanTransactionMeta> =
  {
    status: '1',
    result: [
      ETHERSCAN_TRANSACTION_SUCCESS_MOCK,
      ETHERSCAN_TRANSACTION_ERROR_MOCK,
    ],
  };

export const ETHERSCAN_TOKEN_TRANSACTION_RESPONSE_MOCK: EtherscanTransactionResponse<EtherscanTokenTransactionMeta> =
  {
    status: '1',
    result: [
      ETHERSCAN_TOKEN_TRANSACTION_MOCK,
      ETHERSCAN_TOKEN_TRANSACTION_MOCK,
    ],
  };

export const ETHERSCAN_TRANSACTION_RESPONSE_EMPTY_MOCK: EtherscanTransactionResponse<EtherscanTransactionMeta> =
  {
    status: '0',
    result: '',
  };

export const ETHERSCAN_TOKEN_TRANSACTION_RESPONSE_EMPTY_MOCK: EtherscanTransactionResponse<EtherscanTokenTransactionMeta> =
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ETHERSCAN_TRANSACTION_RESPONSE_EMPTY_MOCK as any;

export const ETHERSCAN_TRANSACTION_RESPONSE_ERROR_MOCK: EtherscanTransactionResponse<EtherscanTransactionMeta> =
  {
    status: '0',
    message: 'NOTOK',
    result: 'Test Error',
  };

export const ETHERSCAN_TOKEN_TRANSACTION_RESPONSE_ERROR_MOCK: EtherscanTransactionResponse<EtherscanTokenTransactionMeta> =
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ETHERSCAN_TRANSACTION_RESPONSE_ERROR_MOCK as any;

const EXPECTED_NORMALISED_TRANSACTION_BASE = {
  blockNumber: ETHERSCAN_TRANSACTION_SUCCESS_MOCK.blockNumber,
  chainId: undefined,
  hash: ETHERSCAN_TRANSACTION_SUCCESS_MOCK.hash,
  id: ID_MOCK,
  status: TransactionStatus.confirmed,
  time: 1543596356000,
  txParams: {
    chainId: undefined,
    from: ETHERSCAN_TRANSACTION_SUCCESS_MOCK.from,
    gas: '0x51d68',
    gasPrice: '0x4a817c800',
    gasUsed: '0x5208',
    nonce: '0x1',
    to: ETHERSCAN_TRANSACTION_SUCCESS_MOCK.to,
    value: '0xb1a2bc2ec50000',
  },
  type: TransactionType.incoming,
  verifiedOnBlockchain: false,
};

export const EXPECTED_NORMALISED_TRANSACTION_SUCCESS = {
  ...EXPECTED_NORMALISED_TRANSACTION_BASE,
  txParams: {
    ...EXPECTED_NORMALISED_TRANSACTION_BASE.txParams,
    data: ETHERSCAN_TRANSACTION_SUCCESS_MOCK.input,
  },
};

export const EXPECTED_NORMALISED_TRANSACTION_ERROR = {
  ...EXPECTED_NORMALISED_TRANSACTION_SUCCESS,
  error: new Error('Transaction failed'),
  status: TransactionStatus.failed,
};

export const EXPECTED_NORMALISED_TOKEN_TRANSACTION = {
  ...EXPECTED_NORMALISED_TRANSACTION_BASE,
  isTransfer: true,
  transferInformation: {
    contractAddress: '',
    decimals: Number(ETHERSCAN_TOKEN_TRANSACTION_MOCK.tokenDecimal),
    symbol: ETHERSCAN_TOKEN_TRANSACTION_MOCK.tokenSymbol,
  },
};
