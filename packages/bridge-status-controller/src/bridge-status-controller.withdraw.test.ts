/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable vitest/no-restricted-matchers */
import type {
  BridgeControllerMessenger,
  TxData,
  Trade,
} from '@metamask/bridge-controller';
import {
  ActionTypes,
  StatusTypes,
  getNativeAssetForChainId,
  formatAddressToAssetId,
  FeatureId,
  MetaMetricsSwapsEventSource,
  ChainId,
  REFRESH_INTERVAL_MS,
} from '@metamask/bridge-controller';
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { flushPromises } from '../../../tests/vitest/helpers.js';
import { BridgeStatusController } from './bridge-status-controller.js';
import {
  BRIDGE_STATUS_CONTROLLER_NAME,
  DEFAULT_MAX_PENDING_HISTORY_ITEM_AGE_MS,
} from './constants.js';
import { SubmitStep, type SubmitStrategyParams } from './strategy/types.js';
import { BridgeClientId, Operation } from './types.js';
import type {
  BridgeId,
  BridgeHistoryItem,
  BridgeStatusControllerMessenger,
  StatusResponse,
} from './types.js';
import * as historyUtils from './utils/history.js';
import * as transactionUtils from './utils/transaction.js';

const mockGetMoneyAccountVaultConfig = vi.fn();
const mockBuildMoneyAccountWithdrawBatch = vi.fn();
vi.mock('@metamask/money-account-utils', async (importOriginal) => ({
  ...(await importOriginal()),
  getMoneyAccountVaultConfig: () => mockGetMoneyAccountVaultConfig(),
  buildMoneyAccountWithdrawBatch: (...args: unknown[]) =>
    mockBuildMoneyAccountWithdrawBatch(...args),
}));

const { mockSubmitEvmHandler } = vi.hoisted(() => ({
  mockSubmitEvmHandler: vi.fn(async function* submitEvmHandler() {
    yield {
      type: SubmitStep.SetTradeMeta,
      payload: {
        tradeMeta: {
          id: '0xswapTxMetaId1',
          hash: WITHDRAW_SWAP_TX_HASH,
        },
      },
    };
  }),
}));
vi.mock('./strategy/evm-strategy.js', () => ({
  submitEvmHandler: mockSubmitEvmHandler,
}));

const { mockSubmitBatchHandler } = vi.hoisted(() => ({
  mockSubmitBatchHandler: vi.fn(async function* submitBatchHandler() {
    yield {
      type: SubmitStep.SetTradeMeta,
      payload: {
        tradeMeta: {
          id: '0xswapTxMetaId1',
          hash: WITHDRAW_SWAP_TX_HASH,
        },
      },
    };
  }),
}));
vi.mock('./strategy/batch-strategy.js', () => ({
  submitBatchHandler: mockSubmitBatchHandler,
}));

const { mockExecuteSubmitStrategy, setRealExecuteSubmitStrategy } = vi.hoisted(
  () => {
    // mockReset restores this implementation. A later mockImplementation() does not survive.
    let realExecuteSubmitStrategy:
      | ((
          params: SubmitStrategyParams<Trade>,
        ) => AsyncGenerator<unknown, void, void>)
      | undefined;
    return {
      mockExecuteSubmitStrategy: vi.fn(
        (params: SubmitStrategyParams<Trade>) => {
          if (!realExecuteSubmitStrategy) {
            throw new Error('executeSubmitStrategy spy is not ready');
          }
          return realExecuteSubmitStrategy(params);
        },
      ),
      setRealExecuteSubmitStrategy: (
        real: (
          params: SubmitStrategyParams<Trade>,
        ) => AsyncGenerator<unknown, void, void>,
      ) => {
        realExecuteSubmitStrategy = real;
      },
    };
  },
);
vi.mock('./strategy/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./strategy/index.js')>();
  setRealExecuteSubmitStrategy(
    actual.default as (
      params: SubmitStrategyParams<Trade>,
    ) => AsyncGenerator<unknown, void, void>,
  );
  return {
    ...actual,
    default: (params: Parameters<typeof actual.default>[0]) =>
      mockExecuteSubmitStrategy(params),
  };
});

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
    isExpectedToken = true,
  } = {}) => ({
    status: 'COMPLETE' as StatusTypes,
    isExpectedToken,
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
    isExpectedToken = false,
  } = {}): StatusResponse => ({
    status: 'FAILED' as StatusTypes,
    bridge: 'debridge',
    isExpectedToken,
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

const WITHDRAW_BATCH_ID_1 = '0xwithdrawBatchId1';
const WITHDRAW_TX_META_ID_1 = 'withdrawTxMetaId1';
const WITHDRAW_SWAP_QUOTE = getMockQuote({
  srcChainId: ChainId.MONAD,
  destChainId: ChainId.MONAD,
});
const WITHDRAW_SWAP_TX_HASH = '0xwithdrawHash1';
const PARTIAL_QUOTE = {
  quoteId: 'withdrawQuoteId1',
  estimatedProcessingTimeInSeconds: 15,
  trade: {
    data: '0xdata',
    from: '0xfrom1',
    to: '0xto1',
    chainId: ChainId.MONAD,
    value: '0xvalue1',
    gasLimit: 100,
  } as unknown as TxData,
};

const WITHDRAW_BATCH_ID_2 = '0xwithdrawBatchId2';
const WITHDRAW_TX_META_ID_2 = 'withdrawTxMetaId2';
const WITHDRAW_SWAP_QUOTE_2 = getMockQuote({
  srcChainId: ChainId.MONAD,
  destChainId: ChainId.SOLANA,
});
const WITHDRAW_SWAP_TX_HASH_2 = '0xwithdrawHash2';

const WITHDRAW_BATCH_ID_STX = '0xwithdrawBatchIdStx';
const WITHDRAW_TX_META_ID_STX = '0xwithdrawTxMetaIdStx';
const WITHDRAW_SWAP_TX_HASH_STX = '0xwithdrawHashStx';

const MockTxHistory = {
  getPendingWithdraw: ({
    destChainId = ChainId.MONAD,
    txMetaId = WITHDRAW_TX_META_ID_1,
    batchId = WITHDRAW_BATCH_ID_1,
    isStxEnabled = false,
  }: {
    txMetaId?: string;
    destChainId?: ChainId;
    batchId?: `0x${string}`;
    isStxEnabled?: boolean;
  }): Record<string, BridgeHistoryItem> => {
    const quote = getMockQuote({
      srcChainId: ChainId.MONAD,
      destChainId,
    });
    return {
      [txMetaId]: {
        txMetaId: undefined,
        quote,
        startTime: Date.now() - 5000,
        estimatedProcessingTimeInSeconds: 15,
        slippagePercentage: 0,
        account: '0xaccount1',
        status: MockStatusResponse.getPending({
          srcTxHash: undefined,
          srcChainId: ChainId.MONAD,
          destChainId,
        }),
        withdrawTxMeta: {
          id: txMetaId,
          batchId,
        },
        pricingData: {
          amountSent: '1.234',
          amountSentInUsd: undefined,
          quotedGasInUsd: undefined,
          quotedReturnInUsd: undefined,
        },
        approvalTxId: undefined,
        isStxEnabled,
        hasApprovalTx: false,
        completionTime: undefined,
        featureId: FeatureId.UNIFIED_SWAP_BRIDGE,
        location: MetaMetricsSwapsEventSource.MainView,
        quoteId: 'withdrawQuoteId1',
        next: [
          {
            operation: 'swap',
            partialQuote: PARTIAL_QUOTE,
          },
        ],
      },
    };
  },
};

const addTransactionBatchFn = vi.fn();

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
    ],
    events: ['TransactionController:transactionStatusUpdated'],
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

let mockTraceFn: Mock;

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
    addTransactionBatchFn,
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

const MOCK_VAULT_CONFIG = {
  chainId: '0xa4b1',
  tellerAddress: '0x123',
  accountantAddress: '0x456',
};
const MOCK_WITHDRAW_TXS = {
  withdrawTx: {
    params: {
      to: '0x123',
      data: '0xdata',
      value: '0x0',
    },
    type: TransactionType.moneyAccountWithdraw,
  },
  transferTx: {
    params: {
      to: '0x123',
      data: '0xdata',
      value: '0x0',
    },
    type: TransactionType.tokenMethodTransfer,
  },
};
const MOCK_TRANSACTION_META = [
  {
    id: 'test-tx-id',
    hash: '0xevmWithdrawTxHash',
    time: 1234567890,
    status: 'unapproved',
    chainId: '0xa4b1', // 42161 in hex
    txParams: {
      from: '0xaccount1',
      to: '0xbridgeContract',
      value: '0x0',
      data: '0xdata',
      chainId: '0xa4b1',
      gasLimit: '0x5208',
    },
    type: TransactionType.batch,
    batchId: BATCH_ID_1,
    nestedTransactions: [
      {
        id: 'test-tx-id',
        txParams: {
          from: '0xaccount1',
          to: '0xbridgeContract',
          value: '0x0',
          data: '0xdataNested',
          chainId: '0xa4b1',
          gasLimit: '0x5208',
        },
        type: TransactionType.moneyAccountWithdraw,
      },
    ],
  },
];

describe('BridgeStatusController (withdraw)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.spyOn(historyUtils, 'isHistoryItemTooOld').mockReturnValue(false);
    mockTraceFn = vi.fn(async (_request, fn) => await fn?.());
  });

  describe('submitTx: EVM withdraw', () => {
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
      mockGenerateBatchId.mockReturnValueOnce(BATCH_ID_1);
      mockGenerateBatchId.mockReturnValueOnce(BATCH_ID_2);
    });

    it('should handle a withdraw transaction', async () => {
      mockMessengerCall.mockImplementationOnce(vi.fn()); // stopPollingForQuotes
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockImplementationOnce(vi.fn()); // track event
      mockMessengerCall.mockReturnValueOnce([]); // isAtomicBatchSupported

      mockMessengerCall.mockReturnValueOnce({}); // feature flags
      mockGetMoneyAccountVaultConfig.mockReturnValueOnce(MOCK_VAULT_CONFIG);
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount); // recipient
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount); // primary money account
      mockMessengerCall.mockReturnValueOnce('arb'); // get network client
      mockMessengerCall.mockReturnValueOnce({ provider: vi.fn() });

      mockBuildMoneyAccountWithdrawBatch.mockResolvedValueOnce(
        MOCK_WITHDRAW_TXS,
      );

      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arb');

      mockMessengerCall.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockMessengerCall.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockMessengerCall.mockReturnValueOnce({
        transactions: MOCK_TRANSACTION_META,
      });
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);

      mockMessengerCall.mockReturnValueOnce({
        transactions: MOCK_TRANSACTION_META,
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
              operation: Operation.WITHDRAW,
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

          expect(result).toMatchInlineSnapshot(`
            {
              "batchId": "0x1234BatchId",
              "chainId": "0xa4b1",
              "hash": "0xevmWithdrawTxHash",
              "id": "test-tx-id",
              "nestedTransactions": [
                {
                  "id": "test-tx-id",
                  "txParams": {
                    "chainId": "0xa4b1",
                    "data": "0xdataNested",
                    "from": "0xaccount1",
                    "gasLimit": "0x5208",
                    "to": "0xbridgeContract",
                    "value": "0x0",
                  },
                  "type": "moneyAccountWithdraw",
                },
              ],
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
              "type": "batch",
            }
          `);

          controller.stopAllPolling();

          expect(mockMessengerCall.mock.calls).toMatchInlineSnapshot(`
            [
              [
                "BridgeController:stopPollingForQuotes",
                "Transaction submitted",
                undefined,
              ],
              [
                "AccountsController:getAccountByAddress",
                "0xaccount1",
              ],
              [
                "BridgeController:trackUnifiedSwapBridgeEvent",
                "Unified SwapBridge Submitted",
                {
                  "account_hardware_type": null,
                  "action_type": "swapbridge-v1",
                  "chain_id_destination": "eip155:42161",
                  "chain_id_source": "eip155:42161",
                  "custom_slippage": false,
                  "destination_hash_present": false,
                  "feature_id": "unified_swap_bridge",
                  "gas_included": true,
                  "gas_included_7702": false,
                  "is_hardware_wallet": false,
                  "location": "Unknown",
                  "price_impact": 0,
                  "provider": "lifi_across",
                  "quoted_time_minutes": 0,
                  "slippage_limit": 0,
                  "source_hash_present": false,
                  "stx_enabled": true,
                  "swap_type": "single_chain",
                  "token_address_destination": "eip155:10/slip44:60",
                  "token_address_source": "eip155:42161/slip44:60",
                  "token_security_type_destination": null,
                  "token_symbol_destination": "ETH",
                  "token_symbol_source": "ETH",
                  "usd_amount_source": 1.01,
                  "usd_quoted_gas": 2.5778,
                  "usd_quoted_return": 0,
                },
              ],
              [
                "TransactionController:isAtomicBatchSupported",
                {
                  "address": "0xaccount1",
                  "chainIds": [
                    "0xa4b1",
                  ],
                },
              ],
              [
                "RemoteFeatureFlagController:getState",
              ],
              [
                "AccountsController:getAccountByAddress",
                "0xaccount1",
              ],
              [
                "MoneyAccountController:getMoneyAccount",
                {
                  "id": "test-account-id",
                },
              ],
              [
                "NetworkController:findNetworkClientIdByChainId",
                "0xa4b1",
              ],
              [
                "NetworkController:getNetworkClientById",
                "arb",
              ],
              [
                "AccountsController:getAccountByAddress",
                "0xaccount1",
              ],
              [
                "NetworkController:findNetworkClientIdByChainId",
                "0xa4b1",
              ],
              [
                "TransactionController:estimateGasFee",
                {
                  "chainId": "0xa4b1",
                  "networkClientId": "arb",
                  "transactionParams": {
                    "data": "0xdata",
                    "from": "0xaccount1",
                    "gas": undefined,
                    "to": "0x123",
                    "value": "0x0",
                  },
                },
              ],
              [
                "TransactionController:estimateGasFee",
                {
                  "chainId": "0xa4b1",
                  "networkClientId": "arb",
                  "transactionParams": {
                    "data": "0xdata",
                    "from": "0xaccount1",
                    "gas": undefined,
                    "to": "0x123",
                    "value": "0x0",
                  },
                },
              ],
              [
                "TransactionController:getState",
              ],
            ]
          `);
          expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
          expect(addTransactionBatchFn).toHaveBeenCalledTimes(1);
          expect(
            mockMessengerCall.mock.calls.filter(
              ([action]) => action === 'TransactionController:addTransaction',
            ),
          ).toHaveLength(0);
          expect(result.id).toBe('test-tx-id');
          expect(Object.keys(controller.state.txHistory)).toStrictEqual([
            BATCH_ID_1,
          ]);
          expect(controller.state.txHistory[BATCH_ID_1].withdrawTxMeta)
            .toMatchInlineSnapshot(`
              {
                "batchId": "0x1234BatchId",
                "hash": "0xevmWithdrawTxHash",
                "id": "test-tx-id",
              }
            `);
          expect(
            controller.state.txHistory[BATCH_ID_1].actionId,
          ).toBeUndefined();
          expect(controller.state.txHistory[BATCH_ID_1].next)
            .toMatchInlineSnapshot(`
              [
                {
                  "operation": "swap",
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
          expect(mockMessengerCall).toHaveBeenCalledTimes(14);
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

    const queueWithdrawSubmitCalls = () => {
      // Failure tracking looks up TransactionController state after the throw.
      mockMessengerCall.mockReturnValue({ transactions: [] });
      mockMessengerCall.mockImplementationOnce(vi.fn()); // stopPollingForQuotes
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockImplementationOnce(vi.fn()); // track event
      mockMessengerCall.mockReturnValueOnce([]); // isAtomicBatchSupported
    };

    const queueMoneyAccountAndProvider = ({
      provider = { provider: vi.fn() },
    }: {
      provider?: { provider: ReturnType<typeof vi.fn> | undefined };
    } = {}) => {
      mockMessengerCall.mockReturnValueOnce({}); // feature flags
      mockGetMoneyAccountVaultConfig.mockReturnValueOnce(MOCK_VAULT_CONFIG);
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount); // recipient
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount); // money account
      mockMessengerCall.mockReturnValueOnce('arb');
      mockMessengerCall.mockReturnValueOnce(provider);
      mockBuildMoneyAccountWithdrawBatch.mockResolvedValueOnce(
        MOCK_WITHDRAW_TXS,
      );
    };

    const queueBatchLookup = (transactions: Record<string, unknown>[]) => {
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arb');
      mockMessengerCall.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockMessengerCall.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockMessengerCall.mockReturnValueOnce({ transactions });
    };

    const submitWithdraw = (rootMessenger: RootMessenger) =>
      rootMessenger.call('BridgeStatusController:submitTx', {
        operation: Operation.WITHDRAW,
        accountAddress: (mockEvmQuoteResponse.trade as TxData).from,
        quoteResponses: [mockEvmQuoteResponse],
        isStxEnabled: false,
      });

    it('throws when the recipient id is missing', async () => {
      queueWithdrawSubmitCalls();
      mockMessengerCall.mockReturnValueOnce({});
      mockGetMoneyAccountVaultConfig.mockReturnValueOnce(MOCK_VAULT_CONFIG);
      mockMessengerCall.mockReturnValueOnce({});

      await withController({ mockMessengerCall }, async ({ rootMessenger }) => {
        await expect(submitWithdraw(rootMessenger)).rejects.toThrow(
          'Failed to get recipient id',
        );
      });
    });

    it('throws when the primary money account is missing', async () => {
      queueWithdrawSubmitCalls();
      mockMessengerCall.mockReturnValueOnce({});
      mockGetMoneyAccountVaultConfig.mockReturnValueOnce(MOCK_VAULT_CONFIG);
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce({});

      await withController({ mockMessengerCall }, async ({ rootMessenger }) => {
        await expect(submitWithdraw(rootMessenger)).rejects.toThrow(
          'Failed to get primary money account',
        );
      });
    });

    it('throws when the vault config is missing', async () => {
      queueWithdrawSubmitCalls();
      mockMessengerCall.mockReturnValueOnce({});
      mockGetMoneyAccountVaultConfig.mockReturnValueOnce(undefined);

      await withController({ mockMessengerCall }, async ({ rootMessenger }) => {
        await expect(submitWithdraw(rootMessenger)).rejects.toThrow(
          'Failed to get vault config',
        );
      });
    });

    it('throws when the src chain provider is missing', async () => {
      queueWithdrawSubmitCalls();
      queueMoneyAccountAndProvider({ provider: { provider: undefined } });

      await withController({ mockMessengerCall }, async ({ rootMessenger }) => {
        await expect(submitWithdraw(rootMessenger)).rejects.toThrow(
          'No provider available for chain 42161',
        );
      });
    });

    it('throws when the withdraw tx meta is not in the batch', async () => {
      queueWithdrawSubmitCalls();
      queueMoneyAccountAndProvider();
      queueBatchLookup([]);

      await withController({ mockMessengerCall }, async ({ rootMessenger }) => {
        await expect(submitWithdraw(rootMessenger)).rejects.toThrow(
          'Failed to find withdraw transaction meta, id or hash',
        );
      });
    });

    it('throws when the matched withdraw tx has no id', async () => {
      queueWithdrawSubmitCalls();
      queueMoneyAccountAndProvider();
      queueBatchLookup([
        {
          ...MOCK_TRANSACTION_META[0],
          id: undefined,
          type: TransactionType.tokenMethodTransfer,
        },
      ]);

      await withController({ mockMessengerCall }, async ({ rootMessenger }) => {
        await expect(submitWithdraw(rootMessenger)).rejects.toThrow(
          'Failed to find withdraw transaction meta, id or hash',
        );
      });
    });

    it('throws when the batch tx is not a withdraw or transfer', async () => {
      queueWithdrawSubmitCalls();
      queueMoneyAccountAndProvider();
      queueBatchLookup([
        {
          ...MOCK_TRANSACTION_META[0],
          type: TransactionType.contractInteraction,
          nestedTransactions: [],
        },
      ]);

      await withController({ mockMessengerCall }, async ({ rootMessenger }) => {
        await expect(submitWithdraw(rootMessenger)).rejects.toThrow(
          'Failed to find withdraw transaction meta, id or hash',
        );
      });
    });

    it('throws when the matched withdraw tx has no hash', async () => {
      queueWithdrawSubmitCalls();
      queueMoneyAccountAndProvider();
      queueBatchLookup([
        {
          ...MOCK_TRANSACTION_META[0],
          hash: undefined,
          type: TransactionType.tokenMethodTransfer,
          nestedTransactions: [],
        },
      ]);

      await withController({ mockMessengerCall }, async ({ rootMessenger }) => {
        await expect(submitWithdraw(rootMessenger)).rejects.toThrow(
          'Failed to find withdraw transaction meta, id or hash',
        );
      });
    });

    it('uses a transfer tx in the batch as the withdraw trade meta', async () => {
      queueWithdrawSubmitCalls();
      queueMoneyAccountAndProvider();
      queueBatchLookup([
        {
          ...MOCK_TRANSACTION_META[0],
          type: TransactionType.tokenMethodTransfer,
          nestedTransactions: [],
        },
      ]);

      await withController(
        { mockMessengerCall },
        async ({ rootMessenger, controller }) => {
          const result = await submitWithdraw(rootMessenger);
          expect(result.id).toBe('test-tx-id');
          expect(result.hash).toBe('0xevmWithdrawTxHash');
          expect(
            controller.state.txHistory[BATCH_ID_1].withdrawTxMeta,
          ).toMatchObject({
            batchId: BATCH_ID_1,
            id: 'test-tx-id',
            hash: '0xevmWithdrawTxHash',
          });
        },
      );
    });

    it('skips the next swap when dest asset is the vault underlying token', async () => {
      const underlyingToken = '0x1111111111111111111111111111111111111111';
      const destAssetId = formatAddressToAssetId(
        underlyingToken,
        MOCK_VAULT_CONFIG.chainId,
      ) as `${string}:${string}/${string}:${string}`;
      queueWithdrawSubmitCalls();
      mockMessengerCall.mockReturnValueOnce({});
      mockGetMoneyAccountVaultConfig.mockReturnValueOnce({
        ...MOCK_VAULT_CONFIG,
        underlyingToken,
      });
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arb');
      mockMessengerCall.mockReturnValueOnce({ provider: vi.fn() });
      mockBuildMoneyAccountWithdrawBatch.mockResolvedValueOnce(
        MOCK_WITHDRAW_TXS,
      );
      queueBatchLookup(MOCK_TRANSACTION_META);

      await withController(
        { mockMessengerCall },
        async ({ rootMessenger, controller }) => {
          await rootMessenger.call('BridgeStatusController:submitTx', {
            operation: Operation.WITHDRAW,
            accountAddress: (mockEvmQuoteResponse.trade as TxData).from,
            quoteResponses: [
              {
                ...mockEvmQuoteResponse,
                quote: {
                  ...mockEvmQuoteResponse.quote,
                  destAsset: {
                    ...mockEvmQuoteResponse.quote.destAsset,
                    address: underlyingToken,
                    assetId: destAssetId,
                  },
                },
              },
            ],
            isStxEnabled: false,
          });

          expect(controller.state.txHistory[BATCH_ID_1].next).toStrictEqual([]);
        },
      );
    });
  });

  describe('subscription handlers: confirmed withdraw + EVM swap/bridge', () => {
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

    beforeEach(() => {
      vi.useFakeTimers();
      vi.clearAllTimers();
      vi.clearAllMocks();
      // eslint-disable-next-line no-empty-function
      vi.spyOn(console, 'warn').mockImplementation(() => {});
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
          'BridgeController:fetchQuotes',
          'AccountsController:getAccountByAddress',
          'RemoteFeatureFlagController:getState',
        ],
        events: ['TransactionController:transactionStatusUpdated'],
      });

      mockFetchFn = vi
        .fn()
        .mockResolvedValueOnce(MockStatusResponse.getPending());

      vi.setSystemTime(1779988919707);

      bridgeStatusController = new BridgeStatusController({
        messenger: mockBridgeStatusMessenger,
        clientId: BridgeClientId.EXTENSION,
        clientProduct: 'test-client-product',
        fetchFn: mockFetchFn,
        traceFn: mockTraceFn,
        addTransactionBatchFn: vi.fn(),
        state: {
          txHistory: {
            ...MockTxHistory.getPendingWithdraw({}),
            ...MockTxHistory.getPendingWithdraw({
              txMetaId: WITHDRAW_TX_META_ID_2,
              batchId: WITHDRAW_BATCH_ID_2,
              destChainId: ChainId.SOLANA,
            }),
            ...MockTxHistory.getPendingWithdraw({
              txMetaId: WITHDRAW_TX_META_ID_STX,
              batchId: WITHDRAW_BATCH_ID_STX,
              isStxEnabled: true,
            }),
          },
        },
      });
    });

    afterEach(() => {
      bridgeStatusController.stopAllPolling();
      console.warn = consoleFn;
      vi.useRealTimers();
    });

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should route to batch-strategy (swap) after withdraw transaction', async () => {
      registerDefaultActionHandlers(mockMessenger, {
        account: '0xaccount1',
        txMetaId: WITHDRAW_TX_META_ID_STX,
        txHash: WITHDRAW_SWAP_TX_HASH_STX,
      });
      mockGenerateBatchId.mockReturnValueOnce(WITHDRAW_BATCH_ID_STX);
      const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');

      mockMessenger.publish('TransactionController:transactionStatusUpdated', {
        transactionMeta: {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: {} as unknown as TransactionParams,
          nestedTransactions: MOCK_TRANSACTION_META[0].nestedTransactions,
          type: TransactionType.batch,
          status: TransactionStatus.confirmed,
          id: WITHDRAW_TX_META_ID_STX,
          batchId: WITHDRAW_BATCH_ID_STX,
          hash: WITHDRAW_SWAP_TX_HASH_STX,
        },
      });
      await flushPromises();

      expect(messengerCallSpy.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "RemoteFeatureFlagController:getState",
          ],
          [
            "AccountsController:getAccountByAddress",
            "0xaccount1",
          ],
          [
            "TransactionController:isAtomicBatchSupported",
            {
              "address": "0xaccount1",
              "chainIds": [
                "0x8f",
              ],
            },
          ],
        ]
      `);

      expect(mockExecuteSubmitStrategy).toHaveBeenCalledWith({
        addTransactionBatchFn: expect.any(Function),
        batchId: WITHDRAW_BATCH_ID_STX,
        batchSellTrades: null,
        bridgeApiBaseUrl: 'https://bridge.api.cx.metamask.io',
        clientId: 'extension',
        fetchFn: expect.any(Function),
        historyKey: WITHDRAW_TX_META_ID_STX,
        isBridgeTx: false,
        isDelegatedAccount: false,
        isStxEnabled: true,
        messenger: mockMessenger,
        next: [],
        operation: 'swap',
        previousTxHash: WITHDRAW_SWAP_TX_HASH_STX,
        quoteResponses: [{ quote: WITHDRAW_SWAP_QUOTE, ...PARTIAL_QUOTE }],
        requireApproval: false,
        selectedAccount: {
          address: '0xaccount1',
          metadata: {
            keyring: {
              type: 'any',
            },
          },
        },
        traceFn: expect.any(Function),
      });

      expect(mockSubmitBatchHandler.mock.calls).toStrictEqual([
        [
          {
            addTransactionBatchFn: expect.any(Function),
            batchId: WITHDRAW_BATCH_ID_STX,
            batchSellTrades: null,
            bridgeApiBaseUrl: 'https://bridge.api.cx.metamask.io',
            clientId: 'extension',
            fetchFn: expect.any(Function),
            historyKey: WITHDRAW_TX_META_ID_STX,
            isBridgeTx: false,
            isDelegatedAccount: false,
            isStxEnabled: true,
            messenger: mockMessenger,
            next: [],
            operation: 'swap',
            previousTxHash: WITHDRAW_SWAP_TX_HASH_STX,
            quoteResponses: [{ quote: WITHDRAW_SWAP_QUOTE, ...PARTIAL_QUOTE }],
            requireApproval: false,
            selectedAccount: {
              address: '0xaccount1',
              metadata: {
                keyring: {
                  type: 'any',
                },
              },
            },
            traceFn: expect.any(Function),
          },
        ],
      ]);
    });

    it('should route to evm-strategy (swap) after withdraw transaction', async () => {
      registerDefaultActionHandlers(mockMessenger, {
        account: '0xaccount1',
        txMetaId: WITHDRAW_TX_META_ID_1,
        txHash: WITHDRAW_SWAP_TX_HASH,
      });
      mockGenerateBatchId.mockReturnValueOnce(WITHDRAW_BATCH_ID_1);
      const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');

      mockMessenger.publish('TransactionController:transactionStatusUpdated', {
        transactionMeta: {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: {} as unknown as TransactionParams,
          nestedTransactions: MOCK_TRANSACTION_META[0].nestedTransactions,
          type: TransactionType.batch,
          status: TransactionStatus.confirmed,
          id: WITHDRAW_TX_META_ID_1,
          batchId: WITHDRAW_BATCH_ID_1,
          hash: WITHDRAW_SWAP_TX_HASH,
        },
      });
      await flushPromises();

      expect(messengerCallSpy.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "RemoteFeatureFlagController:getState",
          ],
          [
            "AccountsController:getAccountByAddress",
            "0xaccount1",
          ],
          [
            "TransactionController:isAtomicBatchSupported",
            {
              "address": "0xaccount1",
              "chainIds": [
                "0x8f",
              ],
            },
          ],
        ]
      `);

      expect(mockSubmitEvmHandler.mock.calls).toStrictEqual([
        [
          {
            addTransactionBatchFn: expect.any(Function),
            batchId: '0xwithdrawBatchId1',
            batchSellTrades: null,
            bridgeApiBaseUrl: 'https://bridge.api.cx.metamask.io',
            clientId: 'extension',
            fetchFn: expect.any(Function),
            historyKey: 'withdrawTxMetaId1',
            isBridgeTx: false,
            isDelegatedAccount: false,
            isStxEnabled: false,
            messenger: mockMessenger,
            next: [],
            operation: 'swap',
            previousTxHash: WITHDRAW_SWAP_TX_HASH,
            quoteResponses: [{ quote: WITHDRAW_SWAP_QUOTE, ...PARTIAL_QUOTE }],
            requireApproval: false,
            selectedAccount: {
              address: '0xaccount1',
              metadata: {
                keyring: {
                  type: 'any',
                },
              },
            },
            traceFn: expect.any(Function),
          },
        ],
      ]);
    });

    it('should route to evm-strategy (bridge) after withdraw transaction', async () => {
      registerDefaultActionHandlers(mockMessenger, {
        account: '0xaccount1',
        txMetaId: WITHDRAW_TX_META_ID_2,
        txHash: WITHDRAW_SWAP_TX_HASH_2,
      });
      mockGenerateBatchId.mockReturnValueOnce(WITHDRAW_BATCH_ID_2);
      const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');

      mockMessenger.publish('TransactionController:transactionStatusUpdated', {
        transactionMeta: {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: {} as unknown as TransactionParams,
          nestedTransactions: MOCK_TRANSACTION_META[0].nestedTransactions,
          type: TransactionType.batch,
          status: TransactionStatus.confirmed,
          id: WITHDRAW_TX_META_ID_2,
          batchId: WITHDRAW_BATCH_ID_2,
          hash: WITHDRAW_SWAP_TX_HASH_2,
        },
      });
      await flushPromises();

      expect(messengerCallSpy.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "RemoteFeatureFlagController:getState",
          ],
          [
            "AccountsController:getAccountByAddress",
            "0xaccount1",
          ],
          [
            "TransactionController:isAtomicBatchSupported",
            {
              "address": "0xaccount1",
              "chainIds": [
                "0x8f",
              ],
            },
          ],
        ]
      `);

      expect(mockSubmitEvmHandler.mock.calls).toStrictEqual([
        [
          {
            addTransactionBatchFn: expect.any(Function),
            batchId: '0xwithdrawBatchId2',
            batchSellTrades: null,
            bridgeApiBaseUrl: 'https://bridge.api.cx.metamask.io',
            clientId: 'extension',
            fetchFn: expect.any(Function),
            historyKey: 'withdrawTxMetaId2',
            isBridgeTx: true,
            isDelegatedAccount: false,
            isStxEnabled: false,
            messenger: mockMessenger,
            next: [],
            operation: 'swap',
            previousTxHash: WITHDRAW_SWAP_TX_HASH_2,
            quoteResponses: [
              { quote: WITHDRAW_SWAP_QUOTE_2, ...PARTIAL_QUOTE },
            ],
            requireApproval: false,
            selectedAccount: {
              address: '0xaccount1',
              metadata: {
                keyring: {
                  type: 'any',
                },
              },
            },
            traceFn: expect.any(Function),
          },
        ],
      ]);
    });

    it('refreshes quotes when the cached quote is expired', async () => {
      registerDefaultActionHandlers(mockMessenger, {
        account: '0xaccount1',
        txMetaId: WITHDRAW_TX_META_ID_1,
        txHash: WITHDRAW_SWAP_TX_HASH,
      });
      mockGenerateBatchId.mockReturnValueOnce(WITHDRAW_BATCH_ID_1);

      const refreshedQuote = {
        quote: getMockQuote({
          srcChainId: ChainId.MONAD,
          destChainId: ChainId.MONAD,
        }),
        ...PARTIAL_QUOTE,
        quoteId: 'refreshedQuoteId',
      };
      const fetchQuotes = vi.fn().mockResolvedValue([refreshedQuote]);
      mockMessenger.registerActionHandler(
        'BridgeController:fetchQuotes',
        fetchQuotes,
      );

      vi.advanceTimersByTime(REFRESH_INTERVAL_MS);

      mockMessenger.publish('TransactionController:transactionStatusUpdated', {
        transactionMeta: {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: { from: '0xaccount1' },
          nestedTransactions: MOCK_TRANSACTION_META[0].nestedTransactions,
          type: TransactionType.batch,
          status: TransactionStatus.confirmed,
          id: WITHDRAW_TX_META_ID_1,
          batchId: WITHDRAW_BATCH_ID_1,
          hash: WITHDRAW_SWAP_TX_HASH,
        },
      });
      await flushPromises();

      const quote = WITHDRAW_SWAP_QUOTE;
      expect(fetchQuotes).toHaveBeenCalledTimes(1);
      expect(fetchQuotes).toHaveBeenCalledWith(
        {
          walletAddress: '0xaccount1',
          srcTokenAddress: quote.srcAsset.address,
          destTokenAddress: quote.destAsset.address,
          srcChainId: quote.srcChainId,
          destChainId: quote.destChainId,
          srcTokenAmount: quote.srcTokenAmount,
          slippage: undefined,
          gasIncluded: false,
          gasIncluded7702: false,
          isMoneyAccount: true,
        },
        FeatureId.UNIFIED_SWAP_BRIDGE,
      );
      expect(mockSubmitEvmHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          historyKey: WITHDRAW_TX_META_ID_1,
          operation: 'swap',
          quoteResponses: [refreshedQuote],
        }),
      );
    });

    it('fails when the refreshed quote is missing', async () => {
      registerDefaultActionHandlers(mockMessenger, {
        account: '0xaccount1',
        txMetaId: WITHDRAW_TX_META_ID_1,
        txHash: WITHDRAW_SWAP_TX_HASH,
      });
      mockGenerateBatchId.mockReturnValueOnce(WITHDRAW_BATCH_ID_1);

      const fetchQuotes = vi.fn().mockResolvedValue([]);
      mockMessenger.registerActionHandler(
        'BridgeController:fetchQuotes',
        fetchQuotes,
      );

      vi.advanceTimersByTime(REFRESH_INTERVAL_MS);

      mockMessenger.publish('TransactionController:transactionStatusUpdated', {
        transactionMeta: {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: { from: '0xaccount1' },
          nestedTransactions: MOCK_TRANSACTION_META[0].nestedTransactions,
          type: TransactionType.batch,
          status: TransactionStatus.confirmed,
          id: WITHDRAW_TX_META_ID_1,
          batchId: WITHDRAW_BATCH_ID_1,
          hash: WITHDRAW_SWAP_TX_HASH,
        },
      });
      await flushPromises();

      expect(fetchQuotes).toHaveBeenCalledTimes(1);
      expect(mockSubmitEvmHandler).not.toHaveBeenCalled();
      expect(
        bridgeStatusController.state.txHistory[WITHDRAW_TX_META_ID_1].status
          .status,
      ).toBe(StatusTypes.FAILED);
    });
  });

  describe('subscription handlers: failed withdraw', () => {
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

    beforeEach(() => {
      vi.useFakeTimers();
      vi.clearAllTimers();
      vi.clearAllMocks();
      // eslint-disable-next-line no-empty-function
      vi.spyOn(console, 'warn').mockImplementation(() => {});
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
          'BridgeController:fetchQuotes',
          'RemoteFeatureFlagController:getState',
        ],
        events: ['TransactionController:transactionStatusUpdated'],
      });

      mockFetchFn = vi
        .fn()
        .mockResolvedValueOnce(MockStatusResponse.getPending());

      vi.setSystemTime(1779988919707);

      bridgeStatusController = new BridgeStatusController({
        messenger: mockBridgeStatusMessenger,
        clientId: BridgeClientId.EXTENSION,
        clientProduct: 'test-client-product',
        fetchFn: mockFetchFn,
        traceFn: mockTraceFn,
        addTransactionBatchFn: vi.fn(),
        state: {
          txHistory: {
            ...MockTxHistory.getPendingWithdraw({}),
            ...MockTxHistory.getPendingWithdraw({
              txMetaId: WITHDRAW_TX_META_ID_2,
              batchId: WITHDRAW_BATCH_ID_2,
              destChainId: ChainId.SOLANA,
            }),
            ...MockTxHistory.getPendingWithdraw({
              txMetaId: WITHDRAW_TX_META_ID_STX,
              batchId: WITHDRAW_BATCH_ID_STX,
              isStxEnabled: true,
            }),
          },
        },
      });
    });

    afterEach(() => {
      bridgeStatusController.stopAllPolling();
      console.warn = consoleFn;
      vi.useRealTimers();
    });

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should mark history item as failed and skip swap/bridge', async () => {
      registerDefaultActionHandlers(mockMessenger, {
        account: '0xaccount1',
        txMetaId: WITHDRAW_TX_META_ID_STX,
        txHash: WITHDRAW_SWAP_TX_HASH_STX,
      });
      mockGenerateBatchId.mockReturnValueOnce(WITHDRAW_BATCH_ID_STX);
      const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');

      mockMessenger.publish('TransactionController:transactionStatusUpdated', {
        transactionMeta: {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: {} as unknown as TransactionParams,
          nestedTransactions: MOCK_TRANSACTION_META[0].nestedTransactions,
          type: TransactionType.batch,
          status: TransactionStatus.failed,
          id: WITHDRAW_TX_META_ID_STX,
          batchId: WITHDRAW_BATCH_ID_STX,
          error: {
            name: 'TransactionFailedError',
            message: 'Withdraw transaction failed',
          },
          hash: WITHDRAW_SWAP_TX_HASH_STX,
        },
      });
      await flushPromises();

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
              "actual_time_minutes": 0.08333333333333333,
              "allowance_reset_transaction": undefined,
              "approval_transaction": undefined,
              "batch_id": "0xwithdrawBatchIdStx",
              "chain_id_destination": "eip155:143",
              "chain_id_source": "eip155:143",
              "custom_slippage": false,
              "destination_hash_present": false,
              "destination_transaction": "FAILED",
              "error_code": "unknown",
              "error_message": "Transaction failed. Withdraw transaction failed",
              "failure_phase": "source_execution",
              "feature_id": "unified_swap_bridge",
              "gas_included": false,
              "gas_included_7702": false,
              "is_hardware_wallet": false,
              "location": "Main View",
              "price_impact": 0,
              "provider": "lifi_across",
              "quote_vs_execution_ratio": 0,
              "quoted_time_minutes": 0.25,
              "quoted_vs_used_gas_ratio": 0,
              "security_warnings": [],
              "slippage_limit": 0,
              "source_hash_present": true,
              "source_transaction": "COMPLETE",
              "stx_enabled": true,
              "swap_type": "single_chain",
              "token_address_destination": "eip155:143/slip44:60",
              "token_address_source": "eip155:143/slip44:60",
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

      expect(mockExecuteSubmitStrategy).not.toHaveBeenCalled();
    });
  });

  describe('subscription handlers: withdraw routing', () => {
    it('ignores an unmatched money-account withdraw', async () => {
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
                  id: 'withdraw-tx-id',
                  hash: '0xwithdrawHash',
                  batchId: BATCH_ID_1,
                  type: TransactionType.moneyAccountWithdraw,
                  status: TransactionStatus.confirmed,
                  chainId: CHAIN_IDS.ARBITRUM,
                  networkClientId: 'arb',
                  time: 1,
                  txParams: { from: '0xaccount1' },
                },
              },
            ),
          ).not.toThrow();
          expect(controller.state.txHistory).toStrictEqual({});
          expect(messengerCall).not.toHaveBeenCalled();
        },
      );
    });

    it('skips the next action when the swap has already started', async () => {
      const history = MockTxHistory.getPendingWithdraw({});
      history[WITHDRAW_TX_META_ID_1].batchId = WITHDRAW_BATCH_ID_1;

      await withController(
        { options: { state: { txHistory: history } } },
        async ({ controller, messenger, rootMessenger }) => {
          registerDefaultActionHandlers(rootMessenger, {
            account: '0xaccount1',
            txMetaId: WITHDRAW_TX_META_ID_1,
            txHash: WITHDRAW_SWAP_TX_HASH,
          });
          rootMessenger.publish(
            'TransactionController:transactionStatusUpdated',
            {
              transactionMeta: {
                id: WITHDRAW_TX_META_ID_1,
                hash: WITHDRAW_SWAP_TX_HASH,
                status: TransactionStatus.confirmed,
                type: TransactionType.swap,
                chainId: CHAIN_IDS.ARBITRUM,
                networkClientId: 'arb',
                time: 1,
                txParams: { from: '0xaccount1' },
              },
            },
          );
          await flushPromises();

          expect(
            controller.state.txHistory[WITHDRAW_TX_META_ID_1].next,
          ).toHaveLength(1);
          expect(
            controller.state.txHistory[WITHDRAW_TX_META_ID_1].status.status,
          ).toBe(StatusTypes.FAILED);
          expect(messenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({
              message: `Swap has already started, skipping: ${WITHDRAW_TX_META_ID_1}`,
            }),
          );
        },
      );
    });
  });
});
