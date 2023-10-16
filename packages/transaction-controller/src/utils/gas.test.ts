/* eslint-disable jsdoc/require-jsdoc */

import { NetworkType, query } from '@metamask/controller-utils';

import type { TransactionMeta } from '../types';
import type { UpdateGasRequest } from './gas';
import { FIXED_GAS, updateGas } from './gas';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  query: jest.fn(),
}));

const GAS_MOCK = 100;
const BLOCK_GAS_LIMIT_MOCK = 1234567;
const BLOCK_NUMBER_MOCK = '0x5678';
const CODE_MOCK = '0x987';

const TRANSACTION_META_MOCK = {
  txParams: {
    data: '0x1',
    to: '0x2',
  },
} as any as TransactionMeta;

const UPDATE_GAS_REQUEST_MOCK = {
  txMeta: TRANSACTION_META_MOCK,
  providerConfig: {},
  ethQuery: {},
} as UpdateGasRequest;

function toHex(value: number) {
  return `0x${value.toString(16)}`;
}

describe('gas', () => {
  const queryMock = jest.mocked(query);
  let updateGasRequest: UpdateGasRequest;

  function mockQuery({
    getCodeResponse,
    getBlockByNumberResponse,
    estimateGasResponse,
    estimateGasError,
  }: {
    getCodeResponse?: any;
    getBlockByNumberResponse?: any;
    estimateGasResponse?: any;
    estimateGasError?: any;
  }) {
    if (getCodeResponse !== undefined) {
      queryMock.mockResolvedValueOnce(getCodeResponse);
    }

    if (getBlockByNumberResponse !== undefined) {
      queryMock.mockResolvedValueOnce(getBlockByNumberResponse);
    }

    if (estimateGasError) {
      queryMock.mockRejectedValueOnce(estimateGasError);
    } else {
      queryMock.mockResolvedValueOnce(estimateGasResponse);
    }
  }

  function expectEstimateGasNotCalled() {
    expect(queryMock).not.toHaveBeenCalledWith(
      expect.anything(),
      'estimateGas',
      expect.anything(),
    );
  }

  beforeEach(() => {
    jest.resetAllMocks();

    updateGasRequest = JSON.parse(JSON.stringify(UPDATE_GAS_REQUEST_MOCK));
  });

  describe('updateGas', () => {
    describe('sets gas', () => {
      afterEach(() => {
        // eslint-disable-next-line jest/no-standalone-expect
        expect(updateGasRequest.txMeta.defaultGasEstimates?.gas).toBe(
          updateGasRequest.txMeta.txParams.gas,
        );
      });

      it('to request value if set', async () => {
        updateGasRequest.txMeta.txParams.gas = toHex(GAS_MOCK);

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.txParams.gas).toBe(toHex(GAS_MOCK));
        expect(updateGasRequest.txMeta.originalGasEstimate).toBeUndefined();
        expectEstimateGasNotCalled();
      });

      it('to estimate if custom network', async () => {
        updateGasRequest.providerConfig.type = NetworkType.rpc;

        mockQuery({
          getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
          estimateGasResponse: toHex(GAS_MOCK),
        });

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.txParams.gas).toBe(toHex(GAS_MOCK));
        expect(updateGasRequest.txMeta.originalGasEstimate).toBe(
          updateGasRequest.txMeta.txParams.gas,
        );
      });

      it('to estimate if estimate greater than 90% of block gas limit', async () => {
        const estimatedGas = Math.ceil(BLOCK_GAS_LIMIT_MOCK * 0.9 + 10);

        mockQuery({
          getCodeResponse: CODE_MOCK,
          getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
          estimateGasResponse: toHex(estimatedGas),
        });

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.txParams.gas).toBe(toHex(estimatedGas));
        expect(updateGasRequest.txMeta.originalGasEstimate).toBe(
          updateGasRequest.txMeta.txParams.gas,
        );
      });

      it('to padded estimate if padded estimate less than 90% of block gas limit', async () => {
        const blockGasLimit90Percent = BLOCK_GAS_LIMIT_MOCK * 0.9;
        const estimatedGasPadded = Math.ceil(blockGasLimit90Percent - 10);
        const estimatedGas = Math.round(estimatedGasPadded / 1.5);

        mockQuery({
          getCodeResponse: CODE_MOCK,
          getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
          estimateGasResponse: toHex(estimatedGas),
        });

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.txParams.gas).toBe(
          toHex(estimatedGasPadded),
        );
        expect(updateGasRequest.txMeta.originalGasEstimate).toBe(
          updateGasRequest.txMeta.txParams.gas,
        );
      });

      it('to 90% of block gas limit if padded estimate only is greater than 90% of block gas limit', async () => {
        const blockGasLimit90Percent = Math.round(BLOCK_GAS_LIMIT_MOCK * 0.9);
        const estimatedGasPadded = blockGasLimit90Percent + 10;
        const estimatedGas = Math.ceil(estimatedGasPadded / 1.5);

        mockQuery({
          getCodeResponse: CODE_MOCK,
          getBlockByNumberResponse: { gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) },
          estimateGasResponse: toHex(estimatedGas),
        });

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.txParams.gas).toBe(
          toHex(blockGasLimit90Percent),
        );
        expect(updateGasRequest.txMeta.originalGasEstimate).toBe(
          updateGasRequest.txMeta.txParams.gas,
        );
      });

      describe('to fixed value', () => {
        it('if not custom network and no to parameter', async () => {
          updateGasRequest.providerConfig.type = NetworkType.mainnet;
          delete updateGasRequest.txMeta.txParams.to;

          await updateGas(updateGasRequest);

          expect(updateGasRequest.txMeta.txParams.gas).toBe(FIXED_GAS);
          expect(updateGasRequest.txMeta.originalGasEstimate).toBe(
            updateGasRequest.txMeta.txParams.gas,
          );
          expectEstimateGasNotCalled();
        });

        it('if not custom network and to parameter and no data and no code', async () => {
          updateGasRequest.providerConfig.type = NetworkType.mainnet;
          delete updateGasRequest.txMeta.txParams.data;

          mockQuery({
            getCodeResponse: undefined,
          });

          await updateGas(updateGasRequest);

          expect(updateGasRequest.txMeta.txParams.gas).toBe(FIXED_GAS);
          expect(updateGasRequest.txMeta.originalGasEstimate).toBe(
            updateGasRequest.txMeta.txParams.gas,
          );
          expectEstimateGasNotCalled();
        });

        it('if not custom network and to parameter and no data and empty code', async () => {
          updateGasRequest.providerConfig.type = NetworkType.mainnet;
          delete updateGasRequest.txMeta.txParams.data;

          mockQuery({
            getCodeResponse: '0x',
          });

          await updateGas(updateGasRequest);

          expect(updateGasRequest.txMeta.txParams.gas).toBe(FIXED_GAS);
          expect(updateGasRequest.txMeta.originalGasEstimate).toBe(
            updateGasRequest.txMeta.txParams.gas,
          );
          expectEstimateGasNotCalled();
        });
      });
    });

    describe('on estimate query error', () => {
      it('sets gas to 95% of block gas limit', async () => {
        const fallbackGas = Math.floor(BLOCK_GAS_LIMIT_MOCK * 0.95);

        mockQuery({
          getCodeResponse: CODE_MOCK,
          getBlockByNumberResponse: {
            gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
          },
          estimateGasError: { message: 'TestError', errorKey: 'TestKey' },
        });

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.txParams.gas).toBe(toHex(fallbackGas));
        expect(updateGasRequest.txMeta.originalGasEstimate).toBe(
          updateGasRequest.txMeta.txParams.gas,
        );
      });

      it('sets simulationFails property', async () => {
        mockQuery({
          getCodeResponse: CODE_MOCK,
          getBlockByNumberResponse: {
            gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
            number: BLOCK_NUMBER_MOCK,
          },
          estimateGasError: { message: 'TestError', errorKey: 'TestKey' },
        });

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.simulationFails).toStrictEqual({
          reason: 'TestError',
          errorKey: 'TestKey',
          debug: {
            blockGasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
            blockNumber: BLOCK_NUMBER_MOCK,
          },
        });
      });
    });
  });
});
