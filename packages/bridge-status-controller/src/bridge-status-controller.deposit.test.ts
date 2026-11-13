// oxlint-disable typescript/no-unsafe-call
import type {
  BridgeControllerMessenger,
  QuoteResponseV1,
  QuoteMetadata,
  SwapTraceFunction,
  SwapTraceRequest,
  Trade,
  TxData,
} from '@metamask/bridge-controller';
import {
  ActionTypes,
  ChainId,
  FeeType,
  StatusTypes,
  getNativeAssetForChainId,
  FeatureId,
  getQuotesReceivedProperties,
  UnifiedSwapBridgeEventName,
  MetaMetricsSwapsEventSource,
  mergeQuoteMetadata,
  validateQuoteResponseV1,
  toQuoteResponseV2,
} from '@metamask/bridge-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import type { NetworkState, Provider } from '@metamask/network-controller';
import {
  CHAIN_IDS,
  GasFeeEstimateType,
  TransactionType,
  TransactionStatus,
} from '@metamask/transaction-controller';
import type {
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';
import type { CaipAssetType } from '@metamask/utils';
import { numberToHex } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
// oxlint-disable vitest/no-conditional-in-test typescript/no-unsafe-return
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable vitest/no-restricted-matchers */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, MockInstance } from 'vitest';

import { flushPromises } from '../../../tests/vitest/helpers.js';
import { BridgeStatusController } from './bridge-status-controller.js';
import {
  BRIDGE_STATUS_CONTROLLER_NAME,
  DEFAULT_MAX_PENDING_HISTORY_ITEM_AGE_MS,
  TraceName,
} from './constants.js';
import { QuoteStatusState } from './quote-status-manager/constants.js';
import { QuoteStatusManager } from './quote-status-manager/quotes-status-manager.js';
import { submitDepositHandler } from './strategy/deposit-strategy.js';
import type { SubmitStrategyParams } from './strategy/types.js';
import { BridgeClientId, Operation } from './types.js';
import type {
  BridgeId,
  StartPollingForBridgeTxStatusArgs,
  BridgeHistoryItem,
  BridgeStatusControllerMessenger,
  StatusResponse,
} from './types.js';
import * as bridgeStatusUtils from './utils/bridge-status.js';
import * as historyUtils from './utils/history.js';
import * as intentApi from './utils/intent-api.js';
import * as metricsUtils from './utils/metrics.js';
import * as networkUtils from './utils/network.js';
import * as transactionUtils from './utils/transaction.js';
import { IntentOrderStatus } from './utils/validators.js';

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

vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

const mockIsEthUsdt = vi.fn();
vi.mock(import('@metamask/bridge-controller'), async (importOriginal) => ({
  ...(await importOriginal()),
  isEthUsdt: () => mockIsEthUsdt(),
}));

const mockGenerateBatchId = vi.fn();
vi.mock(import('@metamask/transaction-controller'), async (importOriginal) => ({
  ...(await importOriginal()),
  generateBatchId: () => {
    return mockGenerateBatchId();
  },
}));

const { mockBuildMoneyAccountDepositBatch, mockGetMoneyAccountVaultConfig } =
  vi.hoisted(() => ({
    mockBuildMoneyAccountDepositBatch: vi.fn(),
    mockGetMoneyAccountVaultConfig: vi.fn(),
  }));
vi.mock('@metamask/money-account-utils', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@metamask/money-account-utils')>();
  return {
    ...actual,
    getMoneyAccountVaultConfig: (...args: unknown[]) =>
      mockGetMoneyAccountVaultConfig(...args),
    buildMoneyAccountDepositBatch: (...args: unknown[]) =>
      mockBuildMoneyAccountDepositBatch(...args),
  };
});

const MockStatusResponse = {
  getPending: ({
    srcTxHash = '0xsrcTxHash1',
    srcChainId = 42161,
    destChainId = 10,
  } = {}) => ({
    status: 'PENDING' as StatusTypes,
    srcChain: {
      chainId: srcChainId,
      txHash: srcTxHash === 'undefined' ? undefined : srcTxHash,
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
    bridge: 'debridge',
    srcChain: {
      chainId: srcChainId,
      txHash: srcTxHash,
      amount: '991250000000000',
      token: {
        address: '0x0000000000000000000000000000000000000000',
        assetId: `eip155:${srcChainId}/slip44:60`,
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
} = {}): StartPollingForBridgeTxStatusArgs => ({
  bridgeTxMeta: {
    id: txMetaId,
    hash: srcTxHash === 'undefined' ? undefined : srcTxHash,
  },
  quoteResponse: {
    ...{
      quote: getMockQuote({ srcChainId, destChainId }),
      trade: {
        chainId: srcChainId,
        to: '0x23981fC34e69eeDFE2BD9a0a9fCb0719Fe09DbFC',
        from: account as Hex,
        value: '0x038d7ea4c68000',
        data: '0x3ce33bff0000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000038d7ea4c6800000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000d6c6966694164617074657256320000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000e397c4883ec89ed4fc9d258f00c689708b2799c9000000000000000000000000e397c4883ec89ed4fc9d258f00c689708b2799c9000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000038589602234000000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000007f544a44c0000000000000000000000000056ca675c3633cc16bd6849e2b431d4e8de5e23bf000000000000000000000000000000000000000000000000000000000000006c5a39b10a4f4f0747826140d2c5fe6ef47965741f6f7a4734bf784bf3ae3f24520000000a000222266cc2dca0671d2a17ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffd00dfeeddeadbeef8932eb23bad9bddb5cf81426f78279a53c6c3b7100000000000000000000000000000000000000009ce3c510b3f58edc8d53ae708056e30926f62d0b42d5c9b61c391bb4e8a2c1917f8ed995169ffad0d79af2590303e83c57e15a9e0b248679849556c2e03a1c811b',
        gasLimit: 282915,
      },
      approval: undefined,
      estimatedProcessingTimeInSeconds: 15,
    },
    ...{
      sentAmount: {
        amount: '1.234',
        valueInCurrency: undefined,
        usd: undefined,
      },
      toTokenAmount: {
        amount: '1.234',
        valueInCurrency: undefined,
        usd: undefined,
      },
      minToTokenAmount: {
        amount: '1.17',
        valueInCurrency: undefined,
        usd: undefined,
      },
      totalNetworkFee: {
        amount: '1.234',
        valueInCurrency: undefined,
        usd: undefined,
      },
      gasFee: {
        total: { amount: '1.234', valueInCurrency: undefined, usd: '2.5778' },
      },
      adjustedReturn: { valueInCurrency: undefined, usd: undefined },
      swapRate: '1.234',
      cost: { valueInCurrency: undefined, usd: undefined },
    },
  },
  accountAddress: account,
  startTime: 1729964825189,
  slippagePercentage: 0,
  initialDestAssetBalance: undefined,
  targetContractAddress: '0x23981fC34e69eeDFE2BD9a0a9fCb0719Fe09DbFC',
  isStxEnabled,
  location: MetaMetricsSwapsEventSource.MainView,
});

const MockTxHistory = {
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
    attempts = undefined as BridgeHistoryItem['attempts'],
    startTime = 1729964825189,
  } = {}): Record<string, BridgeHistoryItem> => ({
    [txMetaId]: {
      txMetaId,
      actionId,
      originalTransactionId: txMetaId,
      batchId,
      quote: getMockQuote({ srcChainId, destChainId }),
      startTime,
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
        quotedGasAmount: '1.234',
        quotedGasInUsd: '2.5778',
        quotedReturnInUsd: undefined,
      },
      approvalTxId,
      isStxEnabled: false,
      hasApprovalTx: false,
      completionTime: undefined,
      attempts,
      featureId,
      location: MetaMetricsSwapsEventSource.MainView,
      quoteId: undefined,
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
    startTime = 1729964825189,
  } = {}): Record<string, BridgeHistoryItem> => ({
    [txMetaId]: {
      txMetaId,
      actionId,
      originalTransactionId: txMetaId,
      quote: getMockQuote({ srcChainId, destChainId }),
      startTime,
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
      quoteId: undefined,
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
        quotedGasAmount: '1.234',
        quotedGasInUsd: '2.5778',
        quotedReturnInUsd: undefined,
      },
      approvalTxId: undefined,
      isStxEnabled: true,
      hasApprovalTx: false,
      attempts: undefined,
      location: MetaMetricsSwapsEventSource.MainView,
      quoteId: undefined,
    },
  }),
};

let addTransactionBatchFnMock: Mock = vi.fn();

function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
    captureException: vi.fn(),
  });
}

function getControllerMessenger(
  rootMessenger: RootMessenger,
): BridgeStatusControllerMessenger {
  const messenger = new Messenger({
    namespace: BRIDGE_STATUS_CONTROLLER_NAME,
    parent: rootMessenger,
  }) as unknown as BridgeStatusControllerMessenger;
  rootMessenger.delegate({
    messenger,
    actions: [
      'AccountsController:getAccountByAddress',
      'NetworkController:findNetworkClientIdByChainId',
      'NetworkController:getState',
      'NetworkController:getNetworkClientById',
      'SnapController:handleRequest',
      'TransactionController:getState',
      'TransactionController:updateTransaction',
      'TransactionController:addTransaction',
      'TransactionController:estimateGasFee',
      'TransactionController:isAtomicBatchSupported',
      'BridgeController:trackUnifiedSwapBridgeEvent',
      'BridgeController:stopPollingForQuotes',
      'RemoteFeatureFlagController:getState',
      'AuthenticationController:getBearerToken',
      'KeyringController:signTypedMessage',
      'MoneyAccountController:getMoneyAccount',
      'TransactionPayController:setTransactionConfig',
      'TransactionPayController:updatePaymentToken',
      'ApprovalController:acceptRequest',
    ],
    events: [
      'TransactionController:transactionStatusUpdated',
      'TransactionController:unapprovedTransactionAdded',
      'TransactionPayController:stateChange',
    ],
  });
  return messenger;
}

function registerDefaultActionHandlers(
  rootMessenger: RootMessenger,
  {
    account = '0xaccount1',
    srcChainId = 42161,
    txHash = '0xsrcTxHash1',
    txMetaId = 'bridgeTxMetaId1',
    status = TransactionStatus.confirmed,
    provider,
    maxPendingHistoryItemAgeMs = DEFAULT_MAX_PENDING_HISTORY_ITEM_AGE_MS,
  }: {
    account?: string;
    srcChainId?: number;
    txHash?: string;
    txMetaId?: string;
    status?: TransactionStatus;
    provider?: 'undefined' | Partial<Provider>;
    maxPendingHistoryItemAgeMs?: number;
  } = {},
) {
  rootMessenger.registerActionHandler(
    'AccountsController:getAccountByAddress',
    () =>
      ({
        address: account,
        metadata: { keyring: { type: 'any' } },
      }) as never,
  );

  rootMessenger.registerActionHandler(
    'BridgeController:trackUnifiedSwapBridgeEvent',
    vi.fn(),
  );

  rootMessenger.registerActionHandler(
    'NetworkController:findNetworkClientIdByChainId',
    () => {
      if (provider === 'undefined') {
        throw new Error('Provider is undefined');
      }
      return 'networkClientId';
    },
  );

  rootMessenger.registerActionHandler(
    'NetworkController:getState',
    () =>
      ({
        selectedNetworkClientId: 'networkClientId',
      }) as NetworkState,
  );

  const mockProvider = {
    request: vi.fn().mockResolvedValue('0xreceipt1'),
    sendAsync: vi.fn(),
    send: vi.fn(),
    ...(provider && provider !== 'undefined' ? provider : {}),
  };

  rootMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    () =>
      ({
        configuration: {
          chainId: numberToHex(srcChainId),
        } as never,
        provider: mockProvider as never,
      }) as never,
  );

  rootMessenger.registerActionHandler(
    'TransactionController:getState',
    () =>
      ({
        transactions: [
          {
            id: txMetaId === 'undefined' ? undefined : txMetaId,
            hash: txHash,
            status,
          } as TransactionMeta,
        ],
      }) as never,
  );

  rootMessenger.registerActionHandler(
    'RemoteFeatureFlagController:getState',
    () => ({
      remoteFeatureFlags: {
        bridgeConfig: {
          maxPendingHistoryItemAgeMs,
        },
      },
      cacheTimestamp: 1776474747215,
    }),
  );

  rootMessenger.registerActionHandler(
    'AuthenticationController:getBearerToken',
    () => Promise.resolve('auth-token'),
  );
}

type WithControllerCallback<ReturnValue> = (payload: {
  controller: BridgeStatusController;
  rootMessenger: RootMessenger;
  messenger: BridgeStatusControllerMessenger;
  startPollingForBridgeTxStatusSpy: Mock;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<ConstructorParameters<typeof BridgeStatusController>[0]>;
  mockMessengerCall?: Mock;
};

let mockTraceFn: Mock<
  (
    request: SwapTraceRequest<TraceName>,
    fn?: (args?: unknown) => unknown,
  ) => unknown
>;

async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ options = {}, mockMessengerCall = undefined }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];
  const rootMessenger = getRootMessenger();
  const messenger = getControllerMessenger(rootMessenger);
  if (mockMessengerCall) {
    vi.spyOn(messenger, 'call').mockImplementation(mockMessengerCall);
  }
  const controller = new BridgeStatusController({
    messenger,
    clientId: BridgeClientId.EXTENSION,
    clientProduct: 'test-client-product',
    fetchFn: vi.fn(),
    addTransactionBatchFn: addTransactionBatchFnMock,
    traceFn: mockTraceFn,
    ...options,
  });
  const startPollingForBridgeTxStatusSpy = vi.fn();
  if (mockMessengerCall) {
    vi.spyOn(controller, 'startPolling').mockImplementation(
      startPollingForBridgeTxStatusSpy,
    );
  }
  return await testFunction({
    controller,
    rootMessenger,
    messenger,
    startPollingForBridgeTxStatusSpy,
  });
}

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

const BATCH_ID_1 = '0x1234BatchId';
const BATCH_ID_2 = 'batchId1';

describe('BridgeStatusController (deposit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    addTransactionBatchFnMock = vi.fn();
    vi.spyOn(historyUtils, 'isHistoryItemTooOld').mockReturnValue(false);
    mockTraceFn = vi.fn(
      async (
        _request: SwapTraceRequest<TraceName>,
        fn?: (args?: unknown) => unknown,
      ) => await fn?.(),
    );
    mockGenerateBatchId.mockReturnValueOnce(BATCH_ID_1);
    mockGenerateBatchId.mockReturnValueOnce(BATCH_ID_2);
  });

  describe('startPollingForBridgeTxStatus', () => {
    it('stops polling when the status response is complete', async () => {
      // Setup
      vi.useFakeTimers();
      vi.spyOn(Date, 'now').mockImplementation(() => {
        return MockTxHistory.getComplete().bridgeTxMetaId1
          .completionTime as number;
      });

      await withController(async ({ controller, messenger, rootMessenger }) => {
        registerDefaultActionHandlers(rootMessenger);
        const messengerCallSpy = vi.spyOn(messenger, 'call');
        const messengerPublishSpy = vi.spyOn(messenger, 'publish');
        const fetchBridgeTxStatusSpy = vi.spyOn(
          bridgeStatusUtils,
          'fetchBridgeTxStatus',
        );
        const stopPollingByNetworkClientIdSpy = vi.spyOn(
          controller,
          'stopPollingByPollingToken',
        );

        // Execution
        rootMessenger.call(
          'BridgeStatusController:startPollingForBridgeTxStatus',
          getMockStartPollingForBridgeTxStatusArgs({ isStxEnabled: true }),
        );
        fetchBridgeTxStatusSpy.mockImplementationOnce(async () => {
          return {
            status: MockStatusResponse.getComplete(),
            validationFailures: [],
          };
        });
        vi.advanceTimersByTime(10000);
        await flushPromises();

        // Assertions
        expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(1);
        expect(stopPollingByNetworkClientIdSpy).toHaveBeenCalledTimes(1);
        expect(controller.state.txHistory).toStrictEqual(
          MockTxHistory.getComplete(),
        );
        const completedEventCall = messengerCallSpy.mock.calls.find(
          ([, eventName]) => eventName === UnifiedSwapBridgeEventName.Completed,
        );
        expect(completedEventCall?.[2]).toStrictEqual(
          expect.objectContaining({
            transaction_internal_id: 'bridgeTxMetaId1',
          }),
        );

        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
        expect(messengerPublishSpy.mock.calls.at(-1)).toMatchSnapshot();
        // Cleanup
        vi.restoreAllMocks();
      });
    });

    it('emits bridgeTransactionComplete event when the status response is complete', async () => {
      // Setup
      vi.useFakeTimers();
      vi.spyOn(Date, 'now').mockImplementation(() => {
        return MockTxHistory.getComplete().bridgeTxMetaId1
          .completionTime as number;
      });

      await withController(async ({ rootMessenger }) => {
        registerDefaultActionHandlers(rootMessenger);
        const fetchBridgeTxStatusSpy = vi
          .spyOn(bridgeStatusUtils, 'fetchBridgeTxStatus')
          .mockImplementationOnce(async () => {
            return {
              status: MockStatusResponse.getComplete(),
              validationFailures: [],
            };
          });

        // Execution
        rootMessenger.call(
          'BridgeStatusController:startPollingForBridgeTxStatus',
          getMockStartPollingForBridgeTxStatusArgs(),
        );
        vi.advanceTimersByTime(10000);
        await flushPromises();

        // Assertions
        expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(1);

        // Cleanup
        vi.restoreAllMocks();
      });
    });

    it('emits bridgeTransactionFailed event when the status response is failed', async () => {
      // Setup
      vi.useFakeTimers();
      vi.spyOn(Date, 'now').mockImplementation(() => {
        return MockTxHistory.getComplete().bridgeTxMetaId1
          .completionTime as number;
      });

      await withController(async ({ rootMessenger, messenger }) => {
        registerDefaultActionHandlers(rootMessenger);
        const messengerCallSpy = vi.spyOn(messenger, 'call');
        const messengerPublishSpy = vi.spyOn(messenger, 'publish');
        const fetchBridgeTxStatusSpy = vi
          .spyOn(bridgeStatusUtils, 'fetchBridgeTxStatus')
          .mockImplementationOnce(async () => {
            return {
              status: MockStatusResponse.getFailed(),
              validationFailures: [],
            };
          });

        // Execution
        rootMessenger.call(
          'BridgeStatusController:startPollingForBridgeTxStatus',
          getMockStartPollingForBridgeTxStatusArgs(),
        );
        vi.advanceTimersByTime(10000);
        await flushPromises();

        // Assertions
        expect(fetchBridgeTxStatusSpy).toHaveBeenCalledTimes(1);
        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
        const failedCall = messengerCallSpy.mock.calls.find(
          ([action, eventName]) =>
            action === 'BridgeController:trackUnifiedSwapBridgeEvent' &&
            eventName === UnifiedSwapBridgeEventName.Failed,
        );
        expect(failedCall?.[2]).toStrictEqual(
          expect.objectContaining({
            failure_phase: 'source_execution',
            error_code: 'status_failed_without_reason',
            source_hash_present: true,
            destination_hash_present: false,
          }),
        );
        expect(messengerPublishSpy).not.toHaveBeenCalledWith(
          'BridgeStatusController:destinationTransactionCompleted',
        );

        // Cleanup
        vi.restoreAllMocks();
      });
    });

    it.each([
      {
        status: TransactionStatus.confirmed,
      },
      { status: TransactionStatus.failed },
      { status: TransactionStatus.dropped },
      { status: TransactionStatus.rejected },
      { status: TransactionStatus.signed, shouldSetSrcTxHash: false },
    ])(
      'updates the srcTxHash when one is available, with status %s',
      async ({ status, shouldSetSrcTxHash = true }) => {
        // Setup
        vi.useFakeTimers();
        let getStateCallCount = 0;

        await withController(
          {
            options: {
              fetchFn: vi
                .fn()
                .mockResolvedValueOnce(MockStatusResponse.getPending()),
              traceFn: vi.fn(),
            },
          },
          async ({ controller, rootMessenger }) => {
            registerDefaultActionHandlers(rootMessenger);

            rootMessenger.unregisterActionHandler(
              'TransactionController:getState',
            );
            rootMessenger.registerActionHandler(
              'TransactionController:getState',
              () => {
                getStateCallCount += 1;
                return {
                  transactions: [
                    {
                      id: 'bridgeTxMetaId1',
                      hash: getStateCallCount === 0 ? undefined : '0xnewTxHash',
                      status,
                    } as TransactionMeta,
                  ],
                } as never;
              },
            );

            // Start polling with no srcTxHash
            const startPollingArgs = getMockStartPollingForBridgeTxStatusArgs({
              srcTxHash: 'undefined',
            });
            rootMessenger.call(
              'BridgeStatusController:startPollingForBridgeTxStatus',
              startPollingArgs,
            );

            // Verify initial state has no srcTxHash
            expect(
              controller.state.txHistory.bridgeTxMetaId1.status.srcChain.txHash,
            ).toBeUndefined();

            // Advance timer to trigger polling with new hash
            vi.advanceTimersByTime(10000);
            await flushPromises();

            // Verify the srcTxHash was updated
            expect(
              controller.state.txHistory.bridgeTxMetaId1.status.srcChain.txHash,
            ).toBe(shouldSetSrcTxHash ? '0xsrcTxHash1' : undefined);

            // Cleanup
            controller.stopAllPolling();
            vi.restoreAllMocks();
          },
        );
      },
    );
  });

  describe('submitTx: Solana bridge', () => {
    const mockQuote: QuoteResponseV1<string> = {
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
          assetId: getNativeAssetForChainId(ChainId.SOLANA).assetId,
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
              assetId: getNativeAssetForChainId(ChainId.SOLANA).assetId,
            },
            destAsset: {
              chainId: ChainId.ETH,
              address: '0x...',
              symbol: 'ETH',
              name: 'Ethereum',
              decimals: 18,
              assetId: 'eip155:1/slip44:60',
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
              assetId: getNativeAssetForChainId(ChainId.SOLANA).assetId,
            },
          },
        },
      },
      estimatedProcessingTimeInSeconds: 300,
      trade:
        'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAHDXLY8oVRIwA8ZdRSGjM5RIZJW8Wv+Twyw3NqU4Hov+OHoHp/dmeDvstKbICW3ezeGR69t3/PTAvdXgZVdJFJXaxkoKXUTWfEAyQyCCG9nwVoDsd10OFdnM9ldSi+9SLqHpqWVDV+zzkmftkF//DpbXxqeH8obNXHFR7pUlxG9uNVOn64oNsFdeUvD139j1M51iRmUY839Y25ET4jDRscT081oGb+rLnywLjLSrIQx6MkqNBhCFbxqY1YmoGZVORW/QMGRm/lIRcy/+ytunLDm+e8jOW7xfcSayxDmzpAAAAAjJclj04kifG7PRApFI4NgwtaE5na/xCEBI572Nvp+FkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbd9uHXZaGT2cvhRs7reawctIXtX1s3kTqM9YV+/wCpBHnVW/IxwG7udMVuzmgVB/2xst6j9I5RArHNola8E4+0P/on9df2SnTAmx8pWHneSwmrNt/J3VFLMhqns4zl6JmXkZ+niuxMhAGrmKBaBo94uMv2Sl+Xh3i+VOO0m5BdNZ1ElenbwQylHQY+VW1ydG1MaUEeNpG+EVgswzPMwPoLBgAFAsBcFQAGAAkDQA0DAAAAAAAHBgABAhMICQAHBgADABYICQEBCAIAAwwCAAAAUEYVOwAAAAAJAQMBEQoUCQADBAETCgsKFw0ODxARAwQACRQj5RfLl3rjrSoBAAAAQ2QAAVBGFTsAAAAAyYZnBwAAAABkAAAJAwMAAAEJDAkAAAIBBBMVCQjGASBMKQwnooTbKNxdBwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUHTKomh4KXvNgA0ovYKS5F8GIOBgAAAAAAAAAAAAAAAAAQgAAAAAAAAAAAAAAAAAAAAAAAEIF7RFOAwAAAAAAAAAAAAAAaAIAAAAAAAC4CwAAAAAAAOAA2mcAAAAAAAAAAAAAAAAAAAAApapuIXG0FuHSfsU8qME9s/kaic0AAwGCsZdSuxV5eCm+Ria4LEQPgTg4bg65gNrTAefEzpAfPQgCABIMAgAAAAAAAAAAAAAACAIABQwCAAAAsIOFAAAAAAADWk6DVOZO8lMFQg2r0dgfltD6tRL/B1hH3u00UzZdgqkAAxEqIPdq2eRt/F6mHNmFe7iwZpdrtGmHNJMFlK7c6Bc6k6kjBezr6u/tAgvu3OGsJSwSElmcOHZ21imqH/rhJ2KgqDJdBPFH4SYIM1kBAAA=',
    };
    const mockQuoteResponse = {
      ...mockQuote,
      ...{
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
        gasFee: {
          total: { amount: '0.05', valueInCurrency: '5', usd: '5' },
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
      },
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

    let mockMessengerCall: Mock;
    beforeEach(() => {
      vi.clearAllMocks();
      vi.clearAllTimers();
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567890);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567891);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567892);

      mockMessengerCall = vi.fn();
      mockMessengerCall.mockImplementationOnce(vi.fn()); // stopPollingForQuotes
    });

    it('adds historyItem.next on submit', async () => {
      mockMessengerCall.mockReturnValueOnce(mockSolanaAccount);
      mockMessengerCall.mockImplementationOnce(vi.fn()); // track event
      mockMessengerCall.mockResolvedValueOnce('signature');
      mockMessengerCall.mockReturnValueOnce(mockSolanaAccount);
      mockMessengerCall.mockReturnValueOnce({
        transactions: [],
      });

      await withController(
        { mockMessengerCall },
        async ({
          controller,
          rootMessenger,
          startPollingForBridgeTxStatusSpy,
        }) => {
          const result = await rootMessenger.call(
            'BridgeStatusController:submitTx',
            {
              operation: Operation.DEPOSIT,
              accountAddress: 'SOLaccountAddress',
              quoteResponses: [mockQuoteResponse],
              isStxEnabled: false,
            },
          );
          controller.stopAllPolling();

          expect(mockMessengerCall.mock.calls).toMatchSnapshot();
          expect(result).toMatchSnapshot();
          expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(1);
          expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledWith({
            bridgeTxMetaId: 'signature',
          });
          expect(mockGenerateBatchId).not.toHaveBeenCalled();
          expect(result.id).toBe('signature');
          expect(Object.keys(controller.state.txHistory)).toStrictEqual([
            'signature',
          ]);
          expect(controller.state.txHistory.signature.batchId).toBeUndefined();
          expect(controller.state.txHistory.signature.actionId).toBeUndefined();
          expect(
            controller.state.txHistory.signature.depositTxMeta,
          ).toBeUndefined();
          expect(controller.state.txHistory.signature.actionId).toBeUndefined();
          expect(
            controller.state.txHistory.signature.depositTxMeta,
          ).toBeUndefined();
          expect(controller.state.txHistory.signature.next)
            .toMatchInlineSnapshot(`
              [
                {
                  "operation": "deposit",
                  "partialQuote": {
                    "approval": undefined,
                    "estimatedProcessingTimeInSeconds": 300,
                    "quoteId": undefined,
                    "resetApproval": undefined,
                    "trade": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAHDXLY8oVRIwA8ZdRSGjM5RIZJW8Wv+Twyw3NqU4Hov+OHoHp/dmeDvstKbICW3ezeGR69t3/PTAvdXgZVdJFJXaxkoKXUTWfEAyQyCCG9nwVoDsd10OFdnM9ldSi+9SLqHpqWVDV+zzkmftkF//DpbXxqeH8obNXHFR7pUlxG9uNVOn64oNsFdeUvD139j1M51iRmUY839Y25ET4jDRscT081oGb+rLnywLjLSrIQx6MkqNBhCFbxqY1YmoGZVORW/QMGRm/lIRcy/+ytunLDm+e8jOW7xfcSayxDmzpAAAAAjJclj04kifG7PRApFI4NgwtaE5na/xCEBI572Nvp+FkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbd9uHXZaGT2cvhRs7reawctIXtX1s3kTqM9YV+/wCpBHnVW/IxwG7udMVuzmgVB/2xst6j9I5RArHNola8E4+0P/on9df2SnTAmx8pWHneSwmrNt/J3VFLMhqns4zl6JmXkZ+niuxMhAGrmKBaBo94uMv2Sl+Xh3i+VOO0m5BdNZ1ElenbwQylHQY+VW1ydG1MaUEeNpG+EVgswzPMwPoLBgAFAsBcFQAGAAkDQA0DAAAAAAAHBgABAhMICQAHBgADABYICQEBCAIAAwwCAAAAUEYVOwAAAAAJAQMBEQoUCQADBAETCgsKFw0ODxARAwQACRQj5RfLl3rjrSoBAAAAQ2QAAVBGFTsAAAAAyYZnBwAAAABkAAAJAwMAAAEJDAkAAAIBBBMVCQjGASBMKQwnooTbKNxdBwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUHTKomh4KXvNgA0ovYKS5F8GIOBgAAAAAAAAAAAAAAAAAQgAAAAAAAAAAAAAAAAAAAAAAAEIF7RFOAwAAAAAAAAAAAAAAaAIAAAAAAAC4CwAAAAAAAOAA2mcAAAAAAAAAAAAAAAAAAAAApapuIXG0FuHSfsU8qME9s/kaic0AAwGCsZdSuxV5eCm+Ria4LEQPgTg4bg65gNrTAefEzpAfPQgCABIMAgAAAAAAAAAAAAAACAIABQwCAAAAsIOFAAAAAAADWk6DVOZO8lMFQg2r0dgfltD6tRL/B1hH3u00UzZdgqkAAxEqIPdq2eRt/F6mHNmFe7iwZpdrtGmHNJMFlK7c6Bc6k6kjBezr6u/tAgvu3OGsJSwSElmcOHZ21imqH/rhJ2KgqDJdBPFH4SYIM1kBAAA=",
                  },
                },
              ]
            `);
        },
      );
    });
  });

  describe('submitTx: EVM bridge', () => {
    const mockEvmQuoteResponse: QuoteResponseV1 & QuoteMetadata = {
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
      totalNetworkFee: {
        amount: '.00055',
        valueInCurrency: undefined,
        usd: '2.5778',
      },
      gasFee: {
        total: { amount: '.00055', valueInCurrency: undefined, usd: '2.5778' },
      },
      adjustedReturn: { valueInCurrency: undefined, usd: undefined },
      swapRate: '1.234',
      cost: { valueInCurrency: undefined, usd: undefined },
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
    };
    validateQuoteResponseV1(mockEvmQuoteResponse);

    const mockEvmTxMeta = {
      id: 'test-tx-id',
      actionId: '1111111111.223',
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
      actionId: '1111111111.222',
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
        type: GasFeeEstimateType.FeeMarket,
        high: {
          suggestedMaxFeePerGas: '0x1234',
          suggestedMaxPriorityFeePerGas: '0x5678',
        },
      },
    };

    let mockMessengerCall: Mock;

    beforeEach(() => {
      vi.clearAllMocks();
      vi.clearAllTimers();
      mockMessengerCall = vi.fn();
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567890);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567891);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567892);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567893);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567894);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567895);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.456);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.457);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.458);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.459);
      mockMessengerCall.mockImplementationOnce(vi.fn()); // stopPollingForQuotes
    });

    const setupEventTrackingMocks = (mockCall: Mock) => {
      mockCall.mockReturnValueOnce(mockSelectedAccount);
      mockCall.mockImplementationOnce(vi.fn()); // track event
      mockCall.mockReturnValueOnce([]); // isAtomicBatchSupported
    };

    const setupApprovalMocks = (mockCall: Mock) => {
      mockCall.mockReturnValueOnce(mockSelectedAccount);
      mockCall.mockReturnValueOnce('arbitrum-client-id');
      mockMessengerCall.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockMessengerCall.mockResolvedValueOnce({
        transactionMeta: mockApprovalTxMeta,
        result: Promise.resolve('0xapprovalTxHash'),
      });
      mockCall.mockReturnValueOnce({
        transactions: [mockApprovalTxMeta],
      });
    };

    const setupBridgeMocks = (mockCall: Mock) => {
      mockCall.mockReturnValueOnce(mockSelectedAccount);
      mockCall.mockReturnValueOnce('arbitrum');
      mockCall.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockCall.mockResolvedValueOnce({
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

    const setupBridgeStxMocks = (mockCall: Mock) => {
      mockCall.mockReturnValueOnce(mockSelectedAccount);
      mockCall.mockReturnValueOnce('arbitrum');
      mockCall.mockResolvedValueOnce(mockEstimateGasFeeResult);
      addTransactionBatchFnMock.mockResolvedValueOnce({
        batchId: 'batchId1',
      });
      mockCall.mockReturnValueOnce({
        transactions: [{ ...mockEvmTxMeta, batchId: BATCH_ID_1 }],
      });

      mockCall.mockReturnValueOnce(mockSelectedAccount);

      mockCall.mockReturnValueOnce({
        transactions: [{ ...mockEvmTxMeta, batchId: BATCH_ID_1 }],
      });
    };

    it('should successfully submit an EVM bridge transaction with approval', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      setupApprovalMocks(mockMessengerCall);
      setupBridgeMocks(mockMessengerCall);

      await withController(
        { mockMessengerCall },
        async ({
          controller,
          rootMessenger,
          startPollingForBridgeTxStatusSpy,
        }) => {
          const result = await rootMessenger.call(
            'BridgeStatusController:submitTx',
            {
              operation: Operation.DEPOSIT,
              accountAddress: 'otherAccount',
              quoteResponses: [mockEvmQuoteResponse],
              isStxEnabled: false,
            },
          );

          expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
          expect(result.id).toBe('test-tx-id');
          expect(Object.keys(controller.state.txHistory)).toStrictEqual([
            'test-tx-id',
          ]);
          expect(
            controller.state.txHistory['test-tx-id'].batchId,
          ).toBeUndefined();
          expect(controller.state.txHistory['test-tx-id'].actionId).toBe(
            '1111111111.223',
          );
          expect(
            controller.state.txHistory['test-tx-id'].depositTxMeta,
          ).toBeUndefined();
          expect(controller.state.txHistory['test-tx-id'].next)
            .toMatchInlineSnapshot(`
              [
                {
                  "operation": "deposit",
                  "partialQuote": {
                    "approval": {
                      "chainId": 42161,
                      "data": "0xapprovalData",
                      "from": "0xaccount1",
                      "gasLimit": 21000,
                      "to": "0xtokenContract",
                      "value": "0x0",
                    },
                    "estimatedProcessingTimeInSeconds": 15,
                    "quoteId": undefined,
                    "resetApproval": undefined,
                    "trade": {
                      "chainId": 42161,
                      "data": "0xdata",
                      "from": "0xaccount1",
                      "gasLimit": 21000,
                      "to": "0xbridgeContract",
                      "value": "0x0",
                    },
                  },
                },
              ]
            `);
          controller.stopAllPolling();
        },
      );
    });

    it('should handle smart transactions and include quotesReceivedContext', async () => {
      mockGenerateBatchId.mockReturnValue(BATCH_ID_1);
      setupEventTrackingMocks(mockMessengerCall);
      setupBridgeStxMocks(mockMessengerCall);
      addTransactionBatchFnMock.mockResolvedValueOnce({
        batchId: 'batchId1',
      });

      await withController(
        { mockMessengerCall },
        async ({
          controller,
          rootMessenger,
          startPollingForBridgeTxStatusSpy,
        }) => {
          const { approval, ...quoteWithoutApproval } = mockEvmQuoteResponse;
          const quoteResponseV2 = mergeQuoteMetadata(
            toQuoteResponseV2(quoteWithoutApproval),
            quoteWithoutApproval,
          );
          const quotesReceivedContext = getQuotesReceivedProperties(
            quoteResponseV2,
            ['low_return'],
            true,
          );
          const result = await rootMessenger.call(
            'BridgeStatusController:submitTx',
            {
              operation: Operation.DEPOSIT,
              accountAddress: (quoteWithoutApproval.trade as TxData).from,
              quoteResponses: [quoteWithoutApproval],
              isStxEnabled: true,
              quotesReceivedContext,
            },
          );
          controller.stopAllPolling();

          expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
          expect(result.id).toBe('test-tx-id');
          expect(Object.keys(controller.state.txHistory)).toStrictEqual([
            'test-tx-id',
          ]);
          expect(controller.state.txHistory['test-tx-id'].batchId).toBe(
            BATCH_ID_1,
          );
          expect(controller.state.txHistory['test-tx-id'].actionId).toBe(
            '1111111111.223',
          );
          expect(
            controller.state.txHistory['test-tx-id'].depositTxMeta,
          ).toBeUndefined();
          expect(controller.state.txHistory['test-tx-id'].next)
            .toMatchInlineSnapshot(`
            [
              {
                "operation": "deposit",
                "partialQuote": {
                  "approval": undefined,
                  "estimatedProcessingTimeInSeconds": 15,
                  "quoteId": undefined,
                  "resetApproval": undefined,
                  "trade": {
                    "chainId": 42161,
                    "data": "0xdata",
                    "from": "0xaccount1",
                    "gasLimit": 21000,
                    "to": "0xbridgeContract",
                    "value": "0x0",
                  },
                },
              },
            ]
          `);
          expect(addTransactionBatchFnMock).toHaveBeenCalledTimes(1);
        },
      );
    });

    describe('actionId tracking and rekeying', () => {
      beforeEach(() => {
        vi.clearAllMocks();
      });

      it('should add pre-submission history keyed by actionId and rekey to next batchId after success', async () => {
        // Mock generateActionId to return a predictable value
        vi.spyOn(transactionUtils, 'generateActionId').mockReturnValueOnce(
          '1234567890.456',
        );

        setupEventTrackingMocks(mockMessengerCall);
        // No approval for this test - direct to bridge tx
        const { approval, ...quoteWithoutApproval } = mockEvmQuoteResponse;
        setupBridgeMocks(mockMessengerCall);

        await withController(
          { mockMessengerCall },
          async ({
            controller,
            rootMessenger,
            startPollingForBridgeTxStatusSpy,
          }) => {
            const result = await rootMessenger.call(
              'BridgeStatusController:submitTx',
              {
                operation: Operation.DEPOSIT,
                accountAddress: (quoteWithoutApproval.trade as TxData).from,
                quoteResponses: [quoteWithoutApproval],
                isStxEnabled: false, // STX disabled - uses non-batch path
              },
            );
            controller.stopAllPolling();

            expect(result.id).toBe('test-tx-id');
            expect(Object.keys(controller.state.txHistory)).toStrictEqual([
              'test-tx-id',
            ]);
            expect(controller.state.txHistory['test-tx-id']).toBeDefined();
            expect(controller.state.txHistory['test-tx-id'].txMetaId).toBe(
              result.id,
            );
            expect(controller.state.txHistory['test-tx-id'].actionId).toBe(
              '1111111111.223',
            );
            expect(
              controller.state.txHistory['test-tx-id'].batchId,
            ).toBeUndefined();
            expect(
              controller.state.txHistory['test-tx-id'].depositTxMeta,
            ).toBeUndefined();
            expect(
              controller.state.txHistory['test-tx-id'].status.srcChain.txHash,
            ).toStrictEqual(result.hash);

            expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
          },
        );
      });

      it('should preserve pre-submission history for tracking when trade tx submission fails (before adding tx to state)', async () => {
        const mockActionId = '9876543210.789';
        vi.spyOn(transactionUtils, 'generateActionId')
          .mockReturnValueOnce('9876543210.789')
          .mockReturnValueOnce('9876543210.790');

        setupEventTrackingMocks(mockMessengerCall);
        const { approval, ...quoteWithoutApproval } = mockEvmQuoteResponse;

        // Setup for trade tx (no approval)
        mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
        mockMessengerCall.mockReturnValueOnce('arbitrum-client-id');
        mockMessengerCall.mockResolvedValueOnce({
          estimates: {
            type: GasFeeEstimateType.FeeMarket,
            high: {
              suggestedMaxFeePerGas: '0x1234',
              suggestedMaxPriorityFeePerGas: '0x5678',
            },
          },
        });

        // Trade tx fails during submission
        mockMessengerCall.mockRejectedValueOnce(
          new Error('Trade tx submission failed'),
        );
        mockMessengerCall.mockReturnValueOnce({});
        mockMessengerCall.mockReturnValueOnce({});
        mockMessengerCall.mockReturnValueOnce({});

        await withController(
          { mockMessengerCall },
          async ({
            controller,
            rootMessenger,
            startPollingForBridgeTxStatusSpy,
          }) => {
            await expect(
              rootMessenger.call('BridgeStatusController:submitTx', {
                operation: Operation.DEPOSIT,
                accountAddress: (quoteWithoutApproval.trade as TxData).from,
                quoteResponses: [quoteWithoutApproval],
                isStxEnabled: false,
              }),
            ).rejects.toThrow('Trade tx submission failed');

            // Verify: Pre-submission history should still exist keyed by actionId
            // This allows failed event tracking to find the quote data
            expect(controller.state.txHistory[mockActionId]).toBeDefined();
            expect(controller.state.txHistory[mockActionId].actionId).toBe(
              mockActionId,
            );
            // Verify the final history is keyed by the next batchId
            expect(Object.keys(controller.state.txHistory)).toStrictEqual([
              mockActionId,
            ]);
            expect(
              controller.state.txHistory[mockActionId].batchId,
            ).toBeUndefined();
            expect(
              controller.state.txHistory[mockActionId].depositTxMeta,
            ).toBeUndefined();
            expect(
              controller.state.txHistory[mockActionId].txMetaId,
            ).toBeUndefined();
            expect(
              controller.state.txHistory[mockActionId].status.srcChain.txHash,
            ).toBeUndefined(); // Empty since tx w submitted

            expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
            const expectedProperties = {
              account_hardware_type: null,
              action_type: 'swapbridge-v1',
              chain_id_destination: 'eip155:10',
              chain_id_source: 'eip155:42161',
              custom_slippage: false,
              destination_hash_present: false,
              feature_id: 'unified_swap_bridge',
              gas_included: false,
              gas_included_7702: false,
              is_hardware_wallet: false,
              location: 'Unknown',
              price_impact: 0,
              provider: 'lifi_across',
              quoted_time_minutes: 0.25,
              slippage_limit: 0,
              source_hash_present: false,
              stx_enabled: false,
              swap_type: 'crosschain',
              token_address_destination: 'eip155:10/slip44:60',
              token_address_source: 'eip155:42161/slip44:60',
              token_security_type_destination: null,
              token_symbol_destination: 'ETH',
              token_symbol_source: 'ETH',
              usd_amount_source: 1.01,
              usd_quoted_gas: 2.5778,
              usd_quoted_return: 0,
            };

            expect(
              mockMessengerCall.mock.calls.filter(
                ([action]) =>
                  action === 'BridgeController:trackUnifiedSwapBridgeEvent',
              ),
            ).toStrictEqual([
              [
                'BridgeController:trackUnifiedSwapBridgeEvent',
                'Unified SwapBridge Submitted',
                expectedProperties,
              ],
              [
                'BridgeController:trackUnifiedSwapBridgeEvent',
                'Unified SwapBridge Failed',
                {
                  ...expectedProperties,
                  actual_time_minutes: 0.000016666666666666667,
                  allowance_reset_transaction: undefined,
                  approval_transaction: undefined,
                  destination_transaction: 'FAILED',
                  error_code: 'unknown',
                  error_message: 'Trade tx submission failed',
                  failure_phase: 'broadcast',
                  source_transaction: 'PENDING',
                  quote_vs_execution_ratio: 0,
                  quoted_vs_used_gas_ratio: 0,
                  security_warnings: [],
                  usd_actual_gas: 0,
                  usd_actual_return: 0,
                  usd_quoted_return: 0.134214,
                },
              ],
            ]);
          },
        );
      });

      it('should use provided actionId from addTransactionFn result', async () => {
        vi.spyOn(transactionUtils, 'generateActionId')
          .mockReturnValueOnce('1111111111.222')
          .mockReturnValueOnce('1111111111.223');

        setupEventTrackingMocks(mockMessengerCall);
        setupApprovalMocks(mockMessengerCall);
        setupBridgeMocks(mockMessengerCall);

        await withController(
          { mockMessengerCall },
          async ({
            controller,
            rootMessenger,
            startPollingForBridgeTxStatusSpy,
          }) => {
            const result = await rootMessenger.call(
              'BridgeStatusController:submitTx',
              {
                operation: Operation.DEPOSIT,
                accountAddress: (mockEvmQuoteResponse.trade as TxData).from,
                quoteResponses: [mockEvmQuoteResponse],
                isStxEnabled: false,
              },
            );
            controller.stopAllPolling();
            expect(result).toMatchInlineSnapshot(`
              {
                "actionId": "1111111111.223",
                "chainId": "0xa4b1",
                "hash": "0xevmTxHash",
                "id": "test-tx-id",
                "status": "unapproved",
                "time": 1234567890,
                "txParams": {
                  "chainId": "0xa4b1",
                  "data": "0xdata",
                  "from": "0xaccount1",
                  "gasLimit": "0x5208",
                  "to": "0xbridgeContract",
                  "value": "0x0",
                },
                "txReceipt": {
                  "effectiveGasPrice": "0x1880a",
                  "gasUsed": "0x2c92a",
                },
                "type": "bridge",
              }
            `);

            expect(result.id).toBe('test-tx-id');
            expect(Object.keys(controller.state.txHistory)).toStrictEqual([
              'test-tx-id',
            ]);
            expect(controller.state.txHistory['test-tx-id'].actionId).toBe(
              '1111111111.223',
            );
            expect(
              controller.state.txHistory['test-tx-id'].batchId,
            ).toBeUndefined();
            expect(
              controller.state.txHistory['test-tx-id'].depositTxMeta,
            ).toBeUndefined();
            expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
          },
        );
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
      totalNetworkFee: {
        amount: '1.234',
        valueInCurrency: undefined,
        usd: undefined,
      },
      gasFee: {
        total: { amount: '1.234', valueInCurrency: undefined, usd: '2.5778' },
      },
      adjustedReturn: { valueInCurrency: undefined, usd: undefined },
      swapRate: '1.234',
      cost: { valueInCurrency: undefined, usd: undefined },
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
    } as const;

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
        type: GasFeeEstimateType.FeeMarket,
        high: {
          suggestedMaxFeePerGas: '0x1234',
          suggestedMaxPriorityFeePerGas: '0x5678',
        },
      },
    };
    let mockMessengerCall: Mock;

    beforeEach(() => {
      vi.clearAllMocks();
      mockMessengerCall = vi.fn();
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567890);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567891);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567892);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567893);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.456);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.457);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.458);
      mockMessengerCall.mockImplementationOnce(vi.fn()); // stopPollingForQuotes
    });

    const setupEventTrackingMocks = (mockCall: Mock) => {
      mockCall.mockReturnValueOnce(mockSelectedAccount);
      mockCall.mockImplementationOnce(vi.fn()); // track event
      mockCall.mockReturnValueOnce([]); // isAtomicBatchSupported
    };

    const setupApprovalMocks = () => {
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arbitrum-client-id');
      mockMessengerCall.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockMessengerCall.mockResolvedValueOnce({
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
      mockMessengerCall.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockMessengerCall.mockResolvedValueOnce({
        transactionMeta: mockEvmTxMeta,
        result: Promise.resolve('0xevmTxHash'),
      });
      mockMessengerCall.mockReturnValueOnce({
        transactions: [mockEvmTxMeta],
      });

      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
    };

    it('should successfully submit an EVM swap transaction with approval', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      setupApprovalMocks();
      setupBridgeMocks();

      await withController(
        { mockMessengerCall },
        async ({
          controller,
          rootMessenger,
          startPollingForBridgeTxStatusSpy,
        }) => {
          const result = await rootMessenger.call(
            'BridgeStatusController:submitTx',
            {
              operation: Operation.DEPOSIT,
              accountAddress: (mockEvmQuoteResponse.trade as TxData).from,
              quoteResponses: [mockEvmQuoteResponse],
              isStxEnabled: false,
            },
          );
          controller.stopAllPolling();

          expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
          expect(result.id).toBe('test-tx-id');
          expect(Object.keys(controller.state.txHistory)).toStrictEqual([
            'test-tx-id',
          ]);
          const { approvalTxId, depositTxMeta, next, actionId, batchId } =
            controller.state.txHistory['test-tx-id'];
          expect(approvalTxId).toBe('test-approval-tx-id');
          expect(
            mockMessengerCall.mock.calls.filter(
              ([action]) => action === 'TransactionController:addTransaction',
            ),
          ).toHaveLength(2);
          expect(depositTxMeta).toBeUndefined();
          expect(batchId).toBeUndefined();
          expect(actionId).toBe('1234567891.456');
          expect(next).toMatchInlineSnapshot(`
            [
              {
                "operation": "deposit",
                "partialQuote": {
                  "approval": {
                    "chainId": 42161,
                    "data": "0xapprovalData",
                    "from": "0xaccount1",
                    "gasLimit": 21000,
                    "to": "0xtokenContract",
                    "value": "0x0",
                  },
                  "estimatedProcessingTimeInSeconds": 0,
                  "quoteId": undefined,
                  "resetApproval": undefined,
                  "trade": {
                    "chainId": 42161,
                    "data": "0xdata",
                    "from": "0xaccount1",
                    "gasLimit": 21000,
                    "to": "0xbridgeContract",
                    "value": "0x0",
                  },
                },
              },
            ]
          `);
        },
      );
    });

    it('should handle a gasless swap transaction with approval', async () => {
      mockGenerateBatchId.mockReturnValue(BATCH_ID_1);
      setupEventTrackingMocks(mockMessengerCall);
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arbitrum');
      addTransactionBatchFnMock.mockResolvedValueOnce({
        batchId: BATCH_ID_1,
      });
      mockMessengerCall.mockReturnValueOnce({
        transactions: [{ ...mockEvmTxMeta, batchId: BATCH_ID_1 }],
      });

      const getAddTransactionBatchParamsSpy = vi.spyOn(
        transactionUtils,
        'getAddTransactionBatchParams',
      );

      await withController(
        { mockMessengerCall },
        async ({
          controller,
          rootMessenger,
          startPollingForBridgeTxStatusSpy,
        }) => {
          const result = await rootMessenger.call(
            'BridgeStatusController:submitTx',
            {
              operation: Operation.DEPOSIT,
              accountAddress: (mockEvmQuoteResponse.trade as TxData).from,
              quoteResponses: [
                {
                  ...mockEvmQuoteResponse,
                  quote: {
                    ...mockEvmQuoteResponse.quote,
                    gasIncluded: true,
                    feeData: {
                      ...mockEvmQuoteResponse.quote.feeData,
                      txFee: {
                        amount: '100',
                        asset: getNativeAssetForChainId(42161),
                        maxFeePerGas: '123',
                        maxPriorityFeePerGas: '123',
                      },
                    },
                  },
                },
              ],
              isStxEnabled: true,
            },
          );
          controller.stopAllPolling();

          expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
          expect(addTransactionBatchFnMock).toHaveBeenCalledTimes(1);
          expect(
            mockMessengerCall.mock.calls.filter(
              ([action]) => action === 'TransactionController:addTransaction',
            ),
          ).toHaveLength(0);
          expect(result.id).toBe('test-tx-id');
          expect(Object.keys(controller.state.txHistory)).toStrictEqual([
            'test-tx-id',
          ]);
          expect(controller.state.txHistory['test-tx-id'].batchId).toBe(
            BATCH_ID_1,
          );
          expect(
            controller.state.txHistory['test-tx-id'].actionId,
          ).toBeUndefined();
          expect(
            controller.state.txHistory['test-tx-id'].depositTxMeta,
          ).toBeUndefined();
          expect(controller.state.txHistory['test-tx-id'].next)
            .toMatchInlineSnapshot(`
              [
                {
                  "operation": "deposit",
                  "partialQuote": {
                    "approval": {
                      "chainId": 42161,
                      "data": "0xapprovalData",
                      "from": "0xaccount1",
                      "gasLimit": 21000,
                      "to": "0xtokenContract",
                      "value": "0x0",
                    },
                    "estimatedProcessingTimeInSeconds": 0,
                    "quoteId": undefined,
                    "resetApproval": undefined,
                    "trade": {
                      "chainId": 42161,
                      "data": "0xdata",
                      "from": "0xaccount1",
                      "gasLimit": 21000,
                      "to": "0xbridgeContract",
                      "value": "0x0",
                    },
                  },
                },
              ]
            `);
          expect(mockMessengerCall).toHaveBeenCalledTimes(8);
        },
      );

      const { messenger, tradeData, ...params } =
        getAddTransactionBatchParamsSpy.mock.calls[0][0];
      expect(params).toMatchInlineSnapshot(`
        {
          "atomic": true,
          "batchId": "0x1234BatchId",
          "disable7702": true,
          "isDelegatedAccount": false,
          "isGasFeeIncluded": false,
          "isGasFeeSponsored": false,
          "requireApproval": false,
        }
      `);
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
    let bridgeStatusController: BridgeStatusController;

    let mockFetchFn: Mock;
    const consoleFn = console.warn;
    let consoleFnSpy: MockInstance;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.clearAllTimers();
      vi.clearAllMocks();
      // eslint-disable-next-line no-empty-function
      consoleFnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
          'RemoteFeatureFlagController:getState',
        ],
        events: ['TransactionController:transactionStatusUpdated'],
      });

      vi.spyOn(mockBridgeStatusMessenger, 'call').mockImplementation(
        (..._args) => {
          return Promise.resolve();
        },
      );

      mockFetchFn = vi
        .fn()
        .mockResolvedValueOnce(MockStatusResponse.getPending());

      vi.setSystemTime(1779988919707);

      // Create base history item for actionId-keyed entries
      const baseHistoryItem = MockTxHistory.getPending().bridgeTxMetaId1;

      bridgeStatusController = new BridgeStatusController({
        messenger: mockBridgeStatusMessenger,
        clientId: BridgeClientId.EXTENSION,
        clientProduct: 'test-client-product',
        fetchFn: mockFetchFn,
        traceFn: mockTraceFn,
        addTransactionBatchFn: vi.fn(),
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
            ...MockTxHistory.getPendingSwap({
              txMetaId: 'quickBuyBridgeTxMetaId1',
              srcTxHash: '0xquickBuySrcTxHash1',
              featureId: FeatureId.QUICK_BUY_FOLLOW_TRADING as never,
            }),
            ...MockTxHistory.getPendingSwap({
              txMetaId: 'quickBuyExploreBridgeTxMetaId1',
              srcTxHash: '0xquickBuyExploreSrcTxHash1',
              featureId: FeatureId.QUICK_BUY_EXPLORE as never,
            }),
            // ActionId-keyed entries for pre-submission failure tests
            'pre-submission-action-id': {
              ...baseHistoryItem,
              actionId: 'pre-submission-action-id',
              txMetaId: undefined,
            },
            'action-id-for-tracking': {
              ...baseHistoryItem,
              actionId: 'action-id-for-tracking',
              txMetaId: undefined,
            },
            'action-id-for-rejection': {
              ...baseHistoryItem,
              actionId: 'action-id-for-rejection',
              txMetaId: undefined,
            },
            '0xbatchsellparent': {
              ...baseHistoryItem,
              txMetaId: undefined,
              batchId: '0xbatchsellparent',
              batchSellData: { transactions: [] },
            },
            '0xatomicbatchparent': {
              ...baseHistoryItem,
              txMetaId: undefined,
              batchId: '0xatomicbatchparent',
            },
          },
        },
      });
    });

    afterEach(() => {
      bridgeStatusController.stopAllPolling();
      console.warn = consoleFn;
      vi.useRealTimers();
    });

    describe('TransactionController:transactionStatusUpdated (failed)', () => {
      it('should track failed event for bridge transaction', () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              error: { name: 'Error', message: 'tx-error' },
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.bridge,
              status: TransactionStatus.failed,
              id: 'bridgeTxMetaId1',
              batchId: '0xBatchIdFailed1',
            },
          },
        );

        expect(
          bridgeStatusController.state.txHistory.bridgeTxMetaId1.status.status,
        ).toBe(StatusTypes.FAILED);
        expect(messengerCallSpy.mock.lastCall).toMatchSnapshot();
      });

      it('should use txMeta properties if history item does not exist', () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');

        const transactionMeta = {
          error: { name: 'Error', message: 'tx-error' },
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: {} as unknown as TransactionParams,
          type: TransactionType.bridge,
          status: TransactionStatus.failed,
          id: 'bridgeTxMetaId1',
        };
        const getEVMTxPropertiesFromTransactionMetaSpy = vi
          .spyOn(metricsUtils, 'getEVMTxPropertiesFromTransactionMeta')
          .mockImplementationOnce(() => {
            bridgeStatusController.wipeBridgeStatus({
              address: 'otherAccount',
              ignoreNetwork: true,
            });
            return metricsUtils.getEVMTxPropertiesFromTransactionMeta(
              transactionMeta,
            );
          });
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta,
          },
        );

        expect(getEVMTxPropertiesFromTransactionMetaSpy).toHaveBeenCalledTimes(
          2,
        );
        expect(bridgeStatusController.state.txHistory).toStrictEqual({});
        expect(messengerCallSpy.mock.lastCall).toMatchInlineSnapshot(`
          [
            "BridgeController:trackUnifiedSwapBridgeEvent",
            "Unified SwapBridge Failed",
            {
              "account_hardware_type": null,
              "action_type": "swapbridge-v1",
              "actual_time_minutes": 0,
              "chain_id_destination": "eip155:42161",
              "chain_id_source": "eip155:42161",
              "custom_slippage": false,
              "destination_hash_present": false,
              "error_code": "unknown",
              "error_message": "Transaction failed. tx-error",
              "failure_phase": "broadcast",
              "feature_id": "unified_swap_bridge",
              "gas_included": false,
              "gas_included_7702": false,
              "is_hardware_wallet": false,
              "location": "Unknown",
              "price_impact": 0,
              "provider": "",
              "quote_vs_execution_ratio": 0,
              "quoted_time_minutes": 0,
              "quoted_vs_used_gas_ratio": 0,
              "security_warnings": [],
              "slippage_limit": 0,
              "source_hash_present": false,
              "source_transaction": "FAILED",
              "stx_enabled": false,
              "swap_type": "crosschain",
              "token_address_destination": "eip155:42161/slip44:60",
              "token_address_source": "eip155:42161/slip44:60",
              "token_security_type_destination": null,
              "token_symbol_destination": "",
              "token_symbol_source": "",
              "usd_actual_gas": 0,
              "usd_actual_return": 0,
              "usd_amount_source": 0,
              "usd_quoted_gas": 0,
              "usd_quoted_return": 0,
            },
          ]
        `);
      });

      it('should include ab_tests and active_ab_tests from history in tracked event properties', () => {
        const abTestsTxMetaId = 'bridgeTxMetaIdAbTests';
        mockMessenger.call(
          'BridgeStatusController:startPollingForBridgeTxStatus',
          {
            ...getMockStartPollingForBridgeTxStatusArgs({
              txMetaId: abTestsTxMetaId,
              srcTxHash: '0xsrcTxHashAbTests',
            }),
            abTests: { token_details_layout: 'treatment' },
            activeAbTests: [
              { key: 'bridge_quote_sorting', value: 'variant_b' },
            ],
          },
        );

        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              error: { name: 'Error', message: 'tx-error' },
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.bridge,
              status: TransactionStatus.failed,
              id: abTestsTxMetaId,
            },
          },
        );

        expect(messengerCallSpy).toHaveBeenCalledWith(
          'BridgeController:trackUnifiedSwapBridgeEvent',
          expect.anything(),
          expect.objectContaining({
            ab_tests: { token_details_layout: 'treatment' },
            active_ab_tests: [
              { key: 'bridge_quote_sorting', value: 'variant_b' },
            ],
            feature_id: FeatureId.UNIFIED_SWAP_BRIDGE,
          }),
        );
      });

      it('should track failed event for bridge transaction if approval is dropped', () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              error: { name: 'Error', message: 'tx-error' },
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.bridgeApproval,
              status: TransactionStatus.dropped,
              id: 'bridgeApprovalTxMetaId1',
            },
          },
        );

        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              error: { name: 'Error', message: 'tx-error' },
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.bridge,
              status: TransactionStatus.dropped,
              id: 'bridgeTxMetaId1WithApproval',
            },
          },
        );

        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
        expect(
          bridgeStatusController.state.txHistory.bridgeTxMetaId1WithApproval
            .status.status,
        ).toBe(StatusTypes.FAILED);
      });

      it('should not track failed event for bridge transaction with featureId=perps', () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              error: { name: 'Error', message: 'tx-error' },
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.bridge,
              status: TransactionStatus.failed,
              id: 'perpsBridgeTxMetaId1',
            },
          },
        );

        expect(
          bridgeStatusController.state.txHistory.perpsBridgeTxMetaId1.status
            .status,
        ).toBe(StatusTypes.FAILED);
        expect(messengerCallSpy.mock.calls).toMatchInlineSnapshot(`[]`);
      });

      it('should track failed event for transaction with featureId=quick_buy_follow_trading', () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              error: { name: 'Error', message: 'tx-error' },
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.bridge,
              status: TransactionStatus.failed,
              id: 'quickBuyBridgeTxMetaId1',
              batchId: '0xBatchId3',
            },
          },
        );

        expect(
          bridgeStatusController.state.txHistory.quickBuyBridgeTxMetaId1.status
            .status,
        ).toBe(StatusTypes.FAILED);
        expect(messengerCallSpy.mock.calls).toMatchInlineSnapshot(`
          [
            [
              "AccountsController:getAccountByAddress",
              "0xaccount1",
            ],
            [
              "TransactionController:getState",
            ],
            [
              "BridgeController:trackUnifiedSwapBridgeEvent",
              "Unified SwapBridge Failed",
              {
                "account_hardware_type": null,
                "action_type": "swapbridge-v1",
                "actual_time_minutes": 833734.9086333333,
                "allowance_reset_transaction": undefined,
                "approval_transaction": undefined,
                "batch_id": "0xBatchId3",
                "chain_id_destination": "eip155:42161",
                "chain_id_source": "eip155:42161",
                "custom_slippage": true,
                "destination_hash_present": false,
                "destination_transaction": "FAILED",
                "error_code": "unknown",
                "error_message": "Transaction failed. tx-error",
                "failure_phase": "source_execution",
                "feature_id": "quick_buy_follow_trading",
                "gas_included": false,
                "gas_included_7702": false,
                "is_hardware_wallet": false,
                "location": "Unknown",
                "price_impact": 0,
                "provider": "lifi_across",
                "quote_vs_execution_ratio": 0,
                "quoted_time_minutes": 0.25,
                "quoted_vs_used_gas_ratio": 0,
                "security_warnings": [],
                "slippage_limit": 0,
                "source_hash_present": true,
                "source_transaction": "COMPLETE",
                "stx_enabled": false,
                "swap_type": "single_chain",
                "token_address_destination": "eip155:42161/slip44:60",
                "token_address_source": "eip155:42161/slip44:60",
                "token_security_type_destination": null,
                "token_symbol_destination": "ETH",
                "token_symbol_source": "ETH",
                "usd_actual_gas": 0,
                "usd_actual_return": 0,
                "usd_amount_source": 0,
                "usd_quoted_gas": 0,
                "usd_quoted_return": 0,
              },
            ],
          ]
        `);
      });

      it('should track failed event for transaction with featureId=quick_buy_explore', () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              error: { name: 'Error', message: 'tx-error' },
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.bridge,
              status: TransactionStatus.failed,
              id: 'quickBuyExploreBridgeTxMetaId1',
              batchId: '0xBatchId3',
            },
          },
        );

        expect(
          bridgeStatusController.state.txHistory.quickBuyExploreBridgeTxMetaId1
            .status.status,
        ).toBe(StatusTypes.FAILED);
        expect(messengerCallSpy.mock.calls).toMatchInlineSnapshot(`
          [
            [
              "AccountsController:getAccountByAddress",
              "0xaccount1",
            ],
            [
              "TransactionController:getState",
            ],
            [
              "BridgeController:trackUnifiedSwapBridgeEvent",
              "Unified SwapBridge Failed",
              {
                "account_hardware_type": null,
                "action_type": "swapbridge-v1",
                "actual_time_minutes": 833734.9086333333,
                "allowance_reset_transaction": undefined,
                "approval_transaction": undefined,
                "batch_id": "0xBatchId3",
                "chain_id_destination": "eip155:42161",
                "chain_id_source": "eip155:42161",
                "custom_slippage": true,
                "destination_hash_present": false,
                "destination_transaction": "FAILED",
                "error_code": "unknown",
                "error_message": "Transaction failed. tx-error",
                "failure_phase": "source_execution",
                "feature_id": "quick_buy_explore",
                "gas_included": false,
                "gas_included_7702": false,
                "is_hardware_wallet": false,
                "location": "Unknown",
                "price_impact": 0,
                "provider": "lifi_across",
                "quote_vs_execution_ratio": 0,
                "quoted_time_minutes": 0.25,
                "quoted_vs_used_gas_ratio": 0,
                "security_warnings": [],
                "slippage_limit": 0,
                "source_hash_present": true,
                "source_transaction": "COMPLETE",
                "stx_enabled": false,
                "swap_type": "single_chain",
                "token_address_destination": "eip155:42161/slip44:60",
                "token_address_source": "eip155:42161/slip44:60",
                "token_security_type_destination": null,
                "token_symbol_destination": "ETH",
                "token_symbol_source": "ETH",
                "usd_actual_gas": 0,
                "usd_actual_return": 0,
                "usd_amount_source": 0,
                "usd_quoted_gas": 0,
                "usd_quoted_return": 0,
              },
            ],
          ]
        `);
      });

      it('should track failed event for swap transaction if approval fails', () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              error: { name: 'Error', message: 'approval-tx-error' },
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.swapApproval,
              status: TransactionStatus.failed,
              id: 'bridgeApprovalTxMetaId1',
            },
          },
        );

        expect(messengerCallSpy.mock.lastCall).toMatchSnapshot();
        expect(
          bridgeStatusController.state.txHistory.bridgeTxMetaId1WithApproval
            .status.status,
        ).toBe(StatusTypes.FAILED);
        expect(
          bridgeStatusController.state.txHistory.bridgeTxMetaId1WithApproval
            .status.srcChain.txHash,
        ).toBe('0xsrcTxHash1');
        expect(
          bridgeStatusController.state.txHistory.bridgeTxMetaId1WithApproval
            .approvalTxId,
        ).toBe('bridgeApprovalTxMetaId1');
      });

      it('should track failed event for bridge transaction if not in txHistory', () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        const expectedHistory = bridgeStatusController.state.txHistory;
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              error: { name: 'Error', message: 'tx-error' },
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.bridge,
              status: TransactionStatus.failed,
              id: 'bridgeTxMetaIda',
            },
          },
        );

        expect(bridgeStatusController.state.txHistory).toStrictEqual(
          expectedHistory,
        );
        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
      });

      it('should track failed event for swap transaction', () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              error: { name: 'Error', message: 'tx-error' },
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.swap,
              status: TransactionStatus.failed,
              id: 'swapTxMetaId1',
            },
          },
        );

        expect(
          bridgeStatusController.state.txHistory.swapTxMetaId1.status.status,
        ).toBe(StatusTypes.FAILED);
        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
      });

      it('should not call getAccountByAddress with undefined when txParams.from is missing', () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              error: { name: 'Error', message: 'tx-error' },
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.bridge,
              status: TransactionStatus.failed,
              id: 'bridgeTxMetaId1',
            },
          },
        );

        const accountLookupCalls = messengerCallSpy.mock.calls.filter(
          (call) => call[0] === 'AccountsController:getAccountByAddress',
        );
        expect(accountLookupCalls).not.toContainEqual([
          'AccountsController:getAccountByAddress',
          undefined,
        ]);
      });

      it('should call getAccountByAddress when txParams.from is set', () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              error: { name: 'Error', message: 'tx-error' },
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: { from: '0xaccount1' },
              type: TransactionType.bridge,
              status: TransactionStatus.failed,
              id: 'bridgeTxMetaId1',
            },
          },
        );

        expect(messengerCallSpy).toHaveBeenCalledWith(
          'AccountsController:getAccountByAddress',
          '0xaccount1',
        );
      });

      it('should not track failed event for signed status', () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              error: { name: 'Error', message: 'tx-error' },
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.swap,
              status: TransactionStatus.signed,
              id: 'swapTxMetaId1',
            },
          },
        );

        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
      });

      it('should not track failed event for approved status', () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              error: { name: 'Error', message: 'tx-error' },
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.swap,
              status: TransactionStatus.approved,
              id: 'swapTxMetaId1',
            },
          },
        );

        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
      });

      it('should not track failed event for other transaction types', () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              error: { name: 'Error', message: 'tx-error' },
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.simpleSend,
              status: TransactionStatus.failed,
              id: 'simpleSendTxMetaId1',
            },
          },
        );

        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
      });

      it('does not store the approval hash or finalise the quote when pre-submit history shares the approval actionId', () => {
        const actionId = 'pre-submission-action-id';
        const reportFinalisedSpy = vi.spyOn(
          QuoteStatusManager.prototype,
          'reportFinalised',
        );

        try {
          mockMessenger.publish(
            'TransactionController:transactionStatusUpdated',
            {
              transactionMeta: {
                error: { name: 'Error', message: 'approval-tx-error' },
                chainId: CHAIN_IDS.ARBITRUM,
                networkClientId: 'eth-id',
                time: Date.now(),
                txParams: {} as unknown as TransactionParams,
                type: TransactionType.swapApproval,
                status: TransactionStatus.failed,
                id: 'approval-tx-id',
                hash: '0xapprovalHash',
                actionId,
              },
            },
          );

          expect(
            bridgeStatusController.state.txHistory[actionId].status.status,
          ).toBe(StatusTypes.FAILED);
          expect(
            bridgeStatusController.state.txHistory[actionId].status.srcChain
              .txHash,
          ).toBe('0xsrcTxHash1');
          expect(reportFinalisedSpy).not.toHaveBeenCalledWith(
            'approval-tx-id',
            false,
            CHAIN_IDS.ARBITRUM,
            '0xapprovalHash',
          );
        } finally {
          reportFinalisedSpy.mockRestore();
        }
      });

      it('should find history by actionId when txMeta.id not in history (pre-submission failure)', () => {
        // The history entry keyed by actionId is set up in beforeEach
        const actionId = 'pre-submission-action-id';
        const unknownTxMetaId = 'unknown-tx-meta-id';

        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              error: { name: 'Error', message: 'tx-error' },
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.bridge,
              status: TransactionStatus.failed,
              id: unknownTxMetaId,
              actionId, // ActionId matches the history entry
            },
          },
        );

        // Verify: History entry keyed by actionId should be marked as failed
        expect(
          bridgeStatusController.state.txHistory[actionId].status.status,
        ).toBe(StatusTypes.FAILED);
        expect(messengerCallSpy.mock.lastCall).toMatchSnapshot();
      });

      it('should track failed event using actionId lookup when id not found', () => {
        // The history entry keyed by actionId is set up in beforeEach
        const actionId = 'action-id-for-tracking';

        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');

        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              error: { name: 'Error', message: 'tx-error' },
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.bridge,
              status: TransactionStatus.failed,
              id: 'non-existent-tx-id',
              actionId,
            },
          },
        );

        // The Failed event should be tracked with the history data from actionId lookup
        expect(messengerCallSpy).toHaveBeenCalled();
        expect(
          bridgeStatusController.state.txHistory[actionId].status.status,
        ).toBe(StatusTypes.FAILED);
      });

      it('should not track failed event when transaction is rejected', () => {
        // The history entry keyed by actionId is set up in beforeEach
        const actionId = 'action-id-for-rejection';

        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');

        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              error: { name: 'Error', message: 'User rejected' },
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.bridge,
              status: TransactionStatus.rejected,
              id: 'rejected-tx-id',
              actionId,
            },
          },
        );

        // Status should still be marked as failed
        expect(
          bridgeStatusController.state.txHistory[actionId].status.status,
        ).toBe(StatusTypes.FAILED);
        // But Failed event should NOT be tracked for rejected status
        // (check that call was not made for tracking - only for marking failed)
        expect(messengerCallSpy).not.toHaveBeenCalled();
      });
    });

    describe('TransactionController:transactionStatusUpdated (confirmed)', () => {
      beforeEach(() => {
        vi.clearAllMocks();
      });

      it('should start polling for bridge tx if status response is invalid', async () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');

        mockFetchFn.mockClear();
        mockFetchFn.mockResolvedValueOnce({
          ...MockStatusResponse.getComplete(),
          status: 'INVALID',
        });
        const oldHistoryItem = mockMessenger.call(
          'BridgeStatusController:getBridgeHistoryItemByTxMetaId',
          'bridgeTxMetaId1',
        );
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.bridge,
              status: TransactionStatus.confirmed,
              id: 'bridgeTxMetaId1',
            },
          },
        );

        vi.advanceTimersByTime(500);
        bridgeStatusController.stopAllPolling();
        await flushPromises();

        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
        expect(mockFetchFn).toHaveBeenCalledTimes(3);
        expect(mockFetchFn).toHaveBeenCalledWith(
          'https://bridge.api.cx.metamask.io/getTxStatus?bridgeId=lifi&srcTxHash=0xsrcTxHash1&bridge=across&srcChainId=42161&destChainId=10&refuel=false&requestId=197c402f-cb96-4096-9f8c-54aed84ca776',
          {
            headers: { 'X-Client-Id': BridgeClientId.EXTENSION },
          },
        );
        expect(
          mockMessenger.call(
            'BridgeStatusController:getBridgeHistoryItemByTxMetaId',
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

      it('should start polling for completed bridge tx with featureId=perps', async () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');

        mockFetchFn.mockClear();
        mockFetchFn.mockResolvedValueOnce(
          MockStatusResponse.getComplete({ srcTxHash: '0xperpsSrcTxHash1' }),
        );
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.bridge,
              status: TransactionStatus.confirmed,
              id: 'perpsBridgeTxMetaId1',
            },
          },
        );

        vi.advanceTimersByTime(30500);
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
          mockMessenger.call(
            'BridgeStatusController:getBridgeHistoryItemByTxMetaId',
            'perpsBridgeTxMetaId1',
          )?.status,
        ).toMatchSnapshot();
        expect(consoleFnSpy).not.toHaveBeenCalled();
      });

      it('should start polling for failed bridge tx with featureId=perps', async () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');

        mockFetchFn.mockClear();
        mockFetchFn.mockResolvedValueOnce(
          MockStatusResponse.getFailed({ srcTxHash: '0xperpsSrcTxHash1' }),
        );
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.bridge,
              status: TransactionStatus.confirmed,
              id: 'perpsBridgeTxMetaId1',
            },
          },
        );

        vi.advanceTimersByTime(40500);
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
          mockMessenger.call(
            'BridgeStatusController:getBridgeHistoryItemByTxMetaId',
            'perpsBridgeTxMetaId1',
          )?.status,
        ).toMatchSnapshot();
        expect(consoleFnSpy).not.toHaveBeenCalled();
      });

      it('should track completed event for swap transaction', () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.swap,
              status: TransactionStatus.confirmed,
              id: 'swapTxMetaId1',
            },
          },
        );

        const completedEventCall = messengerCallSpy.mock.calls.find(
          ([, eventName]) => eventName === UnifiedSwapBridgeEventName.Completed,
        );
        expect(completedEventCall?.[2]).toStrictEqual(
          expect.objectContaining({
            transaction_internal_id: 'swapTxMetaId1',
          }),
        );
        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
      });

      it('should not track completed event for swap transaction with perps featureId', () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.swap,
              status: TransactionStatus.confirmed,
              id: 'perpsSwapTxMetaId1',
            },
          },
        );

        expect(messengerCallSpy).not.toHaveBeenCalled();
      });

      it('should not track completed event for other transaction types', () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.bridge,
              status: TransactionStatus.confirmed,
              id: 'bridgeTxMetaId1',
            },
          },
        );

        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
      });

      it('should not start poll or track completed event if the transaction is an approval', () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        const startPollingSpy = vi.spyOn(
          bridgeStatusController,
          'startPolling',
        );

        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.contractInteraction,
              status: TransactionStatus.confirmed,
              id: 'bridgeApprovalTxMetaId1',
            },
          },
        );

        expect(messengerCallSpy.mock.calls).toHaveLength(0);
        expect(startPollingSpy).not.toHaveBeenCalled();
      });

      it('should not start polling for bridge tx if tx is not in txHistory', () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: Date.now(),
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.bridge,
              status: TransactionStatus.confirmed,
              id: 'bridgeTxMetaId1Unknown',
            },
          },
        );

        expect(messengerCallSpy.mock.calls).toMatchSnapshot();
      });

      it('should not append auth token to status request when getBearerToken throws an error', async () => {
        const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');
        consoleFnSpy = vi
          .spyOn(console, 'error')
          .mockImplementationOnce(vi.fn());
        consoleFnSpy.mockImplementationOnce(vi.fn());

        messengerCallSpy.mockReturnValueOnce({
          remoteFeatureFlags: {
            bridgeConfig: {
              maxPendingHistoryItemAgeMs:
                DEFAULT_MAX_PENDING_HISTORY_ITEM_AGE_MS,
            },
          },
          cacheTimestamp: Date.now(),
        });

        messengerCallSpy.mockImplementationOnce(() => {
          throw new Error(
            'AuthenticationController:getBearerToken not implemented',
          );
        });

        messengerCallSpy.mockReturnValueOnce({
          remoteFeatureFlags: {
            bridgeConfig: {
              maxPendingHistoryItemAgeMs:
                DEFAULT_MAX_PENDING_HISTORY_ITEM_AGE_MS,
            },
          },
          cacheTimestamp: Date.now(),
        });
        messengerCallSpy.mockImplementationOnce(() => {
          throw new Error(
            'AuthenticationController:getBearerToken not implemented',
          );
        });

        mockFetchFn.mockClear();
        mockFetchFn.mockResolvedValueOnce(
          MockStatusResponse.getComplete({ srcTxHash: '0xperpsSrcTxHash1' }),
        );
        mockMessenger.publish(
          'TransactionController:transactionStatusUpdated',
          {
            transactionMeta: {
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'eth-id',
              time: 1729964825189,
              txParams: {} as unknown as TransactionParams,
              type: TransactionType.bridge,
              status: TransactionStatus.confirmed,
              id: 'perpsBridgeTxMetaId1',
            },
          },
        );

        vi.advanceTimersByTime(30500);
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
            [
              "AccountsController:getAccountByAddress",
              "0xaccount1",
            ],
            [
              "TransactionController:getState",
            ],
          ]
        `);
        expect(mockFetchFn).toHaveBeenCalledWith(
          'https://bridge.api.cx.metamask.io/getTxStatus?bridgeId=lifi&srcTxHash=0xperpsSrcTxHash1&bridge=across&srcChainId=42161&destChainId=10&refuel=false&requestId=197c402f-cb96-4096-9f8c-54aed84ca776',
          {
            headers: { 'X-Client-Id': BridgeClientId.EXTENSION },
          },
        );
        expect(consoleFnSpy.mock.calls).toMatchInlineSnapshot(`
          [
            [
              "Error getting JWT token for bridge-api request",
              [Error: AuthenticationController:getBearerToken not implemented],
            ],
          ]
        `);
      });
    });
  });

  describe('reporting submitted quote status updates', () => {
    let fetchSpy: MockInstance;

    beforeEach(() => {
      vi.useFakeTimers();
      // Keep the quote-status update request in-flight so the manager never
      // resolves and mutates state after the assertions/teardown.
      fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockReturnValue(new Promise(() => undefined));
    });

    afterEach(() => {
      fetchSpy.mockRestore();
      vi.clearAllTimers();
      vi.useRealTimers();
    });

    it('reports SUBMITTED once and persists the quote status store', async () => {
      await withController(
        {
          options: {
            isQuoteStatusManagerEnabled: () => true,
            state: {
              txHistory: {
                bridgeTxMetaId1: {
                  ...MockTxHistory.getPending().bridgeTxMetaId1,
                  quoteId: 'quote-1',
                },
              },
            },
          },
          mockMessengerCall: vi.fn(),
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.publish(
            'TransactionController:transactionStatusUpdated',
            {
              transactionMeta: {
                chainId: CHAIN_IDS.ARBITRUM,
                networkClientId: 'eth-id',
                time: Date.now(),
                txParams: {} as unknown as TransactionParams,
                type: TransactionType.bridge,
                status: TransactionStatus.submitted,
                id: 'bridgeTxMetaId1',
                hash: '0xsrcTxHash1',
              },
            },
          );

          expect(
            controller.state.txHistory.bridgeTxMetaId1.reportedSubmittedTxHash,
          ).toBe('0xsrcTxHash1');
          expect(
            Object.keys(controller.state.quoteUpdateStatusStore),
          ).toStrictEqual(['quote-1:0xsrcTxHash1']);

          // A second update for the same hash is a no-op (already reported).
          rootMessenger.publish(
            'TransactionController:transactionStatusUpdated',
            {
              transactionMeta: {
                chainId: CHAIN_IDS.ARBITRUM,
                networkClientId: 'eth-id',
                time: Date.now(),
                txParams: {} as unknown as TransactionParams,
                type: TransactionType.bridge,
                status: TransactionStatus.submitted,
                id: 'bridgeTxMetaId1',
                hash: '0xsrcTxHash1',
              },
            },
          );

          expect(
            Object.keys(controller.state.quoteUpdateStatusStore),
          ).toStrictEqual(['quote-1:0xsrcTxHash1']);

          controller.resetState();
        },
      );
    });

    it('does not report SUBMITTED when the history item has no quoteId', async () => {
      await withController(
        {
          options: {
            isQuoteStatusManagerEnabled: () => true,
            state: {
              txHistory: {
                bridgeTxMetaId1: MockTxHistory.getPending().bridgeTxMetaId1,
              },
            },
          },
          mockMessengerCall: vi.fn(),
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.publish(
            'TransactionController:transactionStatusUpdated',
            {
              transactionMeta: {
                chainId: CHAIN_IDS.ARBITRUM,
                networkClientId: 'eth-id',
                time: Date.now(),
                txParams: {} as unknown as TransactionParams,
                type: TransactionType.bridge,
                status: TransactionStatus.submitted,
                id: 'bridgeTxMetaId1',
                hash: '0xsrcTxHash1',
              },
            },
          );

          expect(
            controller.state.txHistory.bridgeTxMetaId1.reportedSubmittedTxHash,
          ).toBeUndefined();
          expect(controller.state.quoteUpdateStatusStore).toStrictEqual({});
        },
      );
    });

    it('handles a confirmed swap with no matching history item', async () => {
      await withController(
        { mockMessengerCall: vi.fn() },
        async ({ controller, rootMessenger }) => {
          expect(() =>
            rootMessenger.publish(
              'TransactionController:transactionStatusUpdated',
              {
                transactionMeta: {
                  chainId: CHAIN_IDS.ARBITRUM,
                  networkClientId: 'eth-id',
                  time: Date.now(),
                  txParams: {} as unknown as TransactionParams,
                  type: TransactionType.swap,
                  status: TransactionStatus.confirmed,
                  id: 'unmatched-tx-id',
                  hash: '0xunmatchedHash',
                },
              },
            ),
          ).not.toThrow();

          expect(controller.state.txHistory).toStrictEqual({});
        },
      );
    });

    describe('early reporting during submitTx for EVM txs', () => {
      const EVM_TRADE_HASH = '0xevmEarlySrcTxHash';
      const EVM_TX_META_ID = 'evmEarlyTxMetaId';
      const EVM_QUOTE_ID = 'evm-early-quote-1';

      const mockEvmSwapQuoteResponse: QuoteResponseV1 & QuoteMetadata = {
        ...getMockQuote({ srcChainId: 42161, destChainId: 42161 }),
        quoteId: EVM_QUOTE_ID,
        quote: {
          ...getMockQuote({ srcChainId: 42161, destChainId: 42161 }),
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
        totalNetworkFee: {
          amount: '1.234',
          valueInCurrency: undefined,
          usd: undefined,
        },
        gasFee: {
          total: {
            amount: '1.234',
            valueInCurrency: undefined,
            usd: undefined,
          },
        },
        adjustedReturn: { valueInCurrency: undefined, usd: undefined },
        swapRate: '1.234',
        cost: { valueInCurrency: undefined, usd: undefined },
        trade: {
          from: '0xaccount1',
          to: '0xbridgeContract',
          value: '0x0',
          data: '0xdata',
          chainId: 42161,
          gasLimit: 21000,
        },
      };

      const mockTradeTxMeta = {
        id: EVM_TX_META_ID,
        hash: EVM_TRADE_HASH,
        status: TransactionStatus.submitted,
        type: TransactionType.swap,
        chainId: '0xa4b1',
        txParams: { from: '0xaccount1' } as unknown as TransactionParams,
      } as unknown as TransactionMeta;

      const registerSubmitTxHandlers = (rootMessenger: RootMessenger) => {
        rootMessenger.registerActionHandler(
          'BridgeController:stopPollingForQuotes',
          vi.fn(),
        );
        rootMessenger.registerActionHandler(
          'AccountsController:getAccountByAddress',
          (() => mockSelectedAccount) as never,
        );
        rootMessenger.registerActionHandler(
          'BridgeController:trackUnifiedSwapBridgeEvent',
          vi.fn(),
        );
        rootMessenger.registerActionHandler(
          'TransactionController:isAtomicBatchSupported',
          (() => []) as never,
        );
        rootMessenger.registerActionHandler(
          'NetworkController:findNetworkClientIdByChainId',
          () => 'networkClientId',
        );
        rootMessenger.registerActionHandler(
          'TransactionController:estimateGasFee',
          (async () => ({
            estimates: {
              type: GasFeeEstimateType.FeeMarket,
              high: {
                suggestedMaxFeePerGas: '0x1234',
                suggestedMaxPriorityFeePerGas: '0x5678',
              },
            },
          })) as never,
        );
        rootMessenger.registerActionHandler(
          'TransactionController:addTransaction',
          (() => ({
            transactionMeta: mockTradeTxMeta,
            result: Promise.resolve(EVM_TRADE_HASH),
          })) as never,
        );
        rootMessenger.registerActionHandler(
          'TransactionController:getState',
          (() => ({ transactions: [mockTradeTxMeta] })) as never,
        );
        rootMessenger.registerActionHandler(
          'AuthenticationController:getBearerToken',
          async () => 'auth-token',
        );
      };

      it('reports SUBMITTED at submission time, before any status event', async () => {
        await withController(
          { options: { isQuoteStatusManagerEnabled: () => true } },
          async ({ controller, rootMessenger }) => {
            registerSubmitTxHandlers(rootMessenger);

            const result = await rootMessenger.call(
              'BridgeStatusController:submitTx',
              {
                operation: Operation.DEPOSIT,
                accountAddress: (mockEvmSwapQuoteResponse.trade as TxData).from,
                quoteResponses: [mockEvmSwapQuoteResponse],
                isStxEnabled: false,
              },
            );
            controller.stopAllPolling();

            // Reported during submission, without any transactionStatusUpdated event.
            expect(result.id).toBe(EVM_TX_META_ID);
            expect(
              controller.state.txHistory[EVM_TX_META_ID]
                .reportedSubmittedTxHash,
            ).toBe(EVM_TRADE_HASH);
            expect(
              Object.keys(controller.state.quoteUpdateStatusStore),
            ).toStrictEqual([`${EVM_QUOTE_ID}:${EVM_TRADE_HASH}`]);

            // A later submitted event for the same hash is a no-op.
            rootMessenger.publish(
              'TransactionController:transactionStatusUpdated',
              { transactionMeta: mockTradeTxMeta },
            );
            expect(
              Object.keys(controller.state.quoteUpdateStatusStore),
            ).toStrictEqual([`${EVM_QUOTE_ID}:${EVM_TRADE_HASH}`]);

            controller.resetState();
          },
        );
      });

      it('reports SUBMITTED again when the trade hash is replaced after submission', async () => {
        await withController(
          { options: { isQuoteStatusManagerEnabled: () => true } },
          async ({ controller, rootMessenger }) => {
            registerSubmitTxHandlers(rootMessenger);

            await rootMessenger.call('BridgeStatusController:submitTx', {
              operation: Operation.DEPOSIT,
              accountAddress: (mockEvmSwapQuoteResponse.trade as TxData).from,
              quoteResponses: [mockEvmSwapQuoteResponse],
              isStxEnabled: false,
            });
            controller.stopAllPolling();

            const replacementHash = '0xevmReplacementSrcTxHash';
            rootMessenger.publish(
              'TransactionController:transactionStatusUpdated',
              {
                transactionMeta: { ...mockTradeTxMeta, hash: replacementHash },
              },
            );

            expect(mockTraceFn.mock.calls).toMatchInlineSnapshot(`
              [
                [
                  {
                    "data": {
                      "feature_id": "unified_swap_bridge",
                      "srcChainId": "eip155:42161",
                      "stxEnabled": false,
                    },
                    "name": "Swap Transaction Completed",
                    "tags": {
                      "feature": "swap",
                    },
                  },
                  [Function],
                ],
                [
                  {
                    "data": {
                      "feature_id": "unified_swap_bridge",
                      "srcChainId": "eip155:42161",
                      "stxEnabled": false,
                    },
                    "name": "Swap Transaction Approval Completed",
                    "tags": {
                      "feature": "swap",
                    },
                  },
                  [Function],
                ],
              ]
            `);
            expect(
              controller.state.txHistory[EVM_TX_META_ID]
                .reportedSubmittedTxHash,
            ).toBe(replacementHash);
            expect(
              Object.keys(controller.state.quoteUpdateStatusStore).sort(),
            ).toStrictEqual(
              [
                `${EVM_QUOTE_ID}:${EVM_TRADE_HASH}`,
                `${EVM_QUOTE_ID}:${replacementHash}`,
              ].sort(),
            );

            controller.resetState();
          },
        );
      });

      it('does not report SUBMITTED when the rekeyed history item is missing', async () => {
        await withController(
          { options: { isQuoteStatusManagerEnabled: () => true } },
          async ({ controller, rootMessenger }) => {
            registerSubmitTxHandlers(rootMessenger);

            // Simulate a rekey that finds no pre-submission history item: the
            // item is never moved to the trade-meta key, so the subsequent
            // `#reportSubmittedOnce` runs against a non-existent history item
            // and must bail out safely without reporting or throwing.
            vi.spyOn(historyUtils, 'rekeyHistoryItemInState').mockReturnValue(
              false,
            );

            await rootMessenger.call('BridgeStatusController:submitTx', {
              operation: Operation.DEPOSIT,
              accountAddress: (mockEvmSwapQuoteResponse.trade as TxData).from,
              quoteResponses: [mockEvmSwapQuoteResponse],
              isStxEnabled: false,
            });
            controller.stopAllPolling();

            // Nothing was rekeyed onto the trade-meta id, so no submitted
            // status was reported for it.
            expect(controller.state.txHistory[EVM_TX_META_ID]).toBeUndefined();
            expect(controller.state.quoteUpdateStatusStore).toStrictEqual({});

            controller.resetState();
          },
        );
      });
    });

    describe('7702/nested batch sell', () => {
      const BATCH_TX_META_ID = 'batchTxMetaId';
      const BATCH_SRC_TX_HASH = '0xbatchSrcTxHash';
      const BATCH_QUOTE_1 = 'batch-quote-1';
      const BATCH_QUOTE_2 = 'batch-quote-2';
      const BATCH_KEY_1 = `${BATCH_QUOTE_1}:${BATCH_SRC_TX_HASH}`;
      const BATCH_KEY_2 = `${BATCH_QUOTE_2}:${BATCH_SRC_TX_HASH}`;

      /**
       * Builds a 7702/nested batch history: a parent item that lists its child
       * quotes via `quoteIds`, plus one child history item per quote. The
       * parent's `startTime` is left at the (old) mock default so startup
       * seeding is skipped and each test drives reporting via events.
       *
       * @returns The batch txHistory keyed by history id.
       */
      function buildBatchHistory(): Record<string, BridgeHistoryItem> {
        const parent = {
          ...MockTxHistory.getPending({
            txMetaId: BATCH_TX_META_ID,
            srcTxHash: BATCH_SRC_TX_HASH,
          })[BATCH_TX_META_ID],
          featureId: FeatureId.BATCH_SELL,
          // The parent reports its quotes via `quoteIds`, not its own quoteId.
          quoteId: undefined,
          quoteIds: ['batchChild1', 'batchChild2'],
        };
        const child1 = {
          ...MockTxHistory.getPending({
            txMetaId: 'batchChild1',
            srcTxHash: BATCH_SRC_TX_HASH,
          }).batchChild1,
          featureId: FeatureId.BATCH_SELL,
          txMetaId: undefined,
          quoteId: BATCH_QUOTE_1,
        };
        const child2 = {
          ...MockTxHistory.getPending({
            txMetaId: 'batchChild2',
            srcTxHash: BATCH_SRC_TX_HASH,
          }).batchChild2,
          featureId: FeatureId.BATCH_SELL,
          txMetaId: undefined,
          quoteId: BATCH_QUOTE_2,
        };
        return {
          [BATCH_TX_META_ID]: parent,
          batchChild1: child1,
          batchChild2: child2,
        };
      }

      const getBatchMessengerCall = () =>
        vi.fn((...args: unknown[]) => {
          const action = args[0] as string;
          if (action === 'TransactionController:getState') {
            return { transactions: [] };
          }
          if (action === 'AccountsController:getAccountByAddress') {
            return mockSelectedAccount;
          }
        });

      it('reports SUBMITTED for every quote in the batch under the shared tx hash', async () => {
        await withController(
          {
            options: {
              isQuoteStatusManagerEnabled: () => true,
              state: { txHistory: buildBatchHistory() },
            },
            mockMessengerCall: vi.fn(),
          },
          async ({ controller, rootMessenger }) => {
            rootMessenger.publish(
              'TransactionController:transactionStatusUpdated',
              {
                transactionMeta: {
                  chainId: CHAIN_IDS.ARBITRUM,
                  networkClientId: 'eth-id',
                  time: Date.now(),
                  txParams: {} as unknown as TransactionParams,
                  type: TransactionType.swap,
                  status: TransactionStatus.submitted,
                  id: BATCH_TX_META_ID,
                  hash: BATCH_SRC_TX_HASH,
                },
              },
            );

            // One entry is created per quote in the batch, all keyed by the
            // shared source tx hash.
            expect(
              Object.keys(controller.state.quoteUpdateStatusStore).sort(),
            ).toStrictEqual([BATCH_KEY_1, BATCH_KEY_2].sort());
            expect(
              controller.state.quoteUpdateStatusStore[BATCH_KEY_1].status,
            ).toBe(QuoteStatusState.Submitted);
            expect(
              controller.state.quoteUpdateStatusStore[BATCH_KEY_2].status,
            ).toBe(QuoteStatusState.Submitted);
            expect(
              controller.state.txHistory[BATCH_TX_META_ID]
                .reportedSubmittedTxHash,
            ).toBe(BATCH_SRC_TX_HASH);

            controller.resetState();
          },
        );
      });

      it('does not re-report the batch quotes on a repeat submitted event', async () => {
        await withController(
          {
            options: {
              isQuoteStatusManagerEnabled: () => true,
              state: { txHistory: buildBatchHistory() },
            },
            mockMessengerCall: vi.fn(),
          },
          async ({ controller, rootMessenger }) => {
            const submittedEvent = {
              transactionMeta: {
                chainId: CHAIN_IDS.ARBITRUM,
                networkClientId: 'eth-id',
                time: Date.now(),
                txParams: {} as unknown as TransactionParams,
                type: TransactionType.swap,
                status: TransactionStatus.submitted,
                id: BATCH_TX_META_ID,
                hash: BATCH_SRC_TX_HASH,
              },
            };

            rootMessenger.publish(
              'TransactionController:transactionStatusUpdated',
              submittedEvent,
            );
            rootMessenger.publish(
              'TransactionController:transactionStatusUpdated',
              submittedEvent,
            );

            // The already-reported guard keeps the store to exactly one entry
            // per quote despite the duplicate event.
            expect(
              Object.keys(controller.state.quoteUpdateStatusStore).sort(),
            ).toStrictEqual([BATCH_KEY_1, BATCH_KEY_2].sort());

            controller.resetState();
          },
        );
      });

      it('finalizes every quote in the batch as success when the batch confirms', async () => {
        await withController(
          {
            options: {
              isQuoteStatusManagerEnabled: () => true,
              state: { txHistory: buildBatchHistory() },
            },
            mockMessengerCall: getBatchMessengerCall(),
          },
          async ({ controller, rootMessenger }) => {
            // A confirmed batch reports SUBMITTED for each quote (via the nested
            // swap) and then finalizes them all under the shared txMetaId.
            rootMessenger.publish(
              'TransactionController:transactionStatusUpdated',
              {
                transactionMeta: {
                  chainId: CHAIN_IDS.ARBITRUM,
                  networkClientId: 'eth-id',
                  time: Date.now(),
                  txParams: {} as unknown as TransactionParams,
                  type: TransactionType.batch,
                  status: TransactionStatus.confirmed,
                  id: BATCH_TX_META_ID,
                  hash: BATCH_SRC_TX_HASH,
                  nestedTransactions: [{ type: TransactionType.swap }],
                },
              },
            );

            expect(
              Object.keys(controller.state.quoteUpdateStatusStore).sort(),
            ).toStrictEqual([BATCH_KEY_1, BATCH_KEY_2].sort());
            expect(
              controller.state.quoteUpdateStatusStore[BATCH_KEY_1].status,
            ).toBe(QuoteStatusState.FinalizedSuccess);
            expect(
              controller.state.quoteUpdateStatusStore[BATCH_KEY_2].status,
            ).toBe(QuoteStatusState.FinalizedSuccess);

            controller.resetState();
          },
        );
      });

      it('finalizes every quote in the batch as failure when the batch fails', async () => {
        await withController(
          {
            options: {
              isQuoteStatusManagerEnabled: () => true,
              state: { txHistory: buildBatchHistory() },
            },
            mockMessengerCall: getBatchMessengerCall(),
          },
          async ({ controller, rootMessenger }) => {
            // Report SUBMITTED for the batch quotes first (failure reporting does
            // not create entries on its own).
            rootMessenger.publish(
              'TransactionController:transactionStatusUpdated',
              {
                transactionMeta: {
                  chainId: CHAIN_IDS.ARBITRUM,
                  networkClientId: 'eth-id',
                  time: Date.now(),
                  txParams: {} as unknown as TransactionParams,
                  type: TransactionType.swap,
                  status: TransactionStatus.submitted,
                  id: BATCH_TX_META_ID,
                  hash: BATCH_SRC_TX_HASH,
                },
              },
            );

            rootMessenger.publish(
              'TransactionController:transactionStatusUpdated',
              {
                transactionMeta: {
                  chainId: CHAIN_IDS.ARBITRUM,
                  networkClientId: 'eth-id',
                  time: Date.now(),
                  txParams: {} as unknown as TransactionParams,
                  type: TransactionType.swap,
                  status: TransactionStatus.failed,
                  id: BATCH_TX_META_ID,
                  hash: BATCH_SRC_TX_HASH,
                },
              },
            );

            expect(
              controller.state.quoteUpdateStatusStore[BATCH_KEY_1].status,
            ).toBe(QuoteStatusState.FinalizedFailed);
            expect(
              controller.state.quoteUpdateStatusStore[BATCH_KEY_2].status,
            ).toBe(QuoteStatusState.FinalizedFailed);

            controller.resetState();
          },
        );
      });

      it('seeds a SUBMITTED entry for every batch quote from persisted history on startup', async () => {
        await withController(
          {
            options: {
              isQuoteStatusManagerEnabled: () => true,
              state: {
                txHistory: {
                  ...buildBatchHistory(),
                  // A recent startTime makes the parent eligible for backfill.
                  [BATCH_TX_META_ID]: {
                    ...buildBatchHistory()[BATCH_TX_META_ID],
                    startTime: Date.now(),
                  },
                },
              },
            },
            mockMessengerCall: getBatchMessengerCall(),
          },
          async ({ controller }) => {
            // Startup seeding replays reportSubmitted for each quote in the batch
            // without waiting for a transaction event.
            expect(
              Object.keys(controller.state.quoteUpdateStatusStore).sort(),
            ).toStrictEqual([BATCH_KEY_1, BATCH_KEY_2].sort());
            expect(
              controller.state.txHistory[BATCH_TX_META_ID]
                .reportedSubmittedTxHash,
            ).toBe(BATCH_SRC_TX_HASH);

            controller.resetState();
          },
        );
      });
    });

    describe('intent-based swaps', () => {
      const INTENT_TX_META_ID = 'intentTxMetaId1';
      const INTENT_SRC_TX_HASH = '0xintentSrcTxHash1';

      /**
       * Builds a history item for an intent-based order. The quote carries
       * `intent` data, which is what marks the trade as backend-tracked.
       *
       * @param startTime - When the trade started, used to decide whether
       * startup seeding considers the item.
       * @returns The intent txHistory keyed by history id.
       */
      function buildIntentHistory(
        startTime = 1729964825189,
      ): Record<string, BridgeHistoryItem> {
        const item = MockTxHistory.getPending({
          txMetaId: INTENT_TX_META_ID,
          srcTxHash: INTENT_SRC_TX_HASH,
          startTime,
        })[INTENT_TX_META_ID];

        return {
          [INTENT_TX_META_ID]: {
            ...item,
            quoteId: 'intent-quote-1',
            quote: {
              ...item.quote,
              intent: {
                protocol: 'cowswap',
                order: {
                  sellToken: '0x0000000000000000000000000000000000000001',
                  buyToken: '0x0000000000000000000000000000000000000002',
                  validTo: 1717027200,
                  appData: 'some-app-data',
                  appDataHash: '0xabcd',
                  feeAmount: '100',
                  kind: 'sell',
                  partiallyFillable: false,
                  sellAmount: '1000',
                },
                typedData: {
                  types: {},
                  primaryType: 'Order',
                  domain: {},
                  message: {},
                },
              },
            },
          },
        };
      }

      const getIntentMessengerCall = () =>
        vi.fn((...args: unknown[]) => {
          const action = args[0] as string;
          if (action === 'TransactionController:getState') {
            return { transactions: [] };
          }
          if (action === 'AuthenticationController:getBearerToken') {
            return Promise.resolve('auth-token');
          }
        });

      it.each([
        {
          description: 'submitted',
          status: TransactionStatus.submitted,
          type: TransactionType.swap,
        },
        {
          description: 'confirmed',
          status: TransactionStatus.confirmed,
          type: TransactionType.swap,
        },
        {
          description: 'failed',
          status: TransactionStatus.failed,
          type: TransactionType.swap,
        },
      ])(
        'does not report any quote status when the intent tx is $description',
        async ({ status, type }) => {
          const onQuoteStatusManagerError = vi.fn();

          await withController(
            {
              options: {
                isQuoteStatusManagerEnabled: () => true,
                onQuoteStatusManagerError,
                state: { txHistory: buildIntentHistory() },
              },
              mockMessengerCall: getIntentMessengerCall(),
            },
            async ({ controller, rootMessenger }) => {
              rootMessenger.publish(
                'TransactionController:transactionStatusUpdated',
                {
                  transactionMeta: {
                    chainId: CHAIN_IDS.ARBITRUM,
                    networkClientId: 'eth-id',
                    time: Date.now(),
                    txParams: {} as unknown as TransactionParams,
                    type,
                    status,
                    id: INTENT_TX_META_ID,
                    hash: INTENT_SRC_TX_HASH,
                  },
                },
              );

              // The backend owns the quote status of intent orders, so the
              // client neither creates a tracking entry nor marks the history
              // item as reported.
              expect(controller.state.quoteUpdateStatusStore).toStrictEqual({});
              expect(
                controller.state.txHistory[INTENT_TX_META_ID]
                  .reportedSubmittedTxHash,
              ).toBeUndefined();
              // Finalizing an untracked quote surfaces a "entry was not found"
              // error, so silence here proves finalization was never attempted.
              expect(onQuoteStatusManagerError).not.toHaveBeenCalled();
            },
          );
        },
      );

      it('does not seed a quote status entry for an intent order on startup', async () => {
        await withController(
          {
            options: {
              isQuoteStatusManagerEnabled: () => true,
              state: { txHistory: buildIntentHistory(Date.now()) },
            },
            mockMessengerCall: getIntentMessengerCall(),
          },
          async ({ controller }) => {
            expect(controller.state.quoteUpdateStatusStore).toStrictEqual({});
            expect(
              controller.state.txHistory[INTENT_TX_META_ID]
                .reportedSubmittedTxHash,
            ).toBeUndefined();
          },
        );
      });
    });
  });

  describe('post-swap deposit', () => {
    const SWAP_ID = 'swapTxMetaId1';
    const SRC_HASH = '0xsrcTxHash1';
    const DEST_HASH = '0xdestTxHash1';
    const DEPOSIT_TX_ID = 'deposit-tx-id';
    const DEPOSIT_HASH = '0xdepositHash';
    const DEPOSIT_DATA = '0xdeposit';
    const DEST_ASSET = '0x0000000000000000000000000000000000000001';
    const MONEY_ACCOUNT = '0x1111111111111111111111111111111111111111';
    const TRANSFER_TOPIC =
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

    const UNDERLYING_TOKEN =
      '0x8888888888888888888888888888888888888888' as const;
    const vaultConfig = (chainId: string = CHAIN_IDS.ARBITRUM) => ({
      chainId,
      boringVault: '0x2222222222222222222222222222222222222222',
      tellerAddress: '0x3333333333333333333333333333333333333333',
      accountantAddress: '0x4444444444444444444444444444444444444444',
      lensAddress: '0x5555555555555555555555555555555555555555',
      underlyingToken: UNDERLYING_TOKEN,
    });

    const depositBatch = () => ({
      approveTx: {
        type: TransactionType.tokenMethodApprove,
        params: {
          to: '0x6666666666666666666666666666666666666666',
          data: '0xapprove',
          value: '0x0',
        },
      },
      depositTx: {
        type: TransactionType.moneyAccountDeposit,
        params: {
          to: '0x7777777777777777777777777777777777777777',
          data: DEPOSIT_DATA,
          value: '0x0',
        },
      },
    });

    const receiptLogs = (wallet = '0xaccount1') => [
      {
        address: DEST_ASSET,
        topics: [
          TRANSFER_TOPIC,
          `0x${'0'.repeat(64)}`,
          `0x${wallet.slice(2).padStart(64, '0')}`,
        ],
        data: '0x64',
      },
    ];

    const transactionReceipt = (
      logs: { address?: string; topics?: string[]; data?: string }[],
    ) => ({ logs });

    const depositTxMeta = (hash?: string): TransactionMeta => ({
      id: DEPOSIT_TX_ID,
      batchId: BATCH_ID_1,
      type: TransactionType.moneyAccountDeposit,
      status: TransactionStatus.confirmed,
      chainId: CHAIN_IDS.ARBITRUM,
      networkClientId: 'arb',
      time: 1,
      txParams: {
        data: DEPOSIT_DATA,
        from: MONEY_ACCOUNT,
        to: '0x7777777777777777777777777777777777777777',
      },
      ...(hash ? { hash } : {}),
    });

    const swapHistory = ({
      srcChainId = 42161,
      destChainId = 42161,
      srcTxHash = SRC_HASH,
      destTxHash,
      destWalletAddress,
      walletAddress,
      gasSponsored,
      gasIncluded7702,
    }: {
      srcChainId?: number;
      destChainId?: number;
      srcTxHash?: string;
      destTxHash?: string;
      destWalletAddress?: string | null;
      walletAddress?: string | null;
      gasSponsored?: boolean;
      gasIncluded7702?: boolean;
    } = {}): Record<string, BridgeHistoryItem> => {
      const pending = MockTxHistory.getPendingSwap({
        txMetaId: SWAP_ID,
        srcTxHash,
        srcChainId,
        destChainId,
      })[SWAP_ID];
      const historyItem: BridgeHistoryItem = {
        ...pending,
        startTime: Date.now(),
        quote: {
          ...pending.quote,
          destAsset: { ...pending.quote.destAsset, address: DEST_ASSET },
          destWalletAddress:
            destWalletAddress === null
              ? undefined
              : (destWalletAddress ?? '0xaccount1'),
          walletAddress: walletAddress === null ? undefined : walletAddress,
          gasSponsored,
          gasIncluded7702,
        },
        next: [
          {
            operation: Operation.DEPOSIT,
            partialQuote: {
              estimatedProcessingTimeInSeconds: 15,
              trade: {
                chainId: destChainId,
                to: '0x1111111111111111111111111111111111111111',
                from: '0x2222222222222222222222222222222222222222',
                value: '0x0',
                data: '0x',
                gasLimit: null,
              },
            },
          },
        ],
      };
      if (destTxHash && historyItem.status.destChain) {
        historyItem.status = {
          ...historyItem.status,
          destChain: {
            ...historyItem.status.destChain,
            txHash: destTxHash,
          },
        };
      }
      return { [SWAP_ID]: historyItem };
    };

    const trackedEvents = (messengerCall: Mock) =>
      messengerCall.mock.calls
        .filter(
          ([action]) =>
            action === 'BridgeController:trackUnifiedSwapBridgeEvent',
        )
        .map(([, eventName]) => eventName);

    const defaultProvider = () => ({
      request: vi.fn(),
      send: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    });

    const queueDepositMessenger = (
      transactions: TransactionMeta[] = [depositTxMeta(DEPOSIT_HASH)],
      options: {
        account?: { id?: string; address: string };
        moneyAccount?: { address?: string };
        provider?: ReturnType<typeof defaultProvider>;
      } = {},
    ) => {
      const account =
        'account' in options ? options.account : mockSelectedAccount;
      const moneyAccount =
        'moneyAccount' in options
          ? options.moneyAccount
          : { address: MONEY_ACCOUNT };
      const provider =
        'provider' in options ? options.provider : defaultProvider();
      const messengerCall = vi.fn((action: string) => {
        switch (action) {
          case 'AccountsController:getAccountByAddress':
            return account;
          case 'TransactionController:isAtomicBatchSupported':
            return [];
          case 'MoneyAccountController:getMoneyAccount':
            return moneyAccount;
          case 'RemoteFeatureFlagController:getState':
            return {
              remoteFeatureFlags: { bridgeConfig: {} },
              cacheTimestamp: 1,
            };
          case 'NetworkController:findNetworkClientIdByChainId':
            return 'arb';
          case 'NetworkController:getNetworkClientById':
            return { provider };
          case 'NetworkController:getState':
            return { selectedNetworkClientId: 'arb' };
          case 'TransactionController:estimateGasFee':
            return {
              estimates: {
                type: GasFeeEstimateType.FeeMarket,
                high: {
                  suggestedMaxFeePerGas: '0x1234',
                  suggestedMaxPriorityFeePerGas: '0x5678',
                },
              },
            };
          case 'TransactionController:getState':
            return { transactions };
          case 'BridgeController:trackUnifiedSwapBridgeEvent':
            return;
          case 'AuthenticationController:getBearerToken':
            return 'auth-token';
          case 'TransactionPayController:setTransactionConfig':
          case 'TransactionPayController:updatePaymentToken':
            return;
          case 'ApprovalController:acceptRequest':
            return Promise.resolve();
          default:
        }
      });
      return messengerCall;
    };

    const publishSwap = (
      rootMessenger: RootMessenger,
      status: TransactionStatus,
      id = SWAP_ID,
    ) => {
      const transactionMeta: TransactionMeta = {
        id,
        hash: SRC_HASH,
        status,
        type: TransactionType.swap,
        chainId: CHAIN_IDS.ARBITRUM,
        networkClientId: 'arb',
        time: 1,
        txParams: { from: '0xaccount1' },
      };
      rootMessenger.publish('TransactionController:transactionStatusUpdated', {
        transactionMeta,
      });
    };

    let receipt: ReturnType<typeof transactionReceipt>;

    beforeEach(() => {
      mockGenerateBatchId.mockReset();
      mockGenerateBatchId.mockReturnValue(BATCH_ID_1);
      mockGetMoneyAccountVaultConfig.mockReturnValue(vaultConfig());
      mockBuildMoneyAccountDepositBatch.mockResolvedValue(depositBatch());
      receipt = transactionReceipt(receiptLogs());
      vi.spyOn(networkUtils, 'getWeb3Provider').mockImplementation(
        (messenger, chainId) => {
          const networkProvider = networkUtils.getNetworkClientByChainId(
            messenger,
            chainId,
          );
          if (!networkProvider) {
            throw new Error(`No provider available for chain ${chainId}`);
          }
          return {
            getTransactionReceipt: async () => receipt,
          } as unknown as ReturnType<typeof networkUtils.getWeb3Provider>;
        },
      );
    });

    it('throws before the deposit batch when params are missing', async () => {
      const selectedAccount: InternalAccount = {
        type: 'eip155:eoa',
        id: 'test-account-id',
        address: '0xaccount1',
        scopes: ['eip155:42161'],
        options: {},
        methods: [],
        metadata: {
          name: 'Account 1',
          importTime: 0,
          keyring: { type: 'HD Key Tree' },
        },
      };
      const traceFn: SwapTraceFunction<TraceName> = (
        _request: SwapTraceRequest<TraceName>,
        fn?: (args?: unknown) => unknown,
      ) => fn?.();

      await withController(async ({ messenger }) => {
        const params = ({
          previousTxHash,
          historyKey,
          batchId,
        }: {
          previousTxHash?: string;
          historyKey?: string;
          batchId?: `0x${string}`;
        } = {}): SubmitStrategyParams<Trade> => ({
          addTransactionBatchFn: async () => ({ batchId: BATCH_ID_1 }),
          messenger,
          traceFn,
          fetchFn: () => Promise.resolve(new Response()),
          batchSellTrades: null,
          isBridgeTx: false,
          isDelegatedAccount: false,
          isStxEnabled: false,
          requireApproval: false,
          selectedAccount,
          clientId: BridgeClientId.EXTENSION,
          bridgeApiBaseUrl: 'https://bridge.api.cx.metamask.io',
          quoteResponses: [
            {
              quote: getMockQuote(),
              trade: {
                chainId: 42161,
                to: '0x1111111111111111111111111111111111111111',
                from: '0x2222222222222222222222222222222222222222',
                value: '0x0',
                data: '0x',
                gasLimit: null,
              },
              estimatedProcessingTimeInSeconds: 15,
            },
          ],
          previousTxHash,
          historyKey,
          batchId,
        });

        await expect(submitDepositHandler(params()).next()).rejects.toThrow(
          'Previous transaction hash is required for deposit',
        );
        await expect(
          submitDepositHandler(params({ previousTxHash: SRC_HASH })).next(),
        ).rejects.toThrow('History key is required for deposit');
        await expect(
          submitDepositHandler(
            params({ previousTxHash: SRC_HASH, historyKey: SWAP_ID }),
          ).next(),
        ).rejects.toThrow('Batch ID is required for deposit');
      });
    });

    it('runs the deposit after the swap confirms and completes only after the deposit', async () => {
      const messengerCall = queueDepositMessenger();
      addTransactionBatchFnMock = vi.fn().mockResolvedValue(undefined);

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: {
            addTransactionBatchFn: addTransactionBatchFnMock,
            state: { txHistory: swapHistory() },
          },
        },
        async ({ controller, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();

          expect(mockBuildMoneyAccountDepositBatch).toHaveBeenCalledTimes(1);
          expect(addTransactionBatchFnMock).toHaveBeenCalledTimes(1);
          expect(trackedEvents(messengerCall)).not.toContain(
            UnifiedSwapBridgeEventName.Completed,
          );
          expect(
            controller.state.txHistory[SWAP_ID].depositTxMeta,
          ).toStrictEqual({
            batchId: BATCH_ID_1,
            id: DEPOSIT_TX_ID,
          });
          expect(controller.state.txHistory[SWAP_ID].next).toStrictEqual([]);
          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.COMPLETE,
          );

          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();
          expect(mockBuildMoneyAccountDepositBatch).toHaveBeenCalledTimes(1);
          expect(trackedEvents(messengerCall)).not.toContain(
            UnifiedSwapBridgeEventName.Completed,
          );

          rootMessenger.publish(
            'TransactionController:transactionStatusUpdated',
            { transactionMeta: depositTxMeta() },
          );
          await flushPromises();

          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.COMPLETE,
          );
          expect(trackedEvents(messengerCall)).toContain(
            UnifiedSwapBridgeEventName.Completed,
          );
        },
      );
    });

    it('runs the deposit after a bridge completes and skips completed until the deposit confirms', async () => {
      vi.useFakeTimers();
      vi.spyOn(Date, 'now').mockReturnValue(1729964825189);
      const messengerCall = queueDepositMessenger();
      vi.spyOn(bridgeStatusUtils, 'fetchBridgeTxStatus').mockResolvedValue({
        status: MockStatusResponse.getComplete({
          srcTxHash: SRC_HASH,
          destTxHash: DEST_HASH,
        }),
        validationFailures: [],
      });

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: {
            addTransactionBatchFn: vi.fn().mockResolvedValue(undefined),
            state: {
              txHistory: swapHistory({
                destChainId: 10,
                destTxHash: DEST_HASH,
                walletAddress: '0xaccount1',
                destWalletAddress: null,
              }),
            },
          },
        },
        async ({ controller }) => {
          controller.startPolling({ bridgeTxMetaId: SWAP_ID });
          await flushPromises();
          vi.advanceTimersByTime(10000);
          await flushPromises();

          expect(mockBuildMoneyAccountDepositBatch).toHaveBeenCalledTimes(1);
          expect(trackedEvents(messengerCall)).not.toContain(
            UnifiedSwapBridgeEventName.Completed,
          );
          expect(controller.state.txHistory[SWAP_ID].depositTxMeta?.id).toBe(
            DEPOSIT_TX_ID,
          );
          vi.useRealTimers();
        },
      );
    });

    it('publishes failed and skips the deposit when the swap fails', async () => {
      const messengerCall = queueDepositMessenger();

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: swapHistory() } },
        },
        async ({ controller, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.failed);
          await flushPromises();

          expect(mockBuildMoneyAccountDepositBatch).not.toHaveBeenCalled();
          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(trackedEvents(messengerCall)).toContain(
            UnifiedSwapBridgeEventName.Failed,
          );
          expect(trackedEvents(messengerCall)).not.toContain(
            UnifiedSwapBridgeEventName.Completed,
          );
        },
      );
    });

    it.each([
      {
        name: 'deposit config',
        options: {},
        omitUnderlyingToken: true,
      },
      {
        name: 'money account',
        options: { moneyAccount: undefined },
      },
      {
        name: 'money account address',
        options: { moneyAccount: {} },
      },
      {
        name: 'provider',
        options: { provider: undefined },
      },
      {
        name: 'received amount',
        options: {},
        logs: [],
      },
    ])(
      'publishes failed when the $name is missing',
      async ({ options, logs, omitUnderlyingToken }) => {
        if (logs) {
          receipt = transactionReceipt(logs);
        }
        if (omitUnderlyingToken) {
          mockGetMoneyAccountVaultConfig.mockReturnValue({
            ...vaultConfig(),
            underlyingToken: undefined,
          });
        }
        const messengerCall = queueDepositMessenger([], options);

        await withController(
          {
            mockMessengerCall: messengerCall,
            options: { state: { txHistory: swapHistory() } },
          },
          async ({ controller, rootMessenger }) => {
            publishSwap(rootMessenger, TransactionStatus.confirmed);
            await flushPromises();

            expect(mockBuildMoneyAccountDepositBatch).not.toHaveBeenCalled();
            expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
              StatusTypes.FAILED,
            );
            expect(trackedEvents(messengerCall)).toContain(
              UnifiedSwapBridgeEventName.Failed,
            );
            expect(trackedEvents(messengerCall)).not.toContain(
              UnifiedSwapBridgeEventName.Completed,
            );
          },
        );
      },
    );

    it('publishes failed when the deposit batch tx has no hash', async () => {
      mockGetMoneyAccountVaultConfig.mockReturnValue(vaultConfig());
      const messengerCall = queueDepositMessenger([depositTxMeta()]);

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: {
            addTransactionBatchFn: vi.fn().mockResolvedValue(undefined),
            state: {
              txHistory: swapHistory({
                destWalletAddress: null,
                walletAddress: null,
                gasSponsored: true,
                gasIncluded7702: true,
              }),
            },
          },
        },
        async ({ controller, messenger, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();

          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(trackedEvents(messengerCall)).toContain(
            UnifiedSwapBridgeEventName.Failed,
          );
          expect(messenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({
              message: 'Transaction failed due to missing tx meta',
            }),
          );
        },
      );
    });

    it('rethrows addTransactionBatchFn error if the deposit tx is not in state', async () => {
      const messengerCall = queueDepositMessenger([]);
      addTransactionBatchFnMock = vi
        .fn()
        .mockRejectedValue(new Error('Failed to add batch'));

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: {
            addTransactionBatchFn: addTransactionBatchFnMock,
            state: { txHistory: swapHistory() },
          },
        },
        async ({ controller, messenger, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();

          expect(addTransactionBatchFnMock).toHaveBeenCalled();
          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(messenger.captureException).toHaveBeenCalledWith(
            new Error('Failed to add batch'),
          );
        },
      );
    });

    it('publishes failed when the vault config is missing', async () => {
      mockGetMoneyAccountVaultConfig.mockReturnValue(undefined);
      const messengerCall = queueDepositMessenger();

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: swapHistory() } },
        },
        async ({ controller, messenger, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();

          expect(mockBuildMoneyAccountDepositBatch).not.toHaveBeenCalled();
          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(messenger.captureException).toHaveBeenCalledWith(
            new Error('Failed to get money account deposit config'),
          );
        },
      );
    });

    it('ignores an unmatched money-account deposit', async () => {
      const messengerCall = vi.fn();
      await withController(
        { mockMessengerCall: messengerCall },
        async ({ controller, rootMessenger }) => {
          messengerCall.mockClear();
          expect(() =>
            rootMessenger.publish(
              'TransactionController:transactionStatusUpdated',
              { transactionMeta: depositTxMeta(DEPOSIT_HASH) },
            ),
          ).not.toThrow();
          expect(controller.state.txHistory).toStrictEqual({});
          expect(messengerCall).not.toHaveBeenCalled();
        },
      );
    });

    it('ignores a nested deposit batch with no matching history item', async () => {
      const messengerCall = vi.fn();
      await withController(
        { mockMessengerCall: messengerCall },
        async ({ controller, rootMessenger }) => {
          messengerCall.mockClear();
          expect(() =>
            rootMessenger.publish(
              'TransactionController:transactionStatusUpdated',
              {
                transactionMeta: {
                  ...depositTxMeta(DEPOSIT_HASH),
                  type: TransactionType.batch,
                  nestedTransactions: [
                    { type: TransactionType.moneyAccountDeposit },
                  ],
                },
              },
            ),
          ).not.toThrow();
          expect(controller.state.txHistory).toStrictEqual({});
        },
      );
    });

    it('marks history failed when a matching deposit fails', async () => {
      const messengerCall = queueDepositMessenger();
      const history = swapHistory();
      history[SWAP_ID].next = [];
      history[SWAP_ID].depositTxMeta = { batchId: BATCH_ID_1 };

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: history } },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.publish(
            'TransactionController:transactionStatusUpdated',
            {
              transactionMeta: {
                ...depositTxMeta(DEPOSIT_HASH),
                status: TransactionStatus.failed,
                error: { name: 'Error', message: 'tx-error' },
              },
            },
          );
          await flushPromises();

          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(trackedEvents(messengerCall)).toContain(
            UnifiedSwapBridgeEventName.Failed,
          );
        },
      );
    });

    it('ignores a non-terminal matching deposit status', async () => {
      const messengerCall = queueDepositMessenger();
      const history = swapHistory();
      history[SWAP_ID].next = [];
      history[SWAP_ID].depositTxMeta = { batchId: BATCH_ID_1 };

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: history } },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.publish(
            'TransactionController:transactionStatusUpdated',
            {
              transactionMeta: {
                ...depositTxMeta(DEPOSIT_HASH),
                status: TransactionStatus.submitted,
              },
            },
          );
          await flushPromises();

          expect(controller.state.txHistory[SWAP_ID].status.status).not.toBe(
            StatusTypes.COMPLETE,
          );
          expect(controller.state.txHistory[SWAP_ID].status.status).not.toBe(
            StatusTypes.FAILED,
          );
        },
      );
    });

    it('skips the next action when the dest token is unexpected', async () => {
      const messengerCall = queueDepositMessenger();
      const history = swapHistory();
      history[SWAP_ID].status.isExpectedToken = false;

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: history } },
        },
        async ({ controller, messenger, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();

          expect(mockBuildMoneyAccountDepositBatch).not.toHaveBeenCalled();
          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(messenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({
              message: `Incorrect token received from bridge tx, skipping next action: ${SWAP_ID}`,
            }),
          );
        },
      );
    });

    it('skips the next action when the deposit has already started', async () => {
      const messengerCall = queueDepositMessenger();
      const history = swapHistory();
      history[SWAP_ID].depositTxMeta = { batchId: BATCH_ID_1 };

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: history } },
        },
        async ({ controller, messenger, rootMessenger }) => {
          const transactionMeta: TransactionMeta = {
            id: SWAP_ID,
            hash: SRC_HASH,
            batchId: BATCH_ID_1,
            status: TransactionStatus.confirmed,
            type: TransactionType.swap,
            chainId: CHAIN_IDS.ARBITRUM,
            networkClientId: 'arb',
            time: 1,
            txParams: { from: '0xaccount1' },
          };
          rootMessenger.publish(
            'TransactionController:transactionStatusUpdated',
            { transactionMeta },
          );
          await flushPromises();

          expect(mockBuildMoneyAccountDepositBatch).not.toHaveBeenCalled();
          expect(controller.state.txHistory[SWAP_ID].next).toHaveLength(1);
          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(messenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({
              message: `Deposit has already started, skipping: ${SWAP_ID}`,
            }),
          );
        },
      );
    });

    it('skips the next action when the account is missing', async () => {
      const messengerCall = queueDepositMessenger([], { account: undefined });

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: swapHistory() } },
        },
        async ({ controller, messenger, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();

          expect(mockBuildMoneyAccountDepositBatch).not.toHaveBeenCalled();
          expect(
            controller.state.txHistory[SWAP_ID].depositTxMeta,
          ).toStrictEqual({
            batchId: BATCH_ID_1,
          });
          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(messenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({
              message: 'Account not found, skipping next action: 0xaccount1',
            }),
          );
        },
      );
    });

    it('runs a follow-up solana swap after confirm', async () => {
      const solAccount = {
        ...mockSelectedAccount,
        metadata: {
          snap: { id: 'test-snap' },
          keyring: { type: ['any'] },
        },
      };
      const messengerCall = vi.fn(
        (
          action: string,
          request?: { request?: { params?: { transaction?: string } } },
        ) => {
          switch (action) {
            case 'AccountsController:getAccountByAddress':
              return solAccount;
            case 'SnapController:handleRequest': {
              if (request?.request?.params?.transaction === 'solana-approval') {
                return { signature: 'sol-approval' };
              }
              return { signature: 'sol-sig' };
            }
            case 'TransactionController:getState':
              return { transactions: [] };
            case 'BridgeController:trackUnifiedSwapBridgeEvent':
            default:
          }
        },
      );
      const history = swapHistory({
        srcChainId: ChainId.SOLANA,
        destChainId: ChainId.SOLANA,
      });
      history[SWAP_ID].next = [
        {
          operation: Operation.SWAP,
          partialQuote: {
            estimatedProcessingTimeInSeconds: 15,
            trade: 'solana-trade',
            approval: 'solana-approval' as never,
          },
        },
      ];

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: history } },
        },
        async ({ controller, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();
          expect(controller.state.txHistory[SWAP_ID].next).toStrictEqual([]);
          expect(controller.state.txHistory[SWAP_ID].txMetaId).toBe('sol-sig');
          expect(controller.state.txHistory[SWAP_ID].approvalTxId).toBe(
            'sol-approval',
          );
        },
      );
    });

    it('runs a follow-up smart-transaction swap after confirm', async () => {
      const messengerCall = queueDepositMessenger();
      addTransactionBatchFnMock = vi.fn().mockResolvedValue({
        batchId: BATCH_ID_1,
      });
      const history = swapHistory();
      history[SWAP_ID].isStxEnabled = true;
      history[SWAP_ID].next = [
        {
          operation: Operation.SWAP,
          partialQuote: history[SWAP_ID].next?.[0]?.partialQuote ?? {
            estimatedProcessingTimeInSeconds: 15,
            trade: {
              chainId: 42161,
              to: '0x1111111111111111111111111111111111111111',
              from: '0x2222222222222222222222222222222222222222',
              value: '0x0',
              data: '0x',
              gasLimit: null,
            },
          },
        },
      ];

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: {
            addTransactionBatchFn: addTransactionBatchFnMock,
            state: { txHistory: history },
          },
        },
        async ({ controller, messenger, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();
          expect(addTransactionBatchFnMock).toHaveBeenCalled();
          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(messenger.captureException).toHaveBeenCalledWith(
            new Error(
              'Failed to update cross-chain swap transaction batch: tradeMeta not found',
            ),
          );
        },
      );
    });

    it('updates history from a follow-up swap after withdraw', async () => {
      const messengerCall = queueDepositMessenger();
      const history = swapHistory();
      history[SWAP_ID].next = [
        {
          operation: Operation.SWAP,
          partialQuote: history[SWAP_ID].next?.[0]?.partialQuote ?? {
            estimatedProcessingTimeInSeconds: 15,
            trade: {
              chainId: 42161,
              to: '0x1111111111111111111111111111111111111111',
              from: '0x2222222222222222222222222222222222222222',
              value: '0x0',
              data: '0x',
              gasLimit: null,
            },
          },
        },
      ];

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: history } },
        },
        async ({ controller, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();

          expect(controller.state.txHistory[SWAP_ID].next).toStrictEqual([]);
          expect(controller.state.txHistory[SWAP_ID].actionId).toBe(BATCH_ID_1);
          expect(controller.state.txHistory[SWAP_ID].batchId).toBe(BATCH_ID_1);
        },
      );
    });

    it('attaches trade identity on a follow-up intent submit', async () => {
      vi.spyOn(intentApi, 'postSubmitOrder').mockResolvedValue({
        id: 'order-uid-1',
        status: IntentOrderStatus.SUBMITTED,
        txHash: undefined,
        metadata: { txHashes: [] },
      });
      const baseMessengerCall = queueDepositMessenger();
      const messengerCall = vi.fn((action: string, ...args: unknown[]) => {
        if (action === 'KeyringController:signTypedMessage') {
          return '0xsignature';
        }
        if (action === 'TransactionController:addTransaction') {
          return {
            transactionMeta: {
              id: 'intent-synthetic-id',
              status: TransactionStatus.submitted,
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'arb',
              time: 1,
              txParams: { from: '0xaccount1' },
            },
            result: Promise.resolve('0xunused'),
          };
        }
        return baseMessengerCall(action, ...args);
      });
      const history = swapHistory();
      history[SWAP_ID].quote = {
        ...history[SWAP_ID].quote,
        intent: {
          protocol: 'cowswap',
          order: {
            sellToken: '0x0000000000000000000000000000000000000001',
            buyToken: '0x0000000000000000000000000000000000000002',
            validTo: 1717027200,
            appData: 'some-app-data',
            appDataHash: '0xabcd',
            feeAmount: '100',
            kind: 'sell',
            partiallyFillable: false,
            sellAmount: '1000',
          },
          typedData: {
            types: {},
            primaryType: 'Order',
            domain: {},
            message: {},
          },
        },
      };
      history[SWAP_ID].next = [
        {
          operation: Operation.SWAP,
          partialQuote: {
            estimatedProcessingTimeInSeconds: 15,
            trade: {
              chainId: 42161,
              to: '0x1111111111111111111111111111111111111111',
              from: '0x2222222222222222222222222222222222222222',
              value: '0x0',
              data: '0x',
              gasLimit: null,
            },
          },
        },
      ];

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: history } },
        },
        async ({ controller, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();

          expect(controller.state.txHistory[SWAP_ID].txMetaId).toBe(
            'intent-synthetic-id',
          );
          expect(
            controller.state.txHistory[SWAP_ID].originalTransactionId,
          ).toBe('intent-synthetic-id');
        },
      );
    });

    it('captures a non-Error thrown while locking the next action', async () => {
      mockGenerateBatchId.mockReset();
      mockGenerateBatchId.mockImplementation(() => {
        throw new Error('batch-id boom');
      });
      const messengerCall = queueDepositMessenger();

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: swapHistory() } },
        },
        async ({ controller, messenger, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();

          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(messenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'batch-id boom' }),
          );
        },
      );
    });

    it('swallows a rejected swap-operation-completed trace on failure', async () => {
      mockTraceFn.mockImplementation(
        (
          request: SwapTraceRequest<TraceName>,
          fn?: (args?: unknown) => unknown,
        ) => {
          if (request.name === TraceName.SwapOperationCompleted) {
            throw new Error('trace boom');
          }
          return fn?.();
        },
      );
      const messengerCall = queueDepositMessenger();

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: swapHistory() } },
        },
        async ({ controller, rootMessenger }) => {
          expect(() =>
            publishSwap(rootMessenger, TransactionStatus.failed),
          ).not.toThrow();
          await flushPromises();
          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
        },
      );
    });

    it('sponsors gas when the vault chain is monad', async () => {
      mockGetMoneyAccountVaultConfig.mockReturnValue(
        vaultConfig(CHAIN_IDS.MONAD),
      );
      const messengerCall = queueDepositMessenger();
      addTransactionBatchFnMock = vi.fn().mockResolvedValue(undefined);

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: {
            addTransactionBatchFn: addTransactionBatchFnMock,
            state: { txHistory: swapHistory() },
          },
        },
        async ({ rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();

          expect(addTransactionBatchFnMock).toHaveBeenCalledWith(
            expect.objectContaining({ isGasFeeSponsored: true }),
          );
        },
      );
    });
  });
});
