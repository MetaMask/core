/* eslint-disable jsdoc/require-jsdoc */
import { ORIGIN_METAMASK, query } from '@metamask/controller-utils';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';

import { UserFeeLevel } from '../types';
import type { UpdateGasFeesRequest } from './gas-fees';
import { updateGasFees } from './gas-fees';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  query: jest.fn(),
}));

// eslint-disable-next-line jest/prefer-spy-on
console.error = jest.fn();

const GAS_MOCK = 123;
const GAS_HEX_MOCK = toHex(GAS_MOCK);
const GAS_HEX_WEI_MOCK = toHex(GAS_MOCK * 1e9);
const ORIGIN_MOCK = 'test.com';

const UPDATE_GAS_FEES_REQUEST_MOCK = {
  eip1559: true,
  ethQuery: {},
  txMeta: {
    transaction: {},
  },
} as any as UpdateGasFeesRequest;

function toHex(value: number) {
  return `0x${value.toString(16)}`;
}

describe('gas-fees', () => {
  let updateGasFeeRequest: jest.Mocked<UpdateGasFeesRequest>;
  const queryMock = jest.mocked(query);

  function mockGetGasFeeEstimates(
    estimateType: typeof GAS_ESTIMATE_TYPES[keyof typeof GAS_ESTIMATE_TYPES],
    gasEstimates: any,
  ) {
    updateGasFeeRequest.getGasFeeEstimates.mockReset();
    updateGasFeeRequest.getGasFeeEstimates.mockResolvedValue({
      gasEstimateType: estimateType,
      gasFeeEstimates: gasEstimates,
    } as any);
  }

  beforeEach(() => {
    updateGasFeeRequest = JSON.parse(
      JSON.stringify(UPDATE_GAS_FEES_REQUEST_MOCK),
    );

    // eslint-disable-next-line jest/prefer-spy-on
    updateGasFeeRequest.getGasFeeEstimates = jest.fn().mockResolvedValue({});
  });

  afterEach(() => {
    // eslint-disable-next-line jest/no-standalone-expect
    expect(updateGasFeeRequest.txMeta.defaultGasEstimates).toStrictEqual({
      maxFeePerGas: updateGasFeeRequest.txMeta.transaction.maxFeePerGas,
      maxPriorityFeePerGas:
        updateGasFeeRequest.txMeta.transaction.maxPriorityFeePerGas,
      gasPrice: updateGasFeeRequest.txMeta.transaction.gasPrice,
      estimateType: updateGasFeeRequest.txMeta.userFeeLevel,
    });
  });

  describe('updateGasFees', () => {
    it('deletes gasPrice property if maxFeePerGas set', async () => {
      updateGasFeeRequest.txMeta.transaction.maxFeePerGas = GAS_HEX_MOCK;
      updateGasFeeRequest.txMeta.transaction.gasPrice = GAS_HEX_MOCK;

      await updateGasFees(updateGasFeeRequest);

      expect(updateGasFeeRequest.txMeta.transaction).not.toHaveProperty(
        'gasPrice',
      );
    });

    it('deletes gasPrice property if maxPriorityFeePerGas set', async () => {
      updateGasFeeRequest.txMeta.transaction.maxPriorityFeePerGas =
        GAS_HEX_MOCK;
      updateGasFeeRequest.txMeta.transaction.gasPrice = GAS_HEX_MOCK;

      await updateGasFees(updateGasFeeRequest);

      expect(updateGasFeeRequest.txMeta.transaction).not.toHaveProperty(
        'gasPrice',
      );
    });

    it('deletes maxFeePerGas property if gasPrice set', async () => {
      updateGasFeeRequest.eip1559 = false;
      updateGasFeeRequest.txMeta.transaction.maxFeePerGas = GAS_HEX_MOCK;
      updateGasFeeRequest.txMeta.transaction.gasPrice = GAS_HEX_MOCK;

      await updateGasFees(updateGasFeeRequest);

      expect(updateGasFeeRequest.txMeta.transaction).not.toHaveProperty(
        'maxFeePerGas',
      );
    });

    it('deletes maxPriorityFeePerGas property if gasPrice set', async () => {
      updateGasFeeRequest.eip1559 = false;
      updateGasFeeRequest.txMeta.transaction.maxPriorityFeePerGas =
        GAS_HEX_MOCK;
      updateGasFeeRequest.txMeta.transaction.gasPrice = GAS_HEX_MOCK;

      await updateGasFees(updateGasFeeRequest);

      expect(updateGasFeeRequest.txMeta.transaction).not.toHaveProperty(
        'maxPriorityFeePerGas',
      );
    });

    it('does not call getGasFeeEstimates if not eip1559 and request gasPrice', async () => {
      updateGasFeeRequest.eip1559 = false;
      updateGasFeeRequest.txMeta.transaction.gasPrice = GAS_HEX_MOCK;

      await updateGasFees(updateGasFeeRequest);

      expect(updateGasFeeRequest.getGasFeeEstimates).not.toHaveBeenCalled();
    });

    it('does not call getGasFeeEstimates if eip1559 and request maxFeePerGas and request maxPriorityFeePerGas', async () => {
      updateGasFeeRequest.txMeta.transaction.maxFeePerGas = GAS_HEX_MOCK;
      updateGasFeeRequest.txMeta.transaction.maxPriorityFeePerGas =
        GAS_HEX_MOCK;

      await updateGasFees(updateGasFeeRequest);

      expect(updateGasFeeRequest.getGasFeeEstimates).not.toHaveBeenCalled();
    });

    describe('sets maxFeePerGas', () => {
      it('to undefined if not eip1559', async () => {
        updateGasFeeRequest.eip1559 = false;

        await updateGasFees(updateGasFeeRequest);

        expect(
          updateGasFeeRequest.txMeta.transaction.maxFeePerGas,
        ).toBeUndefined();
      });

      it('to request maxFeePerGas if set', async () => {
        updateGasFeeRequest.txMeta.transaction.maxFeePerGas = GAS_HEX_MOCK;

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.transaction.maxFeePerGas).toBe(
          GAS_HEX_MOCK,
        );
      });

      it('to request gasPrice if set and no maxPriorityFeePerGas', async () => {
        updateGasFeeRequest.txMeta.transaction.gasPrice = GAS_HEX_MOCK;

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.transaction.maxFeePerGas).toBe(
          GAS_HEX_MOCK,
        );
      });

      it('to suggested maxFeePerGas if no request values', async () => {
        mockGetGasFeeEstimates(GAS_ESTIMATE_TYPES.FEE_MARKET, {
          medium: {
            suggestedMaxFeePerGas: `${GAS_MOCK}`,
            suggestedMaxPriorityFeePerGas: `456`,
          },
        });

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.transaction.maxFeePerGas).toBe(
          GAS_HEX_WEI_MOCK,
        );
      });

      it('to suggested maxFeePerGas if request gas price and request maxPriorityFeePerGas', async () => {
        updateGasFeeRequest.txMeta.transaction.gasPrice = '0x456';
        updateGasFeeRequest.txMeta.transaction.maxPriorityFeePerGas = '0x789';

        mockGetGasFeeEstimates(GAS_ESTIMATE_TYPES.FEE_MARKET, {
          medium: {
            suggestedMaxFeePerGas: `${GAS_MOCK}`,
            suggestedMaxPriorityFeePerGas: `456`,
          },
        });

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.transaction.maxFeePerGas).toBe(
          GAS_HEX_WEI_MOCK,
        );
      });

      it('to suggested gasPrice if no request values and estimate type is legacy', async () => {
        mockGetGasFeeEstimates(GAS_ESTIMATE_TYPES.LEGACY, {
          medium: `${GAS_MOCK}`,
        });

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.transaction.maxFeePerGas).toBe(
          GAS_HEX_WEI_MOCK,
        );
      });

      it('to suggested gasPrice if no request values and estimate type is eth_gasPrice', async () => {
        mockGetGasFeeEstimates(GAS_ESTIMATE_TYPES.ETH_GASPRICE, {
          gasPrice: `${GAS_MOCK}`,
        });

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.transaction.maxFeePerGas).toBe(
          GAS_HEX_WEI_MOCK,
        );
      });

      it('to suggested gasPrice using RPC method if no request values and no suggested values', async () => {
        mockGetGasFeeEstimates(GAS_ESTIMATE_TYPES.FEE_MARKET, {});

        queryMock.mockResolvedValueOnce(GAS_MOCK);

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.transaction.maxFeePerGas).toBe(
          GAS_HEX_MOCK,
        );
      });

      it('to suggested gasPrice using RPC method if no request values and getGasFeeEstimates throws', async () => {
        updateGasFeeRequest.getGasFeeEstimates.mockReset();
        updateGasFeeRequest.getGasFeeEstimates.mockRejectedValueOnce(
          new Error('TestError'),
        );

        queryMock.mockResolvedValueOnce(GAS_MOCK);

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.transaction.maxFeePerGas).toBe(
          GAS_HEX_MOCK,
        );
      });
    });

    describe('sets maxPriorityFeePerGas', () => {
      it('to undefined if not eip1559', async () => {
        updateGasFeeRequest.eip1559 = false;

        await updateGasFees(updateGasFeeRequest);

        expect(
          updateGasFeeRequest.txMeta.transaction.maxPriorityFeePerGas,
        ).toBeUndefined();
      });

      it('to request maxPriorityFeePerGas if set', async () => {
        updateGasFeeRequest.txMeta.transaction.maxPriorityFeePerGas =
          GAS_HEX_MOCK;

        await updateGasFees(updateGasFeeRequest);

        expect(
          updateGasFeeRequest.txMeta.transaction.maxPriorityFeePerGas,
        ).toBe(GAS_HEX_MOCK);
      });

      it('to request gasPrice if set and no maxFeePerGas', async () => {
        updateGasFeeRequest.txMeta.transaction.gasPrice = GAS_HEX_MOCK;

        await updateGasFees(updateGasFeeRequest);

        expect(
          updateGasFeeRequest.txMeta.transaction.maxPriorityFeePerGas,
        ).toBe(GAS_HEX_MOCK);
      });

      it('to suggested maxPriorityFeePerGas if no request values', async () => {
        mockGetGasFeeEstimates(GAS_ESTIMATE_TYPES.FEE_MARKET, {
          medium: {
            suggestedMaxFeePerGas: `456`,
            suggestedMaxPriorityFeePerGas: `${GAS_MOCK}`,
          },
        });

        await updateGasFees(updateGasFeeRequest);

        expect(
          updateGasFeeRequest.txMeta.transaction.maxPriorityFeePerGas,
        ).toBe(GAS_HEX_WEI_MOCK);
      });

      it('to suggested maxPriorityFeePerGas if request gas price and request maxFeePerGas', async () => {
        updateGasFeeRequest.txMeta.transaction.gasPrice = '0x456';
        updateGasFeeRequest.txMeta.transaction.maxFeePerGas = '0x789';

        mockGetGasFeeEstimates(GAS_ESTIMATE_TYPES.FEE_MARKET, {
          medium: {
            suggestedMaxFeePerGas: `456`,
            suggestedMaxPriorityFeePerGas: `${GAS_MOCK}`,
          },
        });

        await updateGasFees(updateGasFeeRequest);

        expect(
          updateGasFeeRequest.txMeta.transaction.maxPriorityFeePerGas,
        ).toBe(GAS_HEX_WEI_MOCK);
      });

      it('to maxFeePerGas if set in request', async () => {
        updateGasFeeRequest.txMeta.transaction.maxFeePerGas = GAS_HEX_MOCK;

        await updateGasFees(updateGasFeeRequest);

        expect(
          updateGasFeeRequest.txMeta.transaction.maxPriorityFeePerGas,
        ).toBe(GAS_HEX_MOCK);
      });

      it('to suggested gasPrice if no request values and estimate type is legacy', async () => {
        mockGetGasFeeEstimates(GAS_ESTIMATE_TYPES.LEGACY, {
          medium: `${GAS_MOCK}`,
        });

        await updateGasFees(updateGasFeeRequest);

        expect(
          updateGasFeeRequest.txMeta.transaction.maxPriorityFeePerGas,
        ).toBe(GAS_HEX_WEI_MOCK);
      });

      it('to suggested gasPrice if no request values and estimate type is eth_gasPrice', async () => {
        mockGetGasFeeEstimates(GAS_ESTIMATE_TYPES.ETH_GASPRICE, {
          gasPrice: `${GAS_MOCK}`,
        });

        await updateGasFees(updateGasFeeRequest);

        expect(
          updateGasFeeRequest.txMeta.transaction.maxPriorityFeePerGas,
        ).toBe(GAS_HEX_WEI_MOCK);
      });

      it('to suggested gasPrice using RPC method if no request values and no suggested values', async () => {
        mockGetGasFeeEstimates(GAS_ESTIMATE_TYPES.FEE_MARKET, {});

        queryMock.mockResolvedValueOnce(GAS_MOCK);

        await updateGasFees(updateGasFeeRequest);

        expect(
          updateGasFeeRequest.txMeta.transaction.maxPriorityFeePerGas,
        ).toBe(GAS_HEX_MOCK);
      });

      it('to suggested gasPrice if no request values and getGasFeeEstimates throws', async () => {
        updateGasFeeRequest.getGasFeeEstimates.mockReset();
        updateGasFeeRequest.getGasFeeEstimates.mockRejectedValueOnce(
          new Error('TestError'),
        );

        queryMock.mockResolvedValueOnce(GAS_MOCK);

        await updateGasFees(updateGasFeeRequest);

        expect(
          updateGasFeeRequest.txMeta.transaction.maxPriorityFeePerGas,
        ).toBe(GAS_HEX_MOCK);
      });
    });

    describe('sets gasPrice', () => {
      describe('if eip1559', () => {
        it('to undefined', async () => {
          await updateGasFees(updateGasFeeRequest);

          expect(
            updateGasFeeRequest.txMeta.transaction.gasPrice,
          ).toBeUndefined();
        });
      });

      describe('if not eip1559', () => {
        it('to request gasPrice if set', async () => {
          updateGasFeeRequest.eip1559 = false;
          updateGasFeeRequest.txMeta.transaction.gasPrice = GAS_HEX_MOCK;

          await updateGasFees(updateGasFeeRequest);

          expect(updateGasFeeRequest.txMeta.transaction.gasPrice).toBe(
            GAS_HEX_MOCK,
          );
        });

        it('to suggested gasPrice if no request gasPrice and estimate type is legacy', async () => {
          updateGasFeeRequest.eip1559 = false;

          mockGetGasFeeEstimates(GAS_ESTIMATE_TYPES.LEGACY, {
            medium: `${GAS_MOCK}`,
          });

          await updateGasFees(updateGasFeeRequest);

          expect(updateGasFeeRequest.txMeta.transaction.gasPrice).toBe(
            GAS_HEX_WEI_MOCK,
          );
        });

        it('to suggested gasPrice if no request gasPrice and estimate type is eth_gasPrice', async () => {
          updateGasFeeRequest.eip1559 = false;

          mockGetGasFeeEstimates(GAS_ESTIMATE_TYPES.ETH_GASPRICE, {
            gasPrice: `${GAS_MOCK}`,
          });

          await updateGasFees(updateGasFeeRequest);

          expect(updateGasFeeRequest.txMeta.transaction.gasPrice).toBe(
            GAS_HEX_WEI_MOCK,
          );
        });

        it('to suggested gasPrice using RPC method if no request gasPrice and no suggested values', async () => {
          updateGasFeeRequest.eip1559 = false;

          queryMock.mockResolvedValueOnce(GAS_MOCK);

          await updateGasFees(updateGasFeeRequest);

          expect(updateGasFeeRequest.txMeta.transaction.gasPrice).toBe(
            GAS_HEX_MOCK,
          );
        });

        it('to suggested gasPrice if no request gasPrice and getGasFeeEstimates throws', async () => {
          updateGasFeeRequest.eip1559 = false;

          updateGasFeeRequest.getGasFeeEstimates.mockReset();
          updateGasFeeRequest.getGasFeeEstimates.mockRejectedValueOnce(
            new Error('TestError'),
          );

          queryMock.mockResolvedValueOnce(GAS_MOCK);

          await updateGasFees(updateGasFeeRequest);

          expect(updateGasFeeRequest.txMeta.transaction.gasPrice).toBe(
            GAS_HEX_MOCK,
          );
        });
      });
    });

    describe('sets userFeeLevel', () => {
      it('to undefined if not eip1559', async () => {
        updateGasFeeRequest.eip1559 = false;

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.userFeeLevel).toBeUndefined();
      });

      it('to custom if request gas price but no request maxFeePerGas or maxPriorityFeePerGas and origin is metamask', async () => {
        updateGasFeeRequest.txMeta.transaction.gasPrice = GAS_HEX_MOCK;
        updateGasFeeRequest.txMeta.origin = ORIGIN_METAMASK;

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.userFeeLevel).toBe(
          UserFeeLevel.CUSTOM,
        );
      });

      it('to medium if request gas price but no request maxFeePerGas or maxPriorityFeePerGas and origin not metamask', async () => {
        updateGasFeeRequest.txMeta.transaction.gasPrice = GAS_HEX_MOCK;
        updateGasFeeRequest.txMeta.origin = ORIGIN_MOCK;

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.userFeeLevel).toBe(
          UserFeeLevel.DAPP_SUGGESTED,
        );
      });

      it('to medium if suggested maxFeePerGas and maxPriorityFeePerGas but no request maxFeePerGas or maxPriorityFeePerGas', async () => {
        mockGetGasFeeEstimates(GAS_ESTIMATE_TYPES.FEE_MARKET, {
          medium: {
            suggestedMaxFeePerGas: `${GAS_MOCK}`,
            suggestedMaxPriorityFeePerGas: `${GAS_MOCK}`,
          },
        });

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.userFeeLevel).toBe(
          UserFeeLevel.MEDIUM,
        );
      });

      it('to medium if origin is metamask', async () => {
        updateGasFeeRequest.txMeta.origin = ORIGIN_METAMASK;

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.userFeeLevel).toBe(
          UserFeeLevel.MEDIUM,
        );
      });

      it('to dappSuggested if origin is not metamask', async () => {
        updateGasFeeRequest.txMeta.origin = ORIGIN_MOCK;

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.userFeeLevel).toBe(
          UserFeeLevel.DAPP_SUGGESTED,
        );
      });
    });
  });
});
