import { ORIGIN_METAMASK, query } from '@metamask/controller-utils';
import type { GasFeeState } from '@metamask/gas-fee-controller';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';
import {
  UserFeeLevel,
  type TransactionParams,
} from '@metamask/transaction-controller';
import { cloneDeep } from 'lodash';

import type { UpdateGasFeesRequest } from './gas-fees';
import { updateGasFees } from './gas-fees';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  query: jest.fn(),
}));

const GAS_FEE_VALUE_HEX = '0x1ca35f0e00';
const GAS_FEE_GWEI_DECIMAL = '123';
const GAS_FEE_WEI_DECIMAL = 123000000000;
const ORIGIN_MOCK = 'test.com';

const UPDATE_GAS_FEES_REQUEST_MOCK = {
  getGasFeeEstimates: () => undefined,
  metadata: {
    userOperation: {},
  },
  originalRequest: {},
  provider: {},
} as unknown as jest.Mocked<UpdateGasFeesRequest>;

describe('gas-fees', () => {
  const queryMock = jest.mocked(query);
  let request: jest.Mocked<UpdateGasFeesRequest>;

  beforeEach(() => {
    request = cloneDeep(UPDATE_GAS_FEES_REQUEST_MOCK);

    jest
      .spyOn(request, 'getGasFeeEstimates')
      .mockResolvedValue({} as GasFeeState);

    queryMock.mockResolvedValue({});
  });

  describe('updateGasFees', () => {
    describe('sets maxFeePerGas to', () => {
      it('request value if set', async () => {
        request.originalRequest.maxFeePerGas = GAS_FEE_VALUE_HEX;
        await updateGasFees(request);
        expect(request.metadata.userOperation.maxFeePerGas).toBe(
          GAS_FEE_VALUE_HEX,
        );
      });

      it('transaction gasPrice if no maxPriorityFeePerGas', async () => {
        request.transaction = {
          gasPrice: GAS_FEE_VALUE_HEX,
        } as TransactionParams;

        await updateGasFees(request);

        expect(request.metadata.userOperation.maxFeePerGas).toBe(
          GAS_FEE_VALUE_HEX,
        );
      });

      it('gas fee estimate with fee market type', async () => {
        request.getGasFeeEstimates.mockResolvedValue({
          gasEstimateType: GAS_ESTIMATE_TYPES.FEE_MARKET,
          gasFeeEstimates: {
            medium: {
              suggestedMaxFeePerGas: GAS_FEE_GWEI_DECIMAL,
              suggestedMaxPriorityFeePerGas: GAS_FEE_GWEI_DECIMAL,
            },
          },
        } as GasFeeState);

        await updateGasFees(request);
        expect(request.metadata.userOperation.maxFeePerGas).toBe(
          GAS_FEE_VALUE_HEX,
        );
      });

      it('gas fee estimate with legacy type', async () => {
        request.getGasFeeEstimates.mockResolvedValue({
          gasEstimateType: GAS_ESTIMATE_TYPES.LEGACY,
          gasFeeEstimates: {
            medium: GAS_FEE_GWEI_DECIMAL,
          },
        } as GasFeeState);

        await updateGasFees(request);
        expect(request.metadata.userOperation.maxFeePerGas).toBe(
          GAS_FEE_VALUE_HEX,
        );
      });

      it('gas fee estimate with gas price type', async () => {
        request.getGasFeeEstimates.mockResolvedValue({
          gasEstimateType: GAS_ESTIMATE_TYPES.ETH_GASPRICE,
          gasFeeEstimates: {
            gasPrice: GAS_FEE_GWEI_DECIMAL,
          },
        } as GasFeeState);

        await updateGasFees(request);
        expect(request.metadata.userOperation.maxFeePerGas).toBe(
          GAS_FEE_VALUE_HEX,
        );
      });

      it('gas price estimate from network', async () => {
        queryMock.mockResolvedValue(GAS_FEE_WEI_DECIMAL);

        await updateGasFees(request);
        expect(request.metadata.userOperation.maxFeePerGas).toBe(
          GAS_FEE_VALUE_HEX,
        );
      });

      it('throws if no estimate', async () => {
        request.getGasFeeEstimates.mockResolvedValue(
          undefined as unknown as GasFeeState,
        );

        queryMock.mockResolvedValue(undefined);

        await expect(updateGasFees(request)).rejects.toThrow(
          'Failed to get gas fee estimate for maxFeePerGas',
        );
      });
    });

    describe('sets maxPriorityFeePerGas to', () => {
      it('request value if set', async () => {
        request.originalRequest.maxPriorityFeePerGas = GAS_FEE_VALUE_HEX;
        await updateGasFees(request);
        expect(request.metadata.userOperation.maxPriorityFeePerGas).toBe(
          GAS_FEE_VALUE_HEX,
        );
      });

      it('transaction gasPrice if no maxFeePerGas', async () => {
        request.transaction = {
          gasPrice: GAS_FEE_VALUE_HEX,
        } as TransactionParams;

        await updateGasFees(request);

        expect(request.metadata.userOperation.maxPriorityFeePerGas).toBe(
          GAS_FEE_VALUE_HEX,
        );
      });

      it('gas fee estimate with fee market type', async () => {
        request.getGasFeeEstimates.mockResolvedValue({
          gasEstimateType: GAS_ESTIMATE_TYPES.FEE_MARKET,
          gasFeeEstimates: {
            medium: {
              suggestedMaxFeePerGas: GAS_FEE_GWEI_DECIMAL,
              suggestedMaxPriorityFeePerGas: GAS_FEE_GWEI_DECIMAL,
            },
          },
        } as GasFeeState);

        await updateGasFees(request);
        expect(request.metadata.userOperation.maxPriorityFeePerGas).toBe(
          GAS_FEE_VALUE_HEX,
        );
      });

      it('gas fee estimate with legacy type', async () => {
        request.getGasFeeEstimates.mockResolvedValue({
          gasEstimateType: GAS_ESTIMATE_TYPES.LEGACY,
          gasFeeEstimates: {
            medium: GAS_FEE_GWEI_DECIMAL,
          },
        } as GasFeeState);

        await updateGasFees(request);
        expect(request.metadata.userOperation.maxPriorityFeePerGas).toBe(
          GAS_FEE_VALUE_HEX,
        );
      });

      it('gas fee estimate with gas price type', async () => {
        request.getGasFeeEstimates.mockResolvedValue({
          gasEstimateType: GAS_ESTIMATE_TYPES.ETH_GASPRICE,
          gasFeeEstimates: {
            gasPrice: GAS_FEE_GWEI_DECIMAL,
          },
        } as GasFeeState);

        await updateGasFees(request);
        expect(request.metadata.userOperation.maxPriorityFeePerGas).toBe(
          GAS_FEE_VALUE_HEX,
        );
      });

      it('gas price estimate from network', async () => {
        queryMock.mockResolvedValue(GAS_FEE_WEI_DECIMAL);

        await updateGasFees(request);
        expect(request.metadata.userOperation.maxPriorityFeePerGas).toBe(
          GAS_FEE_VALUE_HEX,
        );
      });
    });

    describe('sets userFeeLevel to', () => {
      it('custom if transaction gas price but no request values and internal origin', async () => {
        request.transaction = {
          gasPrice: GAS_FEE_VALUE_HEX,
        } as TransactionParams;

        request.metadata.origin = ORIGIN_METAMASK;

        await updateGasFees(request);

        expect(request.metadata.userFeeLevel).toBe(UserFeeLevel.CUSTOM);
      });

      it('dapp suggested if transaction gas price and no request values and external origin', async () => {
        request.transaction = {
          gasPrice: GAS_FEE_VALUE_HEX,
        } as TransactionParams;

        request.metadata.origin = ORIGIN_MOCK;

        await updateGasFees(request);

        expect(request.metadata.userFeeLevel).toBe(UserFeeLevel.DAPP_SUGGESTED);
      });

      it('medium if suggested values and no request values', async () => {
        request.getGasFeeEstimates.mockResolvedValue({
          gasEstimateType: GAS_ESTIMATE_TYPES.FEE_MARKET,
          gasFeeEstimates: {
            medium: {
              suggestedMaxFeePerGas: GAS_FEE_GWEI_DECIMAL,
              suggestedMaxPriorityFeePerGas: GAS_FEE_GWEI_DECIMAL,
            },
          },
        } as unknown as GasFeeState);

        await updateGasFees(request);

        expect(request.metadata.userFeeLevel).toBe(UserFeeLevel.MEDIUM);
      });

      it('custom if request values and internal origin', async () => {
        request.originalRequest.maxFeePerGas = GAS_FEE_VALUE_HEX;
        request.originalRequest.maxPriorityFeePerGas = GAS_FEE_VALUE_HEX;
        request.metadata.origin = ORIGIN_METAMASK;

        await updateGasFees(request);

        expect(request.metadata.userFeeLevel).toBe(UserFeeLevel.CUSTOM);
      });

      it('dapp suggested if request values and external origin', async () => {
        request.originalRequest.maxFeePerGas = GAS_FEE_VALUE_HEX;
        request.originalRequest.maxPriorityFeePerGas = GAS_FEE_VALUE_HEX;
        request.metadata.origin = ORIGIN_MOCK;

        await updateGasFees(request);

        expect(request.metadata.userFeeLevel).toBe(UserFeeLevel.DAPP_SUGGESTED);
      });
    });
  });
});
