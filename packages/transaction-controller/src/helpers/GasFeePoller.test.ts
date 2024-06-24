import type { Provider } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

import { flushPromises } from '../../../../tests/helpers';
import type { GasFeeFlowResponse, Layer1GasFeeFlow } from '../types';
import {
  GasFeeEstimateType,
  TransactionStatus,
  type GasFeeFlow,
  type TransactionMeta,
} from '../types';
import { getTransactionLayer1GasFee } from '../utils/layer1-gas-fee-flow';
import { GasFeePoller } from './GasFeePoller';

jest.mock('../utils/layer1-gas-fee-flow', () => ({
  getTransactionLayer1GasFee: jest.fn(),
}));

jest.useFakeTimers();

const CHAIN_ID_MOCK: Hex = '0x123';
const NETWORK_CLIENT_ID_MOCK = 'networkClientIdMock';
const LAYER1_GAS_FEE_MOCK = '0x123';

const TRANSACTION_META_MOCK: TransactionMeta = {
  id: '1',
  chainId: CHAIN_ID_MOCK,
  networkClientId: NETWORK_CLIENT_ID_MOCK,
  status: TransactionStatus.unapproved,
  time: 0,
  txParams: {
    from: '0x123',
  },
};

const GAS_FEE_FLOW_RESPONSE_MOCK: GasFeeFlowResponse = {
  estimates: {
    type: GasFeeEstimateType.FeeMarket,
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
  const getTransactionLayer1GasFeeMock = jest.mocked(
    getTransactionLayer1GasFee,
  );
  // As we mock implementation of updateTransactionLayer1GasFee, it does not matter if we pass matching flow here
  const layer1GasFeeFlowsMock: jest.Mocked<Layer1GasFeeFlow[]> = [];
  const getGasFeeControllerEstimatesMock = jest.fn();
  const findNetworkClientIdByChainIdMock = jest.fn();

  beforeEach(() => {
    jest.clearAllTimers();

    gasFeeFlowMock = createGasFeeFlowMock();
    gasFeeFlowMock.matchesTransaction.mockReturnValue(true);
    gasFeeFlowMock.getGasFees.mockResolvedValue(GAS_FEE_FLOW_RESPONSE_MOCK);

    getTransactionsMock = jest.fn();
    getTransactionsMock.mockReturnValue([{ ...TRANSACTION_META_MOCK }]);

    getTransactionLayer1GasFeeMock.mockResolvedValue(LAYER1_GAS_FEE_MOCK);

    constructorOptions = {
      findNetworkClientIdByChainId: findNetworkClientIdByChainIdMock,
      gasFeeFlows: [gasFeeFlowMock],
      getGasFeeControllerEstimates: getGasFeeControllerEstimatesMock,
      getTransactions: getTransactionsMock,
      layer1GasFeeFlows: layer1GasFeeFlowsMock,
      onStateChange: (listener: () => void) => {
        triggerOnStateChange = listener;
      },
      getProvider: () => ({} as Provider),
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

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({
          transactionId: TRANSACTION_META_MOCK.id,
          gasFeeEstimates: GAS_FEE_FLOW_RESPONSE_MOCK.estimates,
          layer1GasFee: LAYER1_GAS_FEE_MOCK,
          gasFeeEstimatesLoaded: true,
        });
      });

      it('calls gas fee flow', async () => {
        getGasFeeControllerEstimatesMock.mockResolvedValue({});

        new GasFeePoller(constructorOptions);

        triggerOnStateChange();
        await flushPromises();

        expect(gasFeeFlowMock.getGasFees).toHaveBeenCalledTimes(1);
        expect(gasFeeFlowMock.getGasFees).toHaveBeenCalledWith({
          ethQuery: expect.any(Object),
          gasFeeControllerData: {},
          transactionMeta: TRANSACTION_META_MOCK,
        });
      });

      it('retrieves layer 1 gas fee', async () => {
        new GasFeePoller(constructorOptions);

        triggerOnStateChange();
        await flushPromises();

        expect(getTransactionLayer1GasFeeMock).toHaveBeenCalledTimes(1);
        expect(getTransactionLayer1GasFeeMock).toHaveBeenCalledWith({
          provider: expect.any(Object),
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

      it('does nothing if no transactions', async () => {
        const listener = jest.fn();

        getTransactionsMock.mockReturnValueOnce([{ ...TRANSACTION_META_MOCK }]);
        getTransactionsMock.mockReturnValueOnce([]);

        const gasFeePoller = new GasFeePoller(constructorOptions);
        gasFeePoller.hub.on('transaction-updated', listener);

        triggerOnStateChange();
        await flushPromises();

        expect(listener).toHaveBeenCalledTimes(0);
        expect(getGasFeeControllerEstimatesMock).toHaveBeenCalledTimes(0);
        expect(gasFeeFlowMock.getGasFees).toHaveBeenCalledTimes(0);
      });

      describe('fetches GasFeeController data', () => {
        it('for each unique chain ID', async () => {
          getTransactionsMock.mockReturnValue([
            {
              ...TRANSACTION_META_MOCK,
              chainId: '0x1',
              networkClientId: 'networkClientId1',
            },
            {
              ...TRANSACTION_META_MOCK,
              chainId: '0x2',
              networkClientId: 'networkClientId2',
            },
            {
              ...TRANSACTION_META_MOCK,
              chainId: '0x2',
              networkClientId: 'networkClientId3',
            },
            {
              ...TRANSACTION_META_MOCK,
              chainId: '0x3',
              networkClientId: 'networkClientId4',
            },
          ]);

          new GasFeePoller(constructorOptions);

          triggerOnStateChange();
          await flushPromises();

          expect(getGasFeeControllerEstimatesMock).toHaveBeenCalledTimes(3);
          expect(getGasFeeControllerEstimatesMock).toHaveBeenCalledWith({
            networkClientId: 'networkClientId1',
          });
          expect(getGasFeeControllerEstimatesMock).toHaveBeenCalledWith({
            networkClientId: 'networkClientId2',
          });
          expect(getGasFeeControllerEstimatesMock).toHaveBeenCalledWith({
            networkClientId: 'networkClientId4',
          });
        });

        it('using found network client ID if none in metadata', async () => {
          getTransactionsMock.mockReturnValue([
            {
              ...TRANSACTION_META_MOCK,
              chainId: '0x1',
              networkClientId: undefined,
            },
          ]);

          findNetworkClientIdByChainIdMock.mockReturnValue('networkClientId1');

          new GasFeePoller(constructorOptions);

          triggerOnStateChange();
          await flushPromises();

          expect(getGasFeeControllerEstimatesMock).toHaveBeenCalledTimes(1);
          expect(getGasFeeControllerEstimatesMock).toHaveBeenCalledWith({
            networkClientId: 'networkClientId1',
          });
        });
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
        getTransactionLayer1GasFeeMock.mockResolvedValue(undefined);

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

        gasFeeFlowMock.getGasFees.mockRejectedValue(new Error('TestError'));
        getTransactionLayer1GasFeeMock.mockResolvedValue(undefined);

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
