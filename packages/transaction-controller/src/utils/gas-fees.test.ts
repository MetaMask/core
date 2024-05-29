/* eslint-disable jsdoc/require-jsdoc */
import { ORIGIN_METAMASK, query } from '@metamask/controller-utils';

import type { GasFeeFlow, GasFeeFlowResponse } from '../types';
import { GasFeeEstimateType, TransactionType, UserFeeLevel } from '../types';
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
    txParams: {},
  },
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any as UpdateGasFeesRequest;

const FLOW_RESPONSE_FEE_MARKET_MOCK = {
  estimates: {
    type: GasFeeEstimateType.FeeMarket,
    medium: {
      maxFeePerGas: GAS_HEX_WEI_MOCK,
      maxPriorityFeePerGas: GAS_HEX_WEI_MOCK,
    },
  },
} as GasFeeFlowResponse;

const FLOW_RESPONSE_LEGACY_MOCK = {
  estimates: {
    type: GasFeeEstimateType.Legacy,
    medium: GAS_HEX_WEI_MOCK,
  },
} as GasFeeFlowResponse;

const FLOW_RESPONSE_GAS_PRICE_MOCK = {
  estimates: {
    type: GasFeeEstimateType.GasPrice,
    gasPrice: GAS_HEX_WEI_MOCK,
  },
} as GasFeeFlowResponse;

function toHex(value: number) {
  return `0x${value.toString(16)}`;
}

/**
 * Creates a mock GasFeeFlow.
 * @returns The mock GasFeeFlow.
 */
function createGasFeeFlowMock(): jest.Mocked<GasFeeFlow> {
  return {
    matchesTransaction: jest.fn(),
    getGasFees: jest.fn(),
  };
}

describe('gas-fees', () => {
  let updateGasFeeRequest: jest.Mocked<UpdateGasFeesRequest>;
  const queryMock = jest.mocked(query);
  let gasFeeFlowMock: jest.Mocked<GasFeeFlow>;

  function mockGasFeeFlowMockResponse(response: GasFeeFlowResponse) {
    gasFeeFlowMock.getGasFees.mockResolvedValue(response);
  }

  beforeEach(() => {
    gasFeeFlowMock = createGasFeeFlowMock();
    gasFeeFlowMock.matchesTransaction.mockReturnValue(true);

    updateGasFeeRequest = JSON.parse(
      JSON.stringify(UPDATE_GAS_FEES_REQUEST_MOCK),
    );

    updateGasFeeRequest.gasFeeFlows = [gasFeeFlowMock];
    // eslint-disable-next-line jest/prefer-spy-on
    updateGasFeeRequest.getSavedGasFees = jest.fn();
    // eslint-disable-next-line jest/prefer-spy-on
    updateGasFeeRequest.getGasFeeEstimates = jest.fn().mockResolvedValue({});
  });

  afterEach(() => {
    // eslint-disable-next-line jest/no-standalone-expect
    expect(updateGasFeeRequest.txMeta.defaultGasEstimates).toStrictEqual({
      maxFeePerGas: updateGasFeeRequest.txMeta.txParams.maxFeePerGas,
      maxPriorityFeePerGas:
        updateGasFeeRequest.txMeta.txParams.maxPriorityFeePerGas,
      gasPrice: updateGasFeeRequest.txMeta.txParams.gasPrice,
      estimateType: updateGasFeeRequest.txMeta.userFeeLevel,
    });
  });

  describe('updateGasFees', () => {
    it('deletes gasPrice property if maxFeePerGas set', async () => {
      updateGasFeeRequest.txMeta.txParams.maxFeePerGas = GAS_HEX_MOCK;
      updateGasFeeRequest.txMeta.txParams.gasPrice = GAS_HEX_MOCK;

      await updateGasFees(updateGasFeeRequest);

      expect(updateGasFeeRequest.txMeta.txParams).not.toHaveProperty(
        'gasPrice',
      );
    });

    it('deletes gasPrice property if maxPriorityFeePerGas set', async () => {
      updateGasFeeRequest.txMeta.txParams.maxPriorityFeePerGas = GAS_HEX_MOCK;
      updateGasFeeRequest.txMeta.txParams.gasPrice = GAS_HEX_MOCK;

      await updateGasFees(updateGasFeeRequest);

      expect(updateGasFeeRequest.txMeta.txParams).not.toHaveProperty(
        'gasPrice',
      );
    });

    it('deletes maxFeePerGas property if gasPrice set', async () => {
      updateGasFeeRequest.eip1559 = false;
      updateGasFeeRequest.txMeta.txParams.maxFeePerGas = GAS_HEX_MOCK;
      updateGasFeeRequest.txMeta.txParams.gasPrice = GAS_HEX_MOCK;

      await updateGasFees(updateGasFeeRequest);

      expect(updateGasFeeRequest.txMeta.txParams).not.toHaveProperty(
        'maxFeePerGas',
      );
    });

    it('deletes maxPriorityFeePerGas property if gasPrice set', async () => {
      updateGasFeeRequest.eip1559 = false;
      updateGasFeeRequest.txMeta.txParams.maxPriorityFeePerGas = GAS_HEX_MOCK;
      updateGasFeeRequest.txMeta.txParams.gasPrice = GAS_HEX_MOCK;

      await updateGasFees(updateGasFeeRequest);

      expect(updateGasFeeRequest.txMeta.txParams).not.toHaveProperty(
        'maxPriorityFeePerGas',
      );
    });

    it('does not call getGasFeeEstimates if not eip1559 and request gasPrice', async () => {
      updateGasFeeRequest.eip1559 = false;
      updateGasFeeRequest.txMeta.txParams.gasPrice = GAS_HEX_MOCK;

      await updateGasFees(updateGasFeeRequest);

      expect(updateGasFeeRequest.getGasFeeEstimates).not.toHaveBeenCalled();
    });

    it('does not call getGasFeeEstimates if eip1559 and request maxFeePerGas and request maxPriorityFeePerGas', async () => {
      updateGasFeeRequest.txMeta.txParams.maxFeePerGas = GAS_HEX_MOCK;
      updateGasFeeRequest.txMeta.txParams.maxPriorityFeePerGas = GAS_HEX_MOCK;

      await updateGasFees(updateGasFeeRequest);

      expect(updateGasFeeRequest.getGasFeeEstimates).not.toHaveBeenCalled();
    });

    describe('sets maxFeePerGas', () => {
      it('to undefined if not eip1559', async () => {
        updateGasFeeRequest.eip1559 = false;

        await updateGasFees(updateGasFeeRequest);

        expect(
          updateGasFeeRequest.txMeta.txParams.maxFeePerGas,
        ).toBeUndefined();
      });

      it('to saved maxFeePerGas if saved gas fees defined', async () => {
        updateGasFeeRequest.txMeta.type = TransactionType.simpleSend;
        updateGasFeeRequest.getSavedGasFees.mockReturnValueOnce({
          maxBaseFee: '123',
          priorityFee: '456',
        });

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.txParams.maxFeePerGas).toBe(
          '0x1ca35f0e00', // 123 gwei
        );
      });

      it('to request maxFeePerGas if set', async () => {
        updateGasFeeRequest.txMeta.txParams.maxFeePerGas = GAS_HEX_MOCK;

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.txParams.maxFeePerGas).toBe(
          GAS_HEX_MOCK,
        );
      });

      it('to request gasPrice if set and no maxPriorityFeePerGas', async () => {
        updateGasFeeRequest.txMeta.txParams.gasPrice = GAS_HEX_MOCK;

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.txParams.maxFeePerGas).toBe(
          GAS_HEX_MOCK,
        );
      });

      it('to suggested medium maxFeePerGas if no request values and flow returns fee market estimate', async () => {
        mockGasFeeFlowMockResponse(FLOW_RESPONSE_FEE_MARKET_MOCK);

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.txParams.maxFeePerGas).toBe(
          GAS_HEX_WEI_MOCK,
        );
      });

      it('to suggested medium if no request values and flow returns legacy estimate', async () => {
        mockGasFeeFlowMockResponse(FLOW_RESPONSE_LEGACY_MOCK);

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.txParams.maxFeePerGas).toBe(
          GAS_HEX_WEI_MOCK,
        );
      });

      it('to suggested gas price if no request values and flow returns gas price estimate', async () => {
        mockGasFeeFlowMockResponse(FLOW_RESPONSE_GAS_PRICE_MOCK);

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.txParams.maxFeePerGas).toBe(
          GAS_HEX_WEI_MOCK,
        );
      });

      it('to suggested medium maxFeePerGas if request gas price and request maxPriorityFeePerGas', async () => {
        updateGasFeeRequest.txMeta.txParams.gasPrice = '0x456';
        updateGasFeeRequest.txMeta.txParams.maxPriorityFeePerGas = '0x789';

        mockGasFeeFlowMockResponse(FLOW_RESPONSE_FEE_MARKET_MOCK);

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.txParams.maxFeePerGas).toBe(
          GAS_HEX_WEI_MOCK,
        );
      });

      it('to suggested gasPrice using RPC method if no request values and getGasFeeEstimates throws', async () => {
        updateGasFeeRequest.getGasFeeEstimates.mockReset();
        updateGasFeeRequest.getGasFeeEstimates.mockRejectedValueOnce(
          new Error('TestError'),
        );

        queryMock.mockResolvedValueOnce(GAS_MOCK);

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.txParams.maxFeePerGas).toBe(
          GAS_HEX_MOCK,
        );
      });
    });

    describe('sets maxPriorityFeePerGas', () => {
      it('to undefined if not eip1559', async () => {
        updateGasFeeRequest.eip1559 = false;

        await updateGasFees(updateGasFeeRequest);

        expect(
          updateGasFeeRequest.txMeta.txParams.maxPriorityFeePerGas,
        ).toBeUndefined();
      });

      it('to saved maxPriorityFeePerGas if saved gas fees defined', async () => {
        updateGasFeeRequest.txMeta.type = TransactionType.simpleSend;
        updateGasFeeRequest.getSavedGasFees.mockReturnValueOnce({
          maxBaseFee: '123',
          priorityFee: '456',
        });

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.txParams.maxPriorityFeePerGas).toBe(
          '0x6a2bb7d000', // 456 gwei
        );
      });

      it('to request maxPriorityFeePerGas if set', async () => {
        updateGasFeeRequest.txMeta.txParams.maxPriorityFeePerGas = GAS_HEX_MOCK;

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.txParams.maxPriorityFeePerGas).toBe(
          GAS_HEX_MOCK,
        );
      });

      it('to request gasPrice if set and no maxFeePerGas', async () => {
        updateGasFeeRequest.txMeta.txParams.gasPrice = GAS_HEX_MOCK;

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.txParams.maxPriorityFeePerGas).toBe(
          GAS_HEX_MOCK,
        );
      });

      it('to suggested maxPriorityFeePerGas if no request values and flow returns fee market estimate', async () => {
        mockGasFeeFlowMockResponse(FLOW_RESPONSE_FEE_MARKET_MOCK);

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.txParams.maxPriorityFeePerGas).toBe(
          GAS_HEX_WEI_MOCK,
        );
      });

      it('to suggested maxPriorityFeePerGas if no request values and flow returns legacy estimate', async () => {
        mockGasFeeFlowMockResponse(FLOW_RESPONSE_LEGACY_MOCK);

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.txParams.maxPriorityFeePerGas).toBe(
          GAS_HEX_WEI_MOCK,
        );
      });

      it('to suggested maxPriorityFeePerGas if no request values and flow returns gas price estimate', async () => {
        mockGasFeeFlowMockResponse(FLOW_RESPONSE_GAS_PRICE_MOCK);

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.txParams.maxPriorityFeePerGas).toBe(
          GAS_HEX_WEI_MOCK,
        );
      });

      it('to suggested medium maxPriorityFeePerGas if request gas price and request maxFeePerGas', async () => {
        updateGasFeeRequest.txMeta.txParams.gasPrice = '0x456';
        updateGasFeeRequest.txMeta.txParams.maxFeePerGas = '0x789';

        mockGasFeeFlowMockResponse(FLOW_RESPONSE_FEE_MARKET_MOCK);

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.txParams.maxPriorityFeePerGas).toBe(
          GAS_HEX_WEI_MOCK,
        );
      });

      it('to maxFeePerGas if set in request', async () => {
        updateGasFeeRequest.txMeta.txParams.maxFeePerGas = GAS_HEX_MOCK;

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.txParams.maxPriorityFeePerGas).toBe(
          GAS_HEX_MOCK,
        );
      });

      it('to suggested gasPrice if no request values and getGasFeeEstimates throws', async () => {
        updateGasFeeRequest.getGasFeeEstimates.mockReset();
        updateGasFeeRequest.getGasFeeEstimates.mockRejectedValueOnce(
          new Error('TestError'),
        );

        queryMock.mockResolvedValueOnce(GAS_MOCK);

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.txParams.maxPriorityFeePerGas).toBe(
          GAS_HEX_MOCK,
        );
      });
    });

    describe('sets gasPrice', () => {
      describe('if eip1559', () => {
        it('to undefined', async () => {
          await updateGasFees(updateGasFeeRequest);

          expect(updateGasFeeRequest.txMeta.txParams.gasPrice).toBeUndefined();
        });
      });

      describe('if not eip1559', () => {
        it('to request gasPrice if set', async () => {
          updateGasFeeRequest.eip1559 = false;
          updateGasFeeRequest.txMeta.txParams.gasPrice = GAS_HEX_MOCK;

          await updateGasFees(updateGasFeeRequest);

          expect(updateGasFeeRequest.txMeta.txParams.gasPrice).toBe(
            GAS_HEX_MOCK,
          );
        });

        it('to suggested medium maxFeePerGas if no request gasPrice and flow returns fee market estimate', async () => {
          updateGasFeeRequest.eip1559 = false;

          mockGasFeeFlowMockResponse(FLOW_RESPONSE_FEE_MARKET_MOCK);

          await updateGasFees(updateGasFeeRequest);

          expect(updateGasFeeRequest.txMeta.txParams.gasPrice).toBe(
            GAS_HEX_WEI_MOCK,
          );
        });

        it('to suggested medium if no request gasPrice and flow returns legacy estimate', async () => {
          updateGasFeeRequest.eip1559 = false;

          mockGasFeeFlowMockResponse(FLOW_RESPONSE_LEGACY_MOCK);

          await updateGasFees(updateGasFeeRequest);

          expect(updateGasFeeRequest.txMeta.txParams.gasPrice).toBe(
            GAS_HEX_WEI_MOCK,
          );
        });

        it('to suggested medium if no request gasPrice and flow returns gas price estimate', async () => {
          updateGasFeeRequest.eip1559 = false;

          mockGasFeeFlowMockResponse(FLOW_RESPONSE_GAS_PRICE_MOCK);

          await updateGasFees(updateGasFeeRequest);

          expect(updateGasFeeRequest.txMeta.txParams.gasPrice).toBe(
            GAS_HEX_WEI_MOCK,
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

          expect(updateGasFeeRequest.txMeta.txParams.gasPrice).toBe(
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

      it('to saved userFeeLevel if saved gas fees defined', async () => {
        updateGasFeeRequest.txMeta.type = TransactionType.simpleSend;
        updateGasFeeRequest.getSavedGasFees.mockReturnValueOnce({
          maxBaseFee: '123',
          priorityFee: '456',
        });

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.userFeeLevel).toBe(
          UserFeeLevel.CUSTOM,
        );
      });

      it('to custom if request gas price but no request maxFeePerGas or maxPriorityFeePerGas and origin is metamask', async () => {
        updateGasFeeRequest.txMeta.txParams.gasPrice = GAS_HEX_MOCK;
        updateGasFeeRequest.txMeta.origin = ORIGIN_METAMASK;

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.userFeeLevel).toBe(
          UserFeeLevel.CUSTOM,
        );
      });

      it('to medium if request gas price but no request maxFeePerGas or maxPriorityFeePerGas and origin not metamask', async () => {
        updateGasFeeRequest.txMeta.txParams.gasPrice = GAS_HEX_MOCK;
        updateGasFeeRequest.txMeta.origin = ORIGIN_MOCK;

        await updateGasFees(updateGasFeeRequest);

        expect(updateGasFeeRequest.txMeta.userFeeLevel).toBe(
          UserFeeLevel.DAPP_SUGGESTED,
        );
      });

      it('to medium if suggested maxFeePerGas and maxPriorityFeePerGas but no request maxFeePerGas or maxPriorityFeePerGas', async () => {
        mockGasFeeFlowMockResponse(FLOW_RESPONSE_FEE_MARKET_MOCK);

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
