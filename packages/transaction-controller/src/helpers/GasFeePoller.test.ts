import type EthQuery from '@metamask/eth-query';
import type { Hex } from '@metamask/utils';

import { flushPromises } from '../../../../tests/helpers';
import type {
  GasFeeFlowResponse,
  Layer1GasFeeFlow,
  Layer1GasFeeFlowResponse,
} from '../types';
import {
  TransactionStatus,
  type GasFeeFlow,
  type TransactionMeta,
} from '../types';
import { GasFeePoller } from './GasFeePoller';

jest.useFakeTimers();

const CHAIN_ID_MOCK: Hex = '0x123';

const TRANSACTION_META_MOCK: TransactionMeta = {
  id: '1',
  chainId: CHAIN_ID_MOCK,
  status: TransactionStatus.unapproved,
  time: 0,
  txParams: {
    from: '0x123',
  },
};

const GAS_FEE_FLOW_RESPONSE_MOCK: GasFeeFlowResponse = {
  estimates: {
    low: { maxFeePerGas: '0x1', maxPriorityFeePerGas: '0x2' },
    medium: {
      maxFeePerGas: '0x3',
      maxPriorityFeePerGas: '0x4',
    },
    high: {
      maxFeePerGas: '0x5',
      maxPriorityFeePerGas: '0x6',
    },
  },
};

const LAYER_1_GAS_FEE_FLOW_RESPONSE_MOCK: Layer1GasFeeFlowResponse = {
  layer1Fee: '0x123',
};

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

/**
 * Creates a mock Layer1GasFeeFlow.
 * @returns The mock GasFeeFlow.
 */
function createLayer1GasFeeFlowMock(): jest.Mocked<Layer1GasFeeFlow> {
  return {
    matchesTransaction: jest.fn(),
    getLayer1Fee: jest.fn(),
  };
}

describe('GasFeePoller', () => {
  let constructorOptions: ConstructorParameters<typeof GasFeePoller>[0];
  let gasFeeFlowMock: jest.Mocked<GasFeeFlow>;
  let layer1GasFeeFlowMock: jest.Mocked<Layer1GasFeeFlow>;
  let triggerOnStateChange: () => void;
  let getTransactionsMock: jest.MockedFunction<() => TransactionMeta[]>;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.clearAllTimers();

    gasFeeFlowMock = createGasFeeFlowMock();
    gasFeeFlowMock.matchesTransaction.mockReturnValue(true);
    gasFeeFlowMock.getGasFees.mockResolvedValue(GAS_FEE_FLOW_RESPONSE_MOCK);

    layer1GasFeeFlowMock = createLayer1GasFeeFlowMock();
    layer1GasFeeFlowMock.matchesTransaction.mockReturnValue(true);
    layer1GasFeeFlowMock.getLayer1Fee.mockResolvedValue(
      LAYER_1_GAS_FEE_FLOW_RESPONSE_MOCK,
    );

    getTransactionsMock = jest.fn();
    getTransactionsMock.mockReturnValue([TRANSACTION_META_MOCK]);

    constructorOptions = {
      gasFeeFlows: [gasFeeFlowMock],
      getEthQuery: () => ({} as EthQuery),
      getGasFeeControllerEstimates: jest.fn(),
      getTransactions: getTransactionsMock,
      layer1GasFeeFlows: [layer1GasFeeFlowMock],
      onStateChange: (listener: () => void) => {
        triggerOnStateChange = listener;
      },
    };
  });

  describe('on state change', () => {
    describe('if unapproved transaction', () => {
      it('emits updated event', async () => {
        const listener = jest.fn();

        const gasFeePoller = new GasFeePoller(constructorOptions);
        gasFeePoller.hub.on('transaction-updated', listener);

        triggerOnStateChange();
        await flushPromises();

        expect(listener).toHaveBeenCalledTimes(2);
        expect(listener.mock.calls).toMatchObject([
          [
            {
              ...TRANSACTION_META_MOCK,
              gasFeeEstimates: GAS_FEE_FLOW_RESPONSE_MOCK.estimates,
            },
          ],
          [
            {
              ...TRANSACTION_META_MOCK,
              layer1GasFee: LAYER_1_GAS_FEE_FLOW_RESPONSE_MOCK.layer1Fee,
            },
          ],
        ]);
      });

      it('calls gas fee flow', async () => {
        const listener = jest.fn();

        const gasFeePoller = new GasFeePoller(constructorOptions);
        gasFeePoller.hub.on('transaction-updated', listener);

        triggerOnStateChange();
        await flushPromises();

        expect(gasFeeFlowMock.getGasFees).toHaveBeenCalledTimes(1);
        expect(gasFeeFlowMock.getGasFees).toHaveBeenCalledWith({
          ethQuery: expect.any(Object),
          getGasFeeControllerEstimates:
            constructorOptions.getGasFeeControllerEstimates,
          transactionMeta: TRANSACTION_META_MOCK,
        });
      });

      it('calls layer 1 gas fee flow', async () => {
        const listener = jest.fn();

        const gasFeePoller = new GasFeePoller(constructorOptions);
        gasFeePoller.hub.on('transaction-updated', listener);

        triggerOnStateChange();
        await flushPromises();

        expect(layer1GasFeeFlowMock.getLayer1Fee).toHaveBeenCalledTimes(1);
        expect(layer1GasFeeFlowMock.getLayer1Fee).toHaveBeenCalledWith({
          ethQuery: expect.any(Object),
          transactionMeta: TRANSACTION_META_MOCK,
        });
      });

      it('creates polling timeout', async () => {
        new GasFeePoller(constructorOptions);

        triggerOnStateChange();
        await flushPromises();

        expect(jest.getTimerCount()).toBe(1);

        jest.runOnlyPendingTimers();
        await flushPromises();

        expect(gasFeeFlowMock.getGasFees).toHaveBeenCalledTimes(2);
      });

      it('does not create additional polling timeout on subsequent state changes', async () => {
        new GasFeePoller(constructorOptions);

        triggerOnStateChange();
        await flushPromises();

        triggerOnStateChange();
        await flushPromises();

        expect(jest.getTimerCount()).toBe(1);
      });
    });

    describe('does nothing if', () => {
      it('no transactions', async () => {
        const listener = jest.fn();

        getTransactionsMock.mockReturnValue([]);

        const gasFeePoller = new GasFeePoller(constructorOptions);
        gasFeePoller.hub.on('transaction-updated', listener);

        triggerOnStateChange();
        await flushPromises();

        expect(listener).toHaveBeenCalledTimes(0);
      });

      it('transaction has alternate status', async () => {
        const listener = jest.fn();

        getTransactionsMock.mockReturnValue([
          {
            ...TRANSACTION_META_MOCK,
            status: TransactionStatus.submitted,
          },
        ]);

        const gasFeePoller = new GasFeePoller(constructorOptions);
        gasFeePoller.hub.on('transaction-updated', listener);

        triggerOnStateChange();
        await flushPromises();

        expect(listener).toHaveBeenCalledTimes(0);
      });

      it('no fee flow matches transaction', async () => {
        const listener = jest.fn();

        gasFeeFlowMock.matchesTransaction.mockReturnValue(false);
        layer1GasFeeFlowMock.matchesTransaction.mockReturnValue(false);

        const gasFeePoller = new GasFeePoller(constructorOptions);
        gasFeePoller.hub.on('transaction-updated', listener);

        triggerOnStateChange();
        await flushPromises();

        expect(listener).toHaveBeenCalledTimes(0);
      });

      it('fee flows throws', async () => {
        const listener = jest.fn();

        gasFeeFlowMock.getGasFees.mockRejectedValue(new Error('TestError'));
        layer1GasFeeFlowMock.getLayer1Fee.mockRejectedValue(
          new Error('TestError'),
        );

        const gasFeePoller = new GasFeePoller(constructorOptions);
        gasFeePoller.hub.on('transaction-updated', listener);

        triggerOnStateChange();
        await flushPromises();

        expect(listener).toHaveBeenCalledTimes(0);
      });
    });

    it('clears polling timeout if no transactions', async () => {
      new GasFeePoller(constructorOptions);

      triggerOnStateChange();
      await flushPromises();

      getTransactionsMock.mockReturnValue([]);

      triggerOnStateChange();
      await flushPromises();

      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
