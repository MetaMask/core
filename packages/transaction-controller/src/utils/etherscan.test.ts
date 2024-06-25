import { handleFetch } from '@metamask/controller-utils';

import { CHAIN_IDS, ETHERSCAN_SUPPORTED_NETWORKS } from '../constants';
import type {
  EtherscanTransactionMeta,
  EtherscanTransactionRequest,
  EtherscanTransactionResponse,
} from './etherscan';
import * as Etherscan from './etherscan';
import { getEtherscanApiHost } from './etherscan';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  handleFetch: jest.fn(),
}));

const ADDERSS_MOCK = '0x2A2D72308838A6A46a0B5FDA3055FE915b5D99eD';

const REQUEST_MOCK: EtherscanTransactionRequest = {
  address: ADDERSS_MOCK,
  chainId: CHAIN_IDS.GOERLI,
  limit: 3,
  fromBlock: 2,
};

const RESPONSE_MOCK: EtherscanTransactionResponse<EtherscanTransactionMeta> = {
  status: '1',
  result: [
    { from: ADDERSS_MOCK, nonce: '0x1' } as EtherscanTransactionMeta,
    { from: ADDERSS_MOCK, nonce: '0x2' } as EtherscanTransactionMeta,
  ],
};

describe('Etherscan', () => {
  const handleFetchMock = jest.mocked(handleFetch);

  describe('getEtherscanApiHost', () => {
    it('returns Etherscan API host for supported network', () => {
      expect(getEtherscanApiHost(CHAIN_IDS.GOERLI)).toBe(
        `https://${ETHERSCAN_SUPPORTED_NETWORKS[CHAIN_IDS.GOERLI].subdomain}.${
          ETHERSCAN_SUPPORTED_NETWORKS[CHAIN_IDS.GOERLI].domain
        }`,
      );
    });
    it('returns an error for unsupported network', () => {
      expect(() => getEtherscanApiHost('0x11111111111111111111')).toThrow(
        'Etherscan does not support chain with ID: 0x11111111111111111111',
      );
    });
  });

  describe.each([
    ['fetchEtherscanTransactions', 'txlist'],
    ['fetchEtherscanTokenTransactions', 'tokentx'],
  ])('%s', (method, action) => {
    it('returns fetched response', async () => {
      handleFetchMock.mockResolvedValueOnce(RESPONSE_MOCK);

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (Etherscan as any)[method](REQUEST_MOCK);

      expect(result).toStrictEqual(RESPONSE_MOCK);
    });

    it('fetches from Etherscan URL', async () => {
      handleFetchMock.mockResolvedValueOnce(RESPONSE_MOCK);

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (Etherscan as any)[method](REQUEST_MOCK);

      expect(handleFetchMock).toHaveBeenCalledTimes(1);
      expect(handleFetchMock).toHaveBeenCalledWith(
        `https://${ETHERSCAN_SUPPORTED_NETWORKS[CHAIN_IDS.GOERLI].subdomain}.${
          ETHERSCAN_SUPPORTED_NETWORKS[CHAIN_IDS.GOERLI].domain
        }/api?` +
          `module=account` +
          `&address=${REQUEST_MOCK.address}` +
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `&startBlock=${REQUEST_MOCK.fromBlock}` +
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `&offset=${REQUEST_MOCK.limit}` +
          `&sort=desc` +
          `&action=${action}` +
          `&tag=latest` +
          `&page=1`,
      );
    });

    it('supports alternate networks', async () => {
      handleFetchMock.mockResolvedValueOnce(RESPONSE_MOCK);

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (Etherscan as any)[method]({
        ...REQUEST_MOCK,
        chainId: CHAIN_IDS.MAINNET,
      });

      expect(handleFetchMock).toHaveBeenCalledTimes(1);
      expect(handleFetchMock).toHaveBeenCalledWith(
        `https://${ETHERSCAN_SUPPORTED_NETWORKS[CHAIN_IDS.MAINNET].subdomain}.${
          ETHERSCAN_SUPPORTED_NETWORKS[CHAIN_IDS.MAINNET].domain
        }/api?` +
          `module=account` +
          `&address=${REQUEST_MOCK.address}` +
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `&startBlock=${REQUEST_MOCK.fromBlock}` +
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `&offset=${REQUEST_MOCK.limit}` +
          `&sort=desc` +
          `&action=${action}` +
          `&tag=latest` +
          `&page=1`,
      );
    });

    it('throws if chain is not supported', async () => {
      const unsupportedChainId = '0x11111111111111111111';

      await expect(
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Etherscan as any)[method]({
          ...REQUEST_MOCK,
          chainId: unsupportedChainId,
        }),
      ).rejects.toThrow(
        `Etherscan does not support chain with ID: ${unsupportedChainId}`,
      );
    });

    it('does not include empty values in fetched URL', async () => {
      handleFetchMock.mockResolvedValueOnce(RESPONSE_MOCK);

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (Etherscan as any)[method]({
        ...REQUEST_MOCK,
        fromBlock: undefined,
        limit: undefined,
      });

      expect(handleFetchMock).toHaveBeenCalledTimes(1);
      expect(handleFetchMock).toHaveBeenCalledWith(
        `https://${ETHERSCAN_SUPPORTED_NETWORKS[CHAIN_IDS.GOERLI].subdomain}.${
          ETHERSCAN_SUPPORTED_NETWORKS[CHAIN_IDS.GOERLI].domain
        }/api?` +
          `module=account` +
          `&address=${REQUEST_MOCK.address}` +
          `&sort=desc` +
          `&action=${action}` +
          `&tag=latest` +
          `&page=1`,
      );
    });
  });
});
