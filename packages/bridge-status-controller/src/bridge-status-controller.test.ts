/* eslint-disable jest/no-conditional-in-test */
/* eslint-disable jest/no-restricted-matchers */
import {
  type QuoteResponse,
  type QuoteMetadata,
  StatusTypes,
} from '@metamask/bridge-controller';
import { ChainId } from '@metamask/bridge-controller';
import { ActionTypes, FeeType } from '@metamask/bridge-controller';
import { EthAccountType } from '@metamask/keyring-api';
import { TransactionType } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { CaipAssetType } from '@metamask/utils';
import { numberToHex } from '@metamask/utils';

import { BridgeStatusController } from './bridge-status-controller';
import { DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE } from './constants';
import {
  type BridgeId,
  type StartPollingForBridgeTxStatusArgsSerialized,
  type BridgeHistoryItem,
  type BridgeStatusControllerState,
  type BridgeStatusControllerMessenger,
  BridgeClientId,
} from './types';
import * as bridgeStatusUtils from './utils/bridge-status';
import * as transactionUtils from './utils/transaction';
import { flushPromises } from '../../../tests/helpers';

jest.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

const mockIsEthUsdt = jest.fn();
jest.mock('@metamask/bridge-controller', () => ({
  ...jest.requireActual('@metamask/bridge-controller'),
  isEthUsdt: () => mockIsEthUsdt(),
}));

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
  isStxEnabled = false,
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
  isStxEnabled,
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
      approvalTxId: undefined,
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
      approvalTxId: undefined,
      isStxEnabled: false,
      hasApprovalTx: false,
      completionTime: undefined,
    },
  }),
  getUnknown: ({
    txMetaId = 'bridgeTxMetaId2',
    srcTxHash = '0xsrcTxHash2',
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
      status: {
        status: StatusTypes.UNKNOWN,
        srcChain: {
          chainId: srcChainId,
          txHash: srcTxHash,
        },
      },
      targetContractAddress: '0x23981fC34e69eeDFE2BD9a0a9fCb0719Fe09DbFC',
      initialDestAssetBalance: undefined,
      pricingData: {
        amountSent: '1.234',
        amountSentInUsd: undefined,
        quotedGasInUsd: undefined,
        quotedReturnInUsd: undefined,
      },
      approvalTxId: undefined,
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
      approvalTxId: undefined,
      isStxEnabled: true,
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
        return {
          address: account,
          metadata: { snap: { id: 'snapId' } },
          options: { scope: 'scope' },
        };
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
  const fetchBridgeTxStatusSpy = jest.spyOn(
    bridgeStatusUtils,
    'fetchBridgeTxStatus',
  );
  const bridgeStatusController = new BridgeStatusController({
    messenger: getMessengerMock(),
    clientId: BridgeClientId.EXTENSION,
    fetchFn: jest.fn(),
    addTransactionFn: jest.fn(),
    estimateGasFeeFn: jest.fn(),
    addUserOperationFromTransactionFn: jest.fn(),
    config: {},
  });
  const startPollingSpy = jest.spyOn(bridgeStatusController, 'startPolling');

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

// Define mocks at the top level
const mockFetchFn = jest.fn();
const mockMessengerCall = jest.fn();
const mockSelectedAccount = {
  id: 'test-account-id',
  address: '0xaccount1',
  type: 'eth',
  metadata: {
    keyring: {
      type: ['any'],
    },
  },
};

const addTransactionFn = jest.fn();
const estimateGasFeeFn = jest.fn();
const addUserOperationFromTransactionFn = jest.fn();

const getController = (call: jest.Mock, traceFn?: jest.Mock) => {
  const controller = new BridgeStatusController({
    messenger: {
      call,
      publish: jest.fn(),
      registerActionHandler: jest.fn(),
      registerInitialEventPayload: jest.fn(),
    } as never,
    clientId: BridgeClientId.EXTENSION,
    fetchFn: mockFetchFn,
    addTransactionFn,
    estimateGasFeeFn,
    addUserOperationFromTransactionFn,
    traceFn,
  });

  jest.spyOn(controller, 'startPolling').mockImplementation(jest.fn());
  const startPollingForBridgeTxStatusFn =
    controller.startPollingForBridgeTxStatus;
  const startPollingForBridgeTxStatusSpy = jest
    .spyOn(controller, 'startPollingForBridgeTxStatus')
    .mockImplementationOnce((...args) =>
      startPollingForBridgeTxStatusFn(...args),
    );
  return { controller, startPollingForBridgeTxStatusSpy };
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
        addTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
        addUserOperationFromTransactionFn: jest.fn(),
      });
      expect(bridgeStatusController.state).toStrictEqual(EMPTY_INIT_STATE);
    });
    it('rehydrates the tx history state', async () => {
      // Setup
      const bridgeStatusController = new BridgeStatusController({
        messenger: getMessengerMock(),
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
        addTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
        addUserOperationFromTransactionFn: jest.fn(),
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
          txHistory: {
            ...MockTxHistory.getPending(),
            ...MockTxHistory.getUnknown(),
          },
        },
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
        addTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
      });
      jest.advanceTimersByTime(10000);
      await flushPromises();

      // Assertions
      expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('startPollingForBridgeTxStatus', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('sets the inital tx history state', async () => {
      // Setup
      const bridgeStatusController = new BridgeStatusController({
        messenger: getMessengerMock(),
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
        addTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
        addUserOperationFromTransactionFn: jest.fn(),
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
      const messengerMock = getMessengerMock();
      const bridgeStatusController = new BridgeStatusController({
        messenger: messengerMock,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
        addTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
        addUserOperationFromTransactionFn: jest.fn(),
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
        getMockStartPollingForBridgeTxStatusArgs({
          isStxEnabled: true,
        }),
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

      expect(messengerMock.call.mock.calls).toMatchSnapshot();
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

      const fetchBridgeTxStatusSpy = jest.spyOn(
        bridgeStatusUtils,
        'fetchBridgeTxStatus',
      );
      const bridgeStatusController = new BridgeStatusController({
        messenger: messengerMock,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
        addTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
        addUserOperationFromTransactionFn: jest.fn(),
      });

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
        addTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
        addUserOperationFromTransactionFn: jest.fn(),
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
      const fetchBridgeTxStatusSpy = jest
        .spyOn(bridgeStatusUtils, 'fetchBridgeTxStatus')
        .mockImplementationOnce(async () => {
          return MockStatusResponse.getFailed();
        });
      const bridgeStatusController = new BridgeStatusController({
        messenger: messengerMock,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
        addTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
        addUserOperationFromTransactionFn: jest.fn(),
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
      expect(messengerMock.call.mock.calls).toMatchSnapshot();

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
        addTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
        addUserOperationFromTransactionFn: jest.fn(),
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
        addTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
        addUserOperationFromTransactionFn: jest.fn(),
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
      expect(messengerMock.call.mock.calls).toMatchSnapshot();
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
        addTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
        addUserOperationFromTransactionFn: jest.fn(),
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
        addTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
        addUserOperationFromTransactionFn: jest.fn(),
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

  describe('submitTx: Solana', () => {
    const mockQuoteResponse: QuoteResponse<string> & QuoteMetadata = {
      quote: {
        requestId: '123',
        srcChainId: ChainId.SOLANA,
        destChainId: ChainId.ETH,
        srcTokenAmount: '1000000000',
        srcAsset: {
          chainId: ChainId.SOLANA,
          address: 'native',
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9,
          assetId: 'eip155:1399811149/slip44:501',
        },
        destTokenAmount: '0.5',
        destAsset: {
          chainId: ChainId.ETH,
          address: '0x...',
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          assetId: 'eip155:1/slip44:60',
        },
        bridgeId: 'test-bridge',
        bridges: ['test-bridge'],
        steps: [
          {
            action: ActionTypes.BRIDGE,
            srcChainId: ChainId.SOLANA,
            destChainId: ChainId.ETH,
            srcAsset: {
              chainId: ChainId.SOLANA,
              address: 'native',
              symbol: 'SOL',
              name: 'Solana',
              decimals: 9,
              assetId: 'eip155:1399811149/slip44:501',
            },
            destAsset: {
              chainId: ChainId.ETH,
              address: '0x...',
              symbol: 'ETH',
              name: 'Ethereum',
              decimals: 18,
              assetId: 'eip155:1/slip44:60',
            },
            srcAmount: '1000000000',
            destAmount: '0.5',
            protocol: {
              name: 'test-protocol',
              displayName: 'Test Protocol',
              icon: 'test-icon',
            },
          },
        ],
        feeData: {
          [FeeType.METABRIDGE]: {
            amount: '1000000',
            asset: {
              chainId: ChainId.SOLANA,
              address: 'native',
              symbol: 'SOL',
              name: 'Solana',
              decimals: 9,
              assetId: 'eip155:1399811149/slip44:501',
            },
          },
        },
      },
      estimatedProcessingTimeInSeconds: 300,
      trade:
        'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAHDXLY8oVRIwA8ZdRSGjM5RIZJW8Wv+Twyw3NqU4Hov+OHoHp/dmeDvstKbICW3ezeGR69t3/PTAvdXgZVdJFJXaxkoKXUTWfEAyQyCCG9nwVoDsd10OFdnM9ldSi+9SLqHpqWVDV+zzkmftkF//DpbXxqeH8obNXHFR7pUlxG9uNVOn64oNsFdeUvD139j1M51iRmUY839Y25ET4jDRscT081oGb+rLnywLjLSrIQx6MkqNBhCFbxqY1YmoGZVORW/QMGRm/lIRcy/+ytunLDm+e8jOW7xfcSayxDmzpAAAAAjJclj04kifG7PRApFI4NgwtaE5na/xCEBI572Nvp+FkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbd9uHXZaGT2cvhRs7reawctIXtX1s3kTqM9YV+/wCpBHnVW/IxwG7udMVuzmgVB/2xst6j9I5RArHNola8E4+0P/on9df2SnTAmx8pWHneSwmrNt/J3VFLMhqns4zl6JmXkZ+niuxMhAGrmKBaBo94uMv2Sl+Xh3i+VOO0m5BdNZ1ElenbwQylHQY+VW1ydG1MaUEeNpG+EVgswzPMwPoLBgAFAsBcFQAGAAkDQA0DAAAAAAAHBgABAhMICQAHBgADABYICQEBCAIAAwwCAAAAUEYVOwAAAAAJAQMBEQoUCQADBAETCgsKFw0ODxARAwQACRQj5RfLl3rjrSoBAAAAQ2QAAVBGFTsAAAAAyYZnBwAAAABkAAAJAwMAAAEJDAkAAAIBBBMVCQjGASBMKQwnooTbKNxdBwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUHTKomh4KXvNgA0ovYKS5F8GIOBgAAAAAAAAAAAAAAAAAQgAAAAAAAAAAAAAAAAAAAAAAAEIF7RFOAwAAAAAAAAAAAAAAaAIAAAAAAAC4CwAAAAAAAOAA2mcAAAAAAAAAAAAAAAAAAAAApapuIXG0FuHSfsU8qME9s/kaic0AAwGCsZdSuxV5eCm+Ria4LEQPgTg4bg65gNrTAefEzpAfPQgCABIMAgAAAAAAAAAAAAAACAIABQwCAAAAsIOFAAAAAAADWk6DVOZO8lMFQg2r0dgfltD6tRL/B1hH3u00UzZdgqkAAxEqIPdq2eRt/F6mHNmFe7iwZpdrtGmHNJMFlK7c6Bc6k6kjBezr6u/tAgvu3OGsJSwSElmcOHZ21imqH/rhJ2KgqDJdBPFH4SYIM1kBAAA=',
      sentAmount: {
        amount: '1',
        valueInCurrency: '100',
        usd: '100',
      },
      toTokenAmount: {
        amount: '0.5',
        valueInCurrency: '1000',
        usd: '1000',
      },
      totalNetworkFee: {
        amount: '0.1',
        valueInCurrency: '10',
        usd: '10',
      },
      totalMaxNetworkFee: {
        amount: '0.15',
        valueInCurrency: '15',
        usd: '15',
      },
      gasFee: {
        amount: '0.05',
        valueInCurrency: '5',
        usd: '5',
      },
      adjustedReturn: {
        valueInCurrency: '985',
        usd: '985',
      },
      cost: {
        valueInCurrency: '15',
        usd: '15',
      },
      swapRate: '0.5',
    };

    const mockSolanaAccount = {
      address: '0x123...',
      metadata: {
        snap: {
          id: 'test-snap',
        },
      },
      options: { scope: 'solana-chain-id' },
    };

    beforeEach(() => {
      jest.clearAllMocks();
      jest.spyOn(Date, 'now').mockReturnValue(1234567890);
    });

    it('should successfully submit a Solana transaction', async () => {
      mockMessengerCall.mockReturnValueOnce(mockSolanaAccount);
      mockMessengerCall.mockResolvedValueOnce('signature');

      mockMessengerCall.mockReturnValueOnce(mockSolanaAccount);
      mockMessengerCall.mockReturnValueOnce(mockSolanaAccount);

      mockMessengerCall.mockResolvedValueOnce('tokens');
      mockMessengerCall.mockResolvedValueOnce('tokens');

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const result = await controller.submitTx(mockQuoteResponse, false);
      controller.stopAllPolling();

      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(1);
      expect(
        startPollingForBridgeTxStatusSpy.mock.lastCall[0],
      ).toMatchSnapshot();
    });

    it('should throw error when snap ID is missing', async () => {
      const accountWithoutSnap = {
        ...mockSelectedAccount,
        metadata: { snap: undefined },
      };
      mockMessengerCall.mockReturnValueOnce(accountWithoutSnap);

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);

      await expect(
        controller.submitTx(mockQuoteResponse, false),
      ).rejects.toThrow(
        'Failed to submit cross-chain swap transaction: undefined snap id',
      );
      expect(startPollingForBridgeTxStatusSpy).not.toHaveBeenCalled();
    });

    it('should throw error when account is missing', async () => {
      mockMessengerCall.mockReturnValueOnce(undefined);

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);

      await expect(
        controller.submitTx(mockQuoteResponse, false),
      ).rejects.toThrow(
        'Failed to submit cross-chain swap transaction: undefined multichain account',
      );
      expect(startPollingForBridgeTxStatusSpy).not.toHaveBeenCalled();
    });

    it('should handle snap controller errors', async () => {
      mockMessengerCall.mockReturnValueOnce(mockSolanaAccount);
      mockMessengerCall.mockRejectedValueOnce(new Error('Snap error'));

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);

      await expect(
        controller.submitTx(mockQuoteResponse, false),
      ).rejects.toThrow('Snap error');
      expect(startPollingForBridgeTxStatusSpy).not.toHaveBeenCalled();
    });

    it('should throw error when txMeta is undefined', async () => {
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockResolvedValueOnce('0xabc...');

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);

      await expect(
        controller.submitTx(
          {
            ...mockQuoteResponse,
            trade: {} as never,
          },
          false,
        ),
      ).rejects.toThrow('Failed to submit bridge tx: txMeta is undefined');
      expect(startPollingForBridgeTxStatusSpy).not.toHaveBeenCalled();
    });
  });

  describe('submitTx: EVM', () => {
    const mockEvmQuoteResponse = {
      ...getMockQuote(),
      quote: {
        ...getMockQuote(),
        srcChainId: 42161, // Arbitrum
        destChainId: 10, // Optimism
      },
      estimatedProcessingTimeInSeconds: 15,
      sentAmount: { amount: '1.234', valueInCurrency: null, usd: null },
      toTokenAmount: { amount: '1.234', valueInCurrency: null, usd: null },
      totalNetworkFee: { amount: '1.234', valueInCurrency: null, usd: null },
      totalMaxNetworkFee: { amount: '1.234', valueInCurrency: null, usd: null },
      gasFee: { amount: '1.234', valueInCurrency: null, usd: null },
      adjustedReturn: { valueInCurrency: null, usd: null },
      swapRate: '1.234',
      cost: { valueInCurrency: null, usd: null },
      trade: {
        from: '0xaccount1',
        to: '0xbridgeContract',
        value: '0x0',
        data: '0xdata',
        chainId: 42161,
        gasLimit: 21000,
      },
      approval: {
        from: '0xaccount1',
        to: '0xtokenContract',
        value: '0x0',
        data: '0xapprovalData',
        chainId: 42161,
        gasLimit: 21000,
      },
    } as QuoteResponse & QuoteMetadata;

    const mockEvmTxMeta = {
      id: 'test-tx-id',
      hash: '0xevmTxHash',
      time: 1234567890,
      status: 'unapproved',
      type: TransactionType.bridge,
      chainId: '0xa4b1', // 42161 in hex
      txParams: {
        from: '0xaccount1',
        to: '0xbridgeContract',
        value: '0x0',
        data: '0xdata',
        chainId: '0xa4b1',
        gasLimit: '0x5208',
      },
    };

    const mockApprovalTxMeta = {
      id: 'test-approval-tx-id',
      hash: '0xapprovalTxHash',
      time: 1234567890,
      status: 'unapproved',
      type: TransactionType.bridgeApproval,
      chainId: '0xa4b1', // 42161 in hex
      txParams: {
        from: '0xaccount1',
        to: '0xtokenContract',
        value: '0x0',
        data: '0xapprovalData',
        chainId: '0xa4b1',
        gasLimit: '0x5208',
      },
    };

    const mockEstimateGasFeeResult = {
      estimates: {
        high: {
          suggestedMaxFeePerGas: '0x1234',
          suggestedMaxPriorityFeePerGas: '0x5678',
        },
      },
    };

    beforeEach(() => {
      jest.clearAllMocks();
      jest.spyOn(Date, 'now').mockReturnValue(1234567890);
      jest.spyOn(Math, 'random').mockReturnValue(0.456);
    });

    const setupApprovalMocks = () => {
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arbitrum-client-id');
      mockMessengerCall.mockReturnValueOnce({
        gasFeeEstimates: { estimatedBaseFee: '0x1234' },
      });
      estimateGasFeeFn.mockResolvedValueOnce(mockEstimateGasFeeResult);
      addTransactionFn.mockResolvedValueOnce({
        transactionMeta: mockApprovalTxMeta,
        result: Promise.resolve('0xapprovalTxHash'),
      });
      mockMessengerCall.mockReturnValueOnce({
        transactions: [mockApprovalTxMeta],
      });
    };

    const setupBridgeMocks = () => {
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arbitrum');
      mockMessengerCall.mockReturnValueOnce({
        gasFeeEstimates: { estimatedBaseFee: '0x1234' },
      });
      estimateGasFeeFn.mockResolvedValueOnce(mockEstimateGasFeeResult);
      addTransactionFn.mockResolvedValueOnce({
        transactionMeta: mockEvmTxMeta,
        result: Promise.resolve('0xevmTxHash'),
      });
      mockMessengerCall.mockReturnValueOnce({
        transactions: [mockEvmTxMeta],
      });

      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
    };

    it('should successfully submit an EVM bridge transaction with approval', async () => {
      setupApprovalMocks();
      setupBridgeMocks();

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const result = await controller.submitTx(mockEvmQuoteResponse, false);
      controller.stopAllPolling();

      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(1);
      expect(
        startPollingForBridgeTxStatusSpy.mock.lastCall[0].statusRequest,
      ).toMatchSnapshot();
      expect(
        startPollingForBridgeTxStatusSpy.mock.lastCall[0].bridgeTxMeta,
      ).toStrictEqual(result);
      expect(startPollingForBridgeTxStatusSpy.mock.lastCall[0].startTime).toBe(
        1234567890,
      );
      expect(addTransactionFn.mock.calls).toMatchSnapshot();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(addUserOperationFromTransactionFn).not.toHaveBeenCalled();
    });

    it('should successfully submit an EVM bridge transaction with no approval', async () => {
      setupBridgeMocks();

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const erc20Token = {
        address: '0x0000000000000000000000000000000000000032',
        assetId: `eip155:10/slip44:60` as CaipAssetType,
        chainId: 10,
        symbol: 'WETH',
        decimals: 18,
        name: 'WETH',
        coinKey: 'WETH',
        logoURI:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        priceUSD: '2478.63',
        icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
      };
      const { approval, ...quoteWithoutApproval } = mockEvmQuoteResponse;
      const result = await controller.submitTx(
        {
          ...quoteWithoutApproval,
          quote: { ...quoteWithoutApproval.quote, destAsset: erc20Token },
        },
        false,
      );

      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(1);
      expect(
        startPollingForBridgeTxStatusSpy.mock.lastCall[0].statusRequest,
      ).toMatchSnapshot();
      expect(
        startPollingForBridgeTxStatusSpy.mock.lastCall[0].bridgeTxMeta,
      ).toStrictEqual(result);
      expect(startPollingForBridgeTxStatusSpy.mock.lastCall[0].startTime).toBe(
        1234567890,
      );
      expect(estimateGasFeeFn.mock.calls).toMatchSnapshot();
      expect(addTransactionFn.mock.calls).toMatchSnapshot();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(addUserOperationFromTransactionFn).not.toHaveBeenCalled();
    });

    it('should handle smart transactions', async () => {
      setupBridgeMocks();

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const { approval, ...quoteWithoutApproval } = mockEvmQuoteResponse;
      const result = await controller.submitTx(quoteWithoutApproval, true);
      controller.stopAllPolling();

      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(1);
      expect(
        startPollingForBridgeTxStatusSpy.mock.lastCall[0].statusRequest,
      ).toMatchSnapshot();
      expect(
        startPollingForBridgeTxStatusSpy.mock.lastCall[0].bridgeTxMeta,
      ).toStrictEqual(result);
      expect(startPollingForBridgeTxStatusSpy.mock.lastCall[0].startTime).toBe(
        1234567890,
      );
      expect(estimateGasFeeFn.mock.calls).toMatchSnapshot();
      expect(addTransactionFn.mock.calls).toMatchSnapshot();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(addUserOperationFromTransactionFn).not.toHaveBeenCalled();
    });

    it('should handle smart accounts (4337)', async () => {
      mockMessengerCall.mockReturnValueOnce({
        ...mockSelectedAccount,
        type: EthAccountType.Erc4337,
      });
      mockMessengerCall.mockReturnValueOnce('arbitrum');
      estimateGasFeeFn.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockMessengerCall.mockReturnValueOnce({
        gasFeeEstimates: { estimatedBaseFee: '0x1234' },
      });
      addUserOperationFromTransactionFn.mockResolvedValueOnce({
        id: 'user-op-id',
        transactionHash: Promise.resolve('0xevmTxHash'),
        hash: Promise.resolve('0xevmTxHash'),
      });
      mockMessengerCall.mockReturnValueOnce({
        transactions: [mockEvmTxMeta],
      });
      estimateGasFeeFn.mockResolvedValueOnce(mockEstimateGasFeeResult);

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const { approval, ...quoteWithoutApproval } = mockEvmQuoteResponse;
      const result = await controller.submitTx(quoteWithoutApproval, false);
      controller.stopAllPolling();

      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(1);
      expect(
        startPollingForBridgeTxStatusSpy.mock.lastCall[0].statusRequest,
      ).toMatchSnapshot();
      expect(
        startPollingForBridgeTxStatusSpy.mock.lastCall[0].bridgeTxMeta,
      ).toStrictEqual(result);
      expect(startPollingForBridgeTxStatusSpy.mock.lastCall[0].startTime).toBe(
        1234567890,
      );
      expect(estimateGasFeeFn.mock.calls).toMatchSnapshot();
      expect(addTransactionFn).not.toHaveBeenCalled();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(addUserOperationFromTransactionFn.mock.calls).toMatchSnapshot();
    });

    it('should throw an error if account is not found', async () => {
      mockMessengerCall.mockReturnValueOnce(undefined);

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const { approval, ...quoteWithoutApproval } = mockEvmQuoteResponse;

      await expect(
        controller.submitTx(quoteWithoutApproval, false),
      ).rejects.toThrow(
        'Failed to submit cross-chain swap transaction: unknown account in trade data',
      );
      controller.stopAllPolling();

      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(addTransactionFn).not.toHaveBeenCalled();
      expect(addUserOperationFromTransactionFn).not.toHaveBeenCalled();
    });

    it('should reset USDT allowance', async () => {
      mockIsEthUsdt.mockReturnValueOnce(true);

      // USDT approval reset
      mockMessengerCall.mockReturnValueOnce('1');
      setupApprovalMocks();

      // Approval tx
      setupApprovalMocks();

      // Bridge transaction
      setupBridgeMocks();

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const result = await controller.submitTx(mockEvmQuoteResponse, false);
      controller.stopAllPolling();

      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(1);
      expect(
        startPollingForBridgeTxStatusSpy.mock.lastCall[0].statusRequest,
      ).toMatchSnapshot();
      expect(
        startPollingForBridgeTxStatusSpy.mock.lastCall[0].bridgeTxMeta,
      ).toStrictEqual(result);
      expect(startPollingForBridgeTxStatusSpy.mock.lastCall[0].startTime).toBe(
        1234567890,
      );
      expect(estimateGasFeeFn.mock.calls).toMatchSnapshot();
      expect(addTransactionFn.mock.calls).toMatchSnapshot();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
    });

    it('should throw an error if approval tx fails', async () => {
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arbitrum-client-id');
      mockMessengerCall.mockReturnValueOnce({
        gasFeeEstimates: { estimatedBaseFee: '0x1234' },
      });
      estimateGasFeeFn.mockResolvedValueOnce(mockEstimateGasFeeResult);
      addTransactionFn.mockRejectedValueOnce(new Error('Approval tx failed'));

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);

      await expect(
        controller.submitTx(mockEvmQuoteResponse, false),
      ).rejects.toThrow('Approval tx failed');

      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(addTransactionFn.mock.calls).toMatchSnapshot();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(addUserOperationFromTransactionFn).not.toHaveBeenCalled();
    });

    it('should throw an error if approval tx meta is undefined', async () => {
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arbitrum-client-id');
      mockMessengerCall.mockReturnValueOnce({
        gasFeeEstimates: { estimatedBaseFee: '0x1234' },
      });
      estimateGasFeeFn.mockResolvedValueOnce(mockEstimateGasFeeResult);
      addTransactionFn.mockResolvedValueOnce({
        transactionMeta: undefined,
        result: undefined,
      });
      mockMessengerCall.mockReturnValueOnce({
        transactions: [],
      });

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);

      await expect(
        controller.submitTx(mockEvmQuoteResponse, false),
      ).rejects.toThrow(
        'Failed to submit bridge tx: approval txMeta is undefined',
      );

      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(addTransactionFn.mock.calls).toMatchSnapshot();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(addUserOperationFromTransactionFn).not.toHaveBeenCalled();
    });

    it('should delay after submitting linea approval', async () => {
      const handleLineaDelaySpy = jest
        .spyOn(transactionUtils, 'handleLineaDelay')
        .mockResolvedValueOnce();
      const mockTraceFn = jest
        .fn()
        .mockImplementation((_p, callback) => callback());

      setupApprovalMocks();
      setupBridgeMocks();

      const { controller, startPollingForBridgeTxStatusSpy } = getController(
        mockMessengerCall,
        mockTraceFn,
      );

      const lineaQuoteResponse = {
        ...mockEvmQuoteResponse,
        quote: { ...mockEvmQuoteResponse.quote, srcChainId: 59144 },
        trade: { ...mockEvmQuoteResponse.trade, gasLimit: undefined } as never,
      };

      const result = await controller.submitTx(lineaQuoteResponse, false);
      controller.stopAllPolling();

      expect(mockTraceFn).toHaveBeenCalledTimes(2);
      expect(handleLineaDelaySpy).toHaveBeenCalledTimes(1);
      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(1);
      expect(
        startPollingForBridgeTxStatusSpy.mock.lastCall[0].statusRequest,
      ).toMatchSnapshot();
      expect(
        startPollingForBridgeTxStatusSpy.mock.lastCall[0].bridgeTxMeta,
      ).toStrictEqual(result);
      expect(startPollingForBridgeTxStatusSpy.mock.lastCall[0].startTime).toBe(
        1234567890,
      );
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(mockTraceFn.mock.calls).toMatchSnapshot();
    });
  });
});
