/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable jest/no-restricted-matchers */
import { deriveStateFromMetadata } from '@metamask/base-controller';
import type {
  BridgeControllerMessenger,
  QuoteResponse,
  QuoteMetadata,
  TxData,
  TronTradeData,
} from '@metamask/bridge-controller';
import {
  ActionTypes,
  ChainId,
  FeeType,
  StatusTypes,
  BridgeController,
  getNativeAssetForChainId,
  FeatureId,
  getQuotesReceivedProperties,
} from '@metamask/bridge-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import {
  TransactionType,
  TransactionStatus,
} from '@metamask/transaction-controller';
import type {
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';
import type { CaipAssetType } from '@metamask/utils';
import { numberToHex } from '@metamask/utils';

import { BridgeStatusController } from './bridge-status-controller';
import {
  BRIDGE_STATUS_CONTROLLER_NAME,
  DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE,
  MAX_ATTEMPTS,
} from './constants';
import { BridgeClientId } from './types';
import type {
  BridgeId,
  StartPollingForBridgeTxStatusArgsSerialized,
  BridgeHistoryItem,
  BridgeStatusControllerState,
  BridgeStatusControllerMessenger,
  StatusResponse,
} from './types';
import * as bridgeStatusUtils from './utils/bridge-status';
import * as transactionUtils from './utils/transaction';
import { flushPromises } from '../../../tests/helpers';
import { CHAIN_IDS } from '../../bridge-controller/src/constants/chains';

type AllBridgeStatusControllerActions =
  MessengerActions<BridgeStatusControllerMessenger>;

type AllBridgeStatusControllerEvents =
  MessengerEvents<BridgeStatusControllerMessenger>;

type AllBridgeControllerActions = MessengerActions<BridgeControllerMessenger>;

type AllBridgeControllerEvents = MessengerEvents<BridgeControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllBridgeStatusControllerActions | AllBridgeControllerActions,
  AllBridgeStatusControllerEvents | AllBridgeControllerEvents
>;

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

const mockMessengerSubscribe = jest.fn();
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
  } = {}): StatusResponse => ({
    status: 'FAILED' as StatusTypes,
    bridge: 'debridge' as BridgeId,
    srcChain: {
      chainId: srcChainId,
      txHash: srcTxHash,
      amount: '991250000000000',
      token: {
        address: '0x0000000000000000000000000000000000000000',
        assetId: `eip155:${srcChainId}/slip44:60` as CaipAssetType,
        chainId: srcChainId,
        symbol: 'ETH',
        decimals: 18,
        name: 'ETH',
        coinKey: 'ETH',
        iconUrl:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
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
  minDestTokenAmount: '941000000000000',
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
      data: '0x3ce33bff0000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000038d7ea4c6800000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000d6c6966694164617074657256320000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000e397c4883ec89ed4fc9d258f00c689708b2799c9000000000000000000000000e397c4883ec89ed4fc9d258f00c689708b2799c9000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000038589602234000000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000007f544a44c0000000000000000000000000056ca675c3633cc16bd6849e2b431d4e8de5e23bf000000000000000000000000000000000000000000000000000000000000006c5a39b10a4f4f0747826140d2c5fe6ef47965741f6f7a4734bf784bf3ae3f24520000000a000222266cc2dca0671d2a17ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffd00dfeeddeadbeef8932eb23bad9bddb5cf81426f78279a53c6c3b7100000000000000000000000000000000000000009ce3c510b3f58edc8d53ae708056e30926f62d0b42d5c9b61c391bb4e8a2c1917f8ed995169ffad0d79af2590303e83c57e15a9e0b248679849556c2e03a1c811b',
      gasLimit: 282915,
    },
    approval: null as never,
    estimatedProcessingTimeInSeconds: 15,
    sentAmount: { amount: '1.234', valueInCurrency: null, usd: null },
    toTokenAmount: { amount: '1.234', valueInCurrency: null, usd: null },
    minToTokenAmount: { amount: '1.17', valueInCurrency: null, usd: null },
    totalNetworkFee: { amount: '1.234', valueInCurrency: null, usd: null },
    totalMaxNetworkFee: { amount: '1.234', valueInCurrency: null, usd: null },
    gasFee: {
      effective: { amount: '.00055', valueInCurrency: null, usd: '2.5778' },
      total: { amount: '1.234', valueInCurrency: null, usd: null },
      max: { amount: '1.234', valueInCurrency: null, usd: null },
    },
    adjustedReturn: { valueInCurrency: null, usd: null },
    swapRate: '1.234',
    cost: { valueInCurrency: null, usd: null },
  },
  accountAddress: account,
  startTime: 1729964825189,
  slippagePercentage: 0,
  initialDestAssetBalance: undefined,
  targetContractAddress: '0x23981fC34e69eeDFE2BD9a0a9fCb0719Fe09DbFC',
  isStxEnabled,
});

const MockTxHistory = {
  getInitNoSrcTxHash: ({
    txMetaId = 'bridgeTxMetaId1',
    actionId = undefined,
    account = '0xaccount1',
    srcChainId = 42161,
    destChainId = 10,
  } = {}): Record<string, BridgeHistoryItem> => ({
    [txMetaId]: {
      txMetaId,
      actionId,
      originalTransactionId: txMetaId,
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
      location: undefined,
    },
  }),
  getInit: ({
    txMetaId = 'bridgeTxMetaId1',
    actionId = undefined,
    account = '0xaccount1',
    srcChainId = 42161,
    destChainId = 10,
  } = {}): Record<string, BridgeHistoryItem> => ({
    [txMetaId]: {
      txMetaId,
      actionId,
      originalTransactionId: txMetaId,
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
      location: undefined,
    },
  }),
  getPending: ({
    txMetaId = 'bridgeTxMetaId1',
    batchId = undefined,
    actionId = undefined,
    approvalTxId = undefined,
    srcTxHash = '0xsrcTxHash1',
    account = '0xaccount1',
    srcChainId = 42161,
    destChainId = 10,
    featureId = undefined,
  } = {}): Record<string, BridgeHistoryItem> => ({
    [txMetaId]: {
      txMetaId,
      actionId,
      originalTransactionId: txMetaId,
      batchId,
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
        quotedGasAmount: '.00055',
        quotedGasInUsd: '2.5778',
        quotedReturnInUsd: undefined,
      },
      approvalTxId,
      isStxEnabled: false,
      hasApprovalTx: false,
      completionTime: undefined,
      attempts: undefined,
      featureId,
      location: undefined,
    },
  }),
  getUnknown: ({
    txMetaId = 'bridgeTxMetaId2',
    actionId = undefined,
    srcTxHash = '0xsrcTxHash2',
    account = '0xaccount1',
    srcChainId = 42161,
    destChainId = 10,
  } = {}): Record<string, BridgeHistoryItem> => ({
    [txMetaId]: {
      txMetaId,
      actionId,
      originalTransactionId: txMetaId,
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
      location: undefined,
    },
  }),
  getPendingSwap: ({
    txMetaId = 'swapTxMetaId1',
    actionId = undefined,
    srcTxHash = '0xsrcTxHash1',
    account = '0xaccount1',
    srcChainId = 42161,
    destChainId = 42161,
    featureId = undefined,
  } = {}): Record<string, BridgeHistoryItem> => ({
    [txMetaId]: {
      txMetaId,
      actionId,
      originalTransactionId: txMetaId,
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
      featureId,
      location: undefined,
    },
  }),
  getComplete: ({
    txMetaId = 'bridgeTxMetaId1',
    actionId = undefined,
    batchId = undefined,
    srcTxHash = '0xsrcTxHash1',
    account = '0xaccount1',
    srcChainId = 42161,
    destChainId = 10,
  } = {}): Record<string, BridgeHistoryItem> => ({
    [txMetaId]: {
      txMetaId,
      actionId,
      originalTransactionId: txMetaId,
      batchId,
      featureId: undefined,
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
        quotedGasAmount: '.00055',
        quotedGasInUsd: '2.5778',
        quotedReturnInUsd: undefined,
      },
      approvalTxId: undefined,
      isStxEnabled: true,
      hasApprovalTx: false,
      attempts: undefined,
      location: undefined,
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
    subscribe: mockMessengerSubscribe,
    publish: jest.fn(),
    registerActionHandler: jest.fn(),
    registerInitialEventPayload: jest.fn(),
  }) as unknown as jest.Mocked<BridgeStatusControllerMessenger>;

const executePollingWithPendingStatus = async () => {
  // Setup
  jest.useFakeTimers();
  const fetchBridgeTxStatusSpy = jest
    .spyOn(bridgeStatusUtils, 'fetchBridgeTxStatus')
    .mockResolvedValueOnce({
      status: MockStatusResponse.getPending(),
      validationFailures: [],
    });
  const bridgeStatusController = new BridgeStatusController({
    messenger: getMessengerMock(),
    clientId: BridgeClientId.EXTENSION,
    fetchFn: jest.fn(),
    addTransactionFn: jest.fn(),
    addTransactionBatchFn: jest.fn(),
    updateTransactionFn: jest.fn(),
    estimateGasFeeFn: jest.fn(),
    config: {},
  });
  const startPollingSpy = jest.spyOn(bridgeStatusController, 'startPolling');

  // Execution
  bridgeStatusController.startPollingForBridgeTxStatus(
    getMockStartPollingForBridgeTxStatusArgs(),
  );
  fetchBridgeTxStatusSpy.mockImplementationOnce(async () => {
    return {
      status: MockStatusResponse.getPending(),
      validationFailures: [],
    };
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
const addTransactionBatchFn = jest.fn();
const updateTransactionFn = jest.fn();
const estimateGasFeeFn = jest.fn();

const getController = (
  call: jest.Mock,
  traceFn?: jest.Mock,
  clientId: BridgeClientId = BridgeClientId.EXTENSION,
  mockFetchFn = jest.fn(),
) => {
  const controller = new BridgeStatusController({
    messenger: {
      call,
      subscribe: mockMessengerSubscribe,
      publish: jest.fn(),
      registerActionHandler: jest.fn(),
      registerInitialEventPayload: jest.fn(),
    } as never,
    clientId,
    fetchFn: mockFetchFn,
    addTransactionFn,
    addTransactionBatchFn,
    estimateGasFeeFn,
    updateTransactionFn,
    traceFn,
  });

  const startPollingSpy = jest.fn();
  jest.spyOn(controller, 'startPolling').mockImplementation(startPollingSpy);
  return {
    controller,
    startPollingForBridgeTxStatusSpy: startPollingSpy,
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
        addTransactionFn: jest.fn(),
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
      });
      expect(bridgeStatusController.state).toStrictEqual(EMPTY_INIT_STATE);
      expect(mockMessengerSubscribe.mock.calls).toMatchSnapshot();
    });

    it('rehydrates the tx history state', async () => {
      // Setup
      const bridgeStatusController = new BridgeStatusController({
        messenger: getMessengerMock(),
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
        addTransactionFn: jest.fn(),
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
        state: {
          txHistory: MockTxHistory.getPending(),
        },
      });

      // Assertion
      expect(bridgeStatusController.state.txHistory).toMatchSnapshot();
      bridgeStatusController.stopAllPolling();
    });

    it('restarts polling for history items that are not complete', async () => {
      // Setup
      jest.useFakeTimers();
      const fetchBridgeTxStatusSpy = jest.spyOn(
        bridgeStatusUtils,
        'fetchBridgeTxStatus',
      );

      // Execution
      const bridgeStatusController = new BridgeStatusController({
        messenger: getMessengerMock(),
        state: {
          txHistory: {
            ...MockTxHistory.getPending(),
            ...MockTxHistory.getUnknown(),
            ...MockTxHistory.getPendingSwap(),
          },
        },
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest
          .fn()
          .mockResolvedValueOnce(MockStatusResponse.getPending())
          .mockResolvedValueOnce(MockStatusResponse.getComplete()),
        addTransactionFn: jest.fn(),
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
      });
      jest.advanceTimersByTime(10000);
      await flushPromises();

      // Assertions
      expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(2);
      bridgeStatusController.stopAllPolling();
    });
  });

  describe('startPolling - error handling', () => {
    const consoleFn = console.warn;
    let consoleFnSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.clearAllMocks();
      jest.clearAllTimers();
      // eslint-disable-next-line no-empty-function
      consoleFnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      console.warn = consoleFn;
    });

    it('should handle network errors during fetchBridgeTxStatus', async () => {
      // Setup
      jest.useFakeTimers();
      const fetchBridgeTxStatusSpy = jest.spyOn(
        bridgeStatusUtils,
        'fetchBridgeTxStatus',
      );

      const mockFetchFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'));
      const bridgeStatusController = new BridgeStatusController({
        messenger: getMessengerMock(),
        clientId: BridgeClientId.EXTENSION,
        fetchFn: mockFetchFn,
        addTransactionFn: jest.fn(),
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
      });

      // Execution
      bridgeStatusController.startPollingForBridgeTxStatus(
        getMockStartPollingForBridgeTxStatusArgs(),
      );

      // Trigger polling
      jest.advanceTimersByTime(10000);
      await flushPromises();

      // Assertions
      expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(1);
      // Transaction should still be in history but status should remain unchanged
      expect(bridgeStatusController.state.txHistory).toHaveProperty(
        'bridgeTxMetaId1',
      );
      expect(
        bridgeStatusController.state.txHistory.bridgeTxMetaId1.status.status,
      ).toBe('PENDING');

      // Should increment attempts counter
      expect(
        bridgeStatusController.state.txHistory.bridgeTxMetaId1.attempts
          ?.counter,
      ).toBe(1);
      expect(
        bridgeStatusController.state.txHistory.bridgeTxMetaId1.attempts
          ?.lastAttemptTime,
      ).toBeDefined();

      bridgeStatusController.stopAllPolling();
      expect(consoleFnSpy.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "Failed to fetch bridge tx status",
            [Error: Network error],
          ],
        ]
      `);
    });

    it('should stop polling after max attempts are reached', async () => {
      // Setup
      jest.useFakeTimers();
      const fetchBridgeTxStatusSpy = jest.spyOn(
        bridgeStatusUtils,
        'fetchBridgeTxStatus',
      );

      const failedFetch = jest
        .fn()
        .mockRejectedValue(new Error('Persistent error'));
      const bridgeStatusController = new BridgeStatusController({
        messenger: getMessengerMock(),
        clientId: BridgeClientId.EXTENSION,
        fetchFn: failedFetch,
        addTransactionFn: jest.fn(),
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
      });

      // Execution
      bridgeStatusController.startPollingForBridgeTxStatus(
        getMockStartPollingForBridgeTxStatusArgs(),
      );

      // Trigger polling with exponential backoff timing
      for (let i = 0; i < MAX_ATTEMPTS * 2; i++) {
        jest.advanceTimersByTime(10_000 * 2 ** i);
        await flushPromises();
      }

      // Assertions
      expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(MAX_ATTEMPTS);
      expect(
        bridgeStatusController.state.txHistory.bridgeTxMetaId1.attempts
          ?.counter,
      ).toBe(MAX_ATTEMPTS);

      // Verify polling stops after max attempts - even with a long wait, no more calls
      const callCountBeforeExtraTime = fetchBridgeTxStatusSpy.mock.calls.length;
      jest.advanceTimersByTime(1_000_000_000);
      await flushPromises();
      expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(
        callCountBeforeExtraTime,
      );
      bridgeStatusController.stopAllPolling();
      expect(consoleFnSpy.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "Failed to fetch bridge tx status",
            [Error: Persistent error],
          ],
          [
            "Failed to fetch bridge tx status",
            [Error: Persistent error],
          ],
          [
            "Failed to fetch bridge tx status",
            [Error: Persistent error],
          ],
          [
            "Failed to fetch bridge tx status",
            [Error: Persistent error],
          ],
          [
            "Failed to fetch bridge tx status",
            [Error: Persistent error],
          ],
          [
            "Failed to fetch bridge tx status",
            [Error: Persistent error],
          ],
          [
            "Failed to fetch bridge tx status",
            [Error: Persistent error],
          ],
        ]
      `);
    });
  });

  describe('startPollingForBridgeTxStatus', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('throws error when bridgeTxMeta.id is not provided', () => {
      const bridgeStatusController = new BridgeStatusController({
        messenger: getMessengerMock(),
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
        addTransactionFn: jest.fn(),
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
      });

      const argsWithoutId = getMockStartPollingForBridgeTxStatusArgs();
      // Remove the id from bridgeTxMeta
      argsWithoutId.bridgeTxMeta = {} as never;

      expect(() => {
        bridgeStatusController.startPollingForBridgeTxStatus(argsWithoutId);
      }).toThrow(
        'Cannot start polling: bridgeTxMeta.id is required for polling',
      );

      bridgeStatusController.stopAllPolling();
    });

    it('throws error when bridgeTxMeta is undefined', () => {
      const bridgeStatusController = new BridgeStatusController({
        messenger: getMessengerMock(),
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
        addTransactionFn: jest.fn(),
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
      });

      const argsWithoutMeta = getMockStartPollingForBridgeTxStatusArgs();
      // Remove bridgeTxMeta entirely
      argsWithoutMeta.bridgeTxMeta = undefined as never;

      expect(() => {
        bridgeStatusController.startPollingForBridgeTxStatus(argsWithoutMeta);
      }).toThrow(
        'Cannot start polling: bridgeTxMeta.id is required for polling',
      );

      bridgeStatusController.stopAllPolling();
    });

    it('sets the inital tx history state', async () => {
      // Setup
      const bridgeStatusController = new BridgeStatusController({
        messenger: getMessengerMock(),
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest
          .fn()
          .mockResolvedValueOnce(MockStatusResponse.getPending()),
        addTransactionFn: jest.fn(),
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
      });

      // Execution
      bridgeStatusController.startPollingForBridgeTxStatus(
        getMockStartPollingForBridgeTxStatusArgs(),
      );

      // Assertion
      expect(bridgeStatusController.state.txHistory).toMatchSnapshot();
      bridgeStatusController.stopAllPolling();
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
      bridgeStatusController.stopAllPolling();
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
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
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
        return {
          status: MockStatusResponse.getComplete(),
          validationFailures: [],
        };
      });
      jest.advanceTimersByTime(10000);
      await flushPromises();

      // Assertions
      expect(stopPollingByNetworkClientIdSpy).toHaveBeenCalledTimes(1);
      expect(bridgeStatusController.state.txHistory).toStrictEqual(
        MockTxHistory.getComplete(),
      );

      expect(messengerMock.call.mock.calls).toMatchSnapshot();
      expect(messengerMock.publish.mock.calls.at(-1)).toMatchSnapshot();
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
        subscribe: mockMessengerSubscribe,
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
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
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
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
      });

      const fetchBridgeTxStatusSpy = jest
        .spyOn(bridgeStatusUtils, 'fetchBridgeTxStatus')
        .mockImplementationOnce(async () => {
          return {
            status: MockStatusResponse.getComplete(),
            validationFailures: [],
          };
        });

      // Execution
      bridgeStatusController.startPollingForBridgeTxStatus(
        getMockStartPollingForBridgeTxStatusArgs(),
      );
      jest.advanceTimersByTime(10000);
      await flushPromises();

      // Assertions
      expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(1);

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
          return {
            status: MockStatusResponse.getFailed(),
            validationFailures: [],
          };
        });
      const bridgeStatusController = new BridgeStatusController({
        messenger: messengerMock,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
        addTransactionFn: jest.fn(),
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
      });

      // Execution
      bridgeStatusController.startPollingForBridgeTxStatus(
        getMockStartPollingForBridgeTxStatusArgs(),
      );
      jest.advanceTimersByTime(10000);
      await flushPromises();

      // Assertions
      expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(1);
      expect(messengerMock.call.mock.calls).toMatchSnapshot();
      expect(messengerMock.publish).not.toHaveBeenCalledWith(
        'BridgeStatusController:destinationTransactionCompleted',
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
        subscribe: mockMessengerSubscribe,
        publish: jest.fn(),
        registerActionHandler: jest.fn(),
        registerInitialEventPayload: jest.fn(),
      } as unknown as jest.Mocked<BridgeStatusControllerMessenger>;

      const bridgeStatusController = new BridgeStatusController({
        messenger: messengerMock,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest
          .fn()
          .mockResolvedValueOnce(MockStatusResponse.getPending()),
        addTransactionFn: jest.fn(),
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
        traceFn: jest.fn(),
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
      ).toBe('0xsrcTxHash1');

      // Cleanup
      bridgeStatusController.stopAllPolling();
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

  describe('getBridgeHistoryItemByTxMetaId', () => {
    it('returns the bridge history item when it exists', async () => {
      const { bridgeStatusController } =
        await executePollingWithPendingStatus();

      const txMetaId = 'bridgeTxMetaId1';
      const bridgeHistoryItem =
        bridgeStatusController.getBridgeHistoryItemByTxMetaId(txMetaId);

      expect(bridgeHistoryItem).toBeDefined();
      expect(bridgeHistoryItem?.quote.srcChainId).toBe(42161);
      expect(bridgeHistoryItem?.quote.destChainId).toBe(10);
      expect(bridgeHistoryItem?.status.status).toBe(StatusTypes.PENDING);
    });

    it('returns undefined when the transaction does not exist', async () => {
      const { bridgeStatusController } =
        await executePollingWithPendingStatus();

      const txMetaId = 'nonExistentTxId';
      const bridgeHistoryItem =
        bridgeStatusController.getBridgeHistoryItemByTxMetaId(txMetaId);

      expect(bridgeHistoryItem).toBeUndefined();
    });

    it('handles the case when txHistory is empty', () => {
      const bridgeStatusController = new BridgeStatusController({
        messenger: getMessengerMock(),
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
        addTransactionFn: jest.fn(),
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
        state: EMPTY_INIT_STATE,
      });

      const txMetaId = 'anyTxId';
      const bridgeHistoryItem =
        bridgeStatusController.getBridgeHistoryItemByTxMetaId(txMetaId);

      expect(bridgeHistoryItem).toBeUndefined();
    });

    it('returns the correct transaction when multiple transactions exist', () => {
      const bridgeStatusController = new BridgeStatusController({
        messenger: getMessengerMock(),
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
        addTransactionFn: jest.fn(),
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
        state: {
          txHistory: {
            bridgeTxMetaId1: {
              ...MockTxHistory.getPending().bridgeTxMetaId1,
              quote: {
                ...MockTxHistory.getPending().bridgeTxMetaId1.quote,
                srcChainId: 10,
                destChainId: 137,
              },
            },
            anotherTxId: {
              ...MockTxHistory.getPending().bridgeTxMetaId1,
              txMetaId: 'anotherTxId',
              quote: {
                ...MockTxHistory.getPending().bridgeTxMetaId1.quote,
                srcChainId: 1,
                destChainId: 42161,
              },
            },
          },
        },
      });

      // Get the first transaction
      const firstTransaction =
        bridgeStatusController.getBridgeHistoryItemByTxMetaId(
          'bridgeTxMetaId1',
        );
      expect(firstTransaction?.quote.srcChainId).toBe(10);
      expect(firstTransaction?.quote.destChainId).toBe(137);

      // Get the second transaction
      const secondTransaction =
        bridgeStatusController.getBridgeHistoryItemByTxMetaId('anotherTxId');
      expect(secondTransaction?.quote.srcChainId).toBe(1);
      expect(secondTransaction?.quote.destChainId).toBe(42161);
    });
  });

  describe('wipeBridgeStatus', () => {
    beforeEach(() => {
      jest.clearAllTimers();
      jest.clearAllMocks();
    });

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
          } else if (method === 'TransactionController:getState') {
            return {
              transactions: [{ id: 'bridgeTxMetaId1', hash: '0xsrcTxHash1' }],
            };
          } else if (method === 'AuthenticationController:getBearerToken') {
            return 'AUTH_TOKEN';
          }
          return null;
        }),
        subscribe: mockMessengerSubscribe,
        publish: jest.fn(),
        registerActionHandler: jest.fn(),
        registerInitialEventPayload: jest.fn(),
      } as unknown as jest.Mocked<BridgeStatusControllerMessenger>;
      const bridgeStatusController = new BridgeStatusController({
        messenger: messengerMock,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
        addTransactionFn: jest.fn(),
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
      });
      const fetchBridgeTxStatusSpy = jest
        .spyOn(bridgeStatusUtils, 'fetchBridgeTxStatus')
        .mockImplementationOnce(async () => {
          return {
            status: MockStatusResponse.getComplete(),
            validationFailures: [],
          };
        })
        .mockImplementationOnce(async () => {
          return {
            status: MockStatusResponse.getComplete({
              srcTxHash: '0xsrcTxHash2',
              destTxHash: '0xdestTxHash2',
            }),
            validationFailures: [],
          };
        });

      bridgeStatusController.startPollingForBridgeTxStatus(
        getMockStartPollingForBridgeTxStatusArgs(),
      );
      jest.advanceTimersToNextTimer();
      await flushPromises();
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
      jest.advanceTimersToNextTimer();
      await flushPromises();
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
      const { calls } = messengerMock.call.mock;
      expect(calls.map((call) => call.slice(0, 2))).toMatchSnapshot();
    });

    it('wipes the bridge status for all networks if ignoreNetwork is true', async () => {
      // Setup
      jest.useFakeTimers();
      const messengerMock = {
        call: jest.fn((method: string) => {
          if (method === 'AuthenticationController:getBearerToken') {
            return 'AUTH_TOKEN';
          }
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
              transactions: [{ id: 'bridgeTxMetaId1', hash: '0xsrcTxHash1' }],
            };
          }
          return null;
        }),
        subscribe: mockMessengerSubscribe,
        publish: jest.fn(),
        registerActionHandler: jest.fn(),
        registerInitialEventPayload: jest.fn(),
      } as unknown as jest.Mocked<BridgeStatusControllerMessenger>;
      const bridgeStatusController = new BridgeStatusController({
        messenger: messengerMock,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
        addTransactionFn: jest.fn(),
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
      });
      const fetchBridgeTxStatusSpy = jest
        .spyOn(bridgeStatusUtils, 'fetchBridgeTxStatus')
        .mockImplementationOnce(async () => {
          return {
            status: MockStatusResponse.getComplete(),
            validationFailures: [],
          };
        })
        .mockImplementationOnce(async () => {
          return {
            status: MockStatusResponse.getComplete({
              srcTxHash: '0xsrcTxHash2',
            }),
            validationFailures: [],
          };
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
      jest.advanceTimersToNextTimer();
      jest.advanceTimersToNextTimer();
      await flushPromises();
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
      jest.advanceTimersToNextTimer();
      await flushPromises();
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

    it('wipes the bridge status only for the current network if ignoreNetwork is false', async () => {
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
          } else if (method === 'TransactionController:getState') {
            return {
              transactions: [{ id: 'bridgeTxMetaId1', hash: '0xsrcTxHash1' }],
            };
          }
          if (method === 'AuthenticationController:getBearerToken') {
            return 'AUTH_TOKEN';
          }
          return null;
        }),
        subscribe: mockMessengerSubscribe,
        publish: jest.fn(),
        registerActionHandler: jest.fn(),
        registerInitialEventPayload: jest.fn(),
      } as unknown as jest.Mocked<BridgeStatusControllerMessenger>;
      const bridgeStatusController = new BridgeStatusController({
        messenger: messengerMock,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
        addTransactionFn: jest.fn(),
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
      });
      const fetchBridgeTxStatusSpy = jest
        .spyOn(bridgeStatusUtils, 'fetchBridgeTxStatus')
        .mockImplementationOnce(async () => {
          return {
            status: MockStatusResponse.getComplete(),
            validationFailures: [],
          };
        })
        .mockImplementationOnce(async () => {
          return {
            status: MockStatusResponse.getComplete({
              srcTxHash: '0xsrcTxHash2',
            }),
            validationFailures: [],
          };
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
      jest.advanceTimersToNextTimer();
      await flushPromises();
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
      jest.advanceTimersToNextTimer();
      await flushPromises();
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

  describe('submitTx: Solana bridge', () => {
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
        minDestTokenAmount: '0.475',
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
      minToTokenAmount: {
        amount: '0.475',
        valueInCurrency: '950',
        usd: '950',
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
        effective: { amount: '0.05', valueInCurrency: '5', usd: '5' },
        total: { amount: '0.05', valueInCurrency: '5', usd: '5' },
        max: { amount: '0', valueInCurrency: null, usd: null },
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
      id: 'solana-account-1',
      address: '0x123...',
      metadata: {
        snap: {
          id: 'test-snap',
        },
        keyring: {
          type: 'any',
        },
      },
      options: { scope: 'solana-chain-id' },
    };

    let mockMessengerCall: jest.Mock;
    beforeEach(() => {
      jest.clearAllMocks();
      jest.clearAllTimers();
      jest.spyOn(Date, 'now').mockReturnValue(1234567890);
      mockMessengerCall = jest.fn();
      mockMessengerCall.mockImplementationOnce(jest.fn()); // stopPollingForQuotes
    });

    it('should successfully submit a transaction', async () => {
      mockMessengerCall.mockReturnValueOnce(mockSolanaAccount);
      mockMessengerCall.mockImplementationOnce(jest.fn()); // track event
      mockMessengerCall.mockResolvedValueOnce('signature');

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const result = await controller.submitTx(
        'SOLaccountAddress',
        mockQuoteResponse,
        false,
      );
      controller.stopAllPolling();

      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(1);
      expect(
        startPollingForBridgeTxStatusSpy.mock.lastCall[0],
      ).toMatchSnapshot();
      expect(controller.state.txHistory[result.id]).toMatchSnapshot();
    });

    it('should throw error when snap ID is missing', async () => {
      const accountWithoutSnap = {
        ...mockSolanaAccount,
        metadata: { keyring: { type: 'any' }, snap: undefined },
      };
      mockMessengerCall.mockReturnValueOnce(accountWithoutSnap);
      mockMessengerCall.mockImplementationOnce(jest.fn()); // track event

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);

      await expect(
        controller.submitTx('SOLaccountAddress', mockQuoteResponse, false),
      ).rejects.toThrow(
        'Failed to submit cross-chain swap transaction: undefined snap id',
      );
      expect(startPollingForBridgeTxStatusSpy).not.toHaveBeenCalled();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
    });

    it('should throw error when account is missing', async () => {
      mockMessengerCall.mockReturnValueOnce(undefined);

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);

      await expect(
        controller.submitTx('SOLaccountAddress', mockQuoteResponse, false),
      ).rejects.toThrow(
        'Failed to submit cross-chain swap transaction: undefined multichain account',
      );
      expect(startPollingForBridgeTxStatusSpy).not.toHaveBeenCalled();
    });

    it('should handle snap controller errors', async () => {
      mockMessengerCall.mockReturnValueOnce(mockSolanaAccount);
      mockMessengerCall.mockImplementationOnce(jest.fn()); // track event
      mockMessengerCall.mockRejectedValueOnce(new Error('Snap error'));

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);

      await expect(
        controller.submitTx('SOLaccountAddress', mockQuoteResponse, false),
      ).rejects.toThrow('Snap error');
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).not.toHaveBeenCalled();
    });
  });

  describe('submitTx: Solana swap', () => {
    const mockQuoteResponse: QuoteResponse<string> & QuoteMetadata = {
      quote: {
        requestId: '123',
        srcChainId: ChainId.SOLANA,
        destChainId: ChainId.SOLANA,
        srcTokenAmount: '1000000000',
        srcAsset: {
          chainId: ChainId.SOLANA,
          address: 'native',
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9,
          assetId: getNativeAssetForChainId(ChainId.SOLANA).assetId,
        },
        destTokenAmount: '500000000000000000s',
        minDestTokenAmount: '475000000000000000s',
        destAsset: {
          chainId: ChainId.SOLANA,
          address: '0x...',
          symbol: 'USDC',
          name: 'USDC',
          decimals: 18,
          assetId: 'eip155:1399811149/slip44:501',
        },
        bridgeId: 'test-bridge',
        bridges: [],
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
      minToTokenAmount: {
        amount: '0.475',
        valueInCurrency: '950',
        usd: '950',
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
        effective: { amount: '0.05', valueInCurrency: '5', usd: '5' },
        total: { amount: '0.05', valueInCurrency: '5', usd: '5' },
        max: { amount: '0', valueInCurrency: null, usd: null },
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
      id: 'solana-account-1',
      address: '0x123...',
      metadata: {
        snap: {
          id: 'test-snap',
        },
        keyring: {
          type: 'Hardware',
        },
      },
      options: { scope: 'solana-chain-id' },
    };
    let mockMessengerCall: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();
      jest.clearAllTimers();
      mockMessengerCall = jest.fn();
      jest.spyOn(Date, 'now').mockReturnValue(1234567890);
      mockMessengerCall.mockImplementationOnce(jest.fn()); // stopPollingForQuotes
    });

    it('should successfully submit a transaction', async () => {
      mockMessengerCall.mockReturnValueOnce(mockSolanaAccount);
      mockMessengerCall.mockImplementationOnce(jest.fn()); // track event
      mockMessengerCall.mockResolvedValueOnce({
        signature: 'signature',
      });
      mockMessengerCall.mockReturnValueOnce({
        transactions: [],
      });

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const result = await controller.submitTx(
        'SOLaccountAddress',
        mockQuoteResponse,
        false,
      );
      controller.stopAllPolling();

      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(result).toMatchSnapshot();
      expect(controller.state.txHistory[result.id]).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
    });

    it('should throw error when snap ID is missing', async () => {
      const accountWithoutSnap = {
        ...mockSolanaAccount,
        metadata: { keyring: { type: 'any' }, snap: undefined },
      };
      mockMessengerCall.mockReturnValueOnce(accountWithoutSnap);
      mockMessengerCall.mockImplementationOnce(jest.fn()); // track event

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);

      await expect(
        controller.submitTx('SOLaccountAddress', mockQuoteResponse, false),
      ).rejects.toThrow(
        'Failed to submit cross-chain swap transaction: undefined snap id',
      );
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).not.toHaveBeenCalled();
    });

    it('should throw error when account is missing', async () => {
      mockMessengerCall.mockReturnValueOnce(undefined);

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);

      await expect(
        controller.submitTx('SOLaccountAddress', mockQuoteResponse, false),
      ).rejects.toThrow(
        'Failed to submit cross-chain swap transaction: undefined multichain account',
      );
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).not.toHaveBeenCalled();
    });

    it('should handle snap controller errors', async () => {
      mockMessengerCall.mockReturnValueOnce(mockSolanaAccount);
      mockMessengerCall.mockImplementationOnce(jest.fn()); // track event
      mockMessengerCall.mockRejectedValueOnce(new Error('Snap error'));

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);

      await expect(
        controller.submitTx('SOLaccountAddress', mockQuoteResponse, false),
      ).rejects.toThrow('Snap error');
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).not.toHaveBeenCalled();
    });
  });

  describe('submitTx: Tron swap with approval', () => {
    const mockTronApproval: TronTradeData = {
      raw_data_hex:
        '0a02aabb22084dde86d0f68ae3e5403a680801b2630a31747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e54726967676572536d617274436f6e747261637412330a15418f7ea8cce9f8bba67d7ae59cd49a1965d617e71a121541a614f803b6fd780986a42c78ec9c7f77e6ded13c',
    };

    const mockTronTrade: TronTradeData = {
      raw_data_hex:
        '0a02aabb22084dde86d0f68ae3e5403a680801b2630a31747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e54726967676572536d617274436f6e747261637412330a15418f7ea8cce9f8bba67d7ae59cd49a1965d617e71b121541a614f803b6fd780986a42c78ec9c7f77e6ded13c',
    };

    const mockQuoteResponse: QuoteResponse<TronTradeData, TronTradeData> &
      QuoteMetadata = {
      quote: {
        requestId: '123',
        srcChainId: ChainId.TRON,
        destChainId: ChainId.TRON,
        srcTokenAmount: '1000000',
        srcAsset: {
          chainId: ChainId.TRON,
          address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT on Tron
          symbol: 'USDT',
          name: 'Tether USD',
          decimals: 6,
          assetId: 'tron:728126428/slip44:195',
        },
        destTokenAmount: '500000000',
        minDestTokenAmount: '475000000',
        destAsset: {
          chainId: ChainId.TRON,
          address: 'native',
          symbol: 'TRX',
          name: 'Tron',
          decimals: 6,
          assetId: 'tron:728126428/slip44:195',
        },
        bridgeId: 'test-bridge',
        bridges: [],
        steps: [
          {
            action: ActionTypes.SWAP,
            srcChainId: ChainId.TRON,
            destChainId: ChainId.TRON,
            srcAsset: {
              chainId: ChainId.TRON,
              address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
              symbol: 'USDT',
              name: 'Tether USD',
              decimals: 6,
              assetId: 'tron:728126428/slip44:195',
            },
            destAsset: {
              chainId: ChainId.TRON,
              address: 'native',
              symbol: 'TRX',
              name: 'Tron',
              decimals: 6,
              assetId: 'tron:728126428/slip44:195',
            },
            srcAmount: '1000000',
            destAmount: '500000000',
            protocol: {
              name: 'test-protocol',
              displayName: 'Test Protocol',
              icon: 'test-icon',
            },
          },
        ],
        feeData: {
          [FeeType.METABRIDGE]: {
            amount: '10000',
            asset: {
              chainId: ChainId.TRON,
              address: 'native',
              symbol: 'TRX',
              name: 'Tron',
              decimals: 6,
              assetId: 'tron:728126428/slip44:195',
            },
          },
        },
      },
      estimatedProcessingTimeInSeconds: 30,
      approval: mockTronApproval,
      trade: mockTronTrade,
      sentAmount: {
        amount: '1',
        valueInCurrency: '1',
        usd: '1',
      },
      toTokenAmount: {
        amount: '500',
        valueInCurrency: '500',
        usd: '500',
      },
      minToTokenAmount: {
        amount: '475',
        valueInCurrency: '475',
        usd: '475',
      },
      totalNetworkFee: {
        amount: '0.01',
        valueInCurrency: '0.01',
        usd: '0.01',
      },
      totalMaxNetworkFee: {
        amount: '0.015',
        valueInCurrency: '0.015',
        usd: '0.015',
      },
      gasFee: {
        effective: { amount: '0.005', valueInCurrency: '0.005', usd: '0.005' },
        total: { amount: '0.005', valueInCurrency: '0.005', usd: '0.005' },
        max: { amount: '0', valueInCurrency: null, usd: null },
      },
      adjustedReturn: {
        valueInCurrency: '499.99',
        usd: '499.99',
      },
      cost: {
        valueInCurrency: '0.01',
        usd: '0.01',
      },
      swapRate: '500',
    };

    const mockTronAccount = {
      id: 'tron-account-1',
      address: 'TRX123...',
      metadata: {
        snap: {
          id: 'npm:@metamask/tron-snap',
        },
        keyring: {
          type: 'any',
        },
      },
      options: { scope: 'tron-chain-id' },
    };

    let mockMessengerCall: jest.Mock;
    beforeEach(() => {
      jest.clearAllMocks();
      jest.clearAllTimers();
      jest.spyOn(Date, 'now').mockReturnValue(1234567890);
      mockMessengerCall = jest.fn();
      mockMessengerCall.mockImplementationOnce(jest.fn()); // stopPollingForQuotes
    });

    it('should successfully submit a Tron swap with approval transaction', async () => {
      mockMessengerCall.mockReturnValueOnce(mockTronAccount);
      mockMessengerCall.mockImplementationOnce(jest.fn()); // track event
      mockMessengerCall.mockResolvedValueOnce('approval-signature'); // approval tx
      mockMessengerCall.mockResolvedValueOnce('swap-signature'); // swap tx

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const result = await controller.submitTx(
        'TRXaccountAddress',
        mockQuoteResponse,
        false,
      );
      controller.stopAllPolling();

      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(result).toMatchSnapshot();
      // Tron swaps start polling for async settlement
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(1);
      expect(controller.state.txHistory[result.id]).toMatchSnapshot();
    });

    it('should handle approval transaction errors', async () => {
      mockMessengerCall.mockReturnValueOnce(mockTronAccount);
      mockMessengerCall.mockImplementationOnce(jest.fn()); // track event
      mockMessengerCall.mockRejectedValueOnce(
        new Error('Approval transaction failed'),
      ); // approval tx error

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);

      await expect(
        controller.submitTx('TRXaccountAddress', mockQuoteResponse, false),
      ).rejects.toThrow('Approval transaction failed');
      expect(startPollingForBridgeTxStatusSpy).not.toHaveBeenCalled();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
    });

    it('should successfully submit a Tron bridge with approval transaction', async () => {
      const mockTronBridgeQuote = {
        ...mockQuoteResponse,
        quote: {
          ...mockQuoteResponse.quote,
          destChainId: ChainId.ETH, // Different chain = bridge
        },
      };

      mockMessengerCall.mockReturnValueOnce(mockTronAccount);
      mockMessengerCall.mockImplementationOnce(jest.fn()); // track event
      mockMessengerCall.mockResolvedValueOnce('approval-signature'); // approval tx
      mockMessengerCall.mockResolvedValueOnce('bridge-signature'); // bridge tx

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const result = await controller.submitTx(
        'TRXaccountAddress',
        mockTronBridgeQuote,
        false,
      );
      controller.stopAllPolling();

      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(1);
      expect(
        startPollingForBridgeTxStatusSpy.mock.lastCall[0],
      ).toMatchSnapshot();
      expect(controller.state.txHistory[result.id]).toMatchSnapshot();
    });
  });

  describe('submitTx: EVM bridge', () => {
    const mockEvmQuoteResponse = {
      ...getMockQuote(),
      quote: {
        ...getMockQuote(),
        srcChainId: 42161, // Arbitrum
        destChainId: 10, // Optimism
      },
      estimatedProcessingTimeInSeconds: 15,
      sentAmount: { amount: '1.234', valueInCurrency: '2.00', usd: '1.01' },
      toTokenAmount: {
        amount: '1.5',
        valueInCurrency: '2.9999',
        usd: '0.134214',
      },
      minToTokenAmount: {
        amount: '1.425',
        valueInCurrency: '2.85',
        usd: '0.127',
      },
      totalNetworkFee: { amount: '1.234', valueInCurrency: null, usd: null },
      totalMaxNetworkFee: {
        amount: '1.234',
        valueInCurrency: null,
        usd: null,
      },
      gasFee: {
        effective: { amount: '.00055', valueInCurrency: null, usd: '2.5778' },
        total: { amount: '1.234', valueInCurrency: null, usd: null },
        max: { amount: '1.234', valueInCurrency: null, usd: null },
      },
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
      txReceipt: {
        gasUsed: '0x2c92a',
        effectiveGasPrice: '0x1880a',
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
      txReceipt: {
        gasUsed: '0x2c92a',
        effectiveGasPrice: '0x1880a',
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

    let mockMessengerCall: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();
      jest.clearAllTimers();
      mockMessengerCall = jest.fn();
      jest.spyOn(Date, 'now').mockReturnValue(1234567890);
      jest.spyOn(Math, 'random').mockReturnValue(0.456);
      mockMessengerCall.mockImplementationOnce(jest.fn()); // stopPollingForQuotes
    });

    const setupEventTrackingMocks = (mockCall: jest.Mock) => {
      mockCall.mockReturnValueOnce(mockSelectedAccount);
      mockCall.mockImplementationOnce(jest.fn()); // track event
    };

    const setupApprovalMocks = (mockCall: jest.Mock) => {
      mockCall.mockReturnValueOnce(mockSelectedAccount);
      mockCall.mockReturnValueOnce('arbitrum-client-id');
      mockCall.mockReturnValueOnce({
        gasFeeEstimates: { estimatedBaseFee: '0x1234' },
      });
      estimateGasFeeFn.mockResolvedValueOnce(mockEstimateGasFeeResult);
      addTransactionFn.mockResolvedValueOnce({
        transactionMeta: mockApprovalTxMeta,
        result: Promise.resolve('0xapprovalTxHash'),
      });
      mockCall.mockReturnValueOnce({
        transactions: [mockApprovalTxMeta],
      });
    };

    const setupBridgeMocks = (mockCall: jest.Mock) => {
      mockCall.mockReturnValueOnce(mockSelectedAccount);
      mockCall.mockReturnValueOnce('arbitrum');
      mockCall.mockReturnValueOnce({
        gasFeeEstimates: { estimatedBaseFee: '0x1234' },
      });
      estimateGasFeeFn.mockResolvedValueOnce(mockEstimateGasFeeResult);
      addTransactionFn.mockResolvedValueOnce({
        transactionMeta: mockEvmTxMeta,
        result: Promise.resolve('0xevmTxHash'),
      });
      mockCall.mockReturnValueOnce({
        transactions: [mockEvmTxMeta],
      });

      mockCall.mockReturnValueOnce(mockSelectedAccount);

      mockCall.mockReturnValue({
        transactions: [mockEvmTxMeta],
      });
    };

    const setupBridgeStxMocks = (mockCall: jest.Mock) => {
      mockCall.mockReturnValueOnce(mockSelectedAccount);
      mockCall.mockReturnValueOnce('arbitrum');
      mockCall.mockReturnValueOnce({
        gasFeeEstimates: { estimatedBaseFee: '0x1234' },
      });
      estimateGasFeeFn.mockResolvedValueOnce(mockEstimateGasFeeResult);
      addTransactionBatchFn.mockResolvedValueOnce({
        batchId: 'batchId1',
      });
      mockCall.mockReturnValueOnce({
        transactions: [{ ...mockEvmTxMeta, batchId: 'batchId1' }],
      });

      mockCall.mockReturnValueOnce(mockSelectedAccount);

      mockCall.mockReturnValueOnce({
        transactions: [{ ...mockEvmTxMeta, batchId: 'batchId1' }],
      });
    };

    it('should successfully submit an EVM bridge transaction with approval', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      setupApprovalMocks(mockMessengerCall);
      setupBridgeMocks(mockMessengerCall);

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const result = await controller.submitTx(
        'otherAccount',
        mockEvmQuoteResponse,
        false,
      );

      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(controller.state.txHistory[result.id]).toMatchSnapshot();
      expect(addTransactionFn.mock.calls).toMatchSnapshot();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      controller.stopAllPolling();
    });

    it('should successfully submit an EVM bridge transaction with no approval', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      setupBridgeMocks(mockMessengerCall);

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
        (quoteWithoutApproval.trade as TxData).from,
        {
          ...quoteWithoutApproval,
          quote: { ...quoteWithoutApproval.quote, destAsset: erc20Token },
        },
        false,
      );

      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(controller.state.txHistory[result.id]).toMatchSnapshot();
      expect(estimateGasFeeFn.mock.calls).toMatchSnapshot();
      expect(addTransactionFn.mock.calls).toMatchSnapshot();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
    });

    it('should handle smart transactions and include quotesReceivedContext', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      setupBridgeStxMocks(mockMessengerCall);
      addTransactionBatchFn.mockResolvedValueOnce({
        batchId: 'batchId1',
      });

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const { approval, ...quoteWithoutApproval } = mockEvmQuoteResponse;
      const result = await controller.submitTx(
        (quoteWithoutApproval.trade as TxData).from,
        quoteWithoutApproval,
        true,
        getQuotesReceivedProperties(quoteWithoutApproval, ['low_return'], true),
      );
      controller.stopAllPolling();

      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(controller.state.txHistory[result.id]).toMatchSnapshot();
      expect(estimateGasFeeFn.mock.calls).toMatchSnapshot();
      expect(addTransactionFn).not.toHaveBeenCalled();
      expect(addTransactionBatchFn.mock.calls).toMatchSnapshot();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
    });

    it('should throw an error if account is not found', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      mockMessengerCall.mockReturnValueOnce(undefined);

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const { approval, ...quoteWithoutApproval } = mockEvmQuoteResponse;

      await expect(
        controller.submitTx(
          (quoteWithoutApproval.trade as TxData).from,
          quoteWithoutApproval,
          false,
        ),
      ).rejects.toThrow(
        'Failed to submit cross-chain swap transaction: unknown account in trade data',
      );
      controller.stopAllPolling();

      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(addTransactionFn).not.toHaveBeenCalled();
    });

    it('should throw an error if EVM trade data is not valid', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      mockMessengerCall.mockReturnValueOnce(undefined);

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const { approval, ...quoteWithoutApproval } = mockEvmQuoteResponse;

      await expect(
        controller.submitTx(
          (quoteWithoutApproval.trade as TxData).from,
          {
            ...quoteWithoutApproval,
            trade: (quoteWithoutApproval.trade as TxData).data,
          },
          false,
        ),
      ).rejects.toThrow(
        'Failed to submit cross-chain swap transaction: trade is not an EVM transaction',
      );
      controller.stopAllPolling();

      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(addTransactionFn).not.toHaveBeenCalled();
    });

    it('should throw an error if Solana trade data is not valid', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      mockMessengerCall.mockReturnValueOnce(undefined);

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const { approval, ...quoteWithoutApproval } = mockEvmQuoteResponse;

      await expect(
        controller.submitTx(
          (quoteWithoutApproval.trade as TxData).from,
          {
            ...quoteWithoutApproval,
            quote: {
              ...quoteWithoutApproval.quote,
              srcChainId: ChainId.SOLANA,
            },
          },
          false,
        ),
      ).rejects.toThrow(
        'Failed to submit cross-chain swap transaction: trade is not a non-EVM transaction',
      );
      controller.stopAllPolling();

      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(addTransactionFn).not.toHaveBeenCalled();
    });

    it('should reset USDT allowance', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      mockIsEthUsdt.mockReturnValueOnce(true);

      // USDT approval reset
      setupApprovalMocks(mockMessengerCall);

      // Approval tx
      setupApprovalMocks(mockMessengerCall);

      // Bridge transaction
      setupBridgeMocks(mockMessengerCall);

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const result = await controller.submitTx(
        (mockEvmQuoteResponse.trade as TxData).from,
        {
          ...mockEvmQuoteResponse,
          resetApproval: {
            chainId: 1,
            data: '0x095ea7b3000000000000000000000000881d40237659c251811cec9c364ef91dc08d300c0000000000000000000000000000000000000000000000000000000000000000',
            from: '0xaccount1',
            gasLimit: 21000,
            to: '0xtokenContract',
            value: '0x0',
          },
        },
        false,
      );
      controller.stopAllPolling();

      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(controller.state.txHistory[result.id]).toMatchSnapshot();
      expect(estimateGasFeeFn.mock.calls).toMatchSnapshot();
      expect(addTransactionFn.mock.calls).toMatchSnapshot();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
    });

    it('should handle smart transactions with USDT reset', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arbitrum');
      mockMessengerCall.mockReturnValueOnce({
        gasFeeEstimates: { estimatedBaseFee: '0x1234' },
      });
      estimateGasFeeFn.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockMessengerCall.mockReturnValueOnce({
        gasFeeEstimates: { estimatedBaseFee: '0x1234' },
      });
      estimateGasFeeFn.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockMessengerCall.mockReturnValueOnce({
        gasFeeEstimates: { estimatedBaseFee: '0x1234' },
      });
      estimateGasFeeFn.mockResolvedValueOnce(mockEstimateGasFeeResult);
      addTransactionBatchFn.mockResolvedValueOnce({
        batchId: 'batchId1',
      });
      mockMessengerCall.mockReturnValueOnce({
        transactions: [{ ...mockEvmTxMeta, batchId: 'batchId1' }],
      });
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const result = await controller.submitTx(
        (mockEvmQuoteResponse.trade as TxData).from,
        {
          ...mockEvmQuoteResponse,
          resetApproval: {
            chainId: 1,
            data: '0x095ea7b3000000000000000000000000881d40237659c251811cec9c364ef91dc08d300c0000000000000000000000000000000000000000000000000000000000000000',
            from: '0xaccount1',
            gasLimit: 21000,
            to: '0xtokenContract',
            value: '0x0',
          },
        },
        true,
      );
      controller.stopAllPolling();

      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      const { quote, txMetaId, batchId } =
        controller.state.txHistory[result.id];
      expect(quote).toBeDefined();
      expect(txMetaId).toBe(result.id);
      expect(batchId).toBe('batchId1');
      expect(estimateGasFeeFn).toHaveBeenCalledTimes(3);
      expect(addTransactionFn).not.toHaveBeenCalled();
      expect(addTransactionBatchFn).toHaveBeenCalledTimes(1);
      expect(mockMessengerCall).toHaveBeenCalledTimes(9);
    });

    it('should throw an error if approval tx fails', async () => {
      setupEventTrackingMocks(mockMessengerCall);
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
        controller.submitTx(
          (mockEvmQuoteResponse.trade as TxData).from,
          mockEvmQuoteResponse,
          false,
        ),
      ).rejects.toThrow('Approval tx failed');

      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(addTransactionFn.mock.calls).toMatchSnapshot();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
    });

    it('should throw an error if approval tx meta does not exist', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arbitrum-client-id');
      mockMessengerCall.mockReturnValueOnce({
        gasFeeEstimates: { estimatedBaseFee: '0x1234' },
      });
      estimateGasFeeFn.mockResolvedValueOnce(mockEstimateGasFeeResult);
      addTransactionFn.mockResolvedValueOnce({
        transactionMeta: undefined,
        result: new Promise((resolve) => resolve('0xevmTxHash')),
      });
      mockMessengerCall.mockReturnValueOnce({
        transactions: [],
      });

      setupBridgeMocks(mockMessengerCall);
      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);

      await expect(
        controller.submitTx(
          (mockEvmQuoteResponse.trade as TxData).from,
          mockEvmQuoteResponse,
          false,
        ),
      ).rejects.toThrow(
        'Failed to submit cross-chain swap tx: txMeta for txHash was not found',
      );

      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(addTransactionFn.mock.calls).toMatchSnapshot();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
    });

    it('should delay after submitting linea approval', async () => {
      const handleLineaDelaySpy = jest
        .spyOn(transactionUtils, 'handleApprovalDelay')
        .mockResolvedValueOnce();
      const mockTraceFn = jest
        .fn()
        .mockImplementation((_p, callback) => callback());

      setupEventTrackingMocks(mockMessengerCall);
      setupApprovalMocks(mockMessengerCall);
      setupBridgeMocks(mockMessengerCall);

      const { controller, startPollingForBridgeTxStatusSpy } = getController(
        mockMessengerCall,
        mockTraceFn,
      );

      const lineaQuoteResponse = {
        ...mockEvmQuoteResponse,
        quote: { ...mockEvmQuoteResponse.quote, srcChainId: 59144 },
        trade: {
          ...(mockEvmQuoteResponse.trade as TxData),
          gasLimit: undefined,
        } as never,
      };

      const result = await controller.submitTx(
        'otherAccount',
        lineaQuoteResponse,
        false,
      );
      controller.stopAllPolling();

      expect(mockTraceFn).toHaveBeenCalledTimes(2);
      expect(handleLineaDelaySpy).toHaveBeenCalledTimes(1);
      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(controller.state.txHistory[result.id]).toMatchSnapshot();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(mockTraceFn.mock.calls).toMatchSnapshot();
    });

    it('should delay after submitting base approval', async () => {
      const handleBaseDelaySpy = jest
        .spyOn(transactionUtils, 'handleApprovalDelay')
        .mockResolvedValueOnce();
      const mockTraceFn = jest
        .fn()
        .mockImplementation((_p, callback) => callback());

      setupEventTrackingMocks(mockMessengerCall);
      setupApprovalMocks(mockMessengerCall);
      setupBridgeMocks(mockMessengerCall);

      const { controller, startPollingForBridgeTxStatusSpy } = getController(
        mockMessengerCall,
        mockTraceFn,
      );

      const baseQuoteResponse = {
        ...mockEvmQuoteResponse,
        quote: { ...mockEvmQuoteResponse.quote, srcChainId: 8453 },
        trade: {
          ...(mockEvmQuoteResponse.trade as TxData),
          gasLimit: undefined,
        } as never,
      };

      const result = await controller.submitTx(
        'otherAccount',
        baseQuoteResponse,
        false,
      );
      controller.stopAllPolling();

      expect(mockTraceFn).toHaveBeenCalledTimes(2);
      expect(handleBaseDelaySpy).toHaveBeenCalledTimes(1);
      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(controller.state.txHistory[result.id]).toMatchSnapshot();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(mockTraceFn.mock.calls).toMatchSnapshot();
    });

    it('should call handleMobileHardwareWalletDelay for hardware wallet on mobile', async () => {
      const handleMobileHardwareWalletDelaySpy = jest
        .spyOn(transactionUtils, 'handleMobileHardwareWalletDelay')
        .mockResolvedValueOnce();
      const mockTraceFn = jest
        .fn()
        .mockImplementation((_p, callback) => callback());

      // Mock for hardware wallet check
      mockMessengerCall.mockReturnValueOnce({
        ...mockSelectedAccount,
        metadata: {
          ...mockSelectedAccount.metadata,
          keyring: {
            type: 'Ledger Hardware',
          },
        },
      });
      mockMessengerCall.mockImplementationOnce(jest.fn()); // track event

      setupApprovalMocks(mockMessengerCall);
      setupBridgeMocks(mockMessengerCall);

      const { controller, startPollingForBridgeTxStatusSpy } = getController(
        mockMessengerCall,
        mockTraceFn,
        BridgeClientId.MOBILE,
      );

      const result = await controller.submitTx(
        (mockEvmQuoteResponse.trade as TxData).from,
        mockEvmQuoteResponse,
        false,
      );
      controller.stopAllPolling();

      expect(mockTraceFn).toHaveBeenCalledTimes(2);
      expect(handleMobileHardwareWalletDelaySpy).toHaveBeenCalledTimes(1);
      expect(handleMobileHardwareWalletDelaySpy).toHaveBeenCalledWith(true);
      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(controller.state.txHistory[result.id]).toMatchSnapshot();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(mockTraceFn.mock.calls).toMatchSnapshot();
    });

    it('should not call handleMobileHardwareWalletDelay on extension', async () => {
      const handleMobileHardwareWalletDelaySpy = jest
        .spyOn(transactionUtils, 'handleMobileHardwareWalletDelay')
        .mockResolvedValueOnce();
      const mockTraceFn = jest
        .fn()
        .mockImplementation((_p, callback) => callback());

      setupEventTrackingMocks(mockMessengerCall);
      setupApprovalMocks(mockMessengerCall);
      setupBridgeMocks(mockMessengerCall);

      const { controller, startPollingForBridgeTxStatusSpy } = getController(
        mockMessengerCall,
        mockTraceFn,
        BridgeClientId.EXTENSION, // Using EXTENSION client
      );

      const result = await controller.submitTx(
        'otherAccount',
        mockEvmQuoteResponse,
        false,
      );
      controller.stopAllPolling();

      expect(mockTraceFn).toHaveBeenCalledTimes(2);
      // Should call the function but with false since it's Extension
      expect(handleMobileHardwareWalletDelaySpy).toHaveBeenCalledTimes(1);
      expect(handleMobileHardwareWalletDelaySpy).toHaveBeenCalledWith(false);
      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(controller.state.txHistory[result.id]).toMatchSnapshot();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(mockTraceFn.mock.calls).toMatchSnapshot();
    });

    it('should not call handleMobileHardwareWalletDelay with true for non-hardware wallet on mobile', async () => {
      const handleMobileHardwareWalletDelaySpy = jest
        .spyOn(transactionUtils, 'handleMobileHardwareWalletDelay')
        .mockResolvedValueOnce();
      const mockTraceFn = jest
        .fn()
        .mockImplementation((_p, callback) => callback());

      // Mock for non-hardware wallet check
      mockMessengerCall.mockReturnValueOnce({
        ...mockSelectedAccount,
        metadata: {
          ...mockSelectedAccount.metadata,
          keyring: {
            type: 'HD Key Tree', // Not a hardware wallet
          },
        },
      });
      mockMessengerCall.mockImplementationOnce(jest.fn()); // track event

      setupApprovalMocks(mockMessengerCall);
      setupBridgeMocks(mockMessengerCall);

      const { controller, startPollingForBridgeTxStatusSpy } = getController(
        mockMessengerCall,
        mockTraceFn,
        BridgeClientId.MOBILE, // Using MOBILE client
      );

      const result = await controller.submitTx(
        (mockEvmQuoteResponse.trade as TxData).from,
        mockEvmQuoteResponse,
        false,
      );
      controller.stopAllPolling();

      expect(mockTraceFn).toHaveBeenCalledTimes(2);
      // Should call the function but with false since it's not a hardware wallet
      expect(handleMobileHardwareWalletDelaySpy).toHaveBeenCalledTimes(1);
      expect(handleMobileHardwareWalletDelaySpy).toHaveBeenCalledWith(false);
      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(controller.state.txHistory[result.id]).toMatchSnapshot();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
      expect(mockTraceFn.mock.calls).toMatchSnapshot();
    });

    describe('actionId tracking and rekeying', () => {
      it('should add pre-submission history keyed by actionId and rekey to txMeta.id after success', async () => {
        // Mock generateActionId to return a predictable value
        const mockActionId = '1234567890.456';
        jest
          .spyOn(transactionUtils, 'generateActionId')
          .mockReturnValue(mockActionId);

        setupEventTrackingMocks(mockMessengerCall);
        // No approval for this test - direct to bridge tx
        const { approval, ...quoteWithoutApproval } = mockEvmQuoteResponse;
        setupBridgeMocks(mockMessengerCall);

        const { controller, startPollingForBridgeTxStatusSpy } =
          getController(mockMessengerCall);

        const result = await controller.submitTx(
          (quoteWithoutApproval.trade as TxData).from,
          quoteWithoutApproval,
          false, // STX disabled - uses non-batch path
        );
        controller.stopAllPolling();

        // Verify the final history is keyed by txMeta.id (not actionId)
        expect(controller.state.txHistory[result.id]).toBeDefined();
        expect(controller.state.txHistory[result.id].txMetaId).toBe(result.id);
        expect(controller.state.txHistory[result.id].actionId).toBe(
          mockActionId,
        );

        // Verify the actionId key no longer exists (was rekeyed)
        expect(controller.state.txHistory[mockActionId]).toBeUndefined();

        // Verify srcTxHash was updated during rekey
        expect(
          controller.state.txHistory[result.id].status.srcChain.txHash,
        ).toBe(result.hash);

        expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      });

      it('should preserve pre-submission history for tracking when trade tx submission fails', async () => {
        const mockActionId = '9876543210.789';
        jest
          .spyOn(transactionUtils, 'generateActionId')
          .mockReturnValue(mockActionId);

        setupEventTrackingMocks(mockMessengerCall);
        const { approval, ...quoteWithoutApproval } = mockEvmQuoteResponse;

        // Setup for trade tx (no approval)
        mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
        mockMessengerCall.mockReturnValueOnce('arbitrum-client-id');
        mockMessengerCall.mockReturnValueOnce({
          gasFeeEstimates: { estimatedBaseFee: '0x1234' },
        });
        estimateGasFeeFn.mockResolvedValueOnce({
          estimates: {
            high: {
              suggestedMaxFeePerGas: '0x1234',
              suggestedMaxPriorityFeePerGas: '0x5678',
            },
          },
        });

        // Trade tx fails during submission
        addTransactionFn.mockRejectedValueOnce(
          new Error('Trade tx submission failed'),
        );

        const { controller, startPollingForBridgeTxStatusSpy } =
          getController(mockMessengerCall);

        await expect(
          controller.submitTx(
            (quoteWithoutApproval.trade as TxData).from,
            quoteWithoutApproval,
            false,
          ),
        ).rejects.toThrow('Trade tx submission failed');

        // Verify: Pre-submission history should still exist keyed by actionId
        // This allows failed event tracking to find the quote data
        expect(controller.state.txHistory[mockActionId]).toBeDefined();
        expect(controller.state.txHistory[mockActionId].actionId).toBe(
          mockActionId,
        );
        expect(
          controller.state.txHistory[mockActionId].txMetaId,
        ).toBeUndefined();
        expect(
          controller.state.txHistory[mockActionId].status.srcChain.txHash,
        ).toBe(''); // Empty since tx was never submitted

        expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      });

      it('should use provided actionId from addTransactionFn result', async () => {
        const mockActionId = '1111111111.222';
        jest
          .spyOn(transactionUtils, 'generateActionId')
          .mockReturnValue(mockActionId);

        setupEventTrackingMocks(mockMessengerCall);
        setupApprovalMocks(mockMessengerCall);
        setupBridgeMocks(mockMessengerCall);

        const { controller, startPollingForBridgeTxStatusSpy } =
          getController(mockMessengerCall);

        const result = await controller.submitTx(
          (mockEvmQuoteResponse.trade as TxData).from,
          mockEvmQuoteResponse,
          false, // STX disabled
        );
        controller.stopAllPolling();

        // Verify actionId is stored in the history item
        expect(controller.state.txHistory[result.id].actionId).toBe(
          mockActionId,
        );
        expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      });
    });
  });

  describe('submitTx: EVM swap', () => {
    const mockEvmQuoteResponse = {
      ...getMockQuote(),
      quote: {
        ...getMockQuote(),
        srcChainId: 42161,
        destChainId: 42161,
      },
      estimatedProcessingTimeInSeconds: 0,
      sentAmount: { amount: '1.234', valueInCurrency: '2.00', usd: '1.01' },
      toTokenAmount: {
        amount: '1.5',
        valueInCurrency: '2.9999',
        usd: '0.134214',
      },
      minToTokenAmount: {
        amount: '1.425',
        valueInCurrency: '2.85',
        usd: '0.127',
      },
      totalNetworkFee: { amount: '1.234', valueInCurrency: null, usd: null },
      totalMaxNetworkFee: {
        amount: '1.234',
        valueInCurrency: null,
        usd: null,
      },
      gasFee: {
        effective: { amount: '.00055', valueInCurrency: null, usd: '2.5778' },
        total: { amount: '1.234', valueInCurrency: null, usd: null },
        max: { amount: '1.234', valueInCurrency: null, usd: null },
      },
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
      type: TransactionType.swap,
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
      type: TransactionType.swapApproval,
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
    let mockMessengerCall: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();
      mockMessengerCall = jest.fn();
      jest.spyOn(Date, 'now').mockReturnValue(1234567890);
      jest.spyOn(Math, 'random').mockReturnValue(0.456);
      mockMessengerCall.mockImplementationOnce(jest.fn()); // stopPollingForQuotes
    });

    const setupEventTrackingMocks = (mockCall: jest.Mock) => {
      mockCall.mockReturnValueOnce(mockSelectedAccount);
      mockCall.mockImplementationOnce(jest.fn()); // track event
    };

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
      // mockMessengerCall.mockReturnValueOnce({
      //   transactions: [mockEvmTxMeta],
      // });
    };

    it('should successfully submit an EVM swap transaction with approval', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      setupApprovalMocks();
      setupBridgeMocks();

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const result = await controller.submitTx(
        (mockEvmQuoteResponse.trade as TxData).from,
        mockEvmQuoteResponse,
        false,
      );
      controller.stopAllPolling();

      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      const { approvalTxId } = controller.state.txHistory[result.id];
      expect(approvalTxId).toBe('test-approval-tx-id');
      expect(addTransactionFn).toHaveBeenCalledTimes(2);
      expect(mockMessengerCall).toHaveBeenCalledTimes(11);
    });

    it('should successfully submit an EVM swap transaction with featureId', async () => {
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      setupApprovalMocks();
      setupBridgeMocks();

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const result = await controller.submitTx(
        (mockEvmQuoteResponse.trade as TxData).from,
        {
          ...mockEvmQuoteResponse,
          featureId: FeatureId.PERPS,
        },
        false,
      );
      controller.stopAllPolling();

      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      const { approvalTxId } = controller.state.txHistory[result.id];
      expect(approvalTxId).toBe('test-approval-tx-id');
      expect(controller.state.txHistory[result.id].featureId).toBe(
        FeatureId.PERPS,
      );
      expect(addTransactionFn).toHaveBeenCalledTimes(2);
      expect(mockMessengerCall).toHaveBeenCalledTimes(10);
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
    });

    it('should handle a gasless swap transaction with approval', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arbitrum');
      addTransactionBatchFn.mockResolvedValueOnce({
        batchId: 'batchId1',
      });
      mockMessengerCall.mockReturnValueOnce({
        transactions: [{ ...mockEvmTxMeta, batchId: 'batchId1' }],
      });

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const result = await controller.submitTx(
        (mockEvmQuoteResponse.trade as TxData).from,
        {
          ...mockEvmQuoteResponse,
          quote: {
            ...mockEvmQuoteResponse.quote,
            gasIncluded: true,
            feeData: {
              txFee: {
                maxFeePerGas: '123',
                maxPriorityFeePerGas: '123',
              } as never,
            } as never,
          },
        },
        true,
      );
      controller.stopAllPolling();

      const { txParams, ...resultsToCheck } = result;
      expect(resultsToCheck).toMatchInlineSnapshot(`
        {
          "batchId": "batchId1",
          "chainId": "0xa4b1",
          "hash": "0xevmTxHash",
          "id": "test-tx-id",
          "status": "unapproved",
          "time": 1234567890,
          "type": "swap",
        }
      `);
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(addTransactionFn).not.toHaveBeenCalled();
      expect(addTransactionBatchFn).toHaveBeenCalledTimes(1);
      expect(mockMessengerCall).toHaveBeenCalledTimes(6);
    });

    it('should successfully submit an EVM swap transaction with no approval', async () => {
      setupEventTrackingMocks(mockMessengerCall);
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
        (mockEvmQuoteResponse.trade as TxData).from,
        {
          ...quoteWithoutApproval,
          quote: { ...quoteWithoutApproval.quote, destAsset: erc20Token },
        },
        false,
      );

      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(controller.state.txHistory[result.id]).toMatchSnapshot();
      expect(estimateGasFeeFn).toHaveBeenCalledTimes(1);
      expect(addTransactionFn).toHaveBeenCalledTimes(1);
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
    });

    it('should use quote txFee when gasIncluded is true and STX is off (Max native token swap)', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      // Setup for single tx path - no gas estimation needed since gasIncluded=true
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arbitrum');
      // Skip GasFeeController mock since we use quote's txFee directly
      addTransactionFn.mockResolvedValueOnce({
        transactionMeta: mockEvmTxMeta,
        result: Promise.resolve('0xevmTxHash'),
      });
      mockMessengerCall.mockReturnValueOnce({
        transactions: [mockEvmTxMeta],
      });
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);

      const { approval, ...quoteWithoutApproval } = mockEvmQuoteResponse;
      const result = await controller.submitTx(
        (mockEvmQuoteResponse.trade as TxData).from,
        {
          ...quoteWithoutApproval,
          quote: {
            ...quoteWithoutApproval.quote,
            gasIncluded: true,
            gasIncluded7702: false,
            feeData: {
              ...quoteWithoutApproval.quote.feeData,
              txFee: {
                maxFeePerGas: '1395348', // Decimal string from quote
                maxPriorityFeePerGas: '1000001',
              },
            },
          },
        } as never,
        false, // isStxEnabledOnClient = FALSE (key for this test)
      );
      controller.stopAllPolling();

      // Should use single tx path (addTransactionFn), NOT batch path
      expect(addTransactionFn).toHaveBeenCalledTimes(1);
      expect(addTransactionBatchFn).not.toHaveBeenCalled();

      // Should NOT estimate gas (uses quote's txFee instead)
      expect(estimateGasFeeFn).not.toHaveBeenCalled();

      // Verify the tx params have hex-converted gas fees from quote
      const txParams = addTransactionFn.mock.calls[0][0];
      expect(txParams.maxFeePerGas).toBe('0x154a94'); // toHex(1395348)
      expect(txParams.maxPriorityFeePerGas).toBe('0xf4241'); // toHex(1000001)

      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(controller.state.txHistory[result.id]).toMatchSnapshot();
    });

    it('should estimate gas when gasIncluded is false and STX is off', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      setupBridgeMocks();

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);

      const { approval, ...quoteWithoutApproval } = mockEvmQuoteResponse;
      const result = await controller.submitTx(
        (mockEvmQuoteResponse.trade as TxData).from,
        {
          ...quoteWithoutApproval,
          quote: {
            ...quoteWithoutApproval.quote,
            gasIncluded: false,
            gasIncluded7702: false,
          },
        },
        false, // STX off
      );
      controller.stopAllPolling();

      // Should estimate gas since gasIncluded is false
      expect(estimateGasFeeFn).toHaveBeenCalledTimes(1);
      expect(addTransactionFn).toHaveBeenCalledTimes(1);
      expect(addTransactionBatchFn).not.toHaveBeenCalled();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(result).toMatchSnapshot();
    });

    it('should use batch path when gasIncluded7702 is true regardless of STX setting', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arbitrum');
      addTransactionBatchFn.mockResolvedValueOnce({
        batchId: 'batchId1',
      });
      mockMessengerCall.mockReturnValueOnce({
        transactions: [{ ...mockEvmTxMeta, batchId: 'batchId1' }],
      });

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);

      const { approval, ...quoteWithoutApproval } = mockEvmQuoteResponse;
      const result = await controller.submitTx(
        (mockEvmQuoteResponse.trade as TxData).from,
        {
          ...quoteWithoutApproval,
          quote: {
            ...quoteWithoutApproval.quote,
            gasIncluded: true,
            gasIncluded7702: true, // 7702 takes precedence → batch path
            feeData: {
              ...quoteWithoutApproval.quote.feeData,
              txFee: {
                maxFeePerGas: '1395348',
                maxPriorityFeePerGas: '1000001',
              },
            },
          },
        } as never,
        false, // STX off, but gasIncluded7702 = true forces batch path
      );
      controller.stopAllPolling();

      // Should use batch path because gasIncluded7702 = true
      expect(addTransactionBatchFn).toHaveBeenCalledTimes(1);
      expect(addTransactionFn).not.toHaveBeenCalled();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(result).toMatchSnapshot();
    });

    it('should handle smart transactions', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arbitrum');
      mockMessengerCall.mockReturnValueOnce({
        gasFeeEstimates: { estimatedBaseFee: '0x1234' },
      });
      estimateGasFeeFn.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockMessengerCall.mockReturnValueOnce({
        gasFeeEstimates: { estimatedBaseFee: '0x1234' },
      });
      estimateGasFeeFn.mockResolvedValueOnce(mockEstimateGasFeeResult);
      addTransactionBatchFn.mockResolvedValueOnce({
        batchId: 'batchId1',
      });
      mockMessengerCall.mockReturnValueOnce({
        transactions: [{ ...mockEvmTxMeta, batchId: 'batchId1' }],
      });

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      const result = await controller.submitTx(
        (mockEvmQuoteResponse.trade as TxData).from,
        mockEvmQuoteResponse,
        true,
      );
      controller.stopAllPolling();

      expect(result).toMatchSnapshot();
      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(controller.state.txHistory[result.id]).toMatchSnapshot();
      expect(estimateGasFeeFn.mock.calls).toMatchSnapshot();
      expect(addTransactionFn).not.toHaveBeenCalled();
      expect(addTransactionBatchFn.mock.calls).toMatchSnapshot();
      expect(mockMessengerCall.mock.calls).toMatchSnapshot();
    });

    it('should throw error if account is not found', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      mockMessengerCall.mockReturnValueOnce(undefined);

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      await expect(
        controller.submitTx(
          (mockEvmQuoteResponse.trade as TxData).from,
          mockEvmQuoteResponse,
          true,
        ),
      ).rejects.toThrow(
        'Failed to submit cross-chain swap batch transaction: unknown account in trade data',
      );
      controller.stopAllPolling();

      expect(startPollingForBridgeTxStatusSpy).not.toHaveBeenCalled();
      expect(estimateGasFeeFn).not.toHaveBeenCalled();
      expect(addTransactionFn).not.toHaveBeenCalled();
      expect(addTransactionBatchFn).not.toHaveBeenCalled();
      expect(mockMessengerCall).toHaveBeenCalledTimes(4);
    });

    it('should throw error if batched tx is not found', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arbitrum');
      mockMessengerCall.mockReturnValueOnce({
        gasFeeEstimates: { estimatedBaseFee: '0x1234' },
      });
      estimateGasFeeFn.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockMessengerCall.mockReturnValueOnce({
        gasFeeEstimates: { estimatedBaseFee: '0x1234' },
      });
      estimateGasFeeFn.mockResolvedValueOnce(mockEstimateGasFeeResult);
      addTransactionBatchFn.mockResolvedValueOnce({
        batchId: 'batchId1',
      });
      mockMessengerCall.mockReturnValueOnce({
        transactions: [{ ...mockEvmTxMeta, batchId: 'batchIdUnknown' }],
      });

      const { controller, startPollingForBridgeTxStatusSpy } =
        getController(mockMessengerCall);
      await expect(
        controller.submitTx(
          (mockEvmQuoteResponse.trade as TxData).from,
          mockEvmQuoteResponse,
          true,
        ),
      ).rejects.toThrow(
        'Failed to update cross-chain swap transaction batch: tradeMeta not found',
      );
      controller.stopAllPolling();

      expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
      expect(estimateGasFeeFn).toHaveBeenCalledTimes(2);
      expect(addTransactionFn).not.toHaveBeenCalled();
      expect(addTransactionBatchFn).toHaveBeenCalledTimes(1);
      expect(mockMessengerCall).toHaveBeenCalledTimes(8);
    });
  });

  describe('resetAttempts', () => {
    let bridgeStatusController: BridgeStatusController;
    let mockMessenger: jest.Mocked<BridgeStatusControllerMessenger>;

    beforeEach(() => {
      mockMessenger = getMessengerMock();
      bridgeStatusController = new BridgeStatusController({
        messenger: mockMessenger,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
        addTransactionFn: jest.fn(),
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
        state: {
          txHistory: {
            ...MockTxHistory.getPending({
              txMetaId: 'bridgeTxMetaId1',
              srcTxHash: '0xsrcTxHash1',
            }),
            ...MockTxHistory.getPendingSwap({
              txMetaId: 'swapTxMetaId1',
              srcTxHash: '0xswapTxHash1',
            }),
          },
        },
      });
    });

    describe('success cases', () => {
      it('should reset attempts by txMetaId for bridge transaction', () => {
        // Setup - add attempts to the history item using controller state initialization
        const controllerWithAttempts = new BridgeStatusController({
          messenger: mockMessenger,
          clientId: BridgeClientId.EXTENSION,
          fetchFn: jest.fn(),
          addTransactionFn: jest.fn(),
          addTransactionBatchFn: jest.fn(),
          updateTransactionFn: jest.fn(),
          estimateGasFeeFn: jest.fn(),
          state: {
            txHistory: {
              bridgeTxMetaId1: {
                ...MockTxHistory.getPending({ txMetaId: 'bridgeTxMetaId1' })
                  .bridgeTxMetaId1,
                attempts: {
                  counter: 5,
                  lastAttemptTime: Date.now(),
                },
              },
            },
          },
        });

        expect(
          controllerWithAttempts.state.txHistory.bridgeTxMetaId1.attempts
            ?.counter,
        ).toBe(5);

        // Execute
        controllerWithAttempts.restartPollingForFailedAttempts({
          txMetaId: 'bridgeTxMetaId1',
        });

        // Assert
        expect(
          controllerWithAttempts.state.txHistory.bridgeTxMetaId1.attempts,
        ).toBeUndefined();
      });

      it('should reset attempts by txHash for bridge transaction', () => {
        // Setup - add attempts to the history item using controller state initialization
        const controllerWithAttempts = new BridgeStatusController({
          messenger: mockMessenger,
          clientId: BridgeClientId.EXTENSION,
          fetchFn: jest.fn(),
          addTransactionFn: jest.fn(),
          addTransactionBatchFn: jest.fn(),
          updateTransactionFn: jest.fn(),
          estimateGasFeeFn: jest.fn(),
          state: {
            txHistory: {
              bridgeTxMetaId1: {
                ...MockTxHistory.getPending({ txMetaId: 'bridgeTxMetaId1' })
                  .bridgeTxMetaId1,
                attempts: {
                  counter: 3,
                  lastAttemptTime: Date.now(),
                },
              },
            },
          },
        });

        expect(
          controllerWithAttempts.state.txHistory.bridgeTxMetaId1.attempts
            ?.counter,
        ).toBe(3);

        // Execute
        controllerWithAttempts.restartPollingForFailedAttempts({
          txHash: '0xsrcTxHash1',
        });

        // Assert
        expect(
          controllerWithAttempts.state.txHistory.bridgeTxMetaId1.attempts,
        ).toBeUndefined();
      });

      it('should prioritize txMetaId when both txMetaId and txHash are provided', () => {
        // Setup - create controller with attempts on both transactions
        const controllerWithAttempts = new BridgeStatusController({
          messenger: mockMessenger,
          clientId: BridgeClientId.EXTENSION,
          fetchFn: jest.fn(),
          addTransactionFn: jest.fn(),
          addTransactionBatchFn: jest.fn(),
          updateTransactionFn: jest.fn(),
          estimateGasFeeFn: jest.fn(),
          state: {
            txHistory: {
              bridgeTxMetaId1: {
                ...MockTxHistory.getPending({ txMetaId: 'bridgeTxMetaId1' })
                  .bridgeTxMetaId1,
                attempts: {
                  counter: 3,
                  lastAttemptTime: Date.now(),
                },
              },
              swapTxMetaId1: {
                ...MockTxHistory.getPendingSwap({ txMetaId: 'swapTxMetaId1' })
                  .swapTxMetaId1,
                attempts: {
                  counter: 5,
                  lastAttemptTime: Date.now(),
                },
              },
            },
          },
        });

        // Execute with both identifiers - should use txMetaId (bridgeTxMetaId1)
        controllerWithAttempts.restartPollingForFailedAttempts({
          txMetaId: 'bridgeTxMetaId1',
          txHash: '0xswapTxHash1',
        });

        // Assert - only bridgeTxMetaId1 should have attempts reset
        expect(
          controllerWithAttempts.state.txHistory.bridgeTxMetaId1.attempts,
        ).toBeUndefined();
        expect(
          controllerWithAttempts.state.txHistory.swapTxMetaId1.attempts
            ?.counter,
        ).toBe(5);
      });

      it('should restart polling for bridge transaction when attempts are reset', async () => {
        // Setup - use the same pattern as "restarts polling for history items that are not complete"
        jest.useFakeTimers();
        const fetchBridgeTxStatusSpy = jest.spyOn(
          bridgeStatusUtils,
          'fetchBridgeTxStatus',
        );
        fetchBridgeTxStatusSpy
          .mockImplementationOnce(async () => {
            return {
              status: MockStatusResponse.getPending(),
              validationFailures: [],
            };
          })
          .mockImplementationOnce(async () => {
            return {
              status: MockStatusResponse.getPending(),
              validationFailures: [],
            };
          });

        // Create controller with a bridge transaction that has failed attempts
        const controllerWithFailedAttempts = new BridgeStatusController({
          messenger: getMessengerMock(),
          clientId: BridgeClientId.EXTENSION,
          fetchFn: jest.fn(),
          addTransactionFn: jest.fn(),
          addTransactionBatchFn: jest.fn(),
          updateTransactionFn: jest.fn(),
          estimateGasFeeFn: jest.fn(),
          state: {
            txHistory: {
              bridgeTxMetaId1: {
                ...MockTxHistory.getPending({ txMetaId: 'bridgeTxMetaId1' })
                  .bridgeTxMetaId1,
                attempts: {
                  counter: MAX_ATTEMPTS + 1, // High number to simulate failed attempts
                  lastAttemptTime: Date.now() - 60000, // 1 minute ago
                },
              },
            },
          },
        });

        // Verify initial state has attempts
        expect(
          controllerWithFailedAttempts.state.txHistory.bridgeTxMetaId1.attempts
            ?.counter,
        ).toBe(MAX_ATTEMPTS + 1);

        // Execute resetAttempts - this should reset attempts and restart polling
        controllerWithFailedAttempts.restartPollingForFailedAttempts({
          txMetaId: 'bridgeTxMetaId1',
        });

        // Verify attempts were reset
        expect(
          controllerWithFailedAttempts.state.txHistory.bridgeTxMetaId1.attempts,
        ).toBeUndefined();
        expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(0);

        // Now advance timer again - polling should work since attempts are reset
        // Advance in steps to allow recursive setTimeout to be set up properly with Jest 28
        jest.advanceTimersByTime(0);
        await flushPromises();
        jest.advanceTimersByTime(10000);
        await flushPromises();

        // Assertions - polling should now happen since attempts were reset
        expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(2);
        expect(
          controllerWithFailedAttempts.state.txHistory.bridgeTxMetaId1.attempts
            ?.counter,
        ).toBeUndefined(); // Should be undefined since we've reset attempts and fetchBridgeTxStatus did not error
      });
    });

    describe('error cases', () => {
      it('should throw error when no identifier is provided', () => {
        expect(() => {
          bridgeStatusController.restartPollingForFailedAttempts({});
        }).toThrow('Either txMetaId or txHash must be provided');
      });

      it('should throw error when txMetaId is not found', () => {
        expect(() => {
          bridgeStatusController.restartPollingForFailedAttempts({
            txMetaId: 'nonexistentTxMetaId',
          });
        }).toThrow(
          'No bridge transaction history found for txMetaId: nonexistentTxMetaId',
        );
      });

      it('should throw error when txHash is not found', () => {
        expect(() => {
          bridgeStatusController.restartPollingForFailedAttempts({
            txHash: '0xnonexistentTxHash',
          });
        }).toThrow(
          'No bridge transaction history found for txHash: 0xnonexistentTxHash',
        );
      });

      it('should throw error when txMetaId is empty string', () => {
        expect(() => {
          bridgeStatusController.restartPollingForFailedAttempts({
            txMetaId: '',
          });
        }).toThrow('Either txMetaId or txHash must be provided');
      });

      it('should throw error when txHash is empty string', () => {
        expect(() => {
          bridgeStatusController.restartPollingForFailedAttempts({
            txHash: '',
          });
        }).toThrow('Either txMetaId or txHash must be provided');
      });
    });

    describe('edge cases', () => {
      it('should handle transaction with no srcChain.txHash when searching by txHash', () => {
        // Setup - create a controller with a transaction without srcChain.txHash
        const controllerWithNoHash = new BridgeStatusController({
          messenger: mockMessenger,
          clientId: BridgeClientId.EXTENSION,
          fetchFn: jest.fn(),
          addTransactionFn: jest.fn(),
          addTransactionBatchFn: jest.fn(),
          updateTransactionFn: jest.fn(),
          estimateGasFeeFn: jest.fn(),
          state: {
            txHistory: {
              noHashTx: {
                ...MockTxHistory.getPending({ txMetaId: 'noHashTx' }).noHashTx,
                status: {
                  ...MockTxHistory.getPending({ txMetaId: 'noHashTx' }).noHashTx
                    .status,
                  srcChain: {
                    ...MockTxHistory.getPending({ txMetaId: 'noHashTx' })
                      .noHashTx.status.srcChain,
                    txHash: undefined as never,
                  },
                },
              },
            },
          },
        });

        expect(() => {
          controllerWithNoHash.restartPollingForFailedAttempts({
            txHash: '0xsomeHash',
          });
        }).toThrow(
          'No bridge transaction history found for txHash: 0xsomeHash',
        );
      });

      it('should handle transaction that exists but has no attempts to reset', () => {
        // Ensure transaction has no attempts initially
        expect(
          bridgeStatusController.state.txHistory.bridgeTxMetaId1.attempts,
        ).toBeUndefined();

        // Execute - should not throw error
        expect(() => {
          bridgeStatusController.restartPollingForFailedAttempts({
            txMetaId: 'bridgeTxMetaId1',
          });
        }).not.toThrow();

        // Assert - attempts should still be undefined
        expect(
          bridgeStatusController.state.txHistory.bridgeTxMetaId1.attempts,
        ).toBeUndefined();
      });
    });
  });

  describe('subscription handlers', () => {
    let mockMessenger: RootMessenger;
    let mockBridgeStatusMessenger: Messenger<
      'BridgeStatusController',
      MessengerActions<BridgeStatusControllerMessenger>,
      MessengerEvents<BridgeStatusControllerMessenger>,
      RootMessenger
    >;
    let mockTrackEventFn: jest.Mock;
    let bridgeStatusController: BridgeStatusController;

    let mockFetchFn: jest.Mock;
    const consoleFn = console.warn;
    let consoleFnSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.useFakeTimers();
      jest.clearAllTimers();
      jest.clearAllMocks();
      // eslint-disable-next-line no-empty-function
      consoleFnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockMessenger = new Messenger({ namespace: MOCK_ANY_NAMESPACE });
      mockBridgeStatusMessenger = new Messenger({
        namespace: BRIDGE_STATUS_CONTROLLER_NAME,
        parent: mockMessenger,
      });
      mockMessenger.delegate({
        messenger: mockBridgeStatusMessenger,
        actions: [
          'TransactionController:getState',
          'BridgeController:trackUnifiedSwapBridgeEvent',
          'AccountsController:getAccountByAddress',
        ],
        events: [
          'TransactionController:transactionFailed',
          'TransactionController:transactionConfirmed',
        ],
      });

      jest
        .spyOn(mockBridgeStatusMessenger, 'call')
        .mockImplementation((..._args) => {
          return Promise.resolve();
        });

      const mockBridgeMessenger = new Messenger<
        'BridgeController',
        MessengerActions<BridgeControllerMessenger>,
        MessengerEvents<BridgeControllerMessenger>,
        RootMessenger
      >({
        namespace: 'BridgeController',
        parent: mockMessenger,
      });
      mockTrackEventFn = jest.fn();
      new BridgeController({
        messenger: mockBridgeMessenger,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: jest.fn(),
        trackMetaMetricsFn: mockTrackEventFn,
        getLayer1GasFee: jest.fn(),
        clientVersion: '13.4.0',
      });

      mockFetchFn = jest
        .fn()
        .mockResolvedValueOnce(MockStatusResponse.getPending());

      // Create base history item for actionId-keyed entries
      const baseHistoryItem = MockTxHistory.getPending().bridgeTxMetaId1;

      bridgeStatusController = new BridgeStatusController({
        messenger: mockBridgeStatusMessenger,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: mockFetchFn,
        addTransactionFn: jest.fn(),
        addTransactionBatchFn: jest.fn(),
        updateTransactionFn: jest.fn(),
        estimateGasFeeFn: jest.fn(),
        state: {
          txHistory: {
            ...MockTxHistory.getPending(),
            ...MockTxHistory.getPendingSwap(),
            ...MockTxHistory.getPending({
              txMetaId: 'bridgeTxMetaId1WithApproval',
              approvalTxId: 'bridgeApprovalTxMetaId1' as never,
            }),
            ...MockTxHistory.getPendingSwap({
              txMetaId: 'perpsSwapTxMetaId1',
              featureId: FeatureId.PERPS as never,
            }),
            ...MockTxHistory.getPending({
              txMetaId: 'perpsBridgeTxMetaId1',
              srcTxHash: '0xperpsSrcTxHash1',
              featureId: FeatureId.PERPS as never,
            }),
            // ActionId-keyed entries for pre-submission failure tests
            'pre-submission-action-id': {
              ...baseHistoryItem,
              actionId: 'pre-submission-action-id',
              txMetaId: undefined,
            } as BridgeHistoryItem,
            'action-id-for-tracking': {
              ...baseHistoryItem,
              actionId: 'action-id-for-tracking',
              txMetaId: undefined,
            } as BridgeHistoryItem,
            'action-id-for-rejection': {
              ...baseHistoryItem,
              actionId: 'action-id-for-rejection',
              txMetaId: undefined,
            } as BridgeHistoryItem,
          },
        },
      });
    });

    afterEach(() => {
      bridgeStatusController.stopAllPolling();
      console.warn = consoleFn;
      jest.useRealTimers();
    });

    describe('TransactionController:transactionFailed', () => {
      it('should track failed event for bridge transaction', () => {
        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish('TransactionController:transactionFailed', {
          error: 'tx-error',
          transactionMeta: {
            chainId: CHAIN_IDS.ARBITRUM,
            networkClientId: 'eth-id',
            time: Date.now(),
            txParams: {} as unknown as TransactionParams,
            type: TransactionType.bridge,
            status: TransactionStatus.failed,
            id: 'bridgeTxMetaId1',
          },
        });

        expect(
          bridgeStatusController.state.txHistory.bridgeTxMetaId1.status.status,
        ).toBe(StatusTypes.FAILED);
        expect(messengerCallSpy.mock.lastCall).toMatchSnapshot();
      });

      it('should include ab_tests from history in tracked event properties', () => {
        const abTestsTxMetaId = 'bridgeTxMetaIdAbTests';
        bridgeStatusController.startPollingForBridgeTxStatus({
          ...getMockStartPollingForBridgeTxStatusArgs({
            txMetaId: abTestsTxMetaId,
            srcTxHash: '0xsrcTxHashAbTests',
          }),
          abTests: { token_details_layout: 'treatment' },
        });

        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish('TransactionController:transactionFailed', {
          error: 'tx-error',
          transactionMeta: {
            chainId: CHAIN_IDS.ARBITRUM,
            networkClientId: 'eth-id',
            time: Date.now(),
            txParams: {} as unknown as TransactionParams,
            type: TransactionType.bridge,
            status: TransactionStatus.failed,
            id: abTestsTxMetaId,
          },
        });

        expect(messengerCallSpy).toHaveBeenCalledWith(
          'BridgeController:trackUnifiedSwapBridgeEvent',
          expect.anything(),
          expect.objectContaining({
            ab_tests: { token_details_layout: 'treatment' },
          }),
        );
      });

      it('should track failed event for bridge transaction if approval is dropped', () => {
        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish('TransactionController:transactionFailed', {
          error: 'tx-error',
          transactionMeta: {
            chainId: CHAIN_IDS.ARBITRUM,
            networkClientId: 'eth-id',
            time: Date.now(),
            txParams: {} as unknown as TransactionParams,
            type: TransactionType.bridgeApproval,
            status: TransactionStatus.dropped,
            id: 'bridgeApprovalTxMetaId1',
          },
        });

        expect(messengerCallSpy.mock.lastCall).toMatchSnapshot();
        expect(
          bridgeStatusController.state.txHistory.bridgeTxMetaId1WithApproval
            .status.status,
        ).toBe(StatusTypes.FAILED);
      });

      it('should not track failed event for bridge transaction with featureId', () => {
        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish('TransactionController:transactionFailed', {
          error: 'tx-error',
          transactionMeta: {
            chainId: CHAIN_IDS.ARBITRUM,
            networkClientId: 'eth-id',
            time: Date.now(),
            txParams: {} as unknown as TransactionParams,
            type: TransactionType.bridge,
            status: TransactionStatus.failed,
            id: 'perpsBridgeTxMetaId1',
          },
        });

        expect(
          bridgeStatusController.state.txHistory.perpsBridgeTxMetaId1.status
            .status,
        ).toBe(StatusTypes.FAILED);
        expect(messengerCallSpy).not.toHaveBeenCalled();
      });

      it('should track failed event for swap transaction if approval fails', () => {
        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish('TransactionController:transactionFailed', {
          error: 'tx-error',
          transactionMeta: {
            chainId: CHAIN_IDS.ARBITRUM,
            networkClientId: 'eth-id',
            time: Date.now(),
            txParams: {} as unknown as TransactionParams,
            type: TransactionType.swapApproval,
            status: TransactionStatus.failed,
            id: 'bridgeApprovalTxMetaId1',
          },
        });

        expect(messengerCallSpy.mock.lastCall).toMatchSnapshot();
        expect(
          bridgeStatusController.state.txHistory.bridgeTxMetaId1WithApproval
            .status.status,
        ).toBe(StatusTypes.FAILED);
      });

      it('should track failed event for bridge transaction if not in txHistory', () => {
        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');
        const expectedHistory = bridgeStatusController.state.txHistory;
        mockMessenger.publish('TransactionController:transactionFailed', {
          error: 'tx-error',
          transactionMeta: {
            chainId: CHAIN_IDS.ARBITRUM,
            networkClientId: 'eth-id',
            time: Date.now(),
            txParams: {} as unknown as TransactionParams,
            type: TransactionType.bridge,
            status: TransactionStatus.failed,
            id: 'bridgeTxMetaIda',
          },
        });

        expect(bridgeStatusController.state.txHistory).toStrictEqual(
          expectedHistory,
        );
        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
      });

      it('should track failed event for swap transaction', () => {
        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish('TransactionController:transactionFailed', {
          error: 'tx-error',
          transactionMeta: {
            chainId: CHAIN_IDS.ARBITRUM,
            networkClientId: 'eth-id',
            time: Date.now(),
            txParams: {} as unknown as TransactionParams,
            type: TransactionType.swap,
            status: TransactionStatus.failed,
            id: 'swapTxMetaId1',
          },
        });

        expect(
          bridgeStatusController.state.txHistory.swapTxMetaId1.status.status,
        ).toBe(StatusTypes.FAILED);
        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
      });

      it('should not track failed event for signed status', () => {
        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish('TransactionController:transactionFailed', {
          error: 'tx-error',
          transactionMeta: {
            chainId: CHAIN_IDS.ARBITRUM,
            networkClientId: 'eth-id',
            time: Date.now(),
            txParams: {} as unknown as TransactionParams,
            type: TransactionType.swap,
            status: TransactionStatus.signed,
            id: 'swapTxMetaId1',
          },
        });

        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
      });

      it('should not track failed event for approved status', () => {
        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish('TransactionController:transactionFailed', {
          error: 'tx-error',
          transactionMeta: {
            chainId: CHAIN_IDS.ARBITRUM,
            networkClientId: 'eth-id',
            time: Date.now(),
            txParams: {} as unknown as TransactionParams,
            type: TransactionType.swap,
            status: TransactionStatus.approved,
            id: 'swapTxMetaId1',
          },
        });

        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
      });

      it('should not track failed event for other transaction types', () => {
        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish('TransactionController:transactionFailed', {
          error: 'tx-error',
          transactionMeta: {
            chainId: CHAIN_IDS.ARBITRUM,
            networkClientId: 'eth-id',
            time: Date.now(),
            txParams: {} as unknown as TransactionParams,
            type: TransactionType.simpleSend,
            status: TransactionStatus.failed,
            id: 'simpleSendTxMetaId1',
          },
        });

        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
      });

      it('should find history by actionId when txMeta.id not in history (pre-submission failure)', () => {
        // The history entry keyed by actionId is set up in beforeEach
        const actionId = 'pre-submission-action-id';
        const unknownTxMetaId = 'unknown-tx-meta-id';

        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');

        // Publish failure with an unknown txMeta.id but with matching actionId
        mockMessenger.publish('TransactionController:transactionFailed', {
          error: 'tx-error',
          transactionMeta: {
            chainId: CHAIN_IDS.ARBITRUM,
            networkClientId: 'eth-id',
            time: Date.now(),
            txParams: {} as unknown as TransactionParams,
            type: TransactionType.bridge,
            status: TransactionStatus.failed,
            id: unknownTxMetaId,
            actionId, // ActionId matches the history entry
          },
        });

        // Verify: History entry keyed by actionId should be marked as failed
        expect(
          bridgeStatusController.state.txHistory[actionId].status.status,
        ).toBe(StatusTypes.FAILED);
        expect(messengerCallSpy.mock.lastCall).toMatchSnapshot();
      });

      it('should track failed event using actionId lookup when id not found', () => {
        // The history entry keyed by actionId is set up in beforeEach
        const actionId = 'action-id-for-tracking';

        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');

        mockMessenger.publish('TransactionController:transactionFailed', {
          error: 'tx-error',
          transactionMeta: {
            chainId: CHAIN_IDS.ARBITRUM,
            networkClientId: 'eth-id',
            time: Date.now(),
            txParams: {} as unknown as TransactionParams,
            type: TransactionType.bridge,
            status: TransactionStatus.failed,
            id: 'non-existent-tx-id',
            actionId,
          },
        });

        // The Failed event should be tracked with the history data from actionId lookup
        expect(messengerCallSpy).toHaveBeenCalled();
        expect(
          bridgeStatusController.state.txHistory[actionId].status.status,
        ).toBe(StatusTypes.FAILED);
      });

      it('should not track failed event when transaction is rejected', () => {
        // The history entry keyed by actionId is set up in beforeEach
        const actionId = 'action-id-for-rejection';

        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');

        mockMessenger.publish('TransactionController:transactionFailed', {
          error: 'User rejected',
          transactionMeta: {
            chainId: CHAIN_IDS.ARBITRUM,
            networkClientId: 'eth-id',
            time: Date.now(),
            txParams: {} as unknown as TransactionParams,
            type: TransactionType.bridge,
            status: TransactionStatus.rejected,
            id: 'rejected-tx-id',
            actionId,
          },
        });

        // Status should still be marked as failed
        expect(
          bridgeStatusController.state.txHistory[actionId].status.status,
        ).toBe(StatusTypes.FAILED);
        // But Failed event should NOT be tracked for rejected status
        // (check that call was not made for tracking - only for marking failed)
        expect(messengerCallSpy).not.toHaveBeenCalled();
      });
    });

    describe('TransactionController:transactionConfirmed', () => {
      beforeEach(() => {
        jest.clearAllMocks();
      });

      it('should start polling for bridge tx if status response is invalid', async () => {
        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');

        mockFetchFn.mockClear();
        mockFetchFn.mockResolvedValueOnce({
          ...MockStatusResponse.getComplete(),
          status: 'INVALID',
        });
        const oldHistoryItem =
          bridgeStatusController.getBridgeHistoryItemByTxMetaId(
            'bridgeTxMetaId1',
          );
        mockMessenger.publish('TransactionController:transactionConfirmed', {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: {} as unknown as TransactionParams,
          type: TransactionType.bridge,
          status: TransactionStatus.confirmed,
          id: 'bridgeTxMetaId1',
        });

        jest.advanceTimersByTime(500);
        bridgeStatusController.stopAllPolling();
        await flushPromises();

        expect(messengerCallSpy.mock.lastCall).toMatchSnapshot();
        expect(mockFetchFn).toHaveBeenCalledTimes(3);
        expect(mockFetchFn).toHaveBeenCalledWith(
          'https://bridge.api.cx.metamask.io/getTxStatus?bridgeId=lifi&srcTxHash=0xsrcTxHash1&bridge=across&srcChainId=42161&destChainId=10&refuel=false&requestId=197c402f-cb96-4096-9f8c-54aed84ca776',
          {
            headers: { 'X-Client-Id': BridgeClientId.EXTENSION },
          },
        );
        expect(
          bridgeStatusController.getBridgeHistoryItemByTxMetaId(
            'bridgeTxMetaId1',
          ),
        ).toStrictEqual({
          ...oldHistoryItem,
          attempts: expect.objectContaining({
            counter: 1,
          }),
        });
        expect(consoleFnSpy.mock.calls).toMatchSnapshot();
      });

      it('should start polling for completed bridge tx with featureId', async () => {
        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');

        mockFetchFn.mockClear();
        mockFetchFn.mockResolvedValueOnce(
          MockStatusResponse.getComplete({ srcTxHash: '0xperpsSrcTxHash1' }),
        );
        mockMessenger.publish('TransactionController:transactionConfirmed', {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: {} as unknown as TransactionParams,
          type: TransactionType.bridge,
          status: TransactionStatus.confirmed,
          id: 'perpsBridgeTxMetaId1',
        });

        jest.advanceTimersByTime(30500);
        bridgeStatusController.stopAllPolling();
        await flushPromises();

        expect(messengerCallSpy.mock.calls).toMatchInlineSnapshot(`
          [
            [
              "AuthenticationController:getBearerToken",
            ],
            [
              "AuthenticationController:getBearerToken",
            ],
          ]
        `);
        expect(mockFetchFn).toHaveBeenCalledWith(
          'https://bridge.api.cx.metamask.io/getTxStatus?bridgeId=lifi&srcTxHash=0xperpsSrcTxHash1&bridge=across&srcChainId=42161&destChainId=10&refuel=false&requestId=197c402f-cb96-4096-9f8c-54aed84ca776',
          {
            headers: { 'X-Client-Id': BridgeClientId.EXTENSION },
          },
        );
        expect(
          bridgeStatusController.getBridgeHistoryItemByTxMetaId(
            'perpsBridgeTxMetaId1',
          )?.status,
        ).toMatchSnapshot();
        expect(consoleFnSpy).not.toHaveBeenCalled();
      });

      it('should start polling for failed bridge tx with featureId', async () => {
        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');

        mockFetchFn.mockClear();
        mockFetchFn.mockResolvedValueOnce(
          MockStatusResponse.getFailed({ srcTxHash: '0xperpsSrcTxHash1' }),
        );
        mockMessenger.publish('TransactionController:transactionConfirmed', {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: {} as unknown as TransactionParams,
          type: TransactionType.bridge,
          status: TransactionStatus.confirmed,
          id: 'perpsBridgeTxMetaId1',
        });

        jest.advanceTimersByTime(40500);
        bridgeStatusController.stopAllPolling();
        await flushPromises();

        expect(messengerCallSpy.mock.calls).toMatchInlineSnapshot(`
          [
            [
              "AuthenticationController:getBearerToken",
            ],
            [
              "AuthenticationController:getBearerToken",
            ],
          ]
        `);
        expect(mockFetchFn).toHaveBeenCalledWith(
          'https://bridge.api.cx.metamask.io/getTxStatus?bridgeId=lifi&srcTxHash=0xperpsSrcTxHash1&bridge=across&srcChainId=42161&destChainId=10&refuel=false&requestId=197c402f-cb96-4096-9f8c-54aed84ca776',
          {
            headers: { 'X-Client-Id': BridgeClientId.EXTENSION },
          },
        );
        expect(
          bridgeStatusController.getBridgeHistoryItemByTxMetaId(
            'perpsBridgeTxMetaId1',
          )?.status,
        ).toMatchSnapshot();
        expect(consoleFnSpy).not.toHaveBeenCalled();
      });

      it('should track completed event for swap transaction', () => {
        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish('TransactionController:transactionConfirmed', {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: {} as unknown as TransactionParams,
          type: TransactionType.swap,
          status: TransactionStatus.confirmed,
          id: 'swapTxMetaId1',
        });

        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
      });

      it('should not track completed event for swap transaction with featureId', () => {
        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish('TransactionController:transactionConfirmed', {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: {} as unknown as TransactionParams,
          type: TransactionType.swap,
          status: TransactionStatus.confirmed,
          id: 'perpsSwapTxMetaId1',
        });

        expect(messengerCallSpy).not.toHaveBeenCalled();
      });

      it('should not track completed event for other transaction types', () => {
        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish('TransactionController:transactionConfirmed', {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: {} as unknown as TransactionParams,
          type: TransactionType.bridge,
          status: TransactionStatus.confirmed,
          id: 'bridgeTxMetaId1',
        });

        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
      });

      it('should not start polling for bridge tx if tx is not in txHistory', () => {
        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish('TransactionController:transactionConfirmed', {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: {} as unknown as TransactionParams,
          type: TransactionType.bridge,
          status: TransactionStatus.confirmed,
          id: 'bridgeTxMetaId1Unknown',
        });

        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
      });

      it('should not append auth token to status request when getBearerToken throws an error', async () => {
        const messengerCallSpy = jest.spyOn(mockBridgeStatusMessenger, 'call');

        messengerCallSpy.mockImplementation(() => {
          throw new Error(
            'AuthenticationController:getBearerToken not implemented',
          );
        });
        mockFetchFn.mockClear();
        mockFetchFn.mockResolvedValueOnce(
          MockStatusResponse.getComplete({ srcTxHash: '0xperpsSrcTxHash1' }),
        );
        mockMessenger.publish('TransactionController:transactionConfirmed', {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: {} as unknown as TransactionParams,
          type: TransactionType.bridge,
          status: TransactionStatus.confirmed,
          id: 'perpsBridgeTxMetaId1',
        });

        jest.advanceTimersByTime(30500);
        bridgeStatusController.stopAllPolling();
        await flushPromises();

        expect(messengerCallSpy.mock.calls).toMatchInlineSnapshot(`
          [
            [
              "AuthenticationController:getBearerToken",
            ],
            [
              "AuthenticationController:getBearerToken",
            ],
          ]
        `);
        expect(mockFetchFn).toHaveBeenCalledWith(
          'https://bridge.api.cx.metamask.io/getTxStatus?bridgeId=lifi&srcTxHash=0xperpsSrcTxHash1&bridge=across&srcChainId=42161&destChainId=10&refuel=false&requestId=197c402f-cb96-4096-9f8c-54aed84ca776',
          {
            headers: { 'X-Client-Id': BridgeClientId.EXTENSION },
          },
        );
        expect(consoleFnSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const { controller } = getController(jest.fn());

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });

    it('includes expected state in state logs', () => {
      const { controller } = getController(jest.fn());

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`
        {
          "txHistory": {},
        }
      `);
    });

    it('persists expected state', () => {
      const { controller } = getController(jest.fn());

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`
        {
          "txHistory": {},
        }
      `);
    });

    it('exposes expected state to UI', () => {
      const { controller } = getController(jest.fn());

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
        {
          "txHistory": {},
        }
      `);
    });
  });
});
