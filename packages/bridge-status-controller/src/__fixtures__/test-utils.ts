/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type {
  BridgeControllerMessenger,
  SwapTraceFunction,
} from '@metamask/bridge-controller';
import {
  ActionTypes,
  MetaMetricsSwapsEventSource,
  StatusTypes,
} from '@metamask/bridge-controller';
import { MockPollingBlockTracker } from '@metamask/eth-block-tracker';
import { MockInternalProvider } from '@metamask/eth-json-rpc-provider';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import {
  getDefaultNetworkControllerState,
  NetworkClientType,
} from '@metamask/network-controller';
import type {
  AutoManagedNetworkClient,
  CustomNetworkClientConfiguration,
  Provider,
} from '@metamask/network-controller';
import { TransactionStatus } from '@metamask/transaction-controller';
import type {
  TransactionControllerState,
  TransactionMeta,
} from '@metamask/transaction-controller';
import { TransactionPayStrategy } from '@metamask/transaction-pay-controller';
import type {
  TransactionPayControllerState,
  TransactionPayQuote,
} from '@metamask/transaction-pay-controller';
import type { Json } from '@metamask/utils';
import { numberToHex, toCaipAssetType } from '@metamask/utils';
import { vi } from 'vitest';
import type { Mock } from 'vitest';

import { BridgeStatusController } from '../bridge-status-controller.js';
import {
  BRIDGE_STATUS_CONTROLLER_NAME,
  DEFAULT_MAX_PENDING_HISTORY_ITEM_AGE_MS,
} from '../constants.js';
import type { TraceName } from '../constants.js';
import { BridgeClientId, BridgeId } from '../types.js';
import type {
  BridgeHistoryItem,
  BridgeStatusControllerMessenger,
  StatusResponse,
} from '../types.js';

type AllBridgeStatusControllerActions =
  MessengerActions<BridgeStatusControllerMessenger>;

type AllBridgeStatusControllerEvents =
  MessengerEvents<BridgeStatusControllerMessenger>;

type AllBridgeControllerActions = MessengerActions<BridgeControllerMessenger>;

type AllBridgeControllerEvents = MessengerEvents<BridgeControllerMessenger>;

export type RootMessenger = Messenger<
  MockAnyNamespace,
  AllBridgeStatusControllerActions | AllBridgeControllerActions,
  AllBridgeStatusControllerEvents | AllBridgeControllerEvents
>;

export const getMockInternalAccount = ({
  address = '0xaccount1',
}: {
  address?: string;
} = {}): InternalAccount => ({
  type: 'eip155:eoa',
  id: 'test-account-id',
  address,
  scopes: ['eip155:eoa'],
  options: {},
  methods: [],
  metadata: {
    name: 'Account 1',
    importTime: 0,
    keyring: { type: 'HD Key Tree' },
  },
});

export const getMockTransactionControllerState = (
  transactions: TransactionMeta[],
): TransactionControllerState => ({
  batchTransactionCounts: {},
  transactions,
  transactionBatches: [],
  methodData: {},
  lastFetchedBlockNumbers: {},
  submitHistory: [],
});

const zeroFiat = { fiat: '0', usd: '0' };
const zeroAmount = { ...zeroFiat, human: '0', raw: '0' };

export const getMockPayQuote = (): TransactionPayQuote<Json> => ({
  dust: zeroFiat,
  estimatedDuration: 1,
  fees: {
    metaMask: zeroFiat,
    provider: zeroFiat,
    sourceNetwork: { estimate: zeroAmount, max: zeroAmount },
    targetNetwork: zeroFiat,
  },
  original: {},
  request: {
    from: '0x1111111111111111111111111111111111111111',
    sourceBalanceRaw: '0',
    sourceChainId: '0xa4b1',
    sourceTokenAddress: '0x0000000000000000000000000000000000000001',
    sourceTokenAmount: '0',
    targetAmountMinimum: '0',
    targetChainId: '0xa4b1',
    targetTokenAddress: '0x0000000000000000000000000000000000000002',
  },
  sourceAmount: zeroAmount,
  strategy: TransactionPayStrategy.Relay,
  targetAmount: zeroFiat,
});

export const getMockPayControllerState = (
  txId: string,
  quotes: TransactionPayQuote<Json>[] = [getMockPayQuote()],
): TransactionPayControllerState => ({
  transactionData: {
    [txId]: {
      isLoading: false,
      quotes,
      tokens: [],
    },
  },
});

const ethToken = (chainId: number, priceUSD: string) => ({
  address: '0x0000000000000000000000000000000000000000',
  assetId: toCaipAssetType('eip155', String(chainId), 'slip44', '60'),
  chainId,
  symbol: 'ETH',
  decimals: 18,
  name: 'ETH',
  coinKey: 'ETH',
  logoURI:
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
  priceUSD,
  icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
});

export const MockStatusResponse = {
  getPending: ({
    srcTxHash = '0xsrcTxHash1',
    srcChainId = 42161,
    destChainId = 10,
  } = {}) => ({
    status: StatusTypes.PENDING,
    srcChain: {
      chainId: srcChainId,
      txHash: srcTxHash === 'undefined' ? undefined : srcTxHash,
      amount: '991250000000000',
      token: ethToken(srcChainId, '2518.47'),
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
    status: StatusTypes.COMPLETE,
    isExpectedToken,
    bridge: BridgeId.ACROSS,
    srcChain: {
      chainId: srcChainId,
      txHash: srcTxHash,
      amount: '991250000000000',
      token: ethToken(srcChainId, '2478.7'),
    },
    destChain: {
      chainId: destChainId,
      txHash: destTxHash,
      amount: '990654755978611',
      token: ethToken(destChainId, '2478.63'),
    },
  }),
  getFailed: ({
    srcTxHash = '0xsrcTxHash1',
    srcChainId = 42161,
    destChainId = 10,
    isExpectedToken = false,
  } = {}): StatusResponse => ({
    status: StatusTypes.FAILED,
    bridge: 'debridge',
    isExpectedToken,
    srcChain: {
      chainId: srcChainId,
      txHash: srcTxHash,
      amount: '991250000000000',
      token: {
        ...ethToken(srcChainId, '2478.7'),
        iconUrl:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
      },
    },
    destChain: {
      chainId: destChainId,
      token: {},
    },
  }),
};

export const getMockQuote = ({
  srcChainId = 42161,
  destChainId = 10,
} = {}) => ({
  requestId: '197c402f-cb96-4096-9f8c-54aed84ca776',
  srcChainId,
  srcTokenAmount: '991250000000000',
  srcAsset: ethToken(srcChainId, '2478.7'),
  destChainId,
  destTokenAmount: '990654755978612',
  minDestTokenAmount: '941000000000000',
  destAsset: ethToken(destChainId, '2478.63'),
  feeData: {
    metabridge: {
      amount: '8750000000000',
      asset: ethToken(srcChainId, '2478.7'),
    },
  },
  bridgeId: 'lifi',
  bridges: ['across'],
  steps: [
    {
      action: ActionTypes.BRIDGE,
      srcChainId,
      destChainId,
      protocol: {
        name: 'across',
        displayName: 'Across',
        icon: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/bridges/acrossv2.png',
      },
      srcAsset: ethToken(srcChainId, '2478.7'),
      destAsset: ethToken(destChainId, '2478.63'),
      srcAmount: '991250000000000',
      destAmount: '990654755978612',
    },
  ],
});

export const MockTxHistory = {
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
    attempts,
    startTime = 1729964825189,
  }: {
    txMetaId?: string;
    batchId?: `0x${string}`;
    actionId?: string;
    approvalTxId?: string;
    srcTxHash?: string;
    account?: string;
    srcChainId?: number;
    destChainId?: number;
    featureId?: BridgeHistoryItem['featureId'];
    attempts?: BridgeHistoryItem['attempts'];
    startTime?: number;
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

export const getRootMessenger = (): RootMessenger =>
  new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
    captureException: vi.fn(),
  });

export const getControllerMessenger = (
  rootMessenger: RootMessenger,
): BridgeStatusControllerMessenger => {
  const messenger = new Messenger<
    typeof BRIDGE_STATUS_CONTROLLER_NAME,
    MessengerActions<BridgeStatusControllerMessenger>,
    MessengerEvents<BridgeStatusControllerMessenger>,
    RootMessenger
  >({
    namespace: BRIDGE_STATUS_CONTROLLER_NAME,
    parent: rootMessenger,
  });
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
      'ApprovalController:rejectRequest',
    ],
    events: [
      'TransactionController:transactionStatusUpdated',
      'TransactionController:unapprovedTransactionAdded',
      'TransactionPayController:stateChange',
    ],
  });
  return messenger;
};

export const registerDefaultActionHandlers = (
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
): void => {
  rootMessenger.registerActionHandler(
    'AccountsController:getAccountByAddress',
    () => getMockInternalAccount({ address: account }),
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

  rootMessenger.registerActionHandler('NetworkController:getState', () => ({
    ...getDefaultNetworkControllerState(),
    selectedNetworkClientId: 'networkClientId',
  }));

  const mockProvider = new MockInternalProvider({
    stubs: [
      {
        request: { method: 'eth_getTransactionReceipt' },
        response: { result: '0xreceipt1' },
        discardAfterMatching: false,
      },
    ],
  });
  if (provider && provider !== 'undefined') {
    Object.assign(mockProvider, provider);
  }

  const networkProvider = Object.assign(mockProvider, {
    __target__: mockProvider,
  });
  const blockTrackerBase = new MockPollingBlockTracker({
    provider: mockProvider,
  });
  const blockTracker = Object.assign(blockTrackerBase, {
    __target__: blockTrackerBase,
  });
  const networkClient: AutoManagedNetworkClient<CustomNetworkClientConfiguration> =
    {
      configuration: {
        chainId: numberToHex(srcChainId),
        ticker: 'ETH',
        rpcUrl: 'https://rpc.example',
        type: NetworkClientType.Custom,
      },
      provider: networkProvider,
      blockTracker,
      destroy: () => undefined,
      setRpcFailoverMode: () => undefined,
    };

  rootMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    () => networkClient,
  );

  rootMessenger.registerActionHandler('TransactionController:getState', () =>
    getMockTransactionControllerState([
      {
        id: txMetaId === 'undefined' ? 'missing-tx-id' : txMetaId,
        hash: txHash,
        status,
        chainId: numberToHex(srcChainId),
        networkClientId: 'networkClientId',
        time: 0,
        txParams: { from: account },
      },
    ]),
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
};

export type WithControllerCallback<ReturnValue> = (payload: {
  controller: BridgeStatusController;
  rootMessenger: RootMessenger;
  messenger: BridgeStatusControllerMessenger;
  startPollingForBridgeTxStatusSpy: Mock;
}) => Promise<ReturnValue> | ReturnValue;

export type WithControllerOptions = {
  options?: Partial<ConstructorParameters<typeof BridgeStatusController>[0]>;
  mockMessengerCall?: Mock;
  addTransactionBatchFn?: Mock;
  traceFn?: SwapTraceFunction<TraceName>;
};

export const withController = async <ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> => {
  const [
    {
      options = {},
      mockMessengerCall = undefined,
      addTransactionBatchFn = vi.fn(),
      traceFn,
    },
    testFunction,
  ] = args.length === 2 ? args : [{}, args[0]];
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
    traceFn: traceFn ?? vi.fn(),
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
};
