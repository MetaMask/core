import { NetworkType, handleFetch } from '@metamask/controller-utils';

import type {
  EtherscanTransactionMeta,
  EtherscanTransactionRequest,
  EtherscanTransactionResponse,
} from './etherscan';
import * as Etherscan from './etherscan';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  handleFetch: jest.fn(),
}));

const ADDERSS_MOCK = '0x2A2D72308838A6A46a0B5FDA3055FE915b5D99eD';

const REQUEST_MOCK: EtherscanTransactionRequest = {
  address: ADDERSS_MOCK,
  networkType: NetworkType.goerli,
  limit: 3,
  fromBlock: '0x2',
  apiKey: 'testApiKey',
};

const RESPONSE_MOCK: EtherscanTransactionResponse<EtherscanTransactionMeta> = {
  status: '1',
  result: [
    { from: ADDERSS_MOCK, nonce: '0x1' } as EtherscanTransactionMeta,
    { from: ADDERSS_MOCK, nonce: '0x2' } as EtherscanTransactionMeta,
  ],
};

describe('Etherscan', () => {
  const handleFetchMock = handleFetch as jest.MockedFunction<
    typeof handleFetch
  >;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe.each([
    ['fetchEtherscanTransactions', 'txlist'],
    ['fetchEtherscanTokenTransactions', 'tokentx'],
  ])('%s', (method, action) => {
    it('returns fetched response', async () => {
      handleFetchMock.mockResolvedValueOnce(RESPONSE_MOCK);

      const result = await (Etherscan as any)[method](REQUEST_MOCK);

      expect(result).toStrictEqual(RESPONSE_MOCK);
    });

    it('fetches from Etherscan URL', async () => {
      handleFetchMock.mockResolvedValueOnce(RESPONSE_MOCK);

      await (Etherscan as any)[method](REQUEST_MOCK);

      expect(handleFetchMock).toHaveBeenCalledTimes(1);
      expect(handleFetchMock).toHaveBeenCalledWith(
        `https://api-${REQUEST_MOCK.networkType}.etherscan.io/api?` +
          `module=account` +
          `&address=${REQUEST_MOCK.address}` +
          `&startBlock=${REQUEST_MOCK.fromBlock}` +
          `&apikey=${REQUEST_MOCK.apiKey}` +
          `&offset=${REQUEST_MOCK.limit}` +
          `&order=desc` +
          `&action=${action}` +
          `&tag=latest` +
          `&page=1`,
      );
    });

    it('returns empty result if response status is 0', async () => {
      handleFetchMock.mockResolvedValueOnce({
        status: '0',
      });

      const result = await (Etherscan as any)[method](REQUEST_MOCK);

      expect(result).toStrictEqual({
        status: '0',
        result: [],
      });
    });

    it('returns standard response if result is empty', async () => {
      handleFetchMock.mockResolvedValueOnce({
        status: '0',
        result: [],
        error: 'testError',
      });

      const result = await (Etherscan as any)[method](REQUEST_MOCK);

      expect(result).toStrictEqual({
        status: '0',
        result: [],
      });
    });

    it('does not include empty values in fetched URL', async () => {
      handleFetchMock.mockResolvedValueOnce(RESPONSE_MOCK);

      await (Etherscan as any)[method]({
        ...REQUEST_MOCK,
        fromBlock: undefined,
        apiKey: undefined,
      });

      expect(handleFetchMock).toHaveBeenCalledTimes(1);
      expect(handleFetchMock).toHaveBeenCalledWith(
        `https://api-${REQUEST_MOCK.networkType}.etherscan.io/api?` +
          `module=account` +
          `&address=${REQUEST_MOCK.address}` +
          `&offset=${REQUEST_MOCK.limit}` +
          `&order=desc` +
          `&action=${action}` +
          `&tag=latest` +
          `&page=1`,
      );
    });
  });
});
