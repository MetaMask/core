import type EthQuery from '@metamask/eth-query';
import type { Hex } from '@metamask/utils';

import { flushPromises } from '../../../../tests/helpers';
import type { GasFeeFlowResponse, Layer1GasFeeFlow } from '../types';
import {
  TransactionStatus,
  type GasFeeFlow,
  type TransactionMeta,
} from '../types';
import { updateTransactionLayer1GasFee } from '../utils/layer1-gas-fee-flow';
import { GasFeePoller } from './GasFeePoller';

jest.mock('../utils/layer1-gas-fee-flow', () => ({
  updateTransactionLayer1GasFee: jest.fn(),
}));

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

const LAYER1_GAS_FEE_MOCK = '0x123';

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

describe('GasFeePoller', () => {
  let constructorOptions: ConstructorParameters<typeof GasFeePoller>[0];
  let gasFeeFlowMock: jest.Mocked<GasFeeFlow>;
  let triggerOnStateChange: () => void;
  let getTransactionsMock: jest.MockedFunction<() => TransactionMeta[]>;
  const updateTransactionLayer1GasFeeMock =
    updateTransactionLayer1GasFee as jest.MockedFunction<
      typeof updateTransactionLayer1GasFee
    >;
  // As we mock implementation of updateTransactionLayer1GasFee, it does not matter if we pass matching flow here
  const layer1GasFeeFlowsMock: jest.Mocked<Layer1GasFeeFlow[]> = [];

  const transactionLayer1GasFeeUpdater = ({
    transactionMeta,
  }: {
    transactionMeta: TransactionMeta;
  }) => {
    transactionMeta.layer1GasFee = LAYER1_GAS_FEE_MOCK;
    return Promise.resolve();
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.clearAllTimers();

    gasFeeFlowMock = createGasFeeFlowMock();
    gasFeeFlowMock.matchesTransaction.mockReturnValue(true);
    gasFeeFlowMock.getGasFees.mockResolvedValue(GAS_FEE_FLOW_RESPONSE_MOCK);

    getTransactionsMock = jest.fn();
    getTransactionsMock.mockReturnValue([{ ...TRANSACTION_META_MOCK }]);

    updateTransactionLayer1GasFeeMock.mockImplementation(
      transactionLayer1GasFeeUpdater,
    );

    constructorOptions = {
      gasFeeFlows: [gasFeeFlowMock],
      getEthQuery: () => ({} as EthQuery),
      getGasFeeControllerEstimates: jest.fn(),
      getTransactions: getTransactionsMock,
      layer1GasFeeFlows: layer1GasFeeFlowsMock,
      onStateChange: (listener: () => void) => {
        triggerOnStateChange = listener;
      },
    };
  });

  describe('on state change', () => {
    describe('if unapproved transaction', () => {
      beforeEach(() => {
        // to avoid side effect of the mock implementation
        // otherwise argument assertion would fail because mock.calls[][] holds reference
        updateTransactionLayer1GasFeeMock.mockResolvedValue(undefined);
      });

      it('emits updated event', async () => {
        // skip into original implementation
        updateTransactionLayer1GasFeeMock.mockImplementationOnce(
          transactionLayer1GasFeeUpdater,
        );

        const listener = jest.fn();

        const gasFeePoller = new GasFeePoller(constructorOptions);
        gasFeePoller.hub.on('transaction-updated', listener);

        triggerOnStateChange();
        await flushPromises();

        expect(listener).toHaveBeenCalledTimes(2);
        expect(listener).toHaveBeenCalledWith({
          ...TRANSACTION_META_MOCK,
          gasFeeEstimates: GAS_FEE_FLOW_RESPONSE_MOCK.estimates,
          layer1GasFee: LAYER1_GAS_FEE_MOCK,
          gasFeeEstimatesLoaded: true,
        });
      });

      it('calls gas fee flow', async () => {
        new GasFeePoller(constructorOptions);

        triggerOnStateChange();

        expect(gasFeeFlowMock.getGasFees).toHaveBeenCalledTimes(1);
        expect(gasFeeFlowMock.getGasFees).toHaveBeenCalledWith({
          ethQuery: expect.any(Object),
          getGasFeeControllerEstimates:
            constructorOptions.getGasFeeControllerEstimates,
          transactionMeta: TRANSACTION_META_MOCK,
        });
      });

      it('calls layer1 gas fee updater', async () => {
        new GasFeePoller(constructorOptions);

        triggerOnStateChange();

        expect(updateTransactionLayer1GasFeeMock).toHaveBeenCalledTimes(1);
        expect(updateTransactionLayer1GasFeeMock).toHaveBeenCalledWith({
          ethQuery: expect.any(Object),
          layer1GasFeeFlows: layer1GasFeeFlowsMock,
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

      it('no gas fee flow matches transaction and already loaded', async () => {
        const listener = jest.fn();

        gasFeeFlowMock.matchesTransaction.mockReturnValue(false);
        updateTransactionLayer1GasFeeMock.mockImplementation(() => {
          return Promise.resolve();
        });

        getTransactionsMock.mockReturnValue([
          { ...TRANSACTION_META_MOCK, gasFeeEstimatesLoaded: true },
        ]);

        const gasFeePoller = new GasFeePoller(constructorOptions);
        gasFeePoller.hub.on('transaction-updated', listener);

        triggerOnStateChange();
        await flushPromises();

        expect(listener).toHaveBeenCalledTimes(0);
      });

      it('gas fee flow throws and already loaded', async () => {
        const listener = jest.fn();

        // to make sure update will be called by gas fee flow
        updateTransactionLayer1GasFeeMock.mockImplementation(() => {
          return Promise.resolve();
        });

        gasFeeFlowMock.getGasFees.mockRejectedValue(new Error('TestError'));

        getTransactionsMock.mockReturnValue([
          { ...TRANSACTION_META_MOCK, gasFeeEstimatesLoaded: true },
        ]);

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
