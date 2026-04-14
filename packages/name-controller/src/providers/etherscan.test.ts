import { CHAIN_IDS } from '../constants';
import { NameType } from '../types';
import { handleFetch } from '../util';
import { EtherscanNameProvider } from './etherscan';

jest.mock('../util');

const VALUE_MOCK = 'TestValue';
const CHAIN_ID_MOCK = '0x1';
const SOURCE_ID = 'etherscan';
const CONTRACT_NAME_MOCK = 'TestContractName';
const CONTRACT_NAME_2_MOCK = 'TestContractName2';

describe('EtherscanNameProvider', () => {
  const handleFetchMock = jest.mocked(handleFetch);

  describe('getMetadata', () => {
    it('returns the provider metadata', () => {
      const metadata = new EtherscanNameProvider().getMetadata();
      const { sourceIds, sourceLabels } = metadata;

      expect(Object.keys(sourceIds)).toStrictEqual([NameType.ETHEREUM_ADDRESS]);
      expect(Object.values(sourceIds)).toStrictEqual([[expect.any(String)]]);

      const providerId = Object.values(sourceIds)[0][0];

      expect(Object.keys(sourceLabels)).toStrictEqual([providerId]);
      expect(sourceLabels[providerId]).toStrictEqual(expect.any(String));
    });
  });

  describe('getProposedNames', () => {
    it('returns the contract names from etherscan response', async () => {
      const provider = new EtherscanNameProvider();

      handleFetchMock.mockResolvedValueOnce({
        result: [
          {
            ContractName: CONTRACT_NAME_MOCK,
          },
          {
            ContractName: CONTRACT_NAME_2_MOCK,
          },
        ],
      });

      const response = await provider.getProposedNames({
        value: VALUE_MOCK,
        variation: CHAIN_ID_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(response).toStrictEqual({
        results: {
          [SOURCE_ID]: {
            proposedNames: [CONTRACT_NAME_MOCK, CONTRACT_NAME_2_MOCK],
          },
        },
      });

      expect(handleFetchMock).toHaveBeenCalledTimes(1);
      expect(handleFetchMock).toHaveBeenCalledWith(
        `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${VALUE_MOCK}`,
      );
    });

    it.each([
      ['empty', { result: [] }],
      ['undefined', undefined],
    ])(
      'returns empty array if response is %s',
      async (_, etherscanResponse) => {
        const provider = new EtherscanNameProvider();

        handleFetchMock.mockResolvedValueOnce(etherscanResponse);

        const response = await provider.getProposedNames({
          value: VALUE_MOCK,
          variation: CHAIN_ID_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
        });

        expect(response).toStrictEqual({
          results: {
            [SOURCE_ID]: {
              proposedNames: [],
            },
          },
        });
      },
    );

    it('requests alternate URL based on chain ID', async () => {
      const provider = new EtherscanNameProvider();

      handleFetchMock.mockResolvedValueOnce({
        result: [
          {
            ContractName: CONTRACT_NAME_MOCK,
          },
          {
            ContractName: CONTRACT_NAME_2_MOCK,
          },
        ],
      });

      await provider.getProposedNames({
        value: VALUE_MOCK,
        variation: CHAIN_IDS.LINEA_GOERLI,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(handleFetchMock).toHaveBeenCalledTimes(1);
      expect(handleFetchMock).toHaveBeenCalledWith(
        `https://goerli.lineascan.build/api?module=contract&action=getsourcecode&address=${VALUE_MOCK}`,
      );
    });

    it('throws if chain ID not supported', async () => {
      const invalidChainId = '0x0';
      const provider = new EtherscanNameProvider();

      await expect(
        provider.getProposedNames({
          value: VALUE_MOCK,
          variation: invalidChainId,
          type: NameType.ETHEREUM_ADDRESS,
        }),
      ).rejects.toThrow(
        `Etherscan does not support chain with ID: ${invalidChainId}`,
      );
    });

    it('returns delay only if within rate limit interval', async () => {
      const provider = new EtherscanNameProvider();

      await provider.getProposedNames({
        value: VALUE_MOCK,
        variation: CHAIN_ID_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      const result = await provider.getProposedNames({
        value: VALUE_MOCK,
        variation: CHAIN_ID_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(result).toStrictEqual({
        results: {
          [SOURCE_ID]: {
            updateDelay: 5,
          },
        },
      });
    });

    it('returns delay only if request has warning', async () => {
      const provider = new EtherscanNameProvider();

      handleFetchMock.mockResolvedValueOnce({
        message: 'NOTOK',
      });

      const result = await provider.getProposedNames({
        value: VALUE_MOCK,
        variation: CHAIN_ID_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(result).toStrictEqual({
        results: {
          [SOURCE_ID]: {
            updateDelay: 5,
          },
        },
      });
    });

    it('returns empty result if disabled', async () => {
      const provider = new EtherscanNameProvider({
        isEnabled: () => false,
      });

      const response = await provider.getProposedNames({
        value: VALUE_MOCK,
        variation: CHAIN_ID_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(response).toStrictEqual({
        results: { [SOURCE_ID]: { proposedNames: [] } },
      });
    });

    it('throws if request fails', async () => {
      const provider = new EtherscanNameProvider();

      handleFetchMock.mockImplementation(() => {
        throw new Error('TestError');
      });

      await expect(
        provider.getProposedNames({
          value: VALUE_MOCK,
          variation: CHAIN_ID_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
        }),
      ).rejects.toThrow('TestError');
    });
  });
});
