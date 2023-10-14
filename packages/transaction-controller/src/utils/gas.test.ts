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

  beforeEach(() => {
    jest.resetAllMocks();

    queryMock.mockResolvedValue({});

    updateGasRequest = JSON.parse(JSON.stringify(UPDATE_GAS_REQUEST_MOCK));
  });

  describe('updateGas', () => {
    it('does not change gas if set in params', async () => {
      updateGasRequest.txMeta.txParams.gas = toHex(GAS_MOCK);

      await updateGas(updateGasRequest);

      expect(updateGasRequest.txMeta.txParams.gas).toBe(toHex(GAS_MOCK));
    });

    it('sets gas to estimate if custom network', async () => {
      updateGasRequest.providerConfig.type = NetworkType.rpc;

      queryMock
        .mockResolvedValueOnce({ gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) })
        .mockResolvedValueOnce(toHex(GAS_MOCK));

      await updateGas(updateGasRequest);

      expect(updateGasRequest.txMeta.txParams.gas).toBe(toHex(GAS_MOCK));
    });

    it('sets gas to estimate if estimate greater than 90% of block gas limit', async () => {
      const estimatedGas = Math.ceil(BLOCK_GAS_LIMIT_MOCK * 0.9 + 10);

      queryMock
        .mockResolvedValueOnce({ gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) })
        .mockResolvedValueOnce(toHex(estimatedGas));

      await updateGas(updateGasRequest);

      expect(updateGasRequest.txMeta.txParams.gas).toBe(toHex(estimatedGas));
    });

    it('sets gas to padded estimate if padded estimate less than 90% of block gas limit', async () => {
      const blockGasLimit90Percent = BLOCK_GAS_LIMIT_MOCK * 0.9;
      const estimatedGasPadded = Math.ceil(blockGasLimit90Percent - 10);
      const estimatedGas = Math.round(estimatedGasPadded / 1.5);

      queryMock
        .mockResolvedValueOnce({ gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) })
        .mockResolvedValueOnce(toHex(estimatedGas));

      await updateGas(updateGasRequest);

      expect(updateGasRequest.txMeta.txParams.gas).toBe(
        toHex(estimatedGasPadded),
      );
    });

    it('sets gas to 90% of block gas limit if padded estimate only is greater than 90% of block gas limit', async () => {
      const blockGasLimit90Percent = Math.round(BLOCK_GAS_LIMIT_MOCK * 0.9);
      const estimatedGasPadded = blockGasLimit90Percent + 10;
      const estimatedGas = Math.ceil(estimatedGasPadded / 1.5);

      queryMock
        .mockResolvedValueOnce({ gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) })
        .mockResolvedValueOnce(toHex(estimatedGas));

      await updateGas(updateGasRequest);

      expect(updateGasRequest.txMeta.txParams.gas).toBe(
        toHex(blockGasLimit90Percent),
      );
    });

    describe('sets gas to fixed value', () => {
      it('if not custom network and no to parameter', async () => {
        delete updateGasRequest.txMeta.txParams.to;

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.txParams.gas).toBe(FIXED_GAS);
      });

      it('if not custom network and to parameter and no data and no code', async () => {
        delete updateGasRequest.txMeta.txParams.data;

        queryMock
          .mockResolvedValueOnce({ gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) })
          .mockResolvedValueOnce(toHex(GAS_MOCK))
          .mockResolvedValueOnce(undefined);

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.txParams.gas).toBe(FIXED_GAS);
      });

      it('if not custom network and to parameter and no data and empty code', async () => {
        delete updateGasRequest.txMeta.txParams.data;

        queryMock
          .mockResolvedValueOnce({ gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK) })
          .mockResolvedValueOnce(toHex(GAS_MOCK))
          .mockResolvedValueOnce('0x');

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.txParams.gas).toBe(FIXED_GAS);
      });
    });

    describe('on estimate query error', () => {
      it('sets gas to 95% of block gas limit', async () => {
        const fallbackGas = Math.floor(BLOCK_GAS_LIMIT_MOCK * 0.95);

        queryMock
          .mockResolvedValueOnce({
            gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
          })
          .mockImplementationOnce(() => {
            throw { message: 'TestError', errorKey: 'TestKey' } as any;
          });

        await updateGas(updateGasRequest);

        expect(updateGasRequest.txMeta.txParams.gas).toBe(toHex(fallbackGas));
      });

      it('sets simulationFails property', async () => {
        queryMock
          .mockResolvedValueOnce({
            gasLimit: toHex(BLOCK_GAS_LIMIT_MOCK),
            number: BLOCK_NUMBER_MOCK,
          })
          .mockImplementationOnce(() => {
            throw { message: 'TestError', errorKey: 'TestKey' } as any;
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
