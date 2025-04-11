/* eslint-disable jest/no-restricted-matchers */
/* eslint-disable jest/no-conditional-in-test */
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { CaipAssetType } from '@metamask/utils';
import { numberToHex } from '@metamask/utils';

import { BridgeStatusController } from './bridge-status-controller';
import { DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE } from './constants';
import {
  type BridgeId,
  type StatusTypes,
  type ActionTypes,
  type StartPollingForBridgeTxStatusArgsSerialized,
  type BridgeHistoryItem,
  type BridgeStatusControllerState,
  type BridgeStatusControllerMessenger,
  BridgeClientId,
} from './types';
import * as bridgeStatusUtils from './utils/bridge-status';
import { flushPromises } from '../../../tests/helpers';

const EMPTY_INIT_STATE: BridgeStatusControllerState = {
  ...DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE,
};

const MockStatusResponse = {
  getPending: ({
    srcTxHash = '0xsrcTxHash1',
    srcChainId = 42161,
    destChainId = 10,
  } = {}) => ({
    status: 'PENDING' as StatusTypes,
    srcChain: {
      chainId: srcChainId,
      txHash: srcTxHash,
      amount: '991250000000000',
      token: {
        address: '0x0000000000000000000000000000000000000000',
        chainId: srcChainId,
        symbol: 'ETH',
        decimals: 18,
        name: 'ETH',
        coinKey: 'ETH',
        logoURI:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        priceUSD: '2518.47',
        icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
      },
    },
    destChain: {
      chainId: destChainId,
      token: {},
    },
  }),
  getComplete: ({
    srcTxHash = '0xsrcTxHash1',
    destTxHash = '0xdestTxHash1',
    srcChainId = 42161,
    destChainId = 10,
  } = {}) => ({
    status: 'COMPLETE' as StatusTypes,
    isExpectedToken: true,
    bridge: 'across' as BridgeId,
    srcChain: {
      chainId: srcChainId,
      txHash: srcTxHash,
      amount: '991250000000000',
      token: {
        address: '0x0000000000000000000000000000000000000000',
        chainId: srcChainId,
        symbol: 'ETH',
        decimals: 18,
        name: 'ETH',
        coinKey: 'ETH',
        logoURI:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        priceUSD: '2478.7',
        icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
      },
    },
    destChain: {
      chainId: destChainId,
      txHash: destTxHash,
      amount: '990654755978611',
      token: {
        address: '0x0000000000000000000000000000000000000000',
        chainId: destChainId,
        symbol: 'ETH',
        decimals: 18,
        name: 'ETH',
        coinKey: 'ETH',
        logoURI:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        priceUSD: '2478.63',
        icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
      },
    },
  }),
  getFailed: ({
    srcTxHash = '0xsrcTxHash1',
    srcChainId = 42161,
    destChainId = 10,
  } = {}) => ({
    status: 'FAILED' as StatusTypes,
    srcChain: {
      chainId: srcChainId,
      txHash: srcTxHash,
      amount: '991250000000000',
      token: {
        address: '0x0000000000000000000000000000000000000000',
        chainId: srcChainId,
        symbol: 'ETH',
        decimals: 18,
        name: 'ETH',
        coinKey: 'ETH',
        logoURI:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        priceUSD: '2518.47',
        icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
      },
    },
    destChain: {
      chainId: destChainId,
      token: {},
    },
  }),
};

const getMockQuote = ({ srcChainId = 42161, destChainId = 10 } = {}) => ({
  requestId: '197c402f-cb96-4096-9f8c-54aed84ca776',
  srcChainId,
  srcTokenAmount: '991250000000000',
  srcAsset: {
    address: '0x0000000000000000000000000000000000000000',
    assetId: `eip155:${srcChainId}/slip44:60` as CaipAssetType,
    chainId: srcChainId,
    symbol: 'ETH',
    decimals: 18,
    name: 'ETH',
    coinKey: 'ETH',
    logoURI:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
    priceUSD: '2478.7',
    icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
  },
  destChainId,
  destTokenAmount: '990654755978612',
  destAsset: {
    address: '0x0000000000000000000000000000000000000000',
    assetId: `eip155:${destChainId}/slip44:60` as CaipAssetType,
    chainId: destChainId,
    symbol: 'ETH',
    decimals: 18,
    name: 'ETH',
    coinKey: 'ETH',
    logoURI:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
    priceUSD: '2478.63',
    icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
  },
  feeData: {
    metabridge: {
      amount: '8750000000000',
      asset: {
        address: '0x0000000000000000000000000000000000000000',
        assetId: `eip155:${srcChainId}/slip44:60` as CaipAssetType,
        chainId: srcChainId,
        symbol: 'ETH',
        decimals: 18,
        name: 'ETH',
        coinKey: 'ETH',
        logoURI:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        priceUSD: '2478.7',
        icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
      },
    },
  },
  bridgeId: 'lifi',
  bridges: ['across'],
  steps: [
    {
      action: 'bridge' as ActionTypes,
      srcChainId,
      destChainId,
      protocol: {
        name: 'across',
        displayName: 'Across',
        icon: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/bridges/acrossv2.png',
      },
      srcAsset: {
        address: '0x0000000000000000000000000000000000000000',
        assetId: `eip155:${srcChainId}/slip44:60` as CaipAssetType,
        chainId: srcChainId,
        symbol: 'ETH',
        decimals: 18,
        name: 'ETH',
        coinKey: 'ETH',
        logoURI:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        priceUSD: '2478.7',
        icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
      },
      destAsset: {
        address: '0x0000000000000000000000000000000000000000',
        assetId: `eip155:${destChainId}/slip44:60` as CaipAssetType,
        chainId: destChainId,
        symbol: 'ETH',
        decimals: 18,
        name: 'ETH',
        coinKey: 'ETH',
        logoURI:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        priceUSD: '2478.63',
        icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
      },
      srcAmount: '991250000000000',
      destAmount: '990654755978612',
    },
  ],
});

const getMockStartPollingForBridgeTxStatusArgs = ({
  txMetaId = 'bridgeTxMetaId1',
  srcTxHash = '0xsrcTxHash1',
  account = '0xaccount1',
  srcChainId = 42161,
  destChainId = 10,
} = {}): StartPollingForBridgeTxStatusArgsSerialized => ({
  bridgeTxMeta: {
    id: txMetaId,
  } as TransactionMeta,
  statusRequest: {
    bridgeId: 'lifi',
    srcTxHash,
    bridge: 'across',
    srcChainId,
    destChainId,
    quote: getMockQuote({ srcChainId, destChainId }),
    refuel: false,
  },
  quoteResponse: {
    quote: getMockQuote({ srcChainId, destChainId }),
    trade: {
      chainId: srcChainId,
      to: '0x23981fC34e69eeDFE2BD9a0a9fCb0719Fe09DbFC',
      from: account,
      value: '0x038d7ea4c68000',
      data: '0x3ce33bff0000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000038d7ea4c6800000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000d6c6966694164617074657256320000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000e397c4883ec89ed4fc9d258f00c689708b2799c9000000000000000000000000e397c4883ec89ed4fc9d258f00c689708b2799c9000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000038589602234000000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000007f544a44c0000000000000000000000000056ca675c3633cc16bd6849e2b431d4e8de5e23bf000000000000000000000000000000000000000000000000000000000000006c5a39b10a4f4f0747826140d2c5fe6ef47965741f6f7a4734bf784bf3ae3f24520000000a000222266cc2dca0671d2a17ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffd00dfeeddeadbeef8932eb23bad9bddb5cf81426f78279a53c6c3b7100000000000000000000000000000000000000009ce3c510b3f58edc8d53ae708056e30926f62d0b42d5c9b61c391bb4e8a2c1917f8ed995169ffad0d79af2590303e83c57e15a9e0b248679849556c2e03a1c811b',
      gasLimit: 282915,
    },
    approval: null,
    estimatedProcessingTimeInSeconds: 15,
    sentAmount: { amount: '1.234', valueInCurrency: null, usd: null },
    toTokenAmount: { amount: '1.234', valueInCurrency: null, usd: null },
    totalNetworkFee: { amount: '1.234', valueInCurrency: null, usd: null },
    totalMaxNetworkFee: { amount: '1.234', valueInCurrency: null, usd: null },
    gasFee: { amount: '1.234', valueInCurrency: null, usd: null },
    adjustedReturn: { valueInCurrency: null, usd: null },
    swapRate: '1.234',
    cost: { valueInCurrency: null, usd: null },
  },
  startTime: 1729964825189,
  slippagePercentage: 0,
  initialDestAssetBalance: undefined,
  targetContractAddress: '0x23981fC34e69eeDFE2BD9a0a9fCb0719Fe09DbFC',
});

const MockTxHistory = {
  getInitNoSrcTxHash: ({
    txMetaId = 'bridgeTxMetaId1',
    account = '0xaccount1',
    srcChainId = 42161,
    destChainId = 10,
  } = {}): Record<string, BridgeHistoryItem> => ({
    [txMetaId]: {
      txMetaId,
      quote: getMockQuote({ srcChainId, destChainId }),
      startTime: 1729964825189,
      estimatedProcessingTimeInSeconds: 15,
      slippagePercentage: 0,
      account,
      targetContractAddress: '0x23981fC34e69eeDFE2BD9a0a9fCb0719Fe09DbFC',
      initialDestAssetBalance: undefined,
      pricingData: { amountSent: '1.234' },
      status: MockStatusResponse.getPending({
        srcChainId,
      }),
      hasApprovalTx: false,
    },
  }),
  getInit: ({
    txMetaId = 'bridgeTxMetaId1',
    account = '0xaccount1',
    srcChainId = 42161,
    destChainId = 10,
  } = {}): Record<string, BridgeHistoryItem> => ({
    [txMetaId]: {
      txMetaId,
      quote: getMockQuote({ srcChainId, destChainId }),
      startTime: 1729964825189,
      estimatedProcessingTimeInSeconds: 15,
      slippagePercentage: 0,
      account,
      targetContractAddress: '0x23981fC34e69eeDFE2BD9a0a9fCb0719Fe09DbFC',
      initialDestAssetBalance: undefined,
      pricingData: { amountSent: '1.234' },
      status: MockStatusResponse.getPending({
        srcChainId,
      }),
      hasApprovalTx: false,
    },
  }),
  getPending: ({
    txMetaId = 'bridgeTxMetaId1',
    srcTxHash = '0xsrcTxHash1',
    account = '0xaccount1',
    srcChainId = 42161,
    destChainId = 10,
  } = {}): Record<string, BridgeHistoryItem> => ({
    [txMetaId]: {
      txMetaId,
      quote: getMockQuote({ srcChainId, destChainId }),
      startTime: 1729964825189,
      estimatedProcessingTimeInSeconds: 15,
      slippagePercentage: 0,
      account,
      status: MockStatusResponse.getPending({
        srcTxHash,
        srcChainId,
      }),
      targetContractAddress: '0x23981fC34e69eeDFE2BD9a0a9fCb0719Fe09DbFC',
      initialDestAssetBalance: undefined,
      pricingData: {
        amountSent: '1.234',
        amountSentInUsd: undefined,
        quotedGasInUsd: undefined,
        quotedReturnInUsd: undefined,
      },
      hasApprovalTx: false,
      completionTime: undefined,
    },
  }),
  getComplete: ({
    txMetaId = 'bridgeTxMetaId1',
    srcTxHash = '0xsrcTxHash1',
    account = '0xaccount1',
    srcChainId = 42161,
    destChainId = 10,
  } = {}): Record<string, BridgeHistoryItem> => ({
    [txMetaId]: {
      txMetaId,
      quote: getMockQuote({ srcChainId, destChainId }),
      startTime: 1729964825189,
      completionTime: 1736277625746,
      estimatedProcessingTimeInSeconds: 15,
      slippagePercentage: 0,
      account,
      status: MockStatusResponse.getComplete({ srcTxHash }),
      targetContractAddress: '0x23981fC34e69eeDFE2BD9a0a9fCb0719Fe09DbFC',
      initialDestAssetBalance: undefined,
      pricingData: {
        amountSent: '1.234',
        amountSentInUsd: undefined,
        quotedGasInUsd: undefined,
        quotedReturnInUsd: undefined,
      },
      hasApprovalTx: false,
    },
  }),
};

const getMessengerMock = ({
  account = '0xaccount1',
  srcChainId = 42161,
  txHash = '0xsrcTxHash1',
  txMetaId = 'bridgeTxMetaId1',
} = {}) =>
  ({
    call: jest.fn((method: string) => {
      if (method === 'AccountsController:getSelectedMultichainAccount') {
        return { address: account };
      } else if (method === 'NetworkController:findNetworkClientIdByChainId') {
        return 'networkClientId';
      } else if (method === 'NetworkController:getState') {
        return { selectedNetworkClientId: 'networkClientId' };
      } else if (method === 'NetworkController:getNetworkClientById') {
        return {
          configuration: {
            chainId: numberToHex(srcChainId),
          },
        };
      } else if (method === 'TransactionController:getState') {
        return {
          transactions: [
            {
              id: txMetaId,
              hash: txHash,
            },
          ],
        };
      }
      return null;
    }),
    publish: jest.fn(),
    registerActionHandler: jest.fn(),
    registerInitialEventPayload: jest.fn(),
  }) as unknown as jest.Mocked<BridgeStatusControllerMessenger>;

const executePollingWithPendingStatus = async () => {
  // Setup
  jest.useFakeTimers();
  const bridgeStatusController = new BridgeStatusController({
    messenger: getMessengerMock(),
    clientId: BridgeClientId.EXTENSION,
    fetchFn: jest.fn(),
  });
  const startPollingSpy = jest.spyOn(bridgeStatusController, 'startPolling');
  const fetchBridgeTxStatusSpy = jest.spyOn(
    bridgeStatusUtils,
    'fetchBridgeTxStatus',
  );

  // Execution
  bridgeStatusController.startPollingForBridgeTxStatus(
    getMockStartPollingForBridgeTxStatusArgs(),
  );
  fetchBridgeTxStatusSpy.mockImplementationOnce(async () => {
    return MockStatusResponse.getPending();
  });
  jest.advanceTimersByTime(10000);
  await flushPromises();

  return {
    bridgeStatusController,
    startPollingSpy,
    fetchBridgeTxStatusSpy,
  };
};

describe('BridgeStatusController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should setup correctly', () => {
      const bridgeStatusController = new BridgeStatusController({
        messenger: getMessengerMock(),
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
      });
      expect(bridgeStatusController.state).toStrictEqual(EMPTY_INIT_STATE);
    });
    it('rehydrates the tx history state', async () => {
      // Setup
      const bridgeStatusController = new BridgeStatusController({
        messenger: getMessengerMock(),
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
        state: {
          txHistory: MockTxHistory.getPending(),
        },
      });

      // Execution
      bridgeStatusController.startPollingForBridgeTxStatus(
        getMockStartPollingForBridgeTxStatusArgs(),
      );

      // Assertion
      expect(bridgeStatusController.state.txHistory).toMatchSnapshot();
    });
    it('restarts polling for history items that are not complete', async () => {
      // Setup
      jest.useFakeTimers();
      const fetchBridgeTxStatusSpy = jest.spyOn(
        bridgeStatusUtils,
        'fetchBridgeTxStatus',
      );

      // Execution
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const bridgeStatusController = new BridgeStatusController({
        messenger: getMessengerMock(),
        state: {
          txHistory: MockTxHistory.getPending(),
        },
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
      });
      jest.advanceTimersByTime(10000);
      await flushPromises();

      // Assertions
      expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(1);
    });
  });
  describe('startPollingForBridgeTxStatus', () => {
    it('sets the inital tx history state', async () => {
      // Setup
      const bridgeStatusController = new BridgeStatusController({
        messenger: getMessengerMock(),
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
      });

      // Execution
      bridgeStatusController.startPollingForBridgeTxStatus(
        getMockStartPollingForBridgeTxStatusArgs(),
      );

      // Assertion
      expect(bridgeStatusController.state.txHistory).toMatchSnapshot();
    });
    it('starts polling and updates the tx history when the status response is received', async () => {
      const {
        bridgeStatusController,
        startPollingSpy,
        fetchBridgeTxStatusSpy,
      } = await executePollingWithPendingStatus();

      // Assertions
      expect(startPollingSpy).toHaveBeenCalledTimes(1);
      expect(fetchBridgeTxStatusSpy).toHaveBeenCalled();
      expect(bridgeStatusController.state.txHistory).toStrictEqual(
        MockTxHistory.getPending(),
      );
    });
    it('stops polling when the status response is complete', async () => {
      // Setup
      jest.useFakeTimers();
      jest.spyOn(Date, 'now').mockImplementation(() => {
        return MockTxHistory.getComplete().bridgeTxMetaId1.completionTime ?? 10;
      });
      const bridgeStatusController = new BridgeStatusController({
        messenger: getMessengerMock(),
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
      });
      const fetchBridgeTxStatusSpy = jest.spyOn(
        bridgeStatusUtils,
        'fetchBridgeTxStatus',
      );
      const stopPollingByNetworkClientIdSpy = jest.spyOn(
        bridgeStatusController,
        'stopPollingByPollingToken',
      );

      // Execution
      bridgeStatusController.startPollingForBridgeTxStatus(
        getMockStartPollingForBridgeTxStatusArgs(),
      );
      fetchBridgeTxStatusSpy.mockImplementationOnce(async () => {
        return MockStatusResponse.getComplete();
      });
      jest.advanceTimersByTime(10000);
      await flushPromises();

      // Assertions
      expect(stopPollingByNetworkClientIdSpy).toHaveBeenCalledTimes(1);
      expect(bridgeStatusController.state.txHistory).toStrictEqual(
        MockTxHistory.getComplete(),
      );

      // Cleanup
      jest.restoreAllMocks();
    });
    it('does not poll if the srcTxHash is not available', async () => {
      // Setup
      jest.useFakeTimers();

      const messengerMock = {
        call: jest.fn((method: string) => {
          if (method === 'AccountsController:getSelectedMultichainAccount') {
            return { address: '0xaccount1' };
          } else if (
            method === 'NetworkController:findNetworkClientIdByChainId'
          ) {
            return 'networkClientId';
          } else if (method === 'NetworkController:getState') {
            return { selectedNetworkClientId: 'networkClientId' };
          } else if (method === 'NetworkController:getNetworkClientById') {
            return {
              configuration: {
                chainId: numberToHex(42161),
              },
            };
          } else if (method === 'TransactionController:getState') {
            return {
              transactions: [
                {
                  id: 'bridgeTxMetaId1',
                  hash: undefined,
                },
              ],
            };
          }
          return null;
        }),
        publish: jest.fn(),
        registerActionHandler: jest.fn(),
        registerInitialEventPayload: jest.fn(),
      } as unknown as jest.Mocked<BridgeStatusControllerMessenger>;

      const bridgeStatusController = new BridgeStatusController({
        messenger: messengerMock,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
      });
      const fetchBridgeTxStatusSpy = jest.spyOn(
        bridgeStatusUtils,
        'fetchBridgeTxStatus',
      );

      // Start polling with args that have no srcTxHash
      const startPollingArgs = getMockStartPollingForBridgeTxStatusArgs();
      startPollingArgs.statusRequest.srcTxHash = undefined;
      bridgeStatusController.startPollingForBridgeTxStatus(startPollingArgs);

      // Advance timer to trigger polling
      jest.advanceTimersByTime(10000);
      await flushPromises();

      // Assertions
      expect(fetchBridgeTxStatusSpy).not.toHaveBeenCalled();
      expect(bridgeStatusController.state.txHistory).toHaveProperty(
        'bridgeTxMetaId1',
      );
      expect(
        bridgeStatusController.state.txHistory.bridgeTxMetaId1.status.srcChain
          .txHash,
      ).toBeUndefined();

      // Cleanup
      jest.restoreAllMocks();
    });
    it('emits bridgeTransactionComplete event when the status response is complete', async () => {
      // Setup
      jest.useFakeTimers();
      jest.spyOn(Date, 'now').mockImplementation(() => {
        return MockTxHistory.getComplete().bridgeTxMetaId1.completionTime ?? 10;
      });

      const messengerMock = getMessengerMock();
      const bridgeStatusController = new BridgeStatusController({
        messenger: messengerMock,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
      });

      const fetchBridgeTxStatusSpy = jest
        .spyOn(bridgeStatusUtils, 'fetchBridgeTxStatus')
        .mockImplementationOnce(async () => {
          return MockStatusResponse.getComplete();
        });

      // Execution
      bridgeStatusController.startPollingForBridgeTxStatus(
        getMockStartPollingForBridgeTxStatusArgs(),
      );
      jest.advanceTimersByTime(10000);
      await flushPromises();

      // Assertions
      expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(1);
      expect(messengerMock.publish).toHaveBeenCalledWith(
        'BridgeStatusController:bridgeTransactionComplete',
        {
          bridgeHistoryItem: expect.objectContaining({
            txMetaId: 'bridgeTxMetaId1',
            status: expect.objectContaining({
              status: 'COMPLETE',
            }),
          }),
        },
      );

      // Cleanup
      jest.restoreAllMocks();
    });
    it('emits bridgeTransactionFailed event when the status response is failed', async () => {
      // Setup
      jest.useFakeTimers();
      jest.spyOn(Date, 'now').mockImplementation(() => {
        return MockTxHistory.getComplete().bridgeTxMetaId1.completionTime ?? 10;
      });

      const messengerMock = getMessengerMock();
      const bridgeStatusController = new BridgeStatusController({
        messenger: messengerMock,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
      });

      const fetchBridgeTxStatusSpy = jest
        .spyOn(bridgeStatusUtils, 'fetchBridgeTxStatus')
        .mockImplementationOnce(async () => {
          return MockStatusResponse.getFailed();
        });

      // Execution
      bridgeStatusController.startPollingForBridgeTxStatus(
        getMockStartPollingForBridgeTxStatusArgs(),
      );
      jest.advanceTimersByTime(10000);
      await flushPromises();

      // Assertions
      expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(1);
      expect(messengerMock.publish).toHaveBeenCalledWith(
        'BridgeStatusController:bridgeTransactionFailed',
        {
          bridgeHistoryItem: expect.objectContaining({
            txMetaId: 'bridgeTxMetaId1',
            status: expect.objectContaining({
              status: 'FAILED',
            }),
          }),
        },
      );

      // Cleanup
      jest.restoreAllMocks();
    });
    it('updates the srcTxHash when one is available', async () => {
      // Setup
      jest.useFakeTimers();
      let getStateCallCount = 0;

      const messengerMock = {
        call: jest.fn((method: string) => {
          if (method === 'AccountsController:getSelectedMultichainAccount') {
            return { address: '0xaccount1' };
          } else if (
            method === 'NetworkController:findNetworkClientIdByChainId'
          ) {
            return 'networkClientId';
          } else if (method === 'NetworkController:getState') {
            return { selectedNetworkClientId: 'networkClientId' };
          } else if (method === 'NetworkController:getNetworkClientById') {
            return {
              configuration: {
                chainId: numberToHex(42161),
              },
            };
          } else if (method === 'TransactionController:getState') {
            getStateCallCount += 1;
            return {
              transactions: [
                {
                  id: 'bridgeTxMetaId1',
                  hash: getStateCallCount === 0 ? undefined : '0xnewTxHash',
                },
              ],
            };
          }
          return null;
        }),
        publish: jest.fn(),
        registerActionHandler: jest.fn(),
        registerInitialEventPayload: jest.fn(),
      } as unknown as jest.Mocked<BridgeStatusControllerMessenger>;

      const bridgeStatusController = new BridgeStatusController({
        messenger: messengerMock,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
      });

      // Start polling with no srcTxHash
      const startPollingArgs = getMockStartPollingForBridgeTxStatusArgs();
      startPollingArgs.statusRequest.srcTxHash = undefined;
      bridgeStatusController.startPollingForBridgeTxStatus(startPollingArgs);

      // Verify initial state has no srcTxHash
      expect(
        bridgeStatusController.state.txHistory.bridgeTxMetaId1.status.srcChain
          .txHash,
      ).toBeUndefined();

      // Advance timer to trigger polling with new hash
      jest.advanceTimersByTime(10000);
      await flushPromises();

      // Verify the srcTxHash was updated
      expect(
        bridgeStatusController.state.txHistory.bridgeTxMetaId1.status.srcChain
          .txHash,
      ).toBe('0xnewTxHash');

      // Cleanup
      jest.restoreAllMocks();
    });
  });
  describe('resetState', () => {
    it('resets the state', async () => {
      const { bridgeStatusController } =
        await executePollingWithPendingStatus();

      expect(bridgeStatusController.state.txHistory).toStrictEqual(
        MockTxHistory.getPending(),
      );
      bridgeStatusController.resetState();
      expect(bridgeStatusController.state.txHistory).toStrictEqual(
        EMPTY_INIT_STATE.txHistory,
      );
    });
  });
  describe('wipeBridgeStatus', () => {
    it('wipes the bridge status for the given address', async () => {
      // Setup
      jest.useFakeTimers();

      let getSelectedMultichainAccountCalledTimes = 0;
      const messengerMock = {
        call: jest.fn((method: string) => {
          if (method === 'AccountsController:getSelectedMultichainAccount') {
            let account;

            if (getSelectedMultichainAccountCalledTimes === 0) {
              account = '0xaccount1';
            } else {
              account = '0xaccount2';
            }
            getSelectedMultichainAccountCalledTimes += 1;
            return { address: account };
          } else if (
            method === 'NetworkController:findNetworkClientIdByChainId'
          ) {
            return 'networkClientId';
          } else if (method === 'NetworkController:getState') {
            return { selectedNetworkClientId: 'networkClientId' };
          } else if (method === 'NetworkController:getNetworkClientById') {
            return {
              configuration: {
                chainId: numberToHex(42161),
              },
            };
          }
          return null;
        }),
        publish: jest.fn(),
        registerActionHandler: jest.fn(),
        registerInitialEventPayload: jest.fn(),
      } as unknown as jest.Mocked<BridgeStatusControllerMessenger>;
      const bridgeStatusController = new BridgeStatusController({
        messenger: messengerMock,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
      });
      const fetchBridgeTxStatusSpy = jest
        .spyOn(bridgeStatusUtils, 'fetchBridgeTxStatus')
        .mockImplementationOnce(async () => {
          return MockStatusResponse.getComplete();
        })
        .mockImplementationOnce(async () => {
          return MockStatusResponse.getComplete({
            srcTxHash: '0xsrcTxHash2',
            destTxHash: '0xdestTxHash2',
          });
        });

      // Start polling for 0xaccount1
      bridgeStatusController.startPollingForBridgeTxStatus(
        getMockStartPollingForBridgeTxStatusArgs(),
      );
      jest.advanceTimersByTime(10_000);
      expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(1);

      // Start polling for 0xaccount2
      bridgeStatusController.startPollingForBridgeTxStatus(
        getMockStartPollingForBridgeTxStatusArgs({
          txMetaId: 'bridgeTxMetaId2',
          srcTxHash: '0xsrcTxHash2',
          account: '0xaccount2',
        }),
      );
      jest.advanceTimersByTime(10_000);
      expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(2);

      // Check that both accounts have a tx history entry
      expect(bridgeStatusController.state.txHistory).toHaveProperty(
        'bridgeTxMetaId1',
      );
      expect(bridgeStatusController.state.txHistory).toHaveProperty(
        'bridgeTxMetaId2',
      );

      // Wipe the status for 1 account only
      bridgeStatusController.wipeBridgeStatus({
        address: '0xaccount1',
        ignoreNetwork: false,
      });

      // Assertions
      const txHistoryItems = Object.values(
        bridgeStatusController.state.txHistory,
      );
      expect(txHistoryItems).toHaveLength(1);
      expect(txHistoryItems[0].account).toBe('0xaccount2');
    });
    it('wipes the bridge status for all networks if ignoreNetwork is true', () => {
      // Setup
      jest.useFakeTimers();
      const messengerMock = {
        call: jest.fn((method: string) => {
          if (method === 'AccountsController:getSelectedMultichainAccount') {
            return { address: '0xaccount1' };
          } else if (
            method === 'NetworkController:findNetworkClientIdByChainId'
          ) {
            return 'networkClientId';
          } else if (method === 'NetworkController:getState') {
            return { selectedNetworkClientId: 'networkClientId' };
          } else if (method === 'NetworkController:getNetworkClientById') {
            return {
              configuration: {
                chainId: numberToHex(42161),
              },
            };
          }
          return null;
        }),
        publish: jest.fn(),
        registerActionHandler: jest.fn(),
        registerInitialEventPayload: jest.fn(),
      } as unknown as jest.Mocked<BridgeStatusControllerMessenger>;
      const bridgeStatusController = new BridgeStatusController({
        messenger: messengerMock,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
      });
      const fetchBridgeTxStatusSpy = jest
        .spyOn(bridgeStatusUtils, 'fetchBridgeTxStatus')
        .mockImplementationOnce(async () => {
          return MockStatusResponse.getComplete();
        })
        .mockImplementationOnce(async () => {
          return MockStatusResponse.getComplete({
            srcTxHash: '0xsrcTxHash2',
          });
        });

      // Start polling for chainId 42161 to chainId 1
      bridgeStatusController.startPollingForBridgeTxStatus(
        getMockStartPollingForBridgeTxStatusArgs({
          account: '0xaccount1',
          srcTxHash: '0xsrcTxHash1',
          txMetaId: 'bridgeTxMetaId1',
          srcChainId: 42161,
          destChainId: 1,
        }),
      );
      jest.advanceTimersByTime(10_000);
      expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(1);

      // Start polling for chainId 10 to chainId 123
      bridgeStatusController.startPollingForBridgeTxStatus(
        getMockStartPollingForBridgeTxStatusArgs({
          account: '0xaccount1',
          srcTxHash: '0xsrcTxHash2',
          txMetaId: 'bridgeTxMetaId2',
          srcChainId: 10,
          destChainId: 123,
        }),
      );
      jest.advanceTimersByTime(10_000);
      expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(2);

      // Check we have a tx history entry for each chainId
      expect(
        bridgeStatusController.state.txHistory.bridgeTxMetaId1.quote.srcChainId,
      ).toBe(42161);
      expect(
        bridgeStatusController.state.txHistory.bridgeTxMetaId1.quote
          .destChainId,
      ).toBe(1);

      expect(
        bridgeStatusController.state.txHistory.bridgeTxMetaId2.quote.srcChainId,
      ).toBe(10);
      expect(
        bridgeStatusController.state.txHistory.bridgeTxMetaId2.quote
          .destChainId,
      ).toBe(123);

      bridgeStatusController.wipeBridgeStatus({
        address: '0xaccount1',
        ignoreNetwork: true,
      });

      // Assertions
      const txHistoryItems = Object.values(
        bridgeStatusController.state.txHistory,
      );
      expect(txHistoryItems).toHaveLength(0);
    });
    it('wipes the bridge status only for the current network if ignoreNetwork is false', () => {
      // Setup
      jest.useFakeTimers();
      const messengerMock = {
        call: jest.fn((method: string) => {
          if (method === 'AccountsController:getSelectedMultichainAccount') {
            return { address: '0xaccount1' };
          } else if (
            method === 'NetworkController:findNetworkClientIdByChainId'
          ) {
            return 'networkClientId';
          } else if (method === 'NetworkController:getState') {
            return { selectedNetworkClientId: 'networkClientId' };
          } else if (method === 'NetworkController:getNetworkClientById') {
            return {
              configuration: {
                // This is what controls the selectedNetwork and what gets wiped in this test
                chainId: numberToHex(42161),
              },
            };
          }
          return null;
        }),
        publish: jest.fn(),
        registerActionHandler: jest.fn(),
        registerInitialEventPayload: jest.fn(),
      } as unknown as jest.Mocked<BridgeStatusControllerMessenger>;
      const bridgeStatusController = new BridgeStatusController({
        messenger: messengerMock,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
      });
      const fetchBridgeTxStatusSpy = jest
        .spyOn(bridgeStatusUtils, 'fetchBridgeTxStatus')
        .mockImplementationOnce(async () => {
          return MockStatusResponse.getComplete();
        })
        .mockImplementationOnce(async () => {
          return MockStatusResponse.getComplete({
            srcTxHash: '0xsrcTxHash2',
          });
        });

      // Start polling for chainId 42161 to chainId 1
      bridgeStatusController.startPollingForBridgeTxStatus(
        getMockStartPollingForBridgeTxStatusArgs({
          account: '0xaccount1',
          srcTxHash: '0xsrcTxHash1',
          txMetaId: 'bridgeTxMetaId1',
          srcChainId: 42161,
          destChainId: 1,
        }),
      );
      jest.advanceTimersByTime(10_000);
      expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(1);

      // Start polling for chainId 10 to chainId 123
      bridgeStatusController.startPollingForBridgeTxStatus(
        getMockStartPollingForBridgeTxStatusArgs({
          account: '0xaccount1',
          srcTxHash: '0xsrcTxHash2',
          txMetaId: 'bridgeTxMetaId2',
          srcChainId: 10,
          destChainId: 123,
        }),
      );
      jest.advanceTimersByTime(10_000);
      expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(2);

      // Check we have a tx history entry for each chainId
      expect(
        bridgeStatusController.state.txHistory.bridgeTxMetaId1.quote.srcChainId,
      ).toBe(42161);
      expect(
        bridgeStatusController.state.txHistory.bridgeTxMetaId1.quote
          .destChainId,
      ).toBe(1);

      expect(
        bridgeStatusController.state.txHistory.bridgeTxMetaId2.quote.srcChainId,
      ).toBe(10);
      expect(
        bridgeStatusController.state.txHistory.bridgeTxMetaId2.quote
          .destChainId,
      ).toBe(123);

      bridgeStatusController.wipeBridgeStatus({
        address: '0xaccount1',
        ignoreNetwork: false,
      });

      // Assertions
      const txHistoryItems = Object.values(
        bridgeStatusController.state.txHistory,
      );
      expect(txHistoryItems).toHaveLength(1);
      expect(txHistoryItems[0].quote.srcChainId).toBe(10);
      expect(txHistoryItems[0].quote.destChainId).toBe(123);
    });
  });
});
