import type { Provider } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

import {
  GasFeePoller,
  updateTransactionGasProperties,
  updateTransactionGasEstimates,
} from './GasFeePoller';
import { flushPromises } from '../../../../tests/helpers';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { GasFeeFlowResponse, Layer1GasFeeFlow } from '../types';
import {
  GasFeeEstimateLevel,
  GasFeeEstimateType,
  TransactionEnvelopeType,
  TransactionStatus,
  UserFeeLevel,
  type GasFeeFlow,
  type GasFeeEstimates,
  type TransactionMeta,
} from '../types';
import { getTransactionLayer1GasFee } from '../utils/layer1-gas-fee-flow';

jest.mock('../utils/feature-flags');
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
    type: TransactionEnvelopeType.feeMarket,
  },
};

const FEE_MARKET_GAS_FEE_ESTIMATES_MOCK = {
  type: GasFeeEstimateType.FeeMarket,
  [GasFeeEstimateLevel.Low]: {
    maxFeePerGas: '0x123',
    maxPriorityFeePerGas: '0x123',
  },
  [GasFeeEstimateLevel.Medium]: {
    maxFeePerGas: '0x1234',
    maxPriorityFeePerGas: '0x1234',
  },
  [GasFeeEstimateLevel.High]: {
    maxFeePerGas: '0x12345',
    maxPriorityFeePerGas: '0x12345',
  },
};

const LEGACY_GAS_FEE_ESTIMATES_MOCK = {
  type: GasFeeEstimateType.Legacy,
  [GasFeeEstimateLevel.Low]: '0x123',
  [GasFeeEstimateLevel.Medium]: '0x1234',
  [GasFeeEstimateLevel.High]: '0x12345',
};

const GAS_PRICE_GAS_FEE_ESTIMATES_MOCK = {
  type: GasFeeEstimateType.GasPrice,
  gasPrice: '0x12345',
};

const GAS_FEE_FLOW_RESPONSE_MOCK = {
  estimates: FEE_MARKET_GAS_FEE_ESTIMATES_MOCK,
} as unknown as GasFeeFlowResponse;

/**
 * Creates a mock GasFeeFlow.
 *
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
  const messengerMock = jest.fn() as unknown as TransactionControllerMessenger;

  beforeEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();

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
      messenger: messengerMock,
      onStateChange: (listener: () => void) => {
        triggerOnStateChange = listener;
      },
      getProvider: () => ({}) as Provider,
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
          messenger: expect.any(Function),
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
          messenger: expect.any(Function),
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

const sharedEIP1559GasTests = [
  {
    name: 'with fee market gas fee estimates',
    estimates: FEE_MARKET_GAS_FEE_ESTIMATES_MOCK,
    userFeeLevel: GasFeeEstimateLevel.Low,
    expectedMaxFeePerGas:
      FEE_MARKET_GAS_FEE_ESTIMATES_MOCK[GasFeeEstimateLevel.Low].maxFeePerGas,
    expectedMaxPriorityFeePerGas:
      FEE_MARKET_GAS_FEE_ESTIMATES_MOCK[GasFeeEstimateLevel.Low]
        .maxPriorityFeePerGas,
  },
  {
    name: 'with gas price gas fee estimates',
    estimates: GAS_PRICE_GAS_FEE_ESTIMATES_MOCK,
    userFeeLevel: GasFeeEstimateLevel.Low,
    expectedMaxFeePerGas: GAS_PRICE_GAS_FEE_ESTIMATES_MOCK.gasPrice,
    expectedMaxPriorityFeePerGas: GAS_PRICE_GAS_FEE_ESTIMATES_MOCK.gasPrice,
  },
  {
    name: 'with legacy gas fee estimates',
    estimates: LEGACY_GAS_FEE_ESTIMATES_MOCK,
    userFeeLevel: GasFeeEstimateLevel.Low,
    expectedMaxFeePerGas:
      LEGACY_GAS_FEE_ESTIMATES_MOCK[GasFeeEstimateLevel.Low],
    expectedMaxPriorityFeePerGas:
      LEGACY_GAS_FEE_ESTIMATES_MOCK[GasFeeEstimateLevel.Low],
  },
];

const sharedLegacyGasTests = [
  {
    name: 'with fee market gas fee estimates',
    estimates: FEE_MARKET_GAS_FEE_ESTIMATES_MOCK,
    userFeeLevel: GasFeeEstimateLevel.Medium,
    expectedGasPrice:
      FEE_MARKET_GAS_FEE_ESTIMATES_MOCK[GasFeeEstimateLevel.Medium]
        .maxFeePerGas,
  },
  {
    name: 'with gas price gas fee estimates',
    estimates: GAS_PRICE_GAS_FEE_ESTIMATES_MOCK,
    userFeeLevel: GasFeeEstimateLevel.Low,
    expectedGasPrice: GAS_PRICE_GAS_FEE_ESTIMATES_MOCK.gasPrice,
  },
  {
    name: 'with legacy gas fee estimates',
    estimates: LEGACY_GAS_FEE_ESTIMATES_MOCK,
    userFeeLevel: GasFeeEstimateLevel.Low,
    expectedGasPrice: LEGACY_GAS_FEE_ESTIMATES_MOCK[GasFeeEstimateLevel.Low],
  },
];

describe('updateTransactionGasProperties', () => {
  it('updates gas fee estimates', () => {
    const txMeta = {
      ...TRANSACTION_META_MOCK,
    };

    updateTransactionGasProperties({
      txMeta,
      gasFeeEstimates: FEE_MARKET_GAS_FEE_ESTIMATES_MOCK as GasFeeEstimates,
      isTxParamsGasFeeUpdatesEnabled: () => true,
    });

    expect(txMeta.gasFeeEstimates).toBe(FEE_MARKET_GAS_FEE_ESTIMATES_MOCK);
  });

  it('updates gasFeeEstimatesLoaded', () => {
    const txMeta = {
      ...TRANSACTION_META_MOCK,
    };

    updateTransactionGasProperties({
      txMeta,
      gasFeeEstimatesLoaded: true,
      isTxParamsGasFeeUpdatesEnabled: () => true,
    });

    expect(txMeta.gasFeeEstimatesLoaded).toBe(true);

    updateTransactionGasProperties({
      txMeta,
      gasFeeEstimatesLoaded: false,
      isTxParamsGasFeeUpdatesEnabled: () => true,
    });

    expect(txMeta.gasFeeEstimatesLoaded).toBe(false);
  });

  it('updates layer1GasFee', () => {
    const layer1GasFeeMock = '0x123456';
    const txMeta = {
      ...TRANSACTION_META_MOCK,
    };

    updateTransactionGasProperties({
      txMeta,
      layer1GasFee: layer1GasFeeMock,
      isTxParamsGasFeeUpdatesEnabled: () => true,
    });

    expect(txMeta.layer1GasFee).toBe(layer1GasFeeMock);
  });

  describe('does not update txParams gas values', () => {
    it('if isTxParamsGasFeeUpdatesEnabled callback returns false', () => {
      const prevMaxFeePerGas = '0x987654321';
      const prevMaxPriorityFeePerGas = '0x98765432';
      const userFeeLevel = UserFeeLevel.MEDIUM;
      const txMeta = {
        ...TRANSACTION_META_MOCK,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          maxFeePerGas: prevMaxFeePerGas,
          maxPriorityFeePerGas: prevMaxPriorityFeePerGas,
        },
        userFeeLevel,
      };

      updateTransactionGasProperties({
        txMeta,
        gasFeeEstimates: FEE_MARKET_GAS_FEE_ESTIMATES_MOCK as GasFeeEstimates,
        isTxParamsGasFeeUpdatesEnabled: () => false,
      });

      expect(txMeta.txParams.maxFeePerGas).toBe(prevMaxFeePerGas);
      expect(txMeta.txParams.maxPriorityFeePerGas).toBe(
        prevMaxPriorityFeePerGas,
      );
    });

    it.each([
      {
        userFeeLevel: UserFeeLevel.CUSTOM,
      },
      {
        userFeeLevel: UserFeeLevel.DAPP_SUGGESTED,
      },
      {
        userFeeLevel: undefined,
      },
    ])('if userFeeLevel is $userFeeLevel', ({ userFeeLevel }) => {
      const dappSuggestedOrCustomMaxFeePerGas = '0x12345678';
      const dappSuggestedOrCustomMaxPriorityFeePerGas = '0x123456789';
      const txMeta = {
        ...TRANSACTION_META_MOCK,
        userFeeLevel,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          maxFeePerGas: dappSuggestedOrCustomMaxFeePerGas,
          maxPriorityFeePerGas: dappSuggestedOrCustomMaxPriorityFeePerGas,
        },
      };

      updateTransactionGasProperties({
        txMeta,
        gasFeeEstimates: FEE_MARKET_GAS_FEE_ESTIMATES_MOCK as GasFeeEstimates,
        isTxParamsGasFeeUpdatesEnabled: () => true,
      });

      expect(txMeta.txParams.maxFeePerGas).toBe(
        dappSuggestedOrCustomMaxFeePerGas,
      );
      expect(txMeta.txParams.maxPriorityFeePerGas).toBe(
        dappSuggestedOrCustomMaxPriorityFeePerGas,
      );
    });
  });

  describe('updates txParam gas values', () => {
    it.each([
      {
        userFeeLevel: GasFeeEstimateLevel.Low,
      },
      {
        userFeeLevel: GasFeeEstimateLevel.Medium,
      },
      {
        userFeeLevel: GasFeeEstimateLevel.High,
      },
    ])('only if userFeeLevel is $userFeeLevel', ({ userFeeLevel }) => {
      const txMeta = {
        ...TRANSACTION_META_MOCK,
        userFeeLevel,
      };

      updateTransactionGasProperties({
        txMeta,
        gasFeeEstimates: FEE_MARKET_GAS_FEE_ESTIMATES_MOCK as GasFeeEstimates,
        isTxParamsGasFeeUpdatesEnabled: () => true,
      });

      expect(txMeta.txParams.maxFeePerGas).toBe(
        FEE_MARKET_GAS_FEE_ESTIMATES_MOCK[userFeeLevel].maxFeePerGas,
      );
      expect(txMeta.txParams.maxPriorityFeePerGas).toBe(
        FEE_MARKET_GAS_FEE_ESTIMATES_MOCK[userFeeLevel].maxPriorityFeePerGas,
      );
    });

    it('calls isTxParamsGasFeeUpdatesEnabled with transaction meta', () => {
      const mockCallback = jest.fn(() => true);
      const txMeta = {
        ...TRANSACTION_META_MOCK,
        userFeeLevel: GasFeeEstimateLevel.Low,
      };

      updateTransactionGasProperties({
        txMeta,
        gasFeeEstimates: FEE_MARKET_GAS_FEE_ESTIMATES_MOCK as GasFeeEstimates,
        isTxParamsGasFeeUpdatesEnabled: mockCallback,
      });

      expect(mockCallback).toHaveBeenCalledWith(txMeta);
    });

    describe('EIP-1559 compatible transaction', () => {
      sharedEIP1559GasTests.forEach((testCase) => {
        it(testCase.name, () => {
          const txMeta = {
            ...TRANSACTION_META_MOCK,
            userFeeLevel: testCase.userFeeLevel,
          };

          updateTransactionGasProperties({
            txMeta,
            gasFeeEstimates: testCase.estimates as GasFeeEstimates,
            isTxParamsGasFeeUpdatesEnabled: () => true,
          });

          expect(txMeta.txParams.maxFeePerGas).toBe(
            testCase.expectedMaxFeePerGas,
          );
          expect(txMeta.txParams.maxPriorityFeePerGas).toBe(
            testCase.expectedMaxPriorityFeePerGas,
          );
        });
      });
    });

    describe('on non-EIP-1559 compatible transaction', () => {
      sharedLegacyGasTests.forEach((testCase) => {
        it(testCase.name, () => {
          const txMeta = {
            ...TRANSACTION_META_MOCK,
            txParams: {
              ...TRANSACTION_META_MOCK.txParams,
              type: TransactionEnvelopeType.legacy,
            },
            userFeeLevel: testCase.userFeeLevel,
          };

          updateTransactionGasProperties({
            txMeta,
            gasFeeEstimates: testCase.estimates as GasFeeEstimates,
            isTxParamsGasFeeUpdatesEnabled: () => true,
          });

          expect(txMeta.txParams.gasPrice).toBe(testCase.expectedGasPrice);
          expect(txMeta.txParams.maxFeePerGas).toBeUndefined();
          expect(txMeta.txParams.maxPriorityFeePerGas).toBeUndefined();
        });
      });
    });
  });

  describe('properly cleans up gas fee parameters', () => {
    it('removes gasPrice when setting EIP-1559 parameters', () => {
      const txMeta = {
        ...TRANSACTION_META_MOCK,
        userFeeLevel: GasFeeEstimateLevel.Medium,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          gasPrice: '0x123456',
        },
      };

      updateTransactionGasProperties({
        txMeta,
        gasFeeEstimates: FEE_MARKET_GAS_FEE_ESTIMATES_MOCK as GasFeeEstimates,
        isTxParamsGasFeeUpdatesEnabled: () => true,
      });

      expect(txMeta.txParams.maxFeePerGas).toBe(
        FEE_MARKET_GAS_FEE_ESTIMATES_MOCK[GasFeeEstimateLevel.Medium]
          .maxFeePerGas,
      );
      expect(txMeta.txParams.maxPriorityFeePerGas).toBe(
        FEE_MARKET_GAS_FEE_ESTIMATES_MOCK[GasFeeEstimateLevel.Medium]
          .maxPriorityFeePerGas,
      );
      expect(txMeta.txParams.gasPrice).toBeUndefined();
    });

    it('removes EIP-1559 parameters when setting gasPrice', () => {
      const txMeta = {
        ...TRANSACTION_META_MOCK,
        userFeeLevel: GasFeeEstimateLevel.Medium,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          type: TransactionEnvelopeType.legacy,
          maxFeePerGas: '0x123456',
          maxPriorityFeePerGas: '0x123456',
        },
      };

      updateTransactionGasProperties({
        txMeta,
        gasFeeEstimates: LEGACY_GAS_FEE_ESTIMATES_MOCK as GasFeeEstimates,
        isTxParamsGasFeeUpdatesEnabled: () => true,
      });

      expect(txMeta.txParams.gasPrice).toBe(
        LEGACY_GAS_FEE_ESTIMATES_MOCK[GasFeeEstimateLevel.Medium],
      );
      expect(txMeta.txParams.maxFeePerGas).toBeUndefined();
      expect(txMeta.txParams.maxPriorityFeePerGas).toBeUndefined();
    });
  });

  describe('handles null or undefined gas fee estimates', () => {
    it('does not update txParams when gasFeeEstimates is undefined', () => {
      const txMeta = {
        ...TRANSACTION_META_MOCK,
        userFeeLevel: GasFeeEstimateLevel.Medium,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          maxFeePerGas: '0x123456',
          maxPriorityFeePerGas: '0x123456',
        },
      };

      updateTransactionGasProperties({
        txMeta,
        gasFeeEstimates: undefined,
        isTxParamsGasFeeUpdatesEnabled: () => true,
      });

      expect(txMeta.txParams.maxFeePerGas).toBe('0x123456');
      expect(txMeta.txParams.maxPriorityFeePerGas).toBe('0x123456');
    });

    it('still updates gasFeeEstimatesLoaded even when gasFeeEstimates is undefined', () => {
      const txMeta = {
        ...TRANSACTION_META_MOCK,
      };

      updateTransactionGasProperties({
        txMeta,
        gasFeeEstimates: undefined,
        gasFeeEstimatesLoaded: true,
        isTxParamsGasFeeUpdatesEnabled: () => true,
      });

      expect(txMeta.gasFeeEstimates).toBeUndefined();
      expect(txMeta.gasFeeEstimatesLoaded).toBe(true);
    });
  });
});

describe('updateTransactionGasEstimates', () => {
  describe('EIP-1559 compatible transaction', () => {
    sharedEIP1559GasTests.forEach((testCase) => {
      it(testCase.name, () => {
        const txMeta = {
          ...TRANSACTION_META_MOCK,
          gasFeeEstimates: testCase.estimates as GasFeeEstimates,
          txParams: {
            ...TRANSACTION_META_MOCK.txParams,
            type: TransactionEnvelopeType.feeMarket,
          },
        };

        updateTransactionGasEstimates({
          txMeta,
          userFeeLevel: testCase.userFeeLevel,
        });

        expect(txMeta.txParams.maxFeePerGas).toBe(
          testCase.expectedMaxFeePerGas,
        );
        expect(txMeta.txParams.maxPriorityFeePerGas).toBe(
          testCase.expectedMaxPriorityFeePerGas,
        );
      });
    });
  });

  describe('non-EIP-1559 compatible transaction', () => {
    sharedLegacyGasTests.forEach((testCase) => {
      it(testCase.name, () => {
        const txMeta = {
          ...TRANSACTION_META_MOCK,
          gasFeeEstimates: testCase.estimates as GasFeeEstimates,
          txParams: {
            ...TRANSACTION_META_MOCK.txParams,
            type: TransactionEnvelopeType.legacy,
          },
        };

        updateTransactionGasEstimates({
          txMeta,
          userFeeLevel: testCase.userFeeLevel,
        });

        expect(txMeta.txParams.gasPrice).toBe(testCase.expectedGasPrice);
      });
    });
  });

  describe('handles missing gas fee estimates', () => {
    it('when gas fee estimates are undefined', () => {
      const txMeta = {
        ...TRANSACTION_META_MOCK,
        gasFeeEstimates: undefined,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          type: TransactionEnvelopeType.feeMarket,
          maxFeePerGas: '0x999999',
          maxPriorityFeePerGas: '0x888888',
        },
      };

      updateTransactionGasEstimates({
        txMeta,
        userFeeLevel: GasFeeEstimateLevel.Medium,
      });

      expect(txMeta.txParams.maxFeePerGas).toBe('0x999999');
      expect(txMeta.txParams.maxPriorityFeePerGas).toBe('0x888888');
    });

    it('when gas fee estimates type is unknown', () => {
      const unknownGasFeeEstimates = {
        ...LEGACY_GAS_FEE_ESTIMATES_MOCK,
        type: 'unknown' as unknown as GasFeeEstimateType,
      };

      const txMeta = {
        ...TRANSACTION_META_MOCK,
        gasFeeEstimates: unknownGasFeeEstimates as GasFeeEstimates,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          gasPrice: '0x777777',
          type: TransactionEnvelopeType.legacy,
        },
      };

      updateTransactionGasEstimates({
        txMeta,
        userFeeLevel: GasFeeEstimateLevel.Medium,
      });

      expect(txMeta.txParams.gasPrice).toBe('0x777777');
    });
  });

  describe('handles different fee levels', () => {
    it.each([
      GasFeeEstimateLevel.Low,
      GasFeeEstimateLevel.Medium,
      GasFeeEstimateLevel.High,
    ])('applies correct fee level %s', (feeLevel) => {
      const txMeta = {
        ...TRANSACTION_META_MOCK,
        gasFeeEstimates: FEE_MARKET_GAS_FEE_ESTIMATES_MOCK as GasFeeEstimates,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          type: TransactionEnvelopeType.feeMarket,
        },
      };

      updateTransactionGasEstimates({
        txMeta,
        userFeeLevel: feeLevel,
      });

      expect(txMeta.txParams.maxFeePerGas).toBe(
        FEE_MARKET_GAS_FEE_ESTIMATES_MOCK[feeLevel].maxFeePerGas,
      );
      expect(txMeta.txParams.maxPriorityFeePerGas).toBe(
        FEE_MARKET_GAS_FEE_ESTIMATES_MOCK[feeLevel].maxPriorityFeePerGas,
      );
    });
  });
});
