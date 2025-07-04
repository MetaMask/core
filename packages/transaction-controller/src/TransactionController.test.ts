/* eslint-disable jest/expect-expect */
import { TransactionFactory } from '@ethereumjs/tx';
import type {
  AddApprovalRequest,
  AddResult,
} from '@metamask/approval-controller';
import { Messenger } from '@metamask/base-controller';
import {
  ChainId,
  NetworkType,
  toHex,
  ORIGIN_METAMASK,
  InfuraNetworkType,
} from '@metamask/controller-utils';
import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import EthQuery from '@metamask/eth-query';
import HttpProvider from '@metamask/ethjs-provider-http';
import type {
  BlockTracker,
  NetworkClientConfiguration,
  NetworkClientId,
  NetworkState,
  Provider,
} from '@metamask/network-controller';
import {
  NetworkStatus,
  getDefaultNetworkControllerState,
} from '@metamask/network-controller';
import { errorCodes, providerErrors } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';
import { createDeferredPromise } from '@metamask/utils';
import assert from 'assert';
// Necessary for mocking
// eslint-disable-next-line import-x/namespace
import * as uuidModule from 'uuid';

import { getAccountAddressRelationship } from './api/accounts-api';
import { CHAIN_IDS } from './constants';
import { DefaultGasFeeFlow } from './gas-flows/DefaultGasFeeFlow';
import { LineaGasFeeFlow } from './gas-flows/LineaGasFeeFlow';
import { RandomisedEstimationsGasFeeFlow } from './gas-flows/RandomisedEstimationsGasFeeFlow';
import { TestGasFeeFlow } from './gas-flows/TestGasFeeFlow';
import {
  updateTransactionGasEstimates,
  GasFeePoller,
} from './helpers/GasFeePoller';
import { IncomingTransactionHelper } from './helpers/IncomingTransactionHelper';
import { MethodDataHelper } from './helpers/MethodDataHelper';
import { MultichainTrackingHelper } from './helpers/MultichainTrackingHelper';
import { PendingTransactionTracker } from './helpers/PendingTransactionTracker';
import { shouldResimulate } from './helpers/ResimulateHelper';
import { ExtraTransactionsPublishHook } from './hooks/ExtraTransactionsPublishHook';
import type {
  AllowedActions,
  AllowedEvents,
  MethodData,
  TransactionControllerActions,
  TransactionControllerEvents,
  TransactionControllerOptions,
} from './TransactionController';
import { TransactionController } from './TransactionController';
import type {
  TransactionMeta,
  DappSuggestedGasFees,
  TransactionParams,
  TransactionHistoryEntry,
  TransactionError,
  GasFeeFlow,
  GasFeeFlowResponse,
  SubmitHistoryEntry,
  InternalAccount,
  PublishHook,
  GasFeeToken,
  GasFeeEstimates,
  SimulationData,
} from './types';
import {
  GasFeeEstimateLevel,
  GasFeeEstimateType,
  SimulationErrorCode,
  SimulationTokenStandard,
  TransactionContainerType,
  TransactionEnvelopeType,
  TransactionStatus,
  TransactionType,
  WalletDevice,
} from './types';
import { getBalanceChanges } from './utils/balance-changes';
import { addTransactionBatch } from './utils/batch';
import { getDelegationAddress } from './utils/eip7702';
import { addGasBuffer, estimateGas, updateGas } from './utils/gas';
import { getGasFeeTokens } from './utils/gas-fee-tokens';
import { updateGasFees } from './utils/gas-fees';
import { getGasFeeFlow } from './utils/gas-flow';
import {
  getTransactionLayer1GasFee,
  updateTransactionLayer1GasFee,
} from './utils/layer1-gas-fee-flow';
import {
  updatePostTransactionBalance,
  updateSwapsTransaction,
} from './utils/swaps';
import { ErrorCode } from './utils/validation';
import { FakeBlockTracker } from '../../../tests/fake-block-tracker';
import { FakeProvider } from '../../../tests/fake-provider';
import { flushPromises } from '../../../tests/helpers';
import {
  buildCustomNetworkClientConfiguration,
  buildMockGetNetworkClientById,
} from '../../network-controller/tests/helpers';

type UnrestrictedMessenger = Messenger<
  TransactionControllerActions | AllowedActions,
  TransactionControllerEvents | AllowedEvents
>;

const MOCK_V1_UUID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const TRANSACTION_HASH_MOCK = '0x123456';
const DATA_MOCK = '0x12345678';
const VALUE_MOCK = '0xabcd';
const ORIGIN_MOCK = 'test.com';

jest.mock('@metamask/eth-query');
jest.mock('./api/accounts-api');
jest.mock('./gas-flows/DefaultGasFeeFlow');
jest.mock('./gas-flows/RandomisedEstimationsGasFeeFlow');
jest.mock('./gas-flows/LineaGasFeeFlow');
jest.mock('./gas-flows/TestGasFeeFlow');
jest.mock('./helpers/GasFeePoller');
jest.mock('./helpers/IncomingTransactionHelper');
jest.mock('./helpers/MethodDataHelper');
jest.mock('./helpers/MultichainTrackingHelper');
jest.mock('./helpers/PendingTransactionTracker');
jest.mock('./hooks/ExtraTransactionsPublishHook');
jest.mock('./utils/batch');
jest.mock('./utils/feature-flags');
jest.mock('./utils/gas');
jest.mock('./utils/gas-fee-tokens');
jest.mock('./utils/gas-fees');
jest.mock('./utils/gas-flow');
jest.mock('./utils/layer1-gas-fee-flow');
jest.mock('./utils/balance-changes');
jest.mock('./utils/swaps');
jest.mock('uuid');

jest.mock('./helpers/ResimulateHelper', () => ({
  ...jest.requireActual('./helpers/ResimulateHelper'),
  shouldResimulate: jest.fn(),
}));

jest.mock('./utils/eip7702', () => ({
  ...jest.requireActual('./utils/eip7702'),
  getDelegationAddress: jest.fn(),
  doesChainSupportEIP7702: jest.fn(),
}));

// TODO: Replace `any` with type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFlags: { [key: string]: any } = {
  estimateGasError: null,
  estimateGasValue: null,
  getBlockByNumberValue: null,
};

/**
 * Constructs an EthQuery for use in tests, with various methods replaced with
 * fake implementations.
 *
 * @returns The mock EthQuery instance.
 */
function buildMockEthQuery(): EthQuery {
  return {
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimateGas: (_transaction: any, callback: any) => {
      if (mockFlags.estimateGasError) {
        callback(new Error(mockFlags.estimateGasError));
        return;
      }

      if (mockFlags.estimateGasValue) {
        callback(undefined, mockFlags.estimateGasValue);
        return;
      }
      callback(undefined, '0x0');
    },
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gasPrice: (callback: any) => {
      callback(undefined, '0x0');
    },
    getBlockByNumber: (
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _blocknumber: any,
      _fetchTxs: boolean,
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: any,
    ) => {
      if (mockFlags.getBlockByNumberValue) {
        callback(undefined, { gasLimit: '0x12a05f200' });
        return;
      }
      callback(undefined, { gasLimit: '0x0' });
    },
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getCode: (_to: any, callback: any) => {
      callback(undefined, '0x0');
    },
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getTransactionByHash: (_hash: string, callback: any) => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txs: any = [
        { blockNumber: '0x1', hash: '1337' },
        { blockNumber: null, hash: '1338' },
      ];
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx: any = txs.find((element: any) => element.hash === _hash);
      callback(undefined, tx);
    },
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getTransactionCount: (_from: any, _to: any, callback: any) => {
      callback(undefined, '0x0');
    },
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendRawTransaction: (_transaction: unknown, callback: any) => {
      callback(undefined, TRANSACTION_HASH_MOCK);
    },
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getTransactionReceipt: (_hash: any, callback: any) => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txs: any = [
        {
          blockHash: '1337',
          gasUsed: '0x5208',
          hash: '1337',
          status: '0x1',
          transactionIndex: 1337,
        },
        {
          gasUsed: '0x1108',
          hash: '1111',
          status: '0x0',
          transactionIndex: 1111,
        },
      ];
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx: any = txs.find((element: any) => element.hash === _hash);
      callback(undefined, tx);
    },
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getBlockByHash: (_blockHash: any, callback: any) => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blocks: any = [
        {
          baseFeePerGas: '0x14',
          hash: '1337',
          number: '0x1',
          timestamp: '628dc0c8',
        },
        { hash: '1338', number: '0x2' },
      ];
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const block: any = blocks.find(
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (element: any) => element.hash === _blockHash,
      );
      callback(undefined, block);
    },
    sendAsync: () => {
      // do nothing
    },
  };
}

/**
 * Builds a mock block tracker with a canned block number that can be used in
 * tests.
 *
 * @param latestBlockNumber - The block number that the block tracker should
 * always return.
 * @param provider - json rpc provider
 * @returns The mocked block tracker.
 */
function buildMockBlockTracker(
  latestBlockNumber: string,
  provider: SafeEventEmitterProvider,
): BlockTracker {
  const fakeBlockTracker = new FakeBlockTracker({ provider });
  fakeBlockTracker.mockLatestBlockNumber(latestBlockNumber);
  return fakeBlockTracker;
}

/**
 * Builds a mock gas fee flow.
 *
 * @returns The mocked gas fee flow.
 */
function buildMockGasFeeFlow(): jest.Mocked<GasFeeFlow> {
  return {
    matchesTransaction: jest.fn(),
    getGasFees: jest.fn(),
  };
}

/**
 * Wait for the controller to emit a transaction finished event.
 *
 * @param messenger - The messenger to monitor.
 * @param options - Options to customize the wait.
 * @param options.confirmed - Whether to wait for the transaction to be confirmed or just finished.
 * @returns A promise that resolves with the transaction meta when the transaction is finished.
 */
function waitForTransactionFinished(
  messenger: Messenger<
    TransactionControllerActions | AllowedActions,
    TransactionControllerEvents | AllowedEvents
  >,
  { confirmed = false } = {},
): Promise<TransactionMeta> {
  const eventName = confirmed
    ? 'TransactionController:transactionConfirmed'
    : 'TransactionController:transactionFinished';
  return new Promise((resolve) => {
    const subscriber = (transactionMeta: TransactionMeta) => {
      resolve(transactionMeta);
      messenger.unsubscribe(eventName, subscriber);
    };
    messenger.subscribe(eventName, subscriber);
  });
}

const MOCK_PREFERENCES = { state: { selectedAddress: 'foo' } };
const INFURA_PROJECT_ID = 'testinfuraid';
const HTTP_PROVIDERS = {
  sepolia: new HttpProvider('https://sepolia.infura.io/v3/sepolia-pid'),
  // TODO: Investigate and address why tests break when mainet has a different INFURA_PROJECT_ID
  mainnet: new HttpProvider(
    `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
  ),
  linea: new HttpProvider('https://linea.infura.io/v3/linea-pid'),
  lineaSepolia: new HttpProvider(
    'https://linea-sepolia.infura.io/v3/linea-sepolia-pid',
  ),
  custom: new HttpProvider(`http://127.0.0.123:456/ethrpc?apiKey=foobar`),
  palm: new HttpProvider('https://palm-mainnet.infura.io/v3/palm-pid'),
};

type MockNetwork = {
  chainId: Hex;
  provider: Provider;
  blockTracker: BlockTracker;
  state: NetworkState;
  subscribe: (listener: (state: NetworkState) => void) => void;
};

const MOCK_NETWORK: MockNetwork = {
  chainId: ChainId.sepolia,
  provider: HTTP_PROVIDERS.sepolia,
  blockTracker: buildMockBlockTracker('0x102833C', HTTP_PROVIDERS.sepolia),
  state: {
    selectedNetworkClientId: NetworkType.sepolia,
    networksMetadata: {
      [NetworkType.sepolia]: {
        EIPS: { 1559: false },
        status: NetworkStatus.Available,
      },
    },
    networkConfigurationsByChainId: {},
  },
  subscribe: () => undefined,
};

const MOCK_LINEA_MAINNET_NETWORK: MockNetwork = {
  chainId: ChainId['linea-mainnet'],
  provider: HTTP_PROVIDERS.linea,
  blockTracker: buildMockBlockTracker('0xA6EDFC', HTTP_PROVIDERS.linea),
  state: {
    selectedNetworkClientId: NetworkType['linea-mainnet'],
    networksMetadata: {
      [NetworkType['linea-mainnet']]: {
        EIPS: { 1559: false },
        status: NetworkStatus.Available,
      },
    },
    networkConfigurationsByChainId: {},
  },
  subscribe: () => undefined,
};

const MOCK_LINEA_SEPOLIA_NETWORK: MockNetwork = {
  chainId: ChainId['linea-sepolia'],
  provider: HTTP_PROVIDERS.lineaSepolia,
  blockTracker: buildMockBlockTracker('0xA6EDFC', HTTP_PROVIDERS.lineaSepolia),
  state: {
    selectedNetworkClientId: NetworkType['linea-sepolia'],
    networksMetadata: {
      [NetworkType['linea-sepolia']]: {
        EIPS: { 1559: false },
        status: NetworkStatus.Available,
      },
    },
    networkConfigurationsByChainId: {},
  },
  subscribe: () => undefined,
};

const ACCOUNT_MOCK = '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207';

const INTERNAL_ACCOUNT_MOCK: InternalAccount = {
  id: '58def058-d35f-49a1-a7ab-e2580565f6f5',
  address: ACCOUNT_MOCK,
  type: 'eip155:eoa',
  scopes: ['eip155:0'],
  options: {},
  methods: [],
  metadata: {
    name: 'Account 1',
    keyring: { type: 'HD Key Tree' },
    importTime: 1631619180000,
    lastSelected: 1631619180000,
  },
};

const ACCOUNT_2_MOCK = '0x08f137f335ea1b8f193b8f6ea92561a60d23a211';
const NONCE_MOCK = 12;
const ACTION_ID_MOCK = '123456';
const CHAIN_ID_MOCK = MOCK_NETWORK.chainId;
const NETWORK_CLIENT_ID_MOCK = 'networkClientIdMock';
const BATCH_ID_MOCK = '0xabcd12';

const TRANSACTION_META_MOCK = {
  hash: '0x1',
  id: '1',
  status: TransactionStatus.confirmed as const,
  time: 123456789,
  txParams: {
    from: ACCOUNT_MOCK,
    to: ACCOUNT_2_MOCK,
    value: '0x42',
  },
} as TransactionMeta;

const TRANSACTION_META_2_MOCK = {
  hash: '0x2',
  status: TransactionStatus.confirmed as const,
  time: 987654321,
  txParams: {
    from: '0x3',
  },
} as TransactionMeta;

const SIMULATION_DATA_RESULT_MOCK: SimulationData = {
  nativeBalanceChange: {
    previousBalance: '0x0',
    newBalance: '0x1',
    difference: '0x1',
    isDecrease: false,
  },
  tokenBalanceChanges: [
    {
      address: '0x123',
      standard: SimulationTokenStandard.erc721,
      id: '0x456',
      previousBalance: '0x1',
      newBalance: '0x3',
      difference: '0x2',
      isDecrease: false,
    },
  ],
};

const GAS_FEE_TOKEN_MOCK: GasFeeToken = {
  amount: '0x1',
  balance: '0x2',
  decimals: 18,
  gas: '0x3',
  gasTransfer: '0x4',
  maxFeePerGas: '0x4',
  maxPriorityFeePerGas: '0x5',
  rateWei: '0x6',
  recipient: '0x7',
  symbol: 'ETH',
  tokenAddress: '0x8',
};

const GAS_FEE_ESTIMATES_MOCK: GasFeeFlowResponse = {
  estimates: {
    type: GasFeeEstimateType.GasPrice,
    gasPrice: '0x1',
  },
};

const METHOD_DATA_MOCK: MethodData = {
  registryMethod: 'testMethod(uint256,uint256)',
  parsedRegistryMethod: {
    name: 'testMethod',
    args: [{ type: 'uint256' }, { type: 'uint256' }],
  },
};

describe('TransactionController', () => {
  const uuidModuleMock = jest.mocked(uuidModule);
  const EthQueryMock = jest.mocked(EthQuery);
  const updateGasMock = jest.mocked(updateGas);
  const updateGasFeesMock = jest.mocked(updateGasFees);
  const estimateGasMock = jest.mocked(estimateGas);
  const addGasBufferMock = jest.mocked(addGasBuffer);
  const updateSwapsTransactionMock = jest.mocked(updateSwapsTransaction);
  const updatePostTransactionBalanceMock = jest.mocked(
    updatePostTransactionBalance,
  );
  const defaultGasFeeFlowClassMock = jest.mocked(DefaultGasFeeFlow);
  const lineaGasFeeFlowClassMock = jest.mocked(LineaGasFeeFlow);
  const randomisedEstimationsGasFeeFlowClassMock = jest.mocked(
    RandomisedEstimationsGasFeeFlow,
  );
  const testGasFeeFlowClassMock = jest.mocked(TestGasFeeFlow);
  const gasFeePollerClassMock = jest.mocked(GasFeePoller);
  const updateTransactionGasEstimatesMock = jest.mocked(
    updateTransactionGasEstimates,
  );
  const getBalanceChangesMock = jest.mocked(getBalanceChanges);
  const getGasFeeTokensMock = jest.mocked(getGasFeeTokens);
  const getTransactionLayer1GasFeeMock = jest.mocked(
    getTransactionLayer1GasFee,
  );
  const getGasFeeFlowMock = jest.mocked(getGasFeeFlow);
  const shouldResimulateMock = jest.mocked(shouldResimulate);
  const getAccountAddressRelationshipMock = jest.mocked(
    getAccountAddressRelationship,
  );
  const addTransactionBatchMock = jest.mocked(addTransactionBatch);
  const methodDataHelperClassMock = jest.mocked(MethodDataHelper);
  const getDelegationAddressMock = jest.mocked(getDelegationAddress);

  let mockEthQuery: EthQuery;
  let getNonceLockSpy: jest.Mock;
  let incomingTransactionHelperMock: jest.Mocked<IncomingTransactionHelper>;
  let pendingTransactionTrackerMock: jest.Mocked<PendingTransactionTracker>;
  let multichainTrackingHelperMock: jest.Mocked<MultichainTrackingHelper>;
  let defaultGasFeeFlowMock: jest.Mocked<DefaultGasFeeFlow>;
  let lineaGasFeeFlowMock: jest.Mocked<LineaGasFeeFlow>;
  let randomisedEstimationsGasFeeFlowMock: jest.Mocked<RandomisedEstimationsGasFeeFlow>;
  let testGasFeeFlowMock: jest.Mocked<TestGasFeeFlow>;
  let gasFeePollerMock: jest.Mocked<GasFeePoller>;
  let methodDataHelperMock: jest.Mocked<MethodDataHelper>;
  let timeCounter = 0;
  let signMock: jest.Mock;
  let isEIP7702GasFeeTokensEnabledMock: jest.Mock;

  const incomingTransactionHelperClassMock =
    IncomingTransactionHelper as jest.MockedClass<
      typeof IncomingTransactionHelper
    >;

  const pendingTransactionTrackerClassMock =
    PendingTransactionTracker as jest.MockedClass<
      typeof PendingTransactionTracker
    >;

  const multichainTrackingHelperClassMock =
    MultichainTrackingHelper as jest.MockedClass<
      typeof MultichainTrackingHelper
    >;

  /**
   * Constructs an instance of the TransactionController and supporting data for
   * use in tests.
   *
   * @param args - The arguments to this function.
   * @param args.options - TransactionController options.
   * @param args.network - The mock network to use with the controller.
   * @param args.network.blockTracker - The desired block tracker associated
   * with the network.
   * @param args.network.provider - The desired provider associated with the
   * provider.
   * @param args.network.state - The desired NetworkController state.
   * @param args.network.onNetworkStateChange - The function to subscribe to
   * changes in the NetworkController state.
   * @param args.messengerOptions - Options to build the mock unrestricted
   * messenger.
   * @param args.messengerOptions.addTransactionApprovalRequest - Options to
   * mock the `ApprovalController:addRequest` action call for transactions.
   * @param args.selectedAccount - The selected account to use with the controller.
   * @param args.mockNetworkClientConfigurationsByNetworkClientId - Network
   * client configurations by network client ID.
   * @param args.updateToInitialState - Whether to apply the controller state after instantiation via the `update` method.
   * This is required if unapproved transactions are included since they are cleared during instantiation.
   * @returns The new TransactionController instance.
   */
  function setupController({
    options: givenOptions = {},
    network = {},
    messengerOptions = {},
    selectedAccount = INTERNAL_ACCOUNT_MOCK,
    mockNetworkClientConfigurationsByNetworkClientId = {
      [NETWORK_CLIENT_ID_MOCK]: buildCustomNetworkClientConfiguration({
        chainId: CHAIN_ID_MOCK,
      }),
    },
    updateToInitialState = false,
  }: {
    options?: Partial<ConstructorParameters<typeof TransactionController>[0]>;
    network?: {
      blockTracker?: BlockTracker;
      provider?: Provider;
      state?: Partial<NetworkState>;
      onNetworkStateChange?: (
        listener: (networkState: NetworkState) => void,
      ) => void;
    };
    messengerOptions?: {
      addTransactionApprovalRequest?: Parameters<
        typeof mockAddTransactionApprovalRequest
      >[1];
    };
    selectedAccount?: InternalAccount;
    mockNetworkClientConfigurationsByNetworkClientId?: Record<
      NetworkClientId,
      NetworkClientConfiguration
    >;
    updateToInitialState?: boolean;
  } = {}) {
    let networkState = {
      ...getDefaultNetworkControllerState(),
      selectedNetworkClientId: MOCK_NETWORK.state.selectedNetworkClientId,
      ...network.state,
    };
    const onNetworkDidChangeListeners: ((state: NetworkState) => void)[] = [];
    const changeNetwork = ({
      selectedNetworkClientId,
    }: {
      selectedNetworkClientId: NetworkClientId;
    }) => {
      networkState = {
        ...networkState,
        selectedNetworkClientId,
      };
      onNetworkDidChangeListeners.forEach((listener) => {
        listener(networkState);
      });
    };
    const unrestrictedMessenger: UnrestrictedMessenger = new Messenger();
    const getNetworkClientById = buildMockGetNetworkClientById(
      mockNetworkClientConfigurationsByNetworkClientId,
    );
    unrestrictedMessenger.registerActionHandler(
      'NetworkController:getNetworkClientById',
      getNetworkClientById,
    );

    const { addTransactionApprovalRequest = { state: 'pending' } } =
      messengerOptions;
    const mockTransactionApprovalRequest = mockAddTransactionApprovalRequest(
      unrestrictedMessenger,
      addTransactionApprovalRequest,
    );

    const {
      messenger: givenRestrictedMessenger,
      ...otherOptions
    }: Partial<TransactionControllerOptions> = {
      disableHistory: false,
      disableSendFlowHistory: false,
      disableSwaps: false,
      getCurrentNetworkEIP1559Compatibility: async () => false,
      getNetworkState: () => networkState,
      getNetworkClientRegistry: () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockNetworkClientConfigurationsByNetworkClientId as any,
      getPermittedAccounts: async () => [ACCOUNT_MOCK],
      hooks: {},
      isEIP7702GasFeeTokensEnabled: isEIP7702GasFeeTokensEnabledMock,
      publicKeyEIP7702: '0x1234',
      sign: signMock,
      transactionHistoryLimit: 40,
      ...givenOptions,
    };

    const restrictedMessenger =
      givenRestrictedMessenger ??
      unrestrictedMessenger.getRestricted({
        name: 'TransactionController',
        allowedActions: [
          'AccountsController:getSelectedAccount',
          'AccountsController:getState',
          'ApprovalController:addRequest',
          'NetworkController:getNetworkClientById',
          'NetworkController:findNetworkClientIdByChainId',
          'RemoteFeatureFlagController:getState',
        ],
        allowedEvents: [],
      });

    const mockGetSelectedAccount = jest.fn().mockReturnValue(selectedAccount);
    unrestrictedMessenger.registerActionHandler(
      'AccountsController:getSelectedAccount',
      mockGetSelectedAccount,
    );

    unrestrictedMessenger.registerActionHandler(
      'AccountsController:getState',
      () => ({}) as never,
    );

    const remoteFeatureFlagControllerGetStateMock = jest.fn().mockReturnValue({
      featureFlags: {},
    });

    unrestrictedMessenger.registerActionHandler(
      'RemoteFeatureFlagController:getState',
      remoteFeatureFlagControllerGetStateMock,
    );

    const controller = new TransactionController({
      ...otherOptions,
      messenger: restrictedMessenger,
    } as TransactionControllerOptions);

    const state = givenOptions?.state;

    if (updateToInitialState && state) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (controller as any).update(() => state);
    }

    multichainTrackingHelperClassMock.mock.calls[0][0].createPendingTransactionTracker(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
    );

    getDelegationAddressMock.mockResolvedValue(undefined);

    remoteFeatureFlagControllerGetStateMock.mockReturnValue({
      remoteFeatureFlags: {},
    });

    return {
      controller,
      messenger: unrestrictedMessenger,
      mockTransactionApprovalRequest,
      mockGetSelectedAccount,
      changeNetwork,
    };
  }

  /**
   * Mocks the `ApprovalController:addRequest` action that the
   * TransactionController calls as it creates transactions.
   *
   * This helper allows the `addRequest` action to be in one of three states:
   * approved, rejected, or pending. In the approved state, the promise which
   * the action returns is resolved ahead of time, and in the rejected state,
   * the promise is rejected ahead of time. Otherwise, in the pending state, the
   * promise is unresolved and it is assumed that the test will resolve or
   * reject the promise.
   *
   * @param messenger - The unrestricted messenger.
   * @param options - An options bag which will be used to create an action
   * handler that places the approval request in a certain state. The `state`
   * option controls the state of the promise as outlined above: if the `state`
   * is approved, then its `result` may be specified; if the `state` is
   * rejected, then its `error` may be specified.
   * @returns An object which contains the aforementioned promise, functions to
   * manually approve or reject the approval (and therefore the promise), and
   * finally the mocked version of the action handler itself.
   */
  function mockAddTransactionApprovalRequest(
    messenger: UnrestrictedMessenger,
    options:
      | {
          state: 'approved';
          result?: Partial<AddResult>;
        }
      | {
          state: 'rejected';
          error?: unknown;
        }
      | {
          state: 'pending';
        },
  ): {
    promise: Promise<AddResult>;
    approve: (approvalResult?: Partial<AddResult>) => void;
    reject: (rejectionError: unknown) => void;
    actionHandlerMock: jest.Mock<
      ReturnType<AddApprovalRequest['handler']>,
      Parameters<AddApprovalRequest['handler']>
    >;
  } {
    const { promise, resolve, reject } = createDeferredPromise<AddResult>();

    const approveTransaction = (approvalResult?: Partial<AddResult>) => {
      resolve({
        resultCallbacks: {
          success() {
            // do nothing
          },
          error() {
            // do nothing
          },
        },
        ...approvalResult,
      });
    };

    const rejectTransaction = (
      rejectionError: unknown = {
        code: errorCodes.provider.userRejectedRequest,
      },
    ) => {
      reject(rejectionError);
    };

    const actionHandlerMock: jest.Mock<
      ReturnType<AddApprovalRequest['handler']>,
      Parameters<AddApprovalRequest['handler']>
    > = jest.fn().mockReturnValue(promise);
    if (options.state === 'approved') {
      approveTransaction(options.result);
    } else if (options.state === 'rejected') {
      rejectTransaction(options.error);
    }

    messenger.registerActionHandler(
      'ApprovalController:addRequest',
      actionHandlerMock,
    );

    return {
      promise,
      approve: approveTransaction,
      reject: rejectTransaction,
      actionHandlerMock,
    };
  }

  /**
   * Wait for a specified number of milliseconds.
   *
   * @param ms - The number of milliseconds to wait.
   */
  async function wait(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  beforeEach(() => {
    jest.resetAllMocks();

    jest.spyOn(Date, 'now').mockImplementation(() => {
      timeCounter += 1;
      return timeCounter;
    });

    for (const key of Object.keys(mockFlags)) {
      mockFlags[key] = null;
    }

    uuidModuleMock.v1.mockReturnValue(MOCK_V1_UUID);

    mockEthQuery = buildMockEthQuery();
    EthQueryMock.mockImplementation(() => mockEthQuery);

    getNonceLockSpy = jest.fn().mockResolvedValue({
      nextNonce: NONCE_MOCK,
      releaseLock: () => Promise.resolve(),
    });

    incomingTransactionHelperClassMock.mockImplementation(() => {
      incomingTransactionHelperMock = {
        start: jest.fn(),
        stop: jest.fn(),
        update: jest.fn(),
        hub: {
          on: jest.fn(),
          removeAllListeners: jest.fn(),
        },
      } as unknown as jest.Mocked<IncomingTransactionHelper>;
      return incomingTransactionHelperMock;
    });

    pendingTransactionTrackerMock = {
      start: jest.fn(),
      stop: jest.fn(),
      startIfPendingTransactions: jest.fn(),
      hub: {
        on: jest.fn(),
        removeAllListeners: jest.fn(),
      },
      onStateChange: jest.fn(),
      forceCheckTransaction: jest.fn(),
    } as unknown as jest.Mocked<PendingTransactionTracker>;

    pendingTransactionTrackerClassMock.mockImplementation(() => {
      return pendingTransactionTrackerMock;
    });

    multichainTrackingHelperClassMock.mockImplementation(() => {
      multichainTrackingHelperMock = {
        getNetworkClient: jest.fn().mockImplementation(() => {
          return {
            configuration: {
              chainId: CHAIN_ID_MOCK,
            },
            id: NETWORK_CLIENT_ID_MOCK,
            provider: new FakeProvider(),
          } as unknown as NetworkClientConfiguration;
        }),
        checkForPendingTransactionAndStartPolling: jest.fn(),
        getNonceLock: getNonceLockSpy,
        initialize: jest.fn(),
        has: jest.fn().mockReturnValue(true),
      } as unknown as jest.Mocked<MultichainTrackingHelper>;
      return multichainTrackingHelperMock;
    });

    defaultGasFeeFlowClassMock.mockImplementation(() => {
      defaultGasFeeFlowMock = {
        matchesTransaction: () => false,
      } as unknown as jest.Mocked<DefaultGasFeeFlow>;
      return defaultGasFeeFlowMock;
    });

    lineaGasFeeFlowClassMock.mockImplementation(() => {
      lineaGasFeeFlowMock = {
        matchesTransaction: () => false,
      } as unknown as jest.Mocked<LineaGasFeeFlow>;
      return lineaGasFeeFlowMock;
    });

    randomisedEstimationsGasFeeFlowClassMock.mockImplementation(() => {
      randomisedEstimationsGasFeeFlowMock = {
        matchesTransaction: () => false,
      } as unknown as jest.Mocked<RandomisedEstimationsGasFeeFlow>;
      return randomisedEstimationsGasFeeFlowMock;
    });

    testGasFeeFlowClassMock.mockImplementation(() => {
      testGasFeeFlowMock = {
        matchesTransaction: () => false,
      } as unknown as jest.Mocked<TestGasFeeFlow>;
      return testGasFeeFlowMock;
    });

    gasFeePollerClassMock.mockImplementation(() => {
      gasFeePollerMock = {
        hub: {
          on: jest.fn(),
        },
      } as unknown as jest.Mocked<GasFeePoller>;
      return gasFeePollerMock;
    });

    methodDataHelperClassMock.mockImplementation(() => {
      methodDataHelperMock = {
        lookup: jest.fn(),
        hub: {
          on: jest.fn(),
        },
      } as unknown as jest.Mocked<MethodDataHelper>;
      return methodDataHelperMock;
    });

    updateSwapsTransactionMock.mockImplementation(
      (transactionMeta) => transactionMeta,
    );

    getAccountAddressRelationshipMock.mockResolvedValue({
      count: 1,
    });

    signMock = jest.fn().mockImplementation(async (transaction) => transaction);
    isEIP7702GasFeeTokensEnabledMock = jest.fn().mockResolvedValue(false);
  });

  describe('constructor', () => {
    it('sets default state', () => {
      const { controller } = setupController();
      expect(controller.state).toStrictEqual({
        methodData: {},
        transactions: [],
        transactionBatches: [],
        lastFetchedBlockNumbers: {},
        submitHistory: [],
      });
    });

    it('provides gas fee flows to GasFeePoller in correct order', () => {
      setupController();

      expect(gasFeePollerClassMock).toHaveBeenCalledTimes(1);
      expect(gasFeePollerClassMock).toHaveBeenCalledWith(
        expect.objectContaining({
          gasFeeFlows: [
            randomisedEstimationsGasFeeFlowMock,
            lineaGasFeeFlowMock,
            defaultGasFeeFlowMock,
          ],
        }),
      );
    });

    it('provides only test flow if option set', () => {
      setupController({
        options: {
          testGasFeeFlows: true,
        },
      });

      expect(gasFeePollerClassMock).toHaveBeenCalledTimes(1);
      expect(gasFeePollerClassMock).toHaveBeenCalledWith(
        expect.objectContaining({
          gasFeeFlows: [testGasFeeFlowMock],
        }),
      );
    });

    it('fails approved and signed transactions for all chains', async () => {
      const mockTransactionMeta = {
        from: ACCOUNT_MOCK,
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        },
      };
      const mockedTransactions = [
        {
          id: '123',
          history: [{ ...mockTransactionMeta, id: '123' }],
          chainId: toHex(5),
          status: TransactionStatus.approved,
          ...mockTransactionMeta,
        },
        {
          id: '456',
          history: [{ ...mockTransactionMeta, id: '456' }],
          chainId: toHex(1),
          status: TransactionStatus.approved,
          ...mockTransactionMeta,
        },
        {
          id: '789',
          history: [{ ...mockTransactionMeta, id: '789' }],
          chainId: toHex(16),
          status: TransactionStatus.approved,
          ...mockTransactionMeta,
        },
        {
          id: '111',
          history: [{ ...mockTransactionMeta, id: '111' }],
          chainId: toHex(5),
          status: TransactionStatus.signed,
          ...mockTransactionMeta,
        },
        {
          id: '222',
          history: [{ ...mockTransactionMeta, id: '222' }],
          chainId: toHex(1),
          status: TransactionStatus.signed,
          ...mockTransactionMeta,
        },
        {
          id: '333',
          history: [{ ...mockTransactionMeta, id: '333' }],
          chainId: toHex(16),
          status: TransactionStatus.signed,
          ...mockTransactionMeta,
        },
      ];

      const mockedControllerState = {
        transactions: mockedTransactions,
        methodData: {},
        lastFetchedBlockNumbers: {},
      };

      const { controller } = setupController({
        options: {
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          state: mockedControllerState as any,
        },
      });

      await flushPromises();

      const { transactions } = controller.state;

      expect(transactions[0].status).toBe(TransactionStatus.failed);
      expect(transactions[1].status).toBe(TransactionStatus.failed);
      expect(transactions[2].status).toBe(TransactionStatus.failed);
      expect(transactions[3].status).toBe(TransactionStatus.failed);
      expect(transactions[4].status).toBe(TransactionStatus.failed);
      expect(transactions[5].status).toBe(TransactionStatus.failed);
    });

    it('removes unapproved transactions', async () => {
      const mockTransactionMeta = {
        from: ACCOUNT_MOCK,
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        },
      };

      const mockedTransactions = [
        {
          id: '123',
          history: [{ ...mockTransactionMeta, id: '123' }],
          chainId: toHex(5),
          status: TransactionStatus.unapproved,
          ...mockTransactionMeta,
        },
        {
          id: '456',
          history: [{ ...mockTransactionMeta, id: '456' }],
          chainId: toHex(1),
          status: TransactionStatus.unapproved,
          ...mockTransactionMeta,
        },
        {
          id: '789',
          history: [{ ...mockTransactionMeta, id: '789' }],
          chainId: toHex(16),
          status: TransactionStatus.unapproved,
          ...mockTransactionMeta,
        },
      ];

      const mockedControllerState = {
        transactions: mockedTransactions,
        methodData: {},
        lastFetchedBlockNumbers: {},
      };

      const { controller } = setupController({
        options: {
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          state: mockedControllerState as any,
        },
      });

      await flushPromises();

      const { transactions } = controller.state;

      expect(transactions).toHaveLength(0);
    });

    it('updates state when helper emits update event', async () => {
      const { controller } = setupController();

      jest.mocked(methodDataHelperMock.hub.on).mock.calls[0][1]({
        fourBytePrefix: '0x12345678',
        methodData: METHOD_DATA_MOCK,
      });

      expect(controller.state.methodData).toStrictEqual({
        '0x12345678': METHOD_DATA_MOCK,
      });
    });
  });

  describe('estimateGas', () => {
    it('returns estimatedGas and simulation fails', async () => {
      const gasMock = '0x123';

      const simulationFailsMock = {
        errorKey: 'testKey',
      };

      const { controller } = setupController();

      estimateGasMock.mockResolvedValue({
        estimatedGas: gasMock,
        simulationFails: simulationFailsMock,
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const { gas, simulationFails } = await controller.estimateGas(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        NETWORK_CLIENT_ID_MOCK,
      );

      expect(gas).toBe(gasMock);
      expect(simulationFails).toBe(simulationFailsMock);
    });
  });

  describe('estimateGasBuffered', () => {
    it('returns estimated gas and simulation fails', async () => {
      const gasMock = '0x123';
      const blockGasLimitMock = '0x1234';
      const expectedEstimatedGas = '0x12345';
      const multiplierMock = 1;
      const transactionParamsMock = {
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      };

      const simulationFailsMock = {
        errorKey: 'testKey',
        reason: 'testReason',
        debug: {
          blockNumber: '123',
          blockGasLimit: '1234',
        },
      };

      const { controller } = setupController();

      estimateGasMock.mockResolvedValue({
        estimatedGas: gasMock,
        blockGasLimit: blockGasLimitMock,
        simulationFails: simulationFailsMock,
        isUpgradeWithDataToSelf: false,
      });

      addGasBufferMock.mockReturnValue(expectedEstimatedGas);

      const { gas, simulationFails } = await controller.estimateGasBuffered(
        transactionParamsMock,
        multiplierMock,
        NETWORK_CLIENT_ID_MOCK,
      );

      expect(estimateGasMock).toHaveBeenCalledTimes(1);
      expect(estimateGasMock).toHaveBeenCalledWith({
        chainId: CHAIN_ID_MOCK,
        ethQuery: expect.anything(),
        isSimulationEnabled: true,
        messenger: expect.anything(),
        txParams: transactionParamsMock,
      });

      expect(addGasBufferMock).toHaveBeenCalledTimes(1);
      expect(addGasBufferMock).toHaveBeenCalledWith(
        gasMock,
        blockGasLimitMock,
        multiplierMock,
      );

      expect(gas).toBe(expectedEstimatedGas);
      expect(simulationFails).toBe(simulationFailsMock);
    });
  });

  describe('with actionId', () => {
    it('adds single unapproved transaction when called twice with same actionId', async () => {
      const { controller, mockTransactionApprovalRequest } = setupController();

      const mockOrigin = 'origin';

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          origin: mockOrigin,
          actionId: ACTION_ID_MOCK,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      const firstTransactionCount = controller.state.transactions.length;

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          origin: mockOrigin,
          actionId: ACTION_ID_MOCK,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );
      const secondTransactionCount = controller.state.transactions.length;

      expect(firstTransactionCount).toStrictEqual(secondTransactionCount);
      expect(
        mockTransactionApprovalRequest.actionHandlerMock,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockTransactionApprovalRequest.actionHandlerMock,
      ).toHaveBeenCalledWith(
        {
          id: expect.any(String),
          origin: mockOrigin,
          type: 'transaction',
          requestData: { txId: expect.any(String) },
          expectsResult: true,
        },
        true,
      );
    });

    it('adds multiple transactions with same actionId and ensures second transaction result does not resolves before the first transaction result', async () => {
      const { controller, mockTransactionApprovalRequest } = setupController();

      const mockOrigin = 'origin';
      let firstTransactionCompleted = false;
      let secondTransactionCompleted = false;

      const { result: firstResult } = await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          origin: mockOrigin,
          actionId: ACTION_ID_MOCK,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      firstResult
        .then(() => {
          firstTransactionCompleted = true;
          return undefined;
        })
        .catch(() => undefined);

      const { result: secondResult } = await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          origin: mockOrigin,
          actionId: ACTION_ID_MOCK,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );
      secondResult
        .then(() => {
          secondTransactionCompleted = true;
          return undefined;
        })
        .catch(() => undefined);

      await wait(0);

      expect(firstTransactionCompleted).toBe(false);
      expect(secondTransactionCompleted).toBe(false);

      mockTransactionApprovalRequest.approve();
      await firstResult;
      await secondResult;

      expect(firstTransactionCompleted).toBe(true);
      expect(secondTransactionCompleted).toBe(true);
    });

    it.each([
      [
        'does not add duplicate transaction if actionId already used',
        ACTION_ID_MOCK,
        ACTION_ID_MOCK,
        1,
      ],
      [
        'adds additional transaction if actionId not used',
        ACTION_ID_MOCK,
        '00000',
        2,
      ],
    ])(
      '%s',
      async (_, firstActionId, secondActionId, expectedTransactionCount) => {
        const { controller, mockTransactionApprovalRequest } =
          setupController();
        const expectedRequestApprovalCalledTimes = expectedTransactionCount;

        const mockOrigin = 'origin';

        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            origin: mockOrigin,
            actionId: firstActionId,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            origin: mockOrigin,
            actionId: secondActionId,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );
        const { transactions } = controller.state;

        expect(transactions).toHaveLength(expectedTransactionCount);
        expect(
          mockTransactionApprovalRequest.actionHandlerMock,
        ).toHaveBeenCalledTimes(expectedRequestApprovalCalledTimes);
      },
    );

    it.each([
      [
        'adds single transaction when speed up called twice with the same actionId',
        ACTION_ID_MOCK,
        2,
        1,
      ],
      [
        'adds multiple transactions when speed up called with non-existent actionId',
        '00000',
        3,
        2,
      ],
    ])(
      '%s',
      async (
        _,
        actionId,
        expectedTransactionCount,
        expectedSignCalledTimes,
      ) => {
        const { controller } = setupController();

        const { transactionMeta } = await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            gas: '0x0',
            gasPrice: '0x50fd51da',
            to: ACCOUNT_MOCK,
            value: '0x0',
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        await controller.speedUpTransaction(transactionMeta.id, undefined, {
          actionId: ACTION_ID_MOCK,
        });

        await controller.speedUpTransaction(transactionMeta.id, undefined, {
          actionId,
        });

        const { transactions } = controller.state;
        expect(transactions).toHaveLength(expectedTransactionCount);
        expect(signMock).toHaveBeenCalledTimes(expectedSignCalledTimes);
      },
    );
  });

  describe('addTransaction', () => {
    it('adds unapproved transaction to state', async () => {
      const { controller } = setupController();

      getAccountAddressRelationshipMock.mockResolvedValueOnce({
        count: 0,
      });

      const mockDeviceConfirmedOn = WalletDevice.OTHER;
      const mockOrigin = 'origin';
      const mockSecurityAlertResponse = {
        result_type: 'Malicious',
        reason: 'blur_farming',
        description:
          'A SetApprovalForAll request was made on {contract}. We found the operator {operator} to be malicious',
        args: {
          contract: '0xa7206d878c5c3871826dfdb42191c49b1d11f466',
          operator: '0x92a3b9773b1763efa556f55ccbeb20441962d9b2',
        },
      };
      const mockSendFlowHistory = [
        {
          entry:
            'sendFlow - user selected transfer to my accounts on recipient screen',
          timestamp: 1650663928211,
        },
      ];
      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          deviceConfirmedOn: mockDeviceConfirmedOn,
          origin: mockOrigin,
          securityAlertResponse: mockSecurityAlertResponse,
          sendFlowHistory: mockSendFlowHistory,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      await flushPromises();

      const transactionMeta = controller.state.transactions[0];

      expect(updateSwapsTransactionMock).toHaveBeenCalledTimes(1);
      expect(transactionMeta.txParams.from).toBe(ACCOUNT_MOCK);
      expect(transactionMeta.chainId).toBe(MOCK_NETWORK.chainId);
      expect(transactionMeta.deviceConfirmedOn).toBe(mockDeviceConfirmedOn);
      expect(transactionMeta.origin).toBe(mockOrigin);
      expect(transactionMeta.status).toBe(TransactionStatus.unapproved);
      expect(transactionMeta.securityAlertResponse).toStrictEqual(
        mockSecurityAlertResponse,
      );
      expect(controller.state.transactions[0].sendFlowHistory).toStrictEqual(
        mockSendFlowHistory,
      );
      expect(controller.state.transactions[0].isFirstTimeInteraction).toBe(
        true,
      );
    });

    it.each([
      [TransactionEnvelopeType.legacy],
      [
        TransactionEnvelopeType.feeMarket,
        {
          maxFeePerGas: '0x1',
          maxPriorityFeePerGas: '0x1',
        },
        {
          getCurrentNetworkEIP1559Compatibility: async () => true,
          getCurrentAccountEIP1559Compatibility: async () => true,
        },
      ],
      [TransactionEnvelopeType.accessList, { accessList: [] }],
      [TransactionEnvelopeType.setCode, { authorizationList: [] }],
    ])(
      'sets txParams.type to %s if not defined in given txParams',
      async (
        type: TransactionEnvelopeType,
        extraTxParamsToSet: Partial<TransactionParams> = {},
        options: Partial<
          ConstructorParameters<typeof TransactionController>[0]
        > = {},
      ) => {
        const { controller } = setupController({ options });

        await controller.addTransaction(
          { from: ACCOUNT_MOCK, to: ACCOUNT_MOCK, ...extraTxParamsToSet },
          { networkClientId: NETWORK_CLIENT_ID_MOCK },
        );

        expect(controller.state.transactions[0].txParams.type).toBe(type);
      },
    );

    it('does not check account address relationship if a transaction with the same from, to, and chainId exists', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: '1',
                chainId: MOCK_NETWORK.chainId,
                networkClientId: NETWORK_CLIENT_ID_MOCK,
                status: TransactionStatus.confirmed as const,
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                  to: ACCOUNT_MOCK,
                },
                isFirstTimeInteraction: false, // Ensure this is set
              },
            ],
          },
        },
      });

      // Add second transaction with the same from, to, and chainId
      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      await flushPromises();

      expect(controller.state.transactions[1].isFirstTimeInteraction).toBe(
        false,
      );
    });

    it('does not update first time interaction properties if disabled', async () => {
      const { controller } = setupController({
        options: { isFirstTimeInteractionEnabled: () => false },
      });

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      await flushPromises();

      expect(getAccountAddressRelationshipMock).not.toHaveBeenCalled();
    });

    describe('networkClientId exists in the MultichainTrackingHelper', () => {
      it('adds unapproved transaction to state when using networkClientId', async () => {
        const { controller } = setupController();
        const sepoliaTxParams: TransactionParams = {
          chainId: ChainId.sepolia,
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        };

        multichainTrackingHelperMock.has.mockReturnValue(true);

        await controller.addTransaction(sepoliaTxParams, {
          origin: 'metamask',
          actionId: ACTION_ID_MOCK,
          networkClientId: InfuraNetworkType.sepolia,
        });

        const transactionMeta = controller.state.transactions[0];

        expect(transactionMeta.txParams.from).toStrictEqual(
          sepoliaTxParams.from,
        );
        expect(transactionMeta.chainId).toStrictEqual(CHAIN_ID_MOCK);
        expect(transactionMeta.networkClientId).toBe('sepolia');
        expect(transactionMeta.origin).toBe('metamask');
      });

      it('adds unapproved transaction with networkClientId and can be updated to submitted', async () => {
        const { controller, messenger } = setupController({
          messengerOptions: {
            addTransactionApprovalRequest: {
              state: 'approved',
            },
          },
        });
        multichainTrackingHelperMock.has.mockReturnValue(true);

        const submittedEventListener = jest.fn();
        messenger.subscribe(
          'TransactionController:transactionSubmitted',
          submittedEventListener,
        );

        const sepoliaTxParams: TransactionParams = {
          chainId: ChainId.sepolia,
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        };

        const { result } = await controller.addTransaction(sepoliaTxParams, {
          origin: 'metamask',
          actionId: ACTION_ID_MOCK,
          networkClientId: InfuraNetworkType.sepolia,
        });

        await result;

        const { txParams, status, networkClientId, chainId } =
          controller.state.transactions[0];
        expect(submittedEventListener).toHaveBeenCalledTimes(1);
        expect(txParams.from).toBe(ACCOUNT_MOCK);
        expect(networkClientId).toBe('sepolia');
        expect(chainId).toBe(CHAIN_ID_MOCK);
        expect(status).toBe(TransactionStatus.submitted);
      });
    });

    it('generates initial history', async () => {
      const { controller } = setupController();

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      const expectedInitialSnapshot = {
        actionId: undefined,
        batchId: undefined,
        chainId: expect.any(String),
        dappSuggestedGasFees: undefined,
        delegationAddress: undefined,
        deviceConfirmedOn: undefined,
        disableGasBuffer: undefined,
        id: expect.any(String),
        isFirstTimeInteraction: undefined,
        nestedTransactions: undefined,
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        origin: undefined,
        securityAlertResponse: undefined,
        sendFlowHistory: expect.any(Array),
        status: TransactionStatus.unapproved as const,
        time: expect.any(Number),
        txParams: expect.anything(),
        userEditedGasLimit: false,
        type: TransactionType.simpleSend,
        verifiedOnBlockchain: expect.any(Boolean),
      };

      // Expect initial snapshot to be in place
      expect(controller.state.transactions[0].history).toStrictEqual([
        expectedInitialSnapshot,
      ]);
    });

    describe('adds dappSuggestedGasFees to transaction', () => {
      it.each([
        ['origin is MM', ORIGIN_METAMASK],
        ['origin is not defined', undefined],
        ['no fee information is given', 'MockDappOrigin'],
      ])('as undefined if %s', async (_testName, origin) => {
        const { controller } = setupController();
        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            origin,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );
        expect(
          controller.state.transactions[0]?.dappSuggestedGasFees,
        ).toBeUndefined();
      });

      it.each<[keyof DappSuggestedGasFees, TransactionEnvelopeType]>([
        ['gasPrice', TransactionEnvelopeType.legacy],
        ['maxFeePerGas', TransactionEnvelopeType.feeMarket],
        ['maxPriorityFeePerGas', TransactionEnvelopeType.feeMarket],
        ['gas', TransactionEnvelopeType.feeMarket],
      ])(
        'if %s is defined',
        async (
          gasPropName: keyof DappSuggestedGasFees,
          type: TransactionEnvelopeType,
        ) => {
          const { controller } = setupController();
          const mockDappOrigin = 'MockDappOrigin';
          const mockGasValue = '0x1';
          await controller.addTransaction(
            {
              from: ACCOUNT_MOCK,
              to: ACCOUNT_MOCK,
              type,
              [gasPropName]: mockGasValue,
            },
            {
              origin: mockDappOrigin,
              networkClientId: NETWORK_CLIENT_ID_MOCK,
            },
          );
          expect(
            controller.state.transactions[0]?.dappSuggestedGasFees?.[
              gasPropName
            ],
          ).toBe(mockGasValue);
        },
      );
    });

    it('adds unapproved transaction to state after switching to Infura network', async () => {
      const { controller, changeNetwork } = setupController({
        network: {
          state: {
            selectedNetworkClientId: InfuraNetworkType.sepolia,
          },
        },
      });
      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.mainnet });

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      expect(controller.state.transactions[0].txParams.from).toBe(ACCOUNT_MOCK);
      expect(controller.state.transactions[0].chainId).toBe(CHAIN_ID_MOCK);
      expect(controller.state.transactions[0].status).toBe(
        TransactionStatus.unapproved,
      );
    });

    it('adds unapproved transaction to state after switching to custom network', async () => {
      const { controller, changeNetwork } = setupController({
        network: {
          state: {
            selectedNetworkClientId: InfuraNetworkType.sepolia,
          },
        },
        mockNetworkClientConfigurationsByNetworkClientId: {
          'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
            chainId: '0x1337',
          }),
        },
      });
      changeNetwork({ selectedNetworkClientId: 'AAAA-BBBB-CCCC-DDDD' });

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          networkClientId: 'AAAA-BBBB-CCCC-DDDD',
        },
      );

      expect(controller.state.transactions[0].txParams.from).toBe(ACCOUNT_MOCK);
      expect(controller.state.transactions[0].chainId).toBe(CHAIN_ID_MOCK);
      expect(controller.state.transactions[0].status).toBe(
        TransactionStatus.unapproved,
      );
    });

    it('throws if address invalid', async () => {
      const { controller } = setupController();
      await expect(
        controller.addTransaction(
          { from: 'foo' },
          { networkClientId: NETWORK_CLIENT_ID_MOCK },
        ),
      ).rejects.toThrow('Invalid "from" address');
    });

    it('increments nonce when adding a new non-cancel non-speedup transaction', async () => {
      uuidModuleMock.v1
        .mockImplementationOnce(() => 'aaaab1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')
        .mockImplementationOnce(() => 'bbbb1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');

      const { controller } = setupController({
        messengerOptions: {
          addTransactionApprovalRequest: {
            state: 'approved',
          },
        },
      });

      const { result: firstResult } = await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          gas: '0x0',
          gasPrice: '0x50fd51da',
          to: ACCOUNT_MOCK,
          value: '0x0',
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      await firstResult.catch(() => undefined);

      const firstTransaction = controller.state.transactions[0];

      // eslint-disable-next-line jest/prefer-spy-on
      multichainTrackingHelperMock.getNonceLock = jest.fn().mockResolvedValue({
        nextNonce: NONCE_MOCK + 1,
        releaseLock: () => Promise.resolve(),
      });

      const { result: secondResult } = await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          gas: '0x2',
          gasPrice: '0x50fd51da',
          to: ACCOUNT_MOCK,
          value: '0x1290',
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      await secondResult.catch(() => undefined);

      expect(controller.state.transactions).toHaveLength(2);
      const secondTransaction = controller.state.transactions[1];

      expect(firstTransaction.txParams.nonce).toBe(
        `0x${NONCE_MOCK.toString(16)}`,
      );

      expect(secondTransaction.txParams.nonce).toBe(
        `0x${(NONCE_MOCK + 1).toString(16)}`,
      );
    });

    it('requests approval using the approval controller', async () => {
      const { controller, messenger } = setupController();
      const messengerCallSpy = jest.spyOn(messenger, 'call');

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      expect(
        messengerCallSpy.mock.calls.filter(
          (args) => args[0] === 'ApprovalController:addRequest',
        ),
      ).toHaveLength(1);
      expect(messengerCallSpy).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          id: expect.any(String),
          origin: 'metamask',
          type: 'transaction',
          requestData: { txId: expect.any(String) },
          expectsResult: true,
        },
        true,
      );
    });

    it('skips approval if option explicitly false', async () => {
      const { controller, messenger } = setupController();
      jest.spyOn(messenger, 'call');

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          requireApproval: false,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      expect(messenger.call).not.toHaveBeenCalledWith(
        'ApprovalController:addRequest',
      );
    });

    it('calls security provider with transaction meta and sets response in to securityProviderResponse', async () => {
      const mockRPCMethodName = 'MOCK_RPC_METHOD_NAME';
      const mockSecurityProviderResponse = {
        flagAsDangerous: 1,
        info: 'Mock info',
      };
      const securityProviderRequestMock = jest
        .fn()
        .mockResolvedValue(mockSecurityProviderResponse);

      const { controller } = setupController({
        options: {
          securityProviderRequest: securityProviderRequestMock,
        },
      });

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          method: mockRPCMethodName,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      expect(securityProviderRequestMock).toHaveBeenCalledTimes(1);
      expect(securityProviderRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: MOCK_V1_UUID,
        }),
        mockRPCMethodName,
      );

      const { securityProviderResponse } = controller.state.transactions[0];
      expect(securityProviderResponse).toStrictEqual(
        mockSecurityProviderResponse,
      );
    });

    it('updates gas properties', async () => {
      const { controller } = setupController();

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      expect(updateGasMock).toHaveBeenCalledTimes(1);
      expect(updateGasMock).toHaveBeenCalledWith({
        chainId: CHAIN_ID_MOCK,
        ethQuery: expect.any(Object),
        isCustomNetwork: false,
        isSimulationEnabled: true,
        messenger: expect.any(Object),
        txMeta: expect.any(Object),
      });
    });

    it('updates gas fee properties', async () => {
      const { controller } = setupController({
        options: {
          getCurrentNetworkEIP1559Compatibility: async () => true,
          getCurrentAccountEIP1559Compatibility: async () => true,
        },
      });

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      expect(updateGasFeesMock).toHaveBeenCalledTimes(1);
      expect(updateGasFeesMock).toHaveBeenCalledWith({
        eip1559: true,
        ethQuery: expect.any(Object),
        gasFeeFlows: [
          randomisedEstimationsGasFeeFlowMock,
          lineaGasFeeFlowMock,
          defaultGasFeeFlowMock,
        ],
        getGasFeeEstimates: expect.any(Function),
        getSavedGasFees: expect.any(Function),
        messenger: expect.any(Object),
        txMeta: expect.any(Object),
      });
    });

    it('adds delegration address to metadata', async () => {
      const { controller } = setupController();

      getDelegationAddressMock.mockResolvedValueOnce(ACCOUNT_MOCK);

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      expect(controller.state.transactions[0].delegationAddress).toBe(
        ACCOUNT_MOCK,
      );
    });

    describe('with afterAdd hook', () => {
      it('calls afterAdd hook', async () => {
        const afterAddHook = jest.fn().mockResolvedValueOnce({});

        const { controller } = setupController({
          options: {
            hooks: {
              afterAdd: afterAddHook,
            },
          },
        });

        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        expect(afterAddHook).toHaveBeenCalledTimes(1);
      });

      it('updates transaction if update callback returned', async () => {
        const updateTransactionMock = jest.fn();

        const afterAddHook = jest
          .fn()
          .mockResolvedValueOnce({ updateTransaction: updateTransactionMock });

        const { controller } = setupController({
          options: {
            hooks: {
              afterAdd: afterAddHook,
            },
          },
        });

        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        expect(updateTransactionMock).toHaveBeenCalledTimes(1);
        expect(updateTransactionMock).toHaveBeenCalledWith(
          expect.objectContaining({
            id: expect.any(String),
          }),
        );
      });

      it('saves original transaction params if update callback returned', async () => {
        const updateTransactionMock = jest.fn();

        const afterAddHook = jest
          .fn()
          .mockResolvedValueOnce({ updateTransaction: updateTransactionMock });

        const { controller } = setupController({
          options: {
            hooks: {
              afterAdd: afterAddHook,
            },
          },
        });

        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        expect(controller.state.transactions[0].txParamsOriginal).toStrictEqual(
          expect.objectContaining({
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          }),
        );
      });
    });

    describe('with afterSimulate hook', () => {
      it('calls afterSimulate hook', async () => {
        const afterSimulateHook = jest.fn().mockResolvedValueOnce({});

        const { controller } = setupController({
          options: {
            hooks: {
              afterSimulate: afterSimulateHook,
            },
          },
        });

        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        await flushPromises();

        expect(afterSimulateHook).toHaveBeenCalledTimes(1);
      });

      it('updates transaction if update callback returned', async () => {
        const updateTransactionMock = jest.fn();

        const afterSimulateHook = jest
          .fn()
          .mockResolvedValueOnce({ updateTransaction: updateTransactionMock });

        const { controller } = setupController({
          options: {
            hooks: {
              afterSimulate: afterSimulateHook,
            },
          },
        });

        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        await flushPromises();

        expect(updateTransactionMock).toHaveBeenCalledTimes(1);
      });

      it('saves original transaction params if update callback returned', async () => {
        const updateTransactionMock = jest.fn();

        const afterSimulateHook = jest
          .fn()
          .mockResolvedValueOnce({ updateTransaction: updateTransactionMock });

        const { controller } = setupController({
          options: {
            hooks: {
              afterSimulate: afterSimulateHook,
            },
          },
        });

        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        await flushPromises();

        expect(controller.state.transactions[0].txParamsOriginal).toStrictEqual(
          expect.objectContaining({
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          }),
        );
      });

      it('will re-simulate balance changes if hook returns skipSimulation as false', async () => {
        const afterSimulateHook = jest
          .fn()
          .mockResolvedValue({ skipSimulation: false });

        const { controller } = setupController({
          options: {
            hooks: {
              afterSimulate: afterSimulateHook,
            },
          },
        });

        const { transactionMeta } = await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        await flushPromises();

        shouldResimulateMock.mockReturnValue({
          blockTime: 123,
          resimulate: true,
        });

        await controller.updateEditableParams(transactionMeta.id, {});

        expect(getBalanceChangesMock).toHaveBeenCalledTimes(2);
      });

      it('will not re-simulate balance changes if hook returns skipSimulation as true', async () => {
        const afterSimulateHook = jest
          .fn()
          .mockResolvedValue({ skipSimulation: true });

        const { controller } = setupController({
          options: {
            hooks: {
              afterSimulate: afterSimulateHook,
            },
          },
        });

        const { transactionMeta } = await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        await flushPromises();

        shouldResimulateMock.mockReturnValue({
          blockTime: 123,
          resimulate: true,
        });

        await controller.updateEditableParams(transactionMeta.id, {});

        await flushPromises();

        expect(getBalanceChangesMock).toHaveBeenCalledTimes(1);
      });
    });

    describe('with beforeSign hook', () => {
      it('calls beforeSign hook', async () => {
        const beforeSignHook = jest.fn().mockResolvedValueOnce({});

        const { controller } = setupController({
          messengerOptions: {
            addTransactionApprovalRequest: {
              state: 'approved',
            },
          },
          options: {
            hooks: {
              beforeSign: beforeSignHook,
            },
          },
        });

        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        await flushPromises();

        expect(beforeSignHook).toHaveBeenCalledTimes(1);
      });

      it('updates transaction if update callback returned', async () => {
        const updateTransactionMock = jest.fn();

        const beforeSignHook = jest
          .fn()
          .mockResolvedValueOnce({ updateTransaction: updateTransactionMock });

        const { controller } = setupController({
          messengerOptions: {
            addTransactionApprovalRequest: {
              state: 'approved',
            },
          },
          options: {
            hooks: {
              beforeSign: beforeSignHook,
            },
          },
        });

        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        await flushPromises();

        expect(updateTransactionMock).toHaveBeenCalledTimes(1);
      });
    });

    describe('updates simulation data', () => {
      it('by default', async () => {
        getBalanceChangesMock.mockResolvedValueOnce(
          SIMULATION_DATA_RESULT_MOCK,
        );

        const { controller } = setupController();

        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        await flushPromises();

        expect(getBalanceChangesMock).toHaveBeenCalledTimes(1);
        expect(getBalanceChangesMock).toHaveBeenCalledWith({
          blockTime: undefined,
          chainId: MOCK_NETWORK.chainId,
          ethQuery: expect.any(Object),
          nestedTransactions: undefined,
          txParams: {
            data: undefined,
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
            type: TransactionEnvelopeType.legacy,
            value: '0x0',
          },
        });

        expect(controller.state.transactions[0].simulationData).toStrictEqual(
          SIMULATION_DATA_RESULT_MOCK,
        );
      });

      it('with error if simulation disabled', async () => {
        getBalanceChangesMock.mockResolvedValueOnce(
          SIMULATION_DATA_RESULT_MOCK,
        );

        const { controller } = setupController({
          options: { isSimulationEnabled: () => false },
        });

        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        expect(getBalanceChangesMock).toHaveBeenCalledTimes(0);
        expect(controller.state.transactions[0].simulationData).toStrictEqual({
          error: {
            code: SimulationErrorCode.Disabled,
            message: 'Simulation disabled',
          },
          tokenBalanceChanges: [],
        });
      });

      it('unless approval not required', async () => {
        getBalanceChangesMock.mockResolvedValueOnce(
          SIMULATION_DATA_RESULT_MOCK,
        );

        const { controller } = setupController();

        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          { requireApproval: false, networkClientId: NETWORK_CLIENT_ID_MOCK },
        );

        expect(getBalanceChangesMock).toHaveBeenCalledTimes(0);
        expect(controller.state.transactions[0].simulationData).toBeUndefined();
      });
    });

    describe('updates gas fee tokens', () => {
      it('by default', async () => {
        getGasFeeTokensMock.mockResolvedValueOnce([GAS_FEE_TOKEN_MOCK]);

        const { controller } = setupController();

        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        await flushPromises();

        expect(controller.state.transactions[0].gasFeeTokens).toStrictEqual([
          GAS_FEE_TOKEN_MOCK,
        ]);
      });

      it('unless approval not required', async () => {
        getGasFeeTokensMock.mockResolvedValueOnce([GAS_FEE_TOKEN_MOCK]);

        const { controller } = setupController();

        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          { requireApproval: false, networkClientId: NETWORK_CLIENT_ID_MOCK },
        );

        expect(getBalanceChangesMock).toHaveBeenCalledTimes(0);
        expect(controller.state.transactions[0].gasFeeTokens).toBeUndefined();
      });
    });

    describe('on approve', () => {
      it('submits transaction', async () => {
        const { controller, messenger } = setupController({
          messengerOptions: {
            addTransactionApprovalRequest: {
              state: 'approved',
            },
          },
        });
        const submittedEventListener = jest.fn();
        messenger.subscribe(
          'TransactionController:transactionSubmitted',
          submittedEventListener,
        );

        const { result } = await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            gas: '0x0',
            gasPrice: '0x0',
            to: ACCOUNT_MOCK,
            value: '0x0',
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        await result;

        expect(controller.state.transactions).toMatchObject([
          expect.objectContaining({
            txParams: expect.objectContaining({
              from: ACCOUNT_MOCK,
              nonce: toHex(NONCE_MOCK),
            }),
            status: TransactionStatus.submitted,
            submittedTime: expect.any(Number),
          }),
        ]);

        expect(submittedEventListener).toHaveBeenCalledTimes(1);
        expect(submittedEventListener).toHaveBeenCalledWith({
          transactionMeta: expect.objectContaining({
            txParams: expect.objectContaining({
              from: ACCOUNT_MOCK,
              nonce: toHex(NONCE_MOCK),
            }),
            status: TransactionStatus.submitted,
            submittedTime: expect.any(Number),
          }),
        });
      });

      it('reports success to approval acceptor', async () => {
        const successCallback = jest.fn();
        const { controller } = setupController({
          messengerOptions: {
            addTransactionApprovalRequest: {
              state: 'approved',
              result: {
                resultCallbacks: {
                  success: successCallback,
                  error: () => {
                    // do nothing
                  },
                },
              },
            },
          },
        });

        const { result } = await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        await result;

        expect(successCallback).toHaveBeenCalledTimes(1);
      });

      it('reports error to approval acceptor on error', async () => {
        const errorCallback = jest.fn();
        const { controller } = setupController({
          options: { sign: undefined },
          messengerOptions: {
            addTransactionApprovalRequest: {
              state: 'approved',
              result: {
                resultCallbacks: {
                  success: () => {
                    // do nothing
                  },
                  error: errorCallback,
                },
              },
            },
          },
        });

        const { result } = await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        try {
          await result;
        } catch {
          // Expected error
        }

        expect(errorCallback).toHaveBeenCalledTimes(1);
      });

      it('updates transaction if approval result includes updated metadata', async () => {
        const { controller, mockTransactionApprovalRequest } =
          setupController();

        const { result } = await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        const transaction = controller.state.transactions[0];

        mockTransactionApprovalRequest.approve({
          value: {
            txMeta: { ...transaction, customNonceValue: '123' },
          },
        });

        await result;

        expect(controller.state.transactions).toStrictEqual([
          expect.objectContaining({
            customNonceValue: '123',
          }),
        ]);
      });

      it('uses extra transactions publish hook if batch transactions in metadata', async () => {
        const { controller } = setupController({
          messengerOptions: {
            addTransactionApprovalRequest: {
              state: 'approved',
            },
          },
        });

        const publishHook: jest.MockedFn<PublishHook> = jest.fn();

        publishHook.mockResolvedValueOnce({
          transactionHash: TRANSACTION_HASH_MOCK,
        });

        const extraTransactionsPublishHook = jest.mocked(
          ExtraTransactionsPublishHook,
        );

        extraTransactionsPublishHook.mockReturnValue({
          getHook: () => publishHook,
        } as unknown as ExtraTransactionsPublishHook);

        const { result, transactionMeta } = await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        controller.updateBatchTransactions({
          transactionId: transactionMeta.id,
          batchTransactions: [
            { data: DATA_MOCK, to: ACCOUNT_2_MOCK, value: VALUE_MOCK },
          ],
        });

        result.catch(() => {
          // Intentionally empty
        });

        await flushPromises();

        expect(ExtraTransactionsPublishHook).toHaveBeenCalledTimes(1);
        expect(ExtraTransactionsPublishHook).toHaveBeenCalledWith({
          addTransactionBatch: expect.any(Function),
          transactions: [
            { data: DATA_MOCK, to: ACCOUNT_2_MOCK, value: VALUE_MOCK },
          ],
        });

        expect(publishHook).toHaveBeenCalledTimes(1);
      });

      it('skips signing if isExternalSign is true', async () => {
        const { controller, mockTransactionApprovalRequest } =
          setupController();

        const { result, transactionMeta } = await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            gas: '0x0',
            gasPrice: '0x0',
            to: ACCOUNT_MOCK,
            value: '0x0',
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        mockTransactionApprovalRequest.approve({
          value: {
            txMeta: {
              ...transactionMeta,
              isExternalSign: true,
            },
          },
        });

        await result;

        expect(signMock).not.toHaveBeenCalled();

        expect(controller.state.transactions).toMatchObject([
          expect.objectContaining({
            status: TransactionStatus.submitted,
          }),
        ]);
      });

      describe('fails', () => {
        /**
         * Test template to assert adding and submitting a transaction fails.
         *
         * @param controller - The controller instance.
         * @param expectedError - The expected error message.
         */
        async function expectTransactionToFail(
          controller: TransactionController,
          expectedError: string,
        ) {
          const { result } = await controller.addTransaction(
            {
              from: ACCOUNT_MOCK,
              to: ACCOUNT_MOCK,
            },
            {
              networkClientId: NETWORK_CLIENT_ID_MOCK,
            },
          );

          await expect(result).rejects.toThrow(expectedError);

          const { txParams, status } = controller.state.transactions[0];
          expect(txParams.from).toBe(ACCOUNT_MOCK);
          expect(txParams.to).toBe(ACCOUNT_MOCK);
          expect(status).toBe(TransactionStatus.failed);
        }

        it('if signing error', async () => {
          const { controller } = setupController({
            options: {
              sign: () => {
                throw new Error('foo');
              },
            },
            messengerOptions: {
              addTransactionApprovalRequest: {
                state: 'approved',
              },
            },
          });

          await expectTransactionToFail(controller, 'foo');
        });

        it('if no sign method defined', async () => {
          const { controller } = setupController({
            options: {
              sign: undefined,
            },
            messengerOptions: {
              addTransactionApprovalRequest: {
                state: 'approved',
              },
            },
          });

          await expectTransactionToFail(controller, 'No sign method defined');
        });

        it('if unexpected status', async () => {
          const { controller } = setupController({
            messengerOptions: {
              addTransactionApprovalRequest: {
                state: TransactionStatus.rejected,
                error: new Error('Unknown problem'),
              },
            },
          });

          const { result } = await controller.addTransaction(
            {
              from: ACCOUNT_MOCK,
              gas: '0x0',
              gasPrice: '0x0',
              to: ACCOUNT_MOCK,
              value: '0x0',
            },
            {
              networkClientId: NETWORK_CLIENT_ID_MOCK,
            },
          );

          await expect(result).rejects.toThrow('Unknown problem');
        });

        it('if unrecognised error', async () => {
          const { controller } = setupController({
            messengerOptions: {
              addTransactionApprovalRequest: {
                state: TransactionStatus.rejected,
                error: new Error('TestError'),
              },
            },
          });

          const { result } = await controller.addTransaction(
            {
              from: ACCOUNT_MOCK,
              gas: '0x0',
              gasPrice: '0x0',
              to: ACCOUNT_MOCK,
              value: '0x0',
            },
            {
              networkClientId: NETWORK_CLIENT_ID_MOCK,
            },
          );

          await expect(result).rejects.toThrow('TestError');
        });

        it('if transaction removed', async () => {
          const { controller, mockTransactionApprovalRequest } =
            setupController();

          const { result } = await controller.addTransaction(
            {
              from: ACCOUNT_MOCK,
              gas: '0x0',
              gasPrice: '0x0',
              to: ACCOUNT_MOCK,
              value: '0x0',
            },
            {
              networkClientId: NETWORK_CLIENT_ID_MOCK,
            },
          );

          controller.clearUnapprovedTransactions();
          mockTransactionApprovalRequest.reject(new Error('Unknown problem'));

          await expect(result).rejects.toThrow('Unknown problem');
        });
      });
    });

    describe('on reject', () => {
      it('cancels transaction', async () => {
        const { controller, messenger } = setupController({
          messengerOptions: {
            addTransactionApprovalRequest: {
              state: 'rejected',
            },
          },
        });

        const { result } = await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        const finishedPromise = waitForTransactionFinished(messenger);

        await expect(result).rejects.toThrow(
          'MetaMask Tx Signature: User denied transaction signature.',
        );

        const { txParams, status } = await finishedPromise;
        expect(txParams.from).toBe(ACCOUNT_MOCK);
        expect(status).toBe(TransactionStatus.rejected);
      });

      it('publishes TransactionController:transactionRejected and TransactionController:transactionFinished', async () => {
        const { controller, messenger } = setupController({
          messengerOptions: {
            addTransactionApprovalRequest: {
              state: 'rejected',
            },
          },
        });
        const rejectedEventListener = jest.fn();

        messenger.subscribe(
          'TransactionController:transactionRejected',
          rejectedEventListener,
        );

        const mockActionId = 'mockActionId';

        const { result } = await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            actionId: mockActionId,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        const finishedPromise = waitForTransactionFinished(messenger);

        try {
          await result;
        } catch {
          // Ignore user rejected error as it is expected
        }
        await finishedPromise;

        expect(rejectedEventListener).toHaveBeenCalledTimes(1);
        expect(rejectedEventListener).toHaveBeenCalledWith(
          expect.objectContaining({
            transactionMeta: expect.objectContaining({
              status: 'rejected',
            }),
            actionId: mockActionId,
          }),
        );
      });

      it('publishes TransactionController:transactionRejected if error is rejected upgrade', async () => {
        const error = {
          code: ErrorCode.RejectedUpgrade,
        };

        const { controller, messenger } = setupController({
          messengerOptions: {
            addTransactionApprovalRequest: {
              state: 'rejected',
              error,
            },
          },
        });

        const rejectedEventListener = jest.fn();

        messenger.subscribe(
          'TransactionController:transactionRejected',
          rejectedEventListener,
        );

        const { result } = await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        const finishedPromise = waitForTransactionFinished(messenger);

        try {
          await result;
        } catch {
          // Ignore user rejected error as it is expected
        }
        await finishedPromise;

        expect(rejectedEventListener).toHaveBeenCalledTimes(1);
        expect(rejectedEventListener).toHaveBeenCalledWith(
          expect.objectContaining({
            transactionMeta: expect.objectContaining({
              error,
              status: 'rejected',
            }),
          }),
        );
      });

      it('throws with correct error code if approval request is rejected due to upgrade', async () => {
        const error = {
          code: ErrorCode.RejectedUpgrade,
        };

        const { controller } = setupController({
          messengerOptions: {
            addTransactionApprovalRequest: {
              state: 'rejected',
              error,
            },
          },
        });

        const { result } = await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        await expect(result).rejects.toHaveProperty(
          'code',
          ErrorCode.RejectedUpgrade,
        );
      });
    });

    describe('checks from address origin', () => {
      it('throws if the origin does not have permissions to initiate transactions from the specified address', async () => {
        const { controller } = setupController();
        const expectedOrigin = 'originMocked';
        await expect(
          controller.addTransaction(
            { from: ACCOUNT_2_MOCK, to: ACCOUNT_MOCK },
            { origin: expectedOrigin, networkClientId: NETWORK_CLIENT_ID_MOCK },
          ),
        ).rejects.toThrow(
          providerErrors.unauthorized({ data: { origin: expectedOrigin } }),
        );
      });
    });

    describe('updates submit history', () => {
      it('adds entry to start of array', async () => {
        const { controller } = setupController({
          messengerOptions: {
            addTransactionApprovalRequest: {
              state: 'approved',
            },
          },
          options: {
            state: {
              submitHistory: [
                {
                  chainId: CHAIN_IDS.LINEA_MAINNET,
                } as unknown as SubmitHistoryEntry,
              ],
            },
          },
        });

        const { result } = await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          { origin: ORIGIN_METAMASK, networkClientId: NETWORK_CLIENT_ID_MOCK },
        );

        await result;

        expect(controller.state.submitHistory).toStrictEqual([
          {
            chainId: MOCK_NETWORK.chainId,
            hash: TRANSACTION_HASH_MOCK,
            networkType: NETWORK_CLIENT_ID_MOCK,
            networkUrl: undefined,
            origin: ORIGIN_METAMASK,
            rawTransaction: expect.stringContaining('0x'),
            time: expect.any(Number),
            transaction: {
              from: ACCOUNT_MOCK,
              nonce: '0xc',
              to: ACCOUNT_MOCK,
              type: TransactionEnvelopeType.legacy,
              value: '0x0',
            },
          },
          {
            chainId: CHAIN_IDS.LINEA_MAINNET,
          },
        ]);
      });

      it('removes last entry if reached maximum size', async () => {
        const existingSubmitHistory = Array(100);

        existingSubmitHistory[99] = {
          chainId: CHAIN_IDS.LINEA_MAINNET,
        } as unknown as SubmitHistoryEntry;

        const { controller } = setupController({
          messengerOptions: {
            addTransactionApprovalRequest: {
              state: 'approved',
            },
          },
          options: {
            state: {
              submitHistory: existingSubmitHistory,
            },
          },
        });

        const { result } = await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            origin: ORIGIN_METAMASK,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

        await result;

        expect(controller.state.submitHistory).toHaveLength(100);
        expect(controller.state.submitHistory[0]).toStrictEqual(
          expect.objectContaining({
            chainId: MOCK_NETWORK.chainId,
            origin: ORIGIN_METAMASK,
          }),
        );
        expect(controller.state.submitHistory[99]).toBeUndefined();
      });
    });

    describe('with batch ID', () => {
      it('throws if duplicate and external origin', async () => {
        const { controller } = setupController({
          options: {
            state: {
              transactions: [
                {
                  batchId: BATCH_ID_MOCK,
                } as unknown as TransactionMeta,
              ],
            },
          },
          updateToInitialState: true,
        });

        const txParams = {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        };

        await expect(
          controller.addTransaction(txParams, {
            batchId: BATCH_ID_MOCK,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
            origin: ORIGIN_MOCK,
          }),
        ).rejects.toThrow('Batch ID already exists');
      });

      it('throws if duplicate with different case and external origin', async () => {
        const { controller } = setupController({
          options: {
            state: {
              transactions: [
                {
                  batchId: BATCH_ID_MOCK.toLowerCase(),
                } as unknown as TransactionMeta,
              ],
            },
          },
          updateToInitialState: true,
        });

        const txParams = {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        };

        await expect(
          controller.addTransaction(txParams, {
            batchId: BATCH_ID_MOCK.toUpperCase() as Hex,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
            origin: ORIGIN_MOCK,
          }),
        ).rejects.toThrow('Batch ID already exists');
      });

      it('does not throw if duplicate but internal origin', async () => {
        const { controller } = setupController({
          options: {
            state: {
              transactions: [
                {
                  batchId: BATCH_ID_MOCK,
                } as unknown as TransactionMeta,
              ],
            },
          },
          updateToInitialState: true,
        });

        const txParams = {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        };

        await controller.addTransaction(txParams, {
          batchId: BATCH_ID_MOCK,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        });
      });
    });
  });

  describe('wipeTransactions', () => {
    it('removes all transactions on current network', async () => {
      const { controller } = setupController();

      controller.wipeTransactions();

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      controller.wipeTransactions();

      expect(controller.state.transactions).toHaveLength(0);
    });

    it('removes only txs with given address', async () => {
      const mockFromAccount1 = '0x1bf137f335ea1b8f193b8f6ea92561a60d23a207';
      const mockFromAccount2 = '0x2bf137f335ea1b8f193b8f6ea92561a60d23a207';
      const mockCurrentChainId = toHex(5);
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: '1',
                chainId: mockCurrentChainId,
                networkClientId: NETWORK_CLIENT_ID_MOCK,
                status: TransactionStatus.confirmed as const,
                time: 123456789,
                txParams: {
                  from: mockFromAccount1,
                },
              },
              {
                id: '2',
                chainId: mockCurrentChainId,
                networkClientId: NETWORK_CLIENT_ID_MOCK,
                status: TransactionStatus.confirmed as const,
                time: 987654321,
                txParams: {
                  from: mockFromAccount2,
                },
              },
            ],
          },
        },
      });

      controller.wipeTransactions({ address: mockFromAccount2 });

      expect(controller.state.transactions).toHaveLength(1);
      expect(controller.state.transactions[0].id).toBe('1');
    });

    it('removes only txs with given address only on current network', async () => {
      const mockFromAccount1 = '0x1bf137f335ea1b8f193b8f6ea92561a60d23a207';
      const mockDifferentChainId = toHex(1);
      const mockCurrentChainId = toHex(5);
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: '1',
                chainId: mockCurrentChainId,
                networkClientId: NETWORK_CLIENT_ID_MOCK,
                txParams: {
                  from: mockFromAccount1,
                },
                status: TransactionStatus.confirmed as const,
                time: 123456789,
              },
              {
                id: '4',
                chainId: mockDifferentChainId,
                networkClientId: NETWORK_CLIENT_ID_MOCK,
                txParams: {
                  from: mockFromAccount1,
                },
                status: TransactionStatus.confirmed as const,
                time: 987654321,
              },
            ],
          },
        },
      });

      controller.wipeTransactions({
        chainId: mockCurrentChainId,
        address: mockFromAccount1,
      });

      expect(controller.state.transactions).toHaveLength(1);
      expect(controller.state.transactions[0].id).toBe('4');
    });

    it('removes incoming transactions to specified account', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              { ...TRANSACTION_META_MOCK, type: TransactionType.incoming },
            ],
          },
        },
        updateToInitialState: true,
      });

      expect(controller.state.transactions).toHaveLength(1);

      controller.wipeTransactions({ address: ACCOUNT_2_MOCK });

      expect(controller.state.transactions).toHaveLength(0);
    });
  });

  describe('stopTransaction', () => {
    it('should avoid creating cancel transaction if actionId already exist', async () => {
      const mockActionId = 'mockActionId';
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                actionId: mockActionId,
                id: '2',
                chainId: toHex(5),
                networkClientId: NETWORK_CLIENT_ID_MOCK,
                status: TransactionStatus.submitted,
                type: TransactionType.cancel,
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                },
              },
            ],
          },
        },
      });

      await controller.stopTransaction('2', undefined, {
        actionId: mockActionId,
      });

      expect(controller.state.transactions).toHaveLength(1);
    });

    it('should throw error if transaction already confirmed', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: '2',
                chainId: toHex(5),
                networkClientId: NETWORK_CLIENT_ID_MOCK,
                status: TransactionStatus.submitted,
                type: TransactionType.cancel,
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                  gasPrice: '0x1',
                },
              },
            ],
          },
        },
      });

      jest
        .spyOn(mockEthQuery, 'sendRawTransaction')
        .mockImplementation((_transaction, callback) => {
          callback(new Error('nonce too low'));
        });

      await expect(controller.stopTransaction('2')).rejects.toThrow(
        'Previous transaction is already confirmed',
      );

      // Expect cancel transaction to be submitted - it will fail
      expect(mockEthQuery.sendRawTransaction).toHaveBeenCalledTimes(1);
      expect(controller.state.transactions).toHaveLength(1);
    });

    it('should throw error if publish transaction fails', async () => {
      const error = new Error('Another reason');
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: '2',
                chainId: toHex(5),
                networkClientId: NETWORK_CLIENT_ID_MOCK,
                status: TransactionStatus.submitted,
                type: TransactionType.cancel,
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                  gasPrice: '0x1',
                },
              },
            ],
          },
        },
      });

      jest
        .spyOn(mockEthQuery, 'sendRawTransaction')
        .mockImplementation((_transaction, callback) => {
          callback(error);
        });

      await expect(controller.stopTransaction('2')).rejects.toThrow(error);

      // Expect cancel transaction to be submitted - it will fail
      expect(mockEthQuery.sendRawTransaction).toHaveBeenCalledTimes(1);
      expect(controller.state.transactions).toHaveLength(1);
    });

    it('submits a cancel transaction', async () => {
      const simpleSendTransactionId =
        'simpleeb1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const cancelTransactionId = 'cancel1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const mockNonce = '0x9';
      uuidModuleMock.v1.mockImplementationOnce(() => cancelTransactionId);
      jest
        .spyOn(mockEthQuery, 'sendRawTransaction')
        .mockImplementation((_transaction, callback) => {
          callback(undefined, 'transaction-hash');
        });

      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              // Assume we have a submitted transaction in the state
              {
                id: simpleSendTransactionId,
                chainId: toHex(5),
                networkClientId: NETWORK_CLIENT_ID_MOCK,
                status: TransactionStatus.submitted,
                type: TransactionType.simpleSend,
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                  nonce: mockNonce,
                  gasPrice: '0x1',
                },
              },
            ],
          },
        },
      });

      await controller.stopTransaction(simpleSendTransactionId, undefined, {
        estimatedBaseFee: '0x123',
      });

      const { transactions } = controller.state;

      const cancelTransaction = transactions.find(
        ({ id }) => id === cancelTransactionId,
      );

      // Expect cancel transaction to be submitted
      expect(mockEthQuery.sendRawTransaction).toHaveBeenCalledTimes(1);
      expect(cancelTransaction?.hash).toBe('transaction-hash');
    });

    it('adds cancel transaction to state', async () => {
      const simpleSendTransactionId =
        'simpleeb1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const cancelTransactionId = 'cancel1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const mockNonce = '0x9';
      uuidModuleMock.v1.mockImplementationOnce(() => cancelTransactionId);

      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              // Assume we have a submitted transaction in the state
              {
                id: simpleSendTransactionId,
                chainId: toHex(5),
                networkClientId: NETWORK_CLIENT_ID_MOCK,
                status: TransactionStatus.submitted,
                type: TransactionType.simpleSend,
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                  nonce: mockNonce,
                  gasPrice: '0x1',
                },
              },
            ],
          },
        },
      });

      await controller.stopTransaction(simpleSendTransactionId, undefined, {
        estimatedBaseFee: '0x123',
      });

      const { transactions } = controller.state;

      const simpleSendTransaction = transactions.find(
        ({ id }) => id === simpleSendTransactionId,
      );
      const cancelTransaction = transactions.find(
        ({ id }) => id === cancelTransactionId,
      );

      expect(transactions).toHaveLength(2);
      expect(simpleSendTransaction?.type).toBe(TransactionType.simpleSend);
      expect(simpleSendTransaction?.status).toBe(TransactionStatus.submitted);

      // This nonce provided while adding first transaction
      expect(cancelTransaction?.txParams.nonce).toBe(mockNonce);

      expect(cancelTransaction?.type).toBe(TransactionType.cancel);
      expect(cancelTransaction?.status).toBe(TransactionStatus.submitted);
    });

    it('rejects unknown transaction', async () => {
      const { controller } = setupController();

      await controller.stopTransaction('transactionIdMock', {
        gasPrice: '0x1',
      });

      expect(signMock).toHaveBeenCalledTimes(0);
    });

    it('throws if no sign method', async () => {
      const { controller } = setupController({ options: { sign: undefined } });

      await controller.addTransaction(
        { from: ACCOUNT_MOCK, to: ACCOUNT_MOCK },
        { networkClientId: NETWORK_CLIENT_ID_MOCK },
      );

      await expect(
        controller.stopTransaction(controller.state.transactions[0].id),
      ).rejects.toThrow('No sign method defined');
    });

    it('publishes transaction events', async () => {
      const { controller, messenger, mockTransactionApprovalRequest } =
        setupController({ network: MOCK_LINEA_SEPOLIA_NETWORK });

      const approvedEventListener = jest.fn();
      const submittedEventListener = jest.fn();
      const finishedEventListener = jest.fn();

      const mockActionId = 'mockActionId';

      messenger.subscribe(
        'TransactionController:transactionApproved',
        approvedEventListener,
      );
      messenger.subscribe(
        'TransactionController:transactionSubmitted',
        submittedEventListener,
      );

      const { transactionMeta } = await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          gas: '0x0',
          gasPrice: '0x1',
          to: ACCOUNT_MOCK,
          value: '0x0',
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      messenger.subscribe(
        'TransactionController:transactionFinished',
        finishedEventListener,
      );

      mockTransactionApprovalRequest.approve();

      // Release for add transaction submission
      await flushPromises();

      await controller.stopTransaction(transactionMeta.id, undefined, {
        estimatedBaseFee: '0x123',
        actionId: mockActionId,
      });

      // Release for cancel transaction submission
      await flushPromises();

      const cancelTransaction = controller.state.transactions.find(
        ({ type }) => type === TransactionType.cancel,
      );

      // All expected events should be emitted twice (add and cancel transaction)
      expect(approvedEventListener).toHaveBeenCalledTimes(2);
      expect(approvedEventListener.mock.calls[1][0]).toStrictEqual({
        actionId: mockActionId,
        transactionMeta: cancelTransaction,
      });

      expect(submittedEventListener).toHaveBeenCalledTimes(2);
      expect(submittedEventListener).toHaveBeenCalledWith({
        actionId: mockActionId,
        transactionMeta: cancelTransaction,
      });

      expect(finishedEventListener).toHaveBeenCalledTimes(2);
      expect(finishedEventListener).toHaveBeenCalledWith(cancelTransaction);
    });

    it('updates submit history', async () => {
      const { controller } = setupController({
        messengerOptions: {
          addTransactionApprovalRequest: {
            state: 'approved',
          },
        },
      });

      const { result } = await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          gas: '0xFF',
          gasPrice: '0xEE',
          to: ACCOUNT_MOCK,
          value: '0x0',
        },
        {
          origin: ORIGIN_METAMASK,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      await result;

      await controller.stopTransaction(controller.state.transactions[0].id);

      const { submitHistory } = controller.state;

      expect(submitHistory).toStrictEqual([
        {
          chainId: MOCK_NETWORK.chainId,
          hash: TRANSACTION_HASH_MOCK,
          networkType: NETWORK_CLIENT_ID_MOCK,
          networkUrl: undefined,
          origin: 'cancel',
          rawTransaction: expect.stringContaining('0x'),
          time: expect.any(Number),
          transaction: {
            from: ACCOUNT_MOCK,
            gas: '0xFF',
            gasLimit: '0xFF',
            gasPrice: '0x105',
            nonce: '0xc',
            to: ACCOUNT_MOCK,
            type: TransactionEnvelopeType.legacy,
            value: '0x0',
          },
        },
        expect.objectContaining({
          origin: ORIGIN_METAMASK,
        }),
      ]);
    });
  });

  describe('speedUpTransaction', () => {
    it('creates additional transaction', async () => {
      const { controller } = setupController({
        network: MOCK_LINEA_MAINNET_NETWORK,
        options: {
          getCurrentNetworkEIP1559Compatibility: async () => false,
        },
      });

      const { transactionMeta } = await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          gas: '0x0',
          gasPrice: '0x50fd51da',
          to: ACCOUNT_MOCK,
          value: '0x0',
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      await controller.speedUpTransaction(transactionMeta.id);

      const { transactions } = controller.state;
      expect(transactions).toHaveLength(2);
      const speedUpTransaction = transactions[1];
      expect(speedUpTransaction.originalType).toBe(transactionMeta.type);
      expect(speedUpTransaction.type).toBe(TransactionType.retry);
    });

    it('should avoid creating speedup transaction if actionId already exist', async () => {
      const mockActionId = 'mockActionId';
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                actionId: mockActionId,
                id: '2',
                networkClientId: NETWORK_CLIENT_ID_MOCK,
                chainId: toHex(5),
                status: TransactionStatus.submitted,
                type: TransactionType.retry,
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                },
              },
            ],
          },
        },
      });

      await controller.speedUpTransaction('2', undefined, {
        actionId: mockActionId,
      });

      expect(controller.state.transactions).toHaveLength(1);
    });

    it('should throw error if transaction already confirmed', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: '2',
                chainId: toHex(5),
                networkClientId: NETWORK_CLIENT_ID_MOCK,
                status: TransactionStatus.submitted,
                type: TransactionType.retry,
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                  gasPrice: '0x1',
                },
              },
            ],
          },
        },
      });

      jest
        .spyOn(mockEthQuery, 'sendRawTransaction')
        .mockImplementation((_transaction, callback) => {
          callback(new Error('nonce too low'));
        });

      await expect(controller.speedUpTransaction('2')).rejects.toThrow(
        'Previous transaction is already confirmed',
      );

      // Expect speedup transaction to be submitted - it will fail
      expect(mockEthQuery.sendRawTransaction).toHaveBeenCalledTimes(1);
      expect(controller.state.transactions).toHaveLength(1);
    });

    it('should throw error if publish transaction fails', async () => {
      const error = new Error('Another reason');
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: '2',
                chainId: toHex(5),
                networkClientId: NETWORK_CLIENT_ID_MOCK,
                status: TransactionStatus.submitted,
                type: TransactionType.retry,
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                  gasPrice: '0x1',
                },
              },
            ],
          },
        },
      });

      jest
        .spyOn(mockEthQuery, 'sendRawTransaction')
        .mockImplementation((_transaction, callback) => {
          callback(error);
        });

      await expect(controller.speedUpTransaction('2')).rejects.toThrow(error);

      // Expect speedup transaction to be submitted - it will fail
      expect(mockEthQuery.sendRawTransaction).toHaveBeenCalledTimes(1);
      expect(controller.state.transactions).toHaveLength(1);
    });

    it('creates additional transaction with increased gas', async () => {
      const { controller } = setupController({
        network: MOCK_LINEA_MAINNET_NETWORK,
        options: {
          getCurrentNetworkEIP1559Compatibility: async () => false,
        },
      });

      const { transactionMeta } = await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          gas: '0x0',
          gasPrice: '0x50fd51da',
          to: ACCOUNT_MOCK,
          value: '0x0',
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      await controller.speedUpTransaction(transactionMeta.id);

      const { transactions } = controller.state;
      expect(transactions).toHaveLength(2);
      expect(transactions[1].txParams.gasPrice).toBe(
        '0x5916a6d6', // 1.1 * 0x50fd51da
      );
    });

    it('verifies s,r and v values are correctly populated', async () => {
      const { controller } = setupController({
        network: MOCK_LINEA_MAINNET_NETWORK,
        options: {
          sign: async (transaction) => {
            return Object.assign(transaction, {
              r: 128n,
              s: 256n,
              v: 512n,
            });
          },
        },
      });

      const { transactionMeta } = await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          gas: '0x0',
          gasPrice: '0x50fd51da',
          to: ACCOUNT_MOCK,
          value: '0x0',
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      await controller.speedUpTransaction(transactionMeta.id);

      const { transactions } = controller.state;
      expect(transactions).toHaveLength(2);
      const speedUpTransaction = transactions[1];
      expect(speedUpTransaction).toMatchObject({
        r: '0x80',
        s: '0x100',
        v: '0x200',
      });
    });

    it('verifies s,r and v values are correctly populated if values are zero', async () => {
      const { controller } = setupController({
        network: MOCK_LINEA_MAINNET_NETWORK,
        options: {
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sign: async (transaction: any) => {
            return Object.assign(transaction, {
              r: 0n,
              s: 0n,
              v: 0n,
            });
          },
        },
      });

      const { transactionMeta } = await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          gas: '0x0',
          gasPrice: '0x50fd51da',
          to: ACCOUNT_MOCK,
          value: '0x0',
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      await controller.speedUpTransaction(transactionMeta.id);

      const { transactions } = controller.state;
      expect(transactions).toHaveLength(2);
      const speedUpTransaction = transactions[1];
      expect(speedUpTransaction.r).toBe('0x0');
      expect(speedUpTransaction.s).toBe('0x0');
      expect(speedUpTransaction.v).toBe('0x0');
    });

    it('creates additional transaction specifying the gasPrice', async () => {
      const { controller } = setupController({
        network: MOCK_LINEA_MAINNET_NETWORK,
        options: {
          getCurrentNetworkEIP1559Compatibility: async () => false,
        },
      });

      const { transactionMeta } = await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          gas: '0x0',
          gasPrice: '0x50fd51da',
          to: ACCOUNT_MOCK,
          value: '0x0',
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      await controller.speedUpTransaction(transactionMeta.id, {
        gasPrice: '0x62DEF4DA',
      });

      const { transactions } = controller.state;
      expect(transactions).toHaveLength(2);
      expect(transactions[1].txParams.gasPrice).toBe('0x62DEF4DA');
    });

    it('uses the same nonce', async () => {
      const { controller } = setupController({
        messengerOptions: {
          addTransactionApprovalRequest: {
            state: 'approved',
          },
        },
      });

      const { transactionMeta, result } = await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          gas: '0x1',
          gasPrice: '0x50fd51da',
          to: ACCOUNT_MOCK,
          value: '0x0',
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      await result;
      await controller.speedUpTransaction(transactionMeta.id, undefined, {
        estimatedBaseFee: '0x123',
      });

      const { transactions } = controller.state;
      expect(getNonceLockSpy).toHaveBeenCalledTimes(1);
      expect(transactions).toHaveLength(2);
      expect(transactions[0].txParams.nonce).toBeDefined();
      expect(transactions[0].txParams.nonce).toStrictEqual(
        transactions[1].txParams.nonce,
      );
      expect(transactions[1].estimatedBaseFee).toBe('0x123');
      expect(transactions[1].originalGasEstimate).toBe('0x1');
    });

    it('allows transaction count to exceed txHistorylimit', async () => {
      const { controller } = setupController({
        options: {
          transactionHistoryLimit: 1,
        },
        messengerOptions: {
          addTransactionApprovalRequest: {
            state: 'approved',
          },
        },
      });

      const { transactionMeta, result } = await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          nonce: '1111111',
          gas: '0x0',
          gasPrice: '0x50fd51da',
          to: ACCOUNT_MOCK,
          value: '0x0',
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      await result;
      await controller.speedUpTransaction(transactionMeta.id);

      expect(controller.state.transactions).toHaveLength(2);
    });

    it('publishes transaction events', async () => {
      const { controller, messenger } = setupController({
        network: MOCK_LINEA_MAINNET_NETWORK,
      });

      const approvedEventListener = jest.fn();
      const submittedEventListener = jest.fn();
      const speedupEventListener = jest.fn();

      const mockActionId = 'mockActionId';

      messenger.subscribe(
        'TransactionController:transactionApproved',
        approvedEventListener,
      );
      messenger.subscribe(
        'TransactionController:transactionSubmitted',
        submittedEventListener,
      );

      const { transactionMeta: firstTransactionMeta } =
        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            gas: '0x0',
            gasPrice: '0x1',
            to: ACCOUNT_MOCK,
            value: '0x0',
          },
          {
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        );

      messenger.subscribe(
        'TransactionController:speedupTransactionAdded',
        speedupEventListener,
      );

      await controller.speedUpTransaction(firstTransactionMeta.id, undefined, {
        actionId: mockActionId,
      });

      const { transactions } = controller.state;
      const speedUpTransaction = transactions[1];

      expect(approvedEventListener).toHaveBeenCalledTimes(1);
      expect(approvedEventListener).toHaveBeenCalledWith({
        actionId: mockActionId,
        transactionMeta: speedUpTransaction,
      });

      expect(submittedEventListener).toHaveBeenCalledTimes(1);
      expect(submittedEventListener).toHaveBeenCalledWith({
        actionId: mockActionId,
        transactionMeta: speedUpTransaction,
      });

      expect(speedupEventListener).toHaveBeenCalledTimes(1);
      expect(speedupEventListener).toHaveBeenCalledWith(speedUpTransaction);
    });

    it('updates submit history', async () => {
      const { controller } = setupController({
        messengerOptions: {
          addTransactionApprovalRequest: {
            state: 'approved',
          },
        },
      });

      const { result } = await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          gas: '0xFF',
          gasPrice: '0xEE',
          to: ACCOUNT_MOCK,
          value: '0x0',
        },
        {
          origin: ORIGIN_METAMASK,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      await result;

      await controller.speedUpTransaction(controller.state.transactions[0].id);

      const { submitHistory } = controller.state;

      expect(submitHistory).toStrictEqual([
        {
          chainId: MOCK_NETWORK.chainId,
          hash: TRANSACTION_HASH_MOCK,
          networkType: NETWORK_CLIENT_ID_MOCK,
          networkUrl: undefined,
          origin: 'speed up',
          rawTransaction: expect.stringContaining('0x'),
          time: expect.any(Number),
          transaction: {
            from: ACCOUNT_MOCK,
            gas: '0xFF',
            gasLimit: '0xFF',
            gasPrice: '0x105',
            nonce: '0xc',
            to: ACCOUNT_MOCK,
            type: TransactionEnvelopeType.legacy,
            value: '0x0',
          },
        },
        expect.objectContaining({
          origin: ORIGIN_METAMASK,
        }),
      ]);
    });
  });

  describe('confirmExternalTransaction', () => {
    it('adds external transaction to the state as confirmed', async () => {
      const { controller } = setupController();

      const externalTransactionToConfirm = {
        id: '1',
        chainId: toHex(1),
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        time: 123456789,
        status: TransactionStatus.confirmed as const,
        txParams: {
          gasUsed: undefined,
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        },
      };
      const externalTransactionReceipt = {
        gasUsed: '0x5208',
      };
      const externalBaseFeePerGas = '0x14';

      await controller.confirmExternalTransaction(
        externalTransactionToConfirm,
        externalTransactionReceipt,
        externalBaseFeePerGas,
      );

      expect(controller.state.transactions[0].status).toBe(
        TransactionStatus.confirmed,
      );
      expect(controller.state.transactions[0].baseFeePerGas).toBe(
        externalBaseFeePerGas,
      );
      expect(controller.state.transactions[0]?.txReceipt?.gasUsed).toBe(
        externalTransactionReceipt.gasUsed,
      );
    });

    it('generates initial history', async () => {
      const { controller } = setupController();

      const externalTransactionToConfirm = {
        from: ACCOUNT_MOCK,
        to: ACCOUNT_2_MOCK,
        id: '1',
        chainId: toHex(1),
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        status: TransactionStatus.confirmed as const,
        time: 123456789,
        txParams: {
          gasUsed: undefined,
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        },
      };

      const externalTransactionReceipt = {
        gasUsed: '0x5208',
      };

      const externalBaseFeePerGas = '0x14';

      await controller.confirmExternalTransaction(
        externalTransactionToConfirm,
        externalTransactionReceipt,
        externalBaseFeePerGas,
      );

      const expectedInitialSnapshot = {
        chainId: '0x1',
        from: ACCOUNT_MOCK,
        id: '1',
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        time: 123456789,
        status: TransactionStatus.confirmed as const,
        to: ACCOUNT_2_MOCK,
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
          gasUsed: undefined,
        },
      };

      // Expect initial snapshot to be the first history item
      expect(controller.state.transactions[0]?.history?.[0]).toStrictEqual(
        expectedInitialSnapshot,
      );
      // Expect modification history to be present
      expect(controller.state.transactions[0]?.history?.[1]).toStrictEqual([
        {
          note: expect.any(String),
          op: 'remove',
          path: '/txParams/gasUsed',
          timestamp: expect.any(Number),
        },
        {
          op: 'add',
          path: '/txParams/value',
          value: '0x0',
        },
        {
          op: 'add',
          path: '/txReceipt',
          value: expect.anything(),
        },
        {
          op: 'add',
          path: '/baseFeePerGas',
          value: expect.any(String),
        },
      ]);
    });

    it('marks local transactions with the same nonce and chainId as status dropped and defines replacedBy properties', async () => {
      const externalTransactionId = '1';
      const externalTransactionHash = '0x1';
      const externalTransactionToConfirm = {
        from: ACCOUNT_MOCK,
        to: ACCOUNT_2_MOCK,
        hash: externalTransactionHash,
        id: externalTransactionId,
        chainId: toHex(5),
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        status: TransactionStatus.confirmed as const,
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
          nonce: toHex(NONCE_MOCK),
          value: '0x42',
        },
      };
      const externalTransactionReceipt = {
        gasUsed: '0x5208',
      };
      const externalBaseFeePerGas = '0x14';

      const localTransactionIdWithSameNonce = '9';

      const droppedEventListener = jest.fn();
      const statusUpdatedEventListener = jest.fn();

      const { controller, messenger } = setupController({
        options: {
          disableHistory: true,
          state: {
            transactions: [
              // Local unapproved transaction with the same chainId and nonce
              {
                id: localTransactionIdWithSameNonce,
                chainId: toHex(5),
                networkClientId: NETWORK_CLIENT_ID_MOCK,
                status: TransactionStatus.unapproved as const,
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                  to: ACCOUNT_2_MOCK,
                  nonce: toHex(NONCE_MOCK),
                  value: '0x42',
                },
              },
            ],
          },
        },
        updateToInitialState: true,
      });
      messenger.subscribe(
        'TransactionController:transactionDropped',
        droppedEventListener,
      );
      messenger.subscribe(
        'TransactionController:transactionStatusUpdated',
        statusUpdatedEventListener,
      );

      await controller.confirmExternalTransaction(
        externalTransactionToConfirm,
        externalTransactionReceipt,
        externalBaseFeePerGas,
      );

      const droppedTx = controller.state.transactions.find(
        (transaction) => transaction.id === localTransactionIdWithSameNonce,
      );
      assert(droppedTx, 'Could not find dropped transaction');
      const externalTx = controller.state.transactions.find(
        (transaction) => transaction.id === externalTransactionId,
      );

      expect(droppedTx.status).toBe(TransactionStatus.dropped);
      expect(droppedTx.replacedById).toBe(externalTransactionId);
      expect(droppedTx.replacedBy).toBe(externalTransactionHash);

      expect(droppedEventListener).toHaveBeenCalledTimes(1);
      expect(droppedEventListener).toHaveBeenCalledWith({
        transactionMeta: droppedTx,
      });

      expect(statusUpdatedEventListener).toHaveBeenCalledTimes(2);
      expect(statusUpdatedEventListener.mock.calls[0][0]).toStrictEqual({
        transactionMeta: droppedTx,
      });
      expect(statusUpdatedEventListener.mock.calls[1][0]).toStrictEqual({
        transactionMeta: externalTx,
      });
    });

    it('doesnt mark transaction as dropped if local transaction with same nonce and chainId has status of failed', async () => {
      const externalTransactionId = '1';
      const externalTransactionHash = '0x1';
      const externalTransactionToConfirm = {
        from: ACCOUNT_MOCK,
        to: ACCOUNT_2_MOCK,
        hash: externalTransactionHash,
        id: externalTransactionId,
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        chainId: toHex(5),
        status: TransactionStatus.confirmed as const,
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
          nonce: toHex(NONCE_MOCK),
        },
      };
      const externalTransactionReceipt = {
        gasUsed: '0x5208',
      };
      const externalBaseFeePerGas = '0x14';

      const localTransactionIdWithSameNonce = '9';
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                // Off-chain failed local transaction with the same chainId and nonce
                id: localTransactionIdWithSameNonce,
                chainId: toHex(5),
                networkClientId: NETWORK_CLIENT_ID_MOCK,
                status: TransactionStatus.failed as const,
                error: new Error('mock error'),
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                  to: ACCOUNT_2_MOCK,
                  nonce: toHex(NONCE_MOCK),
                },
              },
            ],
          },
        },
      });

      await controller.confirmExternalTransaction(
        externalTransactionToConfirm,
        externalTransactionReceipt,
        externalBaseFeePerGas,
      );

      const failedTx = controller.state.transactions.find(
        (transaction) => transaction.id === localTransactionIdWithSameNonce,
      );

      expect(failedTx?.status).toBe(TransactionStatus.failed);

      expect(failedTx?.replacedById).toBe(externalTransactionId);

      expect(failedTx?.replacedBy).toBe(externalTransactionHash);
    });

    it('updates post transaction balance if type is swap', async () => {
      const mockPostTxBalance = '7a00';
      const mockApprovalTransactionMeta = {
        id: '2',
      };
      updatePostTransactionBalanceMock.mockImplementationOnce(
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (transactionMeta: TransactionMeta, _request: any) => {
          return Promise.resolve({
            updatedTransactionMeta: {
              ...transactionMeta,
              postTxBalance: mockPostTxBalance,
            },
            approvalTransactionMeta:
              mockApprovalTransactionMeta as TransactionMeta,
          });
        },
      );
      const postTransactionBalanceUpdatedListener = jest.fn();
      const { controller, messenger } = setupController();
      messenger.subscribe(
        'TransactionController:postTransactionBalanceUpdated',
        postTransactionBalanceUpdatedListener,
      );

      const externalTransactionToConfirm = {
        from: ACCOUNT_MOCK,
        to: ACCOUNT_2_MOCK,
        id: '1',
        chainId: '0x1',
        status: TransactionStatus.confirmed,
        type: TransactionType.swap,
        txParams: {
          gasUsed: undefined,
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        },
        preTxBalance: '8b11',
        // Default token address
        destinationTokenAddress: '0x0000000000000000000000000000000000000000',
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      const externalTransactionReceipt = {
        gasUsed: '0x5208',
      };
      const externalBaseFeePerGas = '0x14';

      await controller.confirmExternalTransaction(
        externalTransactionToConfirm,
        externalTransactionReceipt,
        externalBaseFeePerGas,
      );

      await flushPromises();

      expect(postTransactionBalanceUpdatedListener).toHaveBeenCalledTimes(1);
      expect(postTransactionBalanceUpdatedListener).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionMeta: expect.objectContaining({
            postTxBalance: mockPostTxBalance,
          }),
          approvalTransactionMeta: expect.objectContaining(
            mockApprovalTransactionMeta,
          ),
        }),
      );
    });

    it('publishes TransactionController:transactionConfirmed', async () => {
      const { controller, messenger } = setupController();

      const confirmedEventListener = jest.fn();

      messenger.subscribe(
        'TransactionController:transactionConfirmed',
        confirmedEventListener,
      );

      const externalTransactionToConfirm = {
        from: ACCOUNT_MOCK,
        to: ACCOUNT_2_MOCK,
        id: '1',
        chainId: toHex(5),
        status: TransactionStatus.confirmed,
        txParams: {
          gasUsed: undefined,
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        },
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
      const externalTransactionReceipt = {
        gasUsed: '0x5208',
      };
      const externalBaseFeePerGas = '0x14';

      await controller.confirmExternalTransaction(
        externalTransactionToConfirm,
        externalTransactionReceipt,
        externalBaseFeePerGas,
      );

      expect(confirmedEventListener).toHaveBeenCalledTimes(1);
      expect(confirmedEventListener).toHaveBeenCalledWith(
        expect.objectContaining(externalTransactionToConfirm),
      );
    });
  });

  describe('updateTransactionSendFlowHistory', () => {
    it('appends sendFlowHistory entries to transaction meta', async () => {
      const { controller } = setupController();
      const mockSendFlowHistory = [
        {
          entry:
            'sendFlow - user selected transfer to my accounts on recipient screen',
          timestamp: 1650663928211,
        },
      ];
      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        { networkClientId: NETWORK_CLIENT_ID_MOCK },
      );
      const addedTxId = controller.state.transactions[0].id;
      controller.updateTransactionSendFlowHistory(
        addedTxId,
        0,
        mockSendFlowHistory,
      );

      expect(controller.state.transactions[0].sendFlowHistory).toStrictEqual(
        mockSendFlowHistory,
      );
    });

    it('appends sendFlowHistory entries to existing entries in transaction meta', async () => {
      const { controller } = setupController();
      const mockSendFlowHistory = [
        {
          entry:
            'sendFlow - user selected transfer to my accounts on recipient screen',
          timestamp: 1650663928211,
        },
      ];
      const mockExistingSendFlowHistory = [
        {
          entry: 'sendFlow - user selected transfer to my accounts',
          timestamp: 1650663928210,
        },
      ];
      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          sendFlowHistory: mockExistingSendFlowHistory,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );
      const addedTxId = controller.state.transactions[0].id;
      controller.updateTransactionSendFlowHistory(
        addedTxId,
        1,
        mockSendFlowHistory,
      );

      expect(controller.state.transactions[0].sendFlowHistory).toStrictEqual([
        ...mockExistingSendFlowHistory,
        ...mockSendFlowHistory,
      ]);
    });

    it('doesnt append if current sendFlowHistory lengths doesnt match', async () => {
      const { controller } = setupController();
      const mockSendFlowHistory = [
        {
          entry:
            'sendFlow - user selected transfer to my accounts on recipient screen',
          timestamp: 1650663928211,
        },
      ];
      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );
      const addedTxId = controller.state.transactions[0].id;
      controller.updateTransactionSendFlowHistory(
        addedTxId,
        5,
        mockSendFlowHistory,
      );

      expect(controller.state.transactions[0].sendFlowHistory).toStrictEqual(
        [],
      );
    });

    it('throws if sendFlowHistory persistence is disabled', async () => {
      const { controller } = setupController({
        options: { disableSendFlowHistory: true },
      });
      const mockSendFlowHistory = [
        {
          entry:
            'sendFlow - user selected transfer to my accounts on recipient screen',
          timestamp: 1650663928211,
        },
      ];
      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );
      const addedTxId = controller.state.transactions[0].id;
      expect(() =>
        controller.updateTransactionSendFlowHistory(
          addedTxId,
          0,
          mockSendFlowHistory,
        ),
      ).toThrow(
        'Send flow history is disabled for the current transaction controller',
      );
    });

    it('throws if transactionMeta is not found', async () => {
      const { controller } = setupController();
      const mockSendFlowHistory = [
        {
          entry:
            'sendFlow - user selected transfer to my accounts on recipient screen',
          timestamp: 1650663928211,
        },
      ];
      expect(() =>
        controller.updateTransactionSendFlowHistory(
          'foo',
          0,
          mockSendFlowHistory,
        ),
      ).toThrow(
        'Cannot update send flow history as no transaction metadata found',
      );
    });

    it('throws if the transaction is not unapproved status', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: 'foo',
                chainId: toHex(5),
                networkClientId: NETWORK_CLIENT_ID_MOCK,
                hash: '1337',
                status: TransactionStatus.submitted as const,
                time: 123456789,
                txParams: {
                  from: MOCK_PREFERENCES.state.selectedAddress,
                },
              },
            ],
          },
        },
      });
      const mockSendFlowHistory = [
        {
          entry:
            'sendFlow - user selected transfer to my accounts on recipient screen',
          timestamp: 1650663928211,
        },
      ];
      expect(() =>
        controller.updateTransactionSendFlowHistory(
          'foo',
          0,
          mockSendFlowHistory,
        ),
      )
        .toThrow(`TransactionsController: Can only call updateTransactionSendFlowHistory on an unapproved transaction.
      Current tx status: submitted`);
    });
  });

  describe('clearUnapprovedTransactions', () => {
    it('clears unapproved transactions', async () => {
      const firstUnapprovedTxId = '1';
      const secondUnapprovedTxId = '2';
      const firstConfirmedTxId = '3';
      const secondConfirmedTxId = '4';

      const transactionMeta = {
        chainId: toHex(5),
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        status: TransactionStatus.unapproved as const,
        time: 123456789,
        txParams: {
          from: '0x1bf137f335ea1b8f193b8f6ea92561a60d23a207',
        },
      };

      const confirmedTxMeta = {
        ...transactionMeta,
        status: TransactionStatus.confirmed as const,
      };

      const unapprovedTxMeta = {
        ...transactionMeta,
        status: TransactionStatus.unapproved as const,
      };

      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                ...unapprovedTxMeta,
                id: firstUnapprovedTxId,
              },
              {
                ...unapprovedTxMeta,
                id: secondUnapprovedTxId,
              },
              {
                ...confirmedTxMeta,
                id: firstConfirmedTxId,
              },
              {
                ...confirmedTxMeta,
                id: secondConfirmedTxId,
              },
            ],
          },
        },
      });

      controller.clearUnapprovedTransactions();

      const { transactions } = controller.state;
      expect(transactions).toHaveLength(2);
      expect(
        transactions.find(({ id }) => id === firstConfirmedTxId)?.status,
      ).toBe(TransactionStatus.confirmed);
      expect(
        transactions.find(({ id }) => id === secondConfirmedTxId)?.status,
      ).toBe(TransactionStatus.confirmed);
    });
  });

  describe('on incoming transaction helper transactions event', () => {
    it('adds new transactions to state', async () => {
      const { controller } = setupController();

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (incomingTransactionHelperMock.hub.on as any).mock.calls[0][1]([
        TRANSACTION_META_MOCK,
        TRANSACTION_META_2_MOCK,
      ]);

      expect(controller.state.transactions).toStrictEqual([
        { ...TRANSACTION_META_MOCK, networkClientId: NETWORK_CLIENT_ID_MOCK },
        { ...TRANSACTION_META_2_MOCK, networkClientId: NETWORK_CLIENT_ID_MOCK },
      ]);
    });

    it('limits max transactions when adding to state', async () => {
      const { controller } = setupController({
        options: { transactionHistoryLimit: 1 },
      });

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (incomingTransactionHelperMock.hub.on as any).mock.calls[0][1]([
        TRANSACTION_META_MOCK,
        TRANSACTION_META_2_MOCK,
      ]);

      expect(controller.state.transactions).toStrictEqual([
        { ...TRANSACTION_META_2_MOCK, networkClientId: NETWORK_CLIENT_ID_MOCK },
      ]);
    });

    it('publishes TransactionController:incomingTransactionsReceived', async () => {
      const listener = jest.fn();

      const { messenger } = setupController();
      messenger.subscribe(
        'TransactionController:incomingTransactionsReceived',
        listener,
      );

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (incomingTransactionHelperMock.hub.on as any).mock.calls[0][1]([
        TRANSACTION_META_MOCK,
        TRANSACTION_META_2_MOCK,
      ]);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith([
        { ...TRANSACTION_META_MOCK, networkClientId: NETWORK_CLIENT_ID_MOCK },
        { ...TRANSACTION_META_2_MOCK, networkClientId: NETWORK_CLIENT_ID_MOCK },
      ]);
    });

    it('does not publish TransactionController:incomingTransactionsReceived if no new transactions', async () => {
      const listener = jest.fn();

      const { messenger } = setupController();

      messenger.subscribe(
        'TransactionController:incomingTransactionsReceived',
        listener,
      );

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (incomingTransactionHelperMock.hub.on as any).mock.calls[0][1]([]);

      expect(listener).toHaveBeenCalledTimes(0);
    });

    it('ignores transactions with unrecognised chain ID', async () => {
      const { controller } = setupController();

      multichainTrackingHelperMock.getNetworkClient.mockImplementationOnce(
        () => {
          throw new Error('Unknown chain ID');
        },
      );

      multichainTrackingHelperMock.getNetworkClient.mockImplementationOnce(
        () =>
          ({
            id: NETWORK_CLIENT_ID_MOCK,
          }) as never,
      );

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (incomingTransactionHelperMock.hub.on as any).mock.calls[0][1]([
        TRANSACTION_META_MOCK,
        TRANSACTION_META_2_MOCK,
      ]);

      expect(controller.state.transactions).toStrictEqual([
        { ...TRANSACTION_META_2_MOCK, networkClientId: NETWORK_CLIENT_ID_MOCK },
      ]);
    });
  });

  describe('updateTransactionGasFees', () => {
    it('throws if transaction does not exist', async () => {
      const { controller } = setupController();
      expect(() =>
        controller.updateTransactionGasFees('123', {
          gasPrice: '0x1',
        }),
      ).toThrow('Cannot update transaction as no transaction metadata found');
    });

    it('throws if transaction not unapproved status', async () => {
      const transactionId = '123';
      const fnName = 'updateTransactionGasFees';
      const status = TransactionStatus.failed;
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: transactionId,
                status,
                error: new Error('mock error'),
                chainId: '0x1',
                networkClientId: NETWORK_CLIENT_ID_MOCK,
                time: 123456789,
                txParams: {} as TransactionParams,
              },
            ],
          },
        },
      });
      expect(() =>
        controller.updateTransactionGasFees(transactionId, {
          gasPrice: '0x1',
        }),
      )
        .toThrow(`TransactionsController: Can only call ${fnName} on an unapproved transaction.
      Current tx status: ${status}`);
    });

    it('updates provided legacy gas values', async () => {
      const transactionId = '123';
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: transactionId,
                chainId: '0x1',
                networkClientId: NETWORK_CLIENT_ID_MOCK,
                time: 123456789,
                status: TransactionStatus.unapproved as const,
                history: [
                  {} as TransactionMeta,
                  ...([{}] as TransactionHistoryEntry[]),
                ],
                txParams: {
                  from: ACCOUNT_MOCK,
                  to: ACCOUNT_2_MOCK,
                },
              },
            ],
          },
        },
        updateToInitialState: true,
      });

      const gas = '0x1';
      const gasLimit = '0x2';
      const gasPrice = '0x12';
      const estimateUsed = '0x3';
      const estimateSuggested = '0x123';
      const defaultGasEstimates = '0x124';
      const originalGasEstimate = '0x134';
      const userEditedGasLimit = true;
      const userFeeLevel = '0xuserFeeLevel';

      controller.updateTransactionGasFees(transactionId, {
        gas,
        gasLimit,
        gasPrice,
        estimateUsed,
        estimateSuggested,
        defaultGasEstimates,
        originalGasEstimate,
        userEditedGasLimit,
        userFeeLevel,
      });

      const transaction = controller.state.transactions.find(
        ({ id }) => id === transactionId,
      );

      expect(transaction?.txParams?.gas).toBe(gas);
      expect(transaction?.txParams?.gasLimit).toBe(gasLimit);
      expect(transaction?.txParams?.gasPrice).toBe(gasPrice);
      expect(transaction?.estimateUsed).toBe(estimateUsed);
      expect(transaction?.estimateSuggested).toBe(estimateSuggested);
      expect(transaction?.defaultGasEstimates).toBe(defaultGasEstimates);
      expect(transaction?.originalGasEstimate).toBe(originalGasEstimate);
      expect(transaction?.userEditedGasLimit).toBe(userEditedGasLimit);
      expect(transaction?.userFeeLevel).toBe(userFeeLevel);
    });

    it('updates provided 1559 gas values', async () => {
      const maxPriorityFeePerGas = '0x01';
      const maxFeePerGas = '0x01';
      const transactionId = '123';

      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: transactionId,
                chainId: '0x1',
                networkClientId: NETWORK_CLIENT_ID_MOCK,
                time: 123456789,
                status: TransactionStatus.unapproved as const,
                history: [
                  {} as TransactionMeta,
                  ...([{}] as TransactionHistoryEntry[]),
                ],
                txParams: {
                  from: ACCOUNT_MOCK,
                  to: ACCOUNT_2_MOCK,
                },
              },
            ],
          },
        },
        updateToInitialState: true,
      });

      controller.updateTransactionGasFees(transactionId, {
        maxPriorityFeePerGas,
        maxFeePerGas,
      });

      const txToBeUpdatedWithoutGasPrice = controller.state.transactions.find(
        ({ id }) => id === transactionId,
      );

      expect(txToBeUpdatedWithoutGasPrice?.txParams?.maxPriorityFeePerGas).toBe(
        maxPriorityFeePerGas,
      );
      expect(txToBeUpdatedWithoutGasPrice?.txParams?.maxFeePerGas).toBe(
        maxFeePerGas,
      );
    });

    describe('when called with userFeeLevel', () => {
      it('does not call updateTransactionGasEstimates when gasFeeEstimates is undefined', async () => {
        const transactionId = '123';
        const { controller } = setupController({
          options: {
            state: {
              transactions: [
                {
                  id: transactionId,
                  chainId: '0x1',
                  networkClientId: NETWORK_CLIENT_ID_MOCK,
                  time: 123456789,
                  status: TransactionStatus.unapproved as const,
                  gasFeeEstimates: undefined,
                  txParams: {
                    from: ACCOUNT_MOCK,
                    to: ACCOUNT_2_MOCK,
                  },
                },
              ],
            },
          },
          updateToInitialState: true,
        });

        controller.updateTransactionGasFees(transactionId, {
          userFeeLevel: GasFeeEstimateLevel.Medium,
        });

        expect(updateTransactionGasEstimatesMock).not.toHaveBeenCalled();
      });

      it('calls updateTransactionGasEstimates with correct parameters when gasFeeEstimates exists', async () => {
        const transactionId = '123';
        const gasFeeEstimates = {
          type: GasFeeEstimateType.FeeMarket,
          low: { maxFeePerGas: '0x1', maxPriorityFeePerGas: '0x2' },
          medium: { maxFeePerGas: '0x3', maxPriorityFeePerGas: '0x4' },
          high: { maxFeePerGas: '0x5', maxPriorityFeePerGas: '0x6' },
        } as GasFeeEstimates;

        const { controller } = setupController({
          options: {
            isAutomaticGasFeeUpdateEnabled: () => true,
            state: {
              transactions: [
                {
                  id: transactionId,
                  chainId: '0x1',
                  networkClientId: NETWORK_CLIENT_ID_MOCK,
                  time: 123456789,
                  status: TransactionStatus.unapproved as const,
                  gasFeeEstimates,
                  txParams: {
                    from: ACCOUNT_MOCK,
                    to: ACCOUNT_2_MOCK,
                  },
                },
              ],
            },
          },
          updateToInitialState: true,
        });

        controller.updateTransactionGasFees(transactionId, {
          userFeeLevel: GasFeeEstimateLevel.Medium,
        });

        expect(updateTransactionGasEstimatesMock).toHaveBeenCalledWith({
          txMeta: expect.objectContaining({
            id: transactionId,
            gasFeeEstimates,
          }),
          userFeeLevel: GasFeeEstimateLevel.Medium,
        });
      });

      it('preserves existing gas values when gasFeeEstimates type is unknown', async () => {
        const transactionId = '123';
        const unknownGasFeeEstimates = {
          type: 'unknown' as unknown as GasFeeEstimateType,
          low: '0x123',
          medium: '0x1234',
          high: '0x12345',
        } as GasFeeEstimates;

        const existingGasPrice = '0x777777';

        const { controller } = setupController({
          options: {
            isAutomaticGasFeeUpdateEnabled: () => true,
            state: {
              transactions: [
                {
                  id: transactionId,
                  chainId: '0x1',
                  networkClientId: NETWORK_CLIENT_ID_MOCK,
                  time: 123456789,
                  status: TransactionStatus.unapproved as const,
                  gasFeeEstimates: unknownGasFeeEstimates,
                  txParams: {
                    from: ACCOUNT_MOCK,
                    to: ACCOUNT_2_MOCK,
                    gasPrice: existingGasPrice,
                  },
                },
              ],
            },
          },
          updateToInitialState: true,
        });

        updateTransactionGasEstimatesMock.mockImplementation(({ txMeta }) => {
          expect(txMeta.txParams.gasPrice).toBe(existingGasPrice);
        });

        controller.updateTransactionGasFees(transactionId, {
          userFeeLevel: GasFeeEstimateLevel.Medium,
        });

        expect(updateTransactionGasEstimatesMock).toHaveBeenCalled();

        const updatedTransaction = controller.state.transactions.find(
          ({ id }) => id === transactionId,
        );

        // Gas price should remain unchanged
        expect(updatedTransaction?.txParams.gasPrice).toBe(existingGasPrice);
      });

      it('preserves existing EIP-1559 gas values when gasFeeEstimates is undefined', async () => {
        const transactionId = '123';
        const existingMaxFeePerGas = '0x999999';
        const existingMaxPriorityFeePerGas = '0x888888';

        const { controller } = setupController({
          options: {
            state: {
              transactions: [
                {
                  id: transactionId,
                  chainId: '0x1',
                  networkClientId: NETWORK_CLIENT_ID_MOCK,
                  time: 123456789,
                  status: TransactionStatus.unapproved as const,
                  gasFeeEstimates: undefined,
                  txParams: {
                    type: TransactionEnvelopeType.feeMarket,
                    from: ACCOUNT_MOCK,
                    to: ACCOUNT_2_MOCK,
                    maxFeePerGas: existingMaxFeePerGas,
                    maxPriorityFeePerGas: existingMaxPriorityFeePerGas,
                  },
                },
              ],
            },
          },
          updateToInitialState: true,
        });

        controller.updateTransactionGasFees(transactionId, {
          userFeeLevel: GasFeeEstimateLevel.Medium,
        });

        expect(updateTransactionGasEstimatesMock).not.toHaveBeenCalled();

        const updatedTransaction = controller.state.transactions.find(
          ({ id }) => id === transactionId,
        );

        // Values should remain unchanged
        expect(updatedTransaction?.txParams.maxFeePerGas).toBe(
          existingMaxFeePerGas,
        );
        expect(updatedTransaction?.txParams.maxPriorityFeePerGas).toBe(
          existingMaxPriorityFeePerGas,
        );
      });

      it('does not update transaction gas estimates when userFeeLevel is custom', () => {
        const transactionId = '1';

        const { controller } = setupController({
          options: {
            isAutomaticGasFeeUpdateEnabled: () => true,
            state: {
              transactions: [
                {
                  id: transactionId,
                  chainId: '0x1',
                  networkClientId: NETWORK_CLIENT_ID_MOCK,
                  time: 123456789,
                  status: TransactionStatus.unapproved as const,
                  gasFeeEstimates: {
                    type: GasFeeEstimateType.Legacy,
                    low: '0x1',
                    medium: '0x2',
                    high: '0x3',
                  },
                  txParams: {
                    type: TransactionEnvelopeType.legacy,
                    from: ACCOUNT_MOCK,
                    to: ACCOUNT_2_MOCK,
                    gasPrice: '0x1234',
                  },
                },
              ],
            },
          },
          updateToInitialState: true,
        });

        // Update with custom userFeeLevel and new gasPrice
        controller.updateTransactionGasFees(transactionId, {
          userFeeLevel: 'custom',
          gasPrice: '0x5678',
        });

        const updatedTransaction = controller.state.transactions.find(
          ({ id }) => id === transactionId,
        );
        expect(updatedTransaction?.txParams.gasPrice).toBe('0x5678');
        expect(updatedTransaction?.userFeeLevel).toBe('custom');
      });
    });
  });

  describe('updatePreviousGasParams', () => {
    it('throws if transaction does not exist', async () => {
      const { controller } = setupController();
      expect(() =>
        controller.updatePreviousGasParams('123', {
          maxFeePerGas: '0x1',
        }),
      ).toThrow('Cannot update transaction as no transaction metadata found');
    });

    it('throws if transaction not unapproved status', async () => {
      const transactionId = '123';
      const fnName = 'updatePreviousGasParams';
      const status = TransactionStatus.failed;
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              // TODO: Replace `any` with type
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              { id: transactionId, status } as any,
            ],
          },
        },
        updateToInitialState: true,
      });
      expect(() =>
        controller.updatePreviousGasParams(transactionId, {
          maxFeePerGas: '0x1',
        }),
      )
        .toThrow(`TransactionsController: Can only call ${fnName} on an unapproved transaction.
      Current tx status: ${status}`);
    });

    it('updates previous gas values', async () => {
      const transactionId = '123';
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: transactionId,
                status: TransactionStatus.unapproved,
                history: [{}],
                txParams: {
                  from: ACCOUNT_MOCK,
                  to: ACCOUNT_2_MOCK,
                },
                // TODO: Replace `any` with type
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any,
            ],
          },
        },
        updateToInitialState: true,
      });

      const gasLimit = '0xgasLimit';
      const maxFeePerGas = '0xmaxFeePerGas';
      const maxPriorityFeePerGas = '0xmaxPriorityFeePerGas';

      controller.updatePreviousGasParams(transactionId, {
        gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });

      const transaction = controller.state.transactions[0];

      expect(transaction?.previousGas?.gasLimit).toBe(gasLimit);
      expect(transaction?.previousGas?.maxFeePerGas).toBe(maxFeePerGas);
      expect(transaction?.previousGas?.maxPriorityFeePerGas).toBe(
        maxPriorityFeePerGas,
      );
    });
  });

  describe('on pending transactions tracker event', () => {
    /**
     * Simulate an event from the pending transaction tracker.
     *
     * @param eventName - The name of the event to fire.
     * @param args - The arguments to pass to the event handler.
     */
    function firePendingTransactionTrackerEvent(
      eventName: string,
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...args: any
    ) {
      (pendingTransactionTrackerMock.hub.on as jest.Mock).mock.calls.find(
        (call) => call[0] === eventName,
      )[1](...args);
    }

    describe('on transaction-confirmed event', () => {
      it('bubbles event', async () => {
        const listener = jest.fn();
        const statusUpdateListener = jest.fn();
        const { messenger } = setupController();

        messenger.subscribe(
          'TransactionController:transactionConfirmed',
          listener,
        );
        messenger.subscribe(
          'TransactionController:transactionStatusUpdated',
          statusUpdateListener,
        );

        firePendingTransactionTrackerEvent(
          'transaction-confirmed',
          TRANSACTION_META_MOCK,
        );

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(TRANSACTION_META_MOCK);

        expect(statusUpdateListener).toHaveBeenCalledTimes(1);
        expect(statusUpdateListener).toHaveBeenCalledWith({
          transactionMeta: TRANSACTION_META_MOCK,
        });
      });

      it('marks duplicate nonce transactions as dropped', async () => {
        const confirmed = {
          ...TRANSACTION_META_MOCK,
          id: 'testId1',
          chainId: MOCK_NETWORK.chainId,
          hash: '0x3',
          status: TransactionStatus.confirmed,
          txParams: { ...TRANSACTION_META_MOCK.txParams, nonce: '0x1' },
        };

        const duplicate_1 = {
          ...confirmed,
          id: 'testId2',
          status: TransactionStatus.submitted,
        };

        const duplicate_2 = {
          ...duplicate_1,
          id: 'testId3',
          status: TransactionStatus.approved,
        };

        const duplicate_3 = {
          ...duplicate_1,
          id: 'testId4',
          status: TransactionStatus.failed,
        };

        const wrongChain = {
          ...duplicate_1,
          id: 'testId5',
          chainId: '0x2',
          txParams: { ...duplicate_1.txParams },
        };

        const wrongNonce = {
          ...duplicate_1,
          id: 'testId6',
          txParams: { ...duplicate_1.txParams, nonce: '0x2' },
        };

        const wrongFrom = {
          ...duplicate_1,
          id: 'testId7',
          txParams: { ...duplicate_1.txParams, from: '0x2' },
        };

        const wrongType = {
          ...duplicate_1,
          id: 'testId8',
          status: TransactionStatus.confirmed,
          type: TransactionType.incoming,
        };

        const { controller } = setupController({
          options: {
            state: {
              transactions: [
                confirmed,
                wrongChain,
                wrongNonce,
                wrongFrom,
                wrongType,
                duplicate_1,
                duplicate_2,
                duplicate_3,
              ] as TransactionMeta[],
            },
          },
          updateToInitialState: true,
        });

        firePendingTransactionTrackerEvent('transaction-confirmed', confirmed);

        expect(
          controller.state.transactions.map((tx) => tx.status),
        ).toStrictEqual([
          TransactionStatus.confirmed,
          TransactionStatus.submitted,
          TransactionStatus.submitted,
          TransactionStatus.submitted,
          TransactionStatus.confirmed,
          TransactionStatus.dropped,
          TransactionStatus.dropped,
          TransactionStatus.failed,
        ]);

        expect(
          controller.state.transactions.map((tx) => tx.replacedBy),
        ).toStrictEqual([
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          confirmed.hash,
          confirmed.hash,
          confirmed.hash,
        ]);

        expect(
          controller.state.transactions.map((tx) => tx.replacedById),
        ).toStrictEqual([
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          confirmed.id,
          confirmed.id,
          confirmed.id,
        ]);
      });
    });

    it('sets status to dropped on transaction-dropped event', async () => {
      const { controller } = setupController({
        options: {
          disableHistory: true,
          state: {
            transactions: [{ ...TRANSACTION_META_MOCK }],
          },
        },
      });

      firePendingTransactionTrackerEvent(
        'transaction-dropped',
        TRANSACTION_META_MOCK,
      );

      expect(controller.state.transactions).toStrictEqual([
        { ...TRANSACTION_META_MOCK, status: TransactionStatus.dropped },
      ]);
    });

    it('sets status to failed on transaction-failed event', async () => {
      const statusUpdatedEventListener = jest.fn();
      const { controller, messenger } = setupController({
        options: {
          disableHistory: true,
          state: {
            transactions: [{ ...TRANSACTION_META_MOCK }],
          },
        },
      });
      messenger.subscribe(
        'TransactionController:transactionStatusUpdated',
        statusUpdatedEventListener,
      );

      const errorMock = new Error('TestError');
      const expectedTransactionError: TransactionError = {
        message: errorMock.message,
        name: errorMock.name,
        stack: errorMock.stack,
        code: undefined,
        rpc: undefined,
      };

      firePendingTransactionTrackerEvent(
        'transaction-failed',
        TRANSACTION_META_MOCK,
        errorMock,
      );

      const failedTx = {
        ...TRANSACTION_META_MOCK,
        status: TransactionStatus.failed,
        error: expectedTransactionError,
      };

      expect(controller.state.transactions[0]).toStrictEqual(failedTx);

      expect(statusUpdatedEventListener).toHaveBeenCalledTimes(1);
      expect(statusUpdatedEventListener).toHaveBeenCalledWith({
        transactionMeta: failedTx,
      });
    });

    it('updates transaction on transaction-updated event', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [TRANSACTION_META_MOCK],
          },
          disableHistory: true,
        },
      });

      firePendingTransactionTrackerEvent(
        'transaction-updated',
        { ...TRANSACTION_META_MOCK, retryCount: 123 },
        'TestNote',
      );

      expect(controller.state.transactions).toStrictEqual([
        {
          ...TRANSACTION_META_MOCK,
          retryCount: 123,
        },
      ]);
    });
  });

  describe('approveTransactionsWithSameNonce', () => {
    it('throws error if no sign method', async () => {
      const { controller } = setupController({
        options: {
          sign: undefined,
        },
      });
      const mockTransactionParam2 = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x222',
        to: ACCOUNT_2_MOCK,
        value: '0x1',
        chainId: MOCK_NETWORK.chainId,
      };

      await expect(
        controller.approveTransactionsWithSameNonce([mockTransactionParam2]),
      ).rejects.toThrow('No sign method defined.');
    });

    it('returns empty string if no transactions are provided', async () => {
      const { controller } = setupController();
      const result = await controller.approveTransactionsWithSameNonce([]);
      expect(result).toBe('');
    });

    it('return empty string if transaction is already being signed', async () => {
      const { controller } = setupController({
        options: {
          // We never resolve this promise, so the transaction is always in the process of being signed
          sign: async () =>
            new Promise(() => {
              /* noop */
            }),
        },
      });
      const mockTransactionParam = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x5208',
        to: ACCOUNT_2_MOCK,
        value: '0x0',
        chainId: MOCK_NETWORK.chainId,
      };

      // Send the transaction to put it in the process of being signed
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      controller.approveTransactionsWithSameNonce([mockTransactionParam]);

      // Now send it one more time to test that it doesn't get signed again
      const result = await controller.approveTransactionsWithSameNonce([
        mockTransactionParam,
      ]);

      expect(result).toBe('');
    });

    it('signs transactions and return raw transactions', async () => {
      signMock.mockImplementation(async (transactionParams) =>
        Promise.resolve(TransactionFactory.fromTxData(transactionParams)),
      );

      const { controller } = setupController();

      const mockTransactionParam = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x111',
        to: ACCOUNT_2_MOCK,
        value: '0x0',
        chainId: MOCK_NETWORK.chainId,
      };
      const mockTransactionParam2 = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x222',
        to: ACCOUNT_2_MOCK,
        value: '0x1',
        chainId: MOCK_NETWORK.chainId,
      };

      const result = await controller.approveTransactionsWithSameNonce([
        mockTransactionParam,
        mockTransactionParam2,
      ]);

      expect(result).toHaveLength(2);
      expect(result).toStrictEqual([expect.any(String), expect.any(String)]);
    });

    it('throws if error while signing transaction', async () => {
      const mockSignError = 'Error while signing transaction';

      signMock.mockImplementation(async () =>
        Promise.reject(new Error(mockSignError)),
      );

      const { controller } = setupController({
        options: {
          sign: signMock,
        },
      });
      const mockTransactionParam = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x111',
        to: ACCOUNT_2_MOCK,
        value: '0x0',
        chainId: MOCK_NETWORK.chainId,
      };
      const mockTransactionParam2 = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x222',
        to: ACCOUNT_2_MOCK,
        value: '0x1',
        chainId: MOCK_NETWORK.chainId,
      };

      await expect(
        controller.approveTransactionsWithSameNonce([
          mockTransactionParam,
          mockTransactionParam2,
        ]),
      ).rejects.toThrow(mockSignError);
    });

    it('does not create nonce lock if hasNonce set', async () => {
      const { controller } = setupController();

      const mockTransactionParam = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x111',
        to: ACCOUNT_2_MOCK,
        value: '0x0',
        chainId: MOCK_NETWORK.chainId,
      };

      const mockTransactionParam2 = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x222',
        to: ACCOUNT_2_MOCK,
        value: '0x1',
        chainId: MOCK_NETWORK.chainId,
      };

      await controller.approveTransactionsWithSameNonce(
        [mockTransactionParam, mockTransactionParam2],
        { hasNonce: true },
      );

      expect(getNonceLockSpy).not.toHaveBeenCalled();
    });

    it('uses the nonceTracker for the networkClientId matching the chainId', async () => {
      const { controller, messenger } = setupController();
      messenger.registerActionHandler(
        'NetworkController:findNetworkClientIdByChainId',
        () => 'sepolia',
      );

      const mockTransactionParam = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x111',
        to: ACCOUNT_2_MOCK,
        value: '0x0',
        chainId: MOCK_NETWORK.chainId,
      };

      const mockTransactionParam2 = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x222',
        to: ACCOUNT_2_MOCK,
        value: '0x1',
        chainId: MOCK_NETWORK.chainId,
      };

      await controller.approveTransactionsWithSameNonce([
        mockTransactionParam,
        mockTransactionParam2,
      ]);

      expect(getNonceLockSpy).toHaveBeenCalledWith(
        ACCOUNT_MOCK,
        NETWORK_CLIENT_ID_MOCK,
      );
    });
  });

  describe('with hooks', () => {
    const paramsMock: TransactionParams = {
      from: ACCOUNT_MOCK,
      to: ACCOUNT_MOCK,
    };

    const metadataMock: TransactionMeta = {
      txParams: paramsMock,
      chainId: '0x1' as const,
      networkClientId: NETWORK_CLIENT_ID_MOCK,
      id: '1',
      time: 0,
      status: TransactionStatus.approved,
    };

    it('adds a transaction, signs and update status to `approved`', async () => {
      const { controller, mockTransactionApprovalRequest } = setupController({
        options: {
          hooks: {
            afterSign: () => false,
            beforePublish: () => Promise.resolve(false),
            getAdditionalSignArguments: () => [metadataMock],
          },
        },
      });

      const updateTransactionSpy = jest.spyOn(controller, 'updateTransaction');

      await controller.addTransaction(paramsMock, {
        origin: 'origin',
        actionId: ACTION_ID_MOCK,
        networkClientId: NETWORK_CLIENT_ID_MOCK,
      });

      mockTransactionApprovalRequest.approve({
        value: TRANSACTION_META_MOCK,
      });
      await wait(0);

      const transactionMeta = controller.state.transactions[0];

      expect(signMock).toHaveBeenCalledTimes(1);

      expect(transactionMeta.txParams).toStrictEqual(
        expect.objectContaining(paramsMock),
      );
      expect(updateTransactionSpy).toHaveBeenCalledTimes(1);
      expect(updateTransactionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          txParams: expect.objectContaining(paramsMock),
        }),
        'TransactionController#signTransaction - Update after sign',
      );

      expect(transactionMeta.status).toBe(TransactionStatus.approved);
    });

    it('adds a transaction and signing returns undefined', async () => {
      signMock.mockResolvedValue(undefined);

      const { controller, mockTransactionApprovalRequest } = setupController({
        options: {
          hooks: {
            afterSign: () => false,
            beforePublish: () => Promise.resolve(false),
            getAdditionalSignArguments: () => [metadataMock],
          },
        },
      });

      await controller.addTransaction(paramsMock, {
        origin: 'origin',
        actionId: ACTION_ID_MOCK,
        networkClientId: NETWORK_CLIENT_ID_MOCK,
      });

      mockTransactionApprovalRequest.approve({
        value: TRANSACTION_META_MOCK,
      });
      await wait(0);

      expect(signMock).toHaveBeenCalledTimes(1);
    });

    it('adds a transaction, signs and skips publish the transaction', async () => {
      const { controller, mockTransactionApprovalRequest } = setupController({
        options: {
          hooks: {
            beforePublish: undefined,
            afterSign: () => false,
            getAdditionalSignArguments: () => [metadataMock],
          },
        },
      });

      const updateTransactionSpy = jest.spyOn(controller, 'updateTransaction');

      await controller.addTransaction(paramsMock, {
        origin: 'origin',
        actionId: ACTION_ID_MOCK,
        networkClientId: NETWORK_CLIENT_ID_MOCK,
      });

      mockTransactionApprovalRequest.approve();
      await wait(0);

      const transactionMeta = controller.state.transactions[0];

      expect(transactionMeta.txParams).toStrictEqual(
        expect.objectContaining(paramsMock),
      );

      expect(signMock).toHaveBeenCalledTimes(1);
      expect(updateTransactionSpy).toHaveBeenCalledTimes(1);
      expect(updateTransactionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          txParams: expect.objectContaining(paramsMock),
        }),
        'TransactionController#signTransaction - Update after sign',
      );
    });

    it('gets transaction hash from publish hook and does not submit to provider', async () => {
      const { controller } = setupController({
        options: {
          hooks: {
            publish: async () => ({
              transactionHash: '0x123',
            }),
          },
        },
        messengerOptions: {
          addTransactionApprovalRequest: {
            state: 'approved',
          },
        },
      });
      jest.spyOn(mockEthQuery, 'sendRawTransaction');

      const { result } = await controller.addTransaction(paramsMock, {
        networkClientId: NETWORK_CLIENT_ID_MOCK,
      });

      await result;

      expect(controller.state.transactions[0].hash).toBe('0x123');
      expect(mockEthQuery.sendRawTransaction).not.toHaveBeenCalled();
    });

    it('submits to provider if publish hook returns no transaction hash', async () => {
      jest
        .spyOn(mockEthQuery, 'sendRawTransaction')
        .mockImplementation((_transaction, callback) => {
          callback(undefined, 'some-transaction-hash');
        });
      const { controller } = setupController({
        options: {
          hooks: {
            // @ts-expect-error We are intentionally having this hook return no
            // transaction hash
            publish: async () => ({}),
          },
        },
        messengerOptions: {
          addTransactionApprovalRequest: {
            state: 'approved',
          },
        },
      });

      const { result } = await controller.addTransaction(paramsMock, {
        networkClientId: NETWORK_CLIENT_ID_MOCK,
      });

      await result;

      expect(controller.state.transactions[0].hash).toBe(
        'some-transaction-hash',
      );

      expect(mockEthQuery.sendRawTransaction).toHaveBeenCalledTimes(1);
    });

    it('submits to publish hook with final transaction meta', async () => {
      const publishHook = jest
        .fn()
        .mockResolvedValue({ transactionHash: TRANSACTION_META_MOCK.hash });

      const { controller } = setupController({
        options: {
          hooks: {
            publish: publishHook,
          },
        },
        messengerOptions: {
          addTransactionApprovalRequest: {
            state: 'approved',
          },
        },
      });

      const { result } = await controller.addTransaction(paramsMock, {
        networkClientId: NETWORK_CLIENT_ID_MOCK,
      });

      await result;

      expect(publishHook).toHaveBeenCalledTimes(1);
      expect(publishHook).toHaveBeenCalledWith(
        expect.objectContaining({
          txParams: expect.objectContaining({ nonce: toHex(NONCE_MOCK) }),
        }),
        expect.any(String),
      );
    });

    it('supports publish hook override per call', async () => {
      const publishHookController = jest.fn();

      const publishHookCall = jest.fn().mockResolvedValueOnce({
        transactionHash: TRANSACTION_HASH_MOCK,
      });

      const { controller } = setupController({
        options: {
          hooks: {
            publish: publishHookController,
          },
        },
        messengerOptions: {
          addTransactionApprovalRequest: {
            state: 'approved',
          },
        },
      });

      jest.spyOn(mockEthQuery, 'sendRawTransaction');

      const { result } = await controller.addTransaction(paramsMock, {
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        publishHook: publishHookCall,
      });

      await result;

      expect(controller.state.transactions[0].hash).toBe(TRANSACTION_HASH_MOCK);

      expect(publishHookCall).toHaveBeenCalledTimes(1);
      expect(publishHookController).not.toHaveBeenCalled();
      expect(mockEthQuery.sendRawTransaction).not.toHaveBeenCalled();
    });
  });

  describe('updateSecurityAlertResponse', () => {
    const mockSendFlowHistory = [
      {
        entry:
          'sendFlow - user selected transfer to my accounts on recipient screen',
        timestamp: 1650663928211,
      },
    ];

    it('add securityAlertResponse to transaction meta', async () => {
      const transactionMeta = TRANSACTION_META_MOCK;
      const { controller } = setupController({
        options: {
          state: {
            transactions: [transactionMeta],
          },
        },
      });

      controller.updateSecurityAlertResponse(transactionMeta.id, {
        reason: 'NA',
        result_type: 'Benign',
      });

      expect(
        controller.state.transactions[0].securityAlertResponse,
      ).toBeDefined();
    });

    it('should throw error if transactionMetaId is not defined', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [TRANSACTION_META_MOCK],
          },
        },
      });

      expect(() =>
        // @ts-expect-error Intentionally passing invalid input
        controller.updateSecurityAlertResponse(undefined, {
          reason: 'NA',
          result_type: 'Benign',
        }),
      ).toThrow(
        'Cannot update security alert response as no transaction metadata found',
      );
    });

    it('should throw error if securityAlertResponse is not defined', async () => {
      const transactionMetaId = '123';
      const status = TransactionStatus.submitted;
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: transactionMetaId,
                status,
                // TODO: Replace `any` with type
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any,
            ],
          },
        },
        updateToInitialState: true,
      });
      expect(controller.state.transactions[0]).toBeDefined();

      expect(() =>
        controller.updateSecurityAlertResponse(
          transactionMetaId,
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          undefined as any,
        ),
      ).toThrow(
        'updateSecurityAlertResponse: securityAlertResponse should not be null',
      );
    });

    it('should throw error if transaction with given id does not exist', async () => {
      const transactionMetaId = '123';
      const status = TransactionStatus.submitted;
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: transactionMetaId,
                status,
                txParams: {
                  from: ACCOUNT_MOCK,
                  to: ACCOUNT_2_MOCK,
                },
                history: mockSendFlowHistory,
                // TODO: Replace `any` with type
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any,
            ],
          },
        },
      });
      expect(controller.state.transactions[0]).toBeDefined();

      expect(() =>
        controller.updateSecurityAlertResponse('456', {
          reason: 'NA',
          result_type: 'Benign',
        }),
      ).toThrow(
        'Cannot update security alert response as no transaction metadata found',
      );
    });
  });

  describe('updateCustodialTransaction', () => {
    let transactionId: string;
    let statusMock: TransactionStatus;
    let baseTransaction: TransactionMeta;
    let transactionMeta: TransactionMeta;

    beforeEach(() => {
      transactionId = '1';
      statusMock = TransactionStatus.unapproved as const;
      baseTransaction = {
        id: transactionId,
        chainId: toHex(5),
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        status: statusMock,
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        },
      };
      transactionMeta = {
        ...baseTransaction,
        history: [{ ...baseTransaction }],
      };
    });

    it.each([
      {
        newStatus: TransactionStatus.signed,
      },
      {
        newStatus: TransactionStatus.submitted,
      },
      {
        newStatus: TransactionStatus.failed,
        errorMessage: 'Error mock',
      },
    ])(
      'updates transaction status to $newStatus',
      async ({ newStatus, errorMessage }) => {
        const { controller } = setupController({
          options: {
            state: {
              transactions: [transactionMeta],
            },
          },
          updateToInitialState: true,
        });

        controller.updateCustodialTransaction({
          transactionId,
          status: newStatus,
          errorMessage,
        });

        const updatedTransaction = controller.state.transactions[0];

        expect(updatedTransaction?.status).toStrictEqual(newStatus);
      },
    );

    it.each([
      {
        newStatus: TransactionStatus.submitted,
      },
      {
        newStatus: TransactionStatus.failed,
        errorMessage: 'Error mock',
      },
    ])(
      'publishes TransactionController:transactionFinished when update transaction status to $newStatus',
      async ({ newStatus, errorMessage }) => {
        const finishedEventListener = jest.fn();
        const { controller, messenger } = setupController({
          options: {
            state: {
              transactions: [transactionMeta],
            },
          },
          updateToInitialState: true,
        });
        messenger.subscribe(
          'TransactionController:transactionFinished',
          finishedEventListener,
        );

        controller.updateCustodialTransaction({
          transactionId,
          status: newStatus,
          errorMessage,
        });

        const updatedTransaction = controller.state.transactions[0];

        expect(finishedEventListener).toHaveBeenCalledTimes(1);
        expect(finishedEventListener).toHaveBeenCalledWith(
          expect.objectContaining({
            ...transactionMeta,
            status: newStatus,
          }),
        );
        expect(updatedTransaction.status).toStrictEqual(newStatus);
      },
    );

    it('updates transaction hash', async () => {
      const newHash = '0x1234';
      const { controller } = setupController({
        options: {
          state: {
            transactions: [transactionMeta],
          },
        },
        updateToInitialState: true,
      });

      controller.updateCustodialTransaction({
        transactionId,
        hash: newHash,
      });

      const updatedTransaction = controller.state.transactions[0];

      expect(updatedTransaction.hash).toStrictEqual(newHash);
    });

    it('updates gasLimit', async () => {
      const newGasLimit = '0x1234';
      const { controller } = setupController({
        options: {
          state: { transactions: [transactionMeta] },
        },
        updateToInitialState: true,
      });

      controller.updateCustodialTransaction({
        transactionId,
        gasLimit: newGasLimit,
      });

      const updatedTransaction = controller.state.transactions[0];

      expect(updatedTransaction.txParams.gasLimit).toStrictEqual(newGasLimit);
    });

    it('updates gasPrice', async () => {
      const newGasPrice = '0x1234';
      const { controller } = setupController({
        options: {
          state: { transactions: [transactionMeta] },
        },
        updateToInitialState: true,
      });

      controller.updateCustodialTransaction({
        transactionId,
        gasPrice: newGasPrice,
      });

      const updatedTransaction = controller.state.transactions[0];

      expect(updatedTransaction.txParams.gasPrice).toStrictEqual(newGasPrice);
    });

    it('updates maxFeePerGas', async () => {
      const newMaxFeePerGas = '0x1234';
      const { controller } = setupController({
        options: {
          state: { transactions: [transactionMeta] },
        },
        updateToInitialState: true,
      });

      controller.updateCustodialTransaction({
        transactionId,
        maxFeePerGas: newMaxFeePerGas,
      });

      const updatedTransaction = controller.state.transactions[0];

      expect(updatedTransaction.txParams.maxFeePerGas).toStrictEqual(
        newMaxFeePerGas,
      );
    });

    it('updates maxPriorityFeePerGas', async () => {
      const newMaxPriorityFeePerGas = '0x1234';
      const { controller } = setupController({
        options: {
          state: { transactions: [transactionMeta] },
        },
        updateToInitialState: true,
      });

      controller.updateCustodialTransaction({
        transactionId,
        maxPriorityFeePerGas: newMaxPriorityFeePerGas,
      });

      const updatedTransaction = controller.state.transactions[0];

      expect(updatedTransaction.txParams.maxPriorityFeePerGas).toStrictEqual(
        newMaxPriorityFeePerGas,
      );
    });

    it('updates nonce', async () => {
      const newNonce = '0x1234';
      const { controller } = setupController({
        options: {
          state: { transactions: [transactionMeta] },
        },
        updateToInitialState: true,
      });

      controller.updateCustodialTransaction({
        transactionId,
        nonce: newNonce,
      });

      const updatedTransaction = controller.state.transactions[0];

      expect(updatedTransaction.txParams.nonce).toStrictEqual(newNonce);
    });

    it('updates type from legacy to feeMarket', async () => {
      const newType = TransactionEnvelopeType.feeMarket;
      const { controller } = setupController({
        options: { state: { transactions: [transactionMeta] } },
        updateToInitialState: true,
      });

      controller.updateCustodialTransaction({
        transactionId,
        type: newType,
      });

      const updatedTransaction = controller.state.transactions[0];

      expect(updatedTransaction.txParams.type).toStrictEqual(newType);
    });

    it('updates type from feeMarket to legacy', async () => {
      const newType = TransactionEnvelopeType.legacy;
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                ...transactionMeta,
                txParams: {
                  ...transactionMeta.txParams,
                  maxFeePerGas: '0x1234',
                  maxPriorityFeePerGas: '0x1234',
                },
              },
            ],
          },
        },
        updateToInitialState: true,
      });

      controller.updateCustodialTransaction({
        transactionId,
        type: newType,
      });

      const updatedTransaction = controller.state.transactions[0];

      expect(updatedTransaction.txParams.maxFeePerGas).toBeUndefined();
      expect(updatedTransaction.txParams.maxPriorityFeePerGas).toBeUndefined();
    });

    it('throws if custodial transaction does not exists', async () => {
      const nonExistentId = 'nonExistentId';
      const newStatus = TransactionStatus.approved as const;
      const { controller } = setupController();

      expect(() =>
        controller.updateCustodialTransaction({
          transactionId: nonExistentId,
          status: newStatus,
        }),
      ).toThrow(
        'Cannot update custodial transaction as no transaction metadata found',
      );
    });

    it('throws if status is invalid', async () => {
      const newStatus = TransactionStatus.approved as const;
      const { controller } = setupController({
        options: {
          state: {
            transactions: [transactionMeta],
          },
        },
        updateToInitialState: true,
      });

      expect(() =>
        controller.updateCustodialTransaction({
          transactionId: transactionMeta.id,
          status: newStatus,
        }),
      ).toThrow(
        `Cannot update custodial transaction with status: ${newStatus}`,
      );
    });

    it('no property was updated', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [transactionMeta],
          },
        },
        updateToInitialState: true,
      });

      controller.updateCustodialTransaction({
        transactionId,
        ...{},
      });

      const updatedTransaction = controller.state.transactions[0];

      expect(updatedTransaction.status).toStrictEqual(transactionMeta.status);
      expect(updatedTransaction.hash).toStrictEqual(transactionMeta.hash);
    });

    it.each([
      {
        paramName: 'hash',
        newValue: '0x1234',
        expectedPath: 'hash',
      },
      {
        paramName: 'gasLimit',
        newValue: '0x1234',
        expectedPath: 'txParams.gasLimit',
      },
      {
        paramName: 'gasPrice',
        newValue: '0x1234',
        expectedPath: 'txParams.gasPrice',
      },
      {
        paramName: 'maxFeePerGas',
        newValue: '0x1234',
        expectedPath: 'txParams.maxFeePerGas',
      },
      {
        paramName: 'maxPriorityFeePerGas',
        newValue: '0x1234',
        expectedPath: 'txParams.maxPriorityFeePerGas',
      },
      {
        paramName: 'nonce',
        newValue: '0x1234',
        expectedPath: 'txParams.nonce',
      },
    ])('updates $paramName', async ({ paramName, newValue, expectedPath }) => {
      const { controller } = setupController({
        options: {
          state: { transactions: [transactionMeta] },
        },
        updateToInitialState: true,
      });

      controller.updateCustodialTransaction({
        transactionId,
        [paramName]: newValue,
      });

      const updatedTransaction = controller.state.transactions[0];
      const pathParts = expectedPath.split('.');
      let actualValue = updatedTransaction;

      for (const key of pathParts) {
        // Type assertion needed since we're accessing dynamic properties
        actualValue = actualValue[
          key as keyof typeof actualValue
        ] as typeof actualValue;
      }

      expect(actualValue).toStrictEqual(newValue);
    });

    describe('type updates', () => {
      it('updates from legacy to feeMarket', async () => {
        const newType = TransactionEnvelopeType.feeMarket;
        const { controller } = setupController({
          options: { state: { transactions: [transactionMeta] } },
          updateToInitialState: true,
        });

        controller.updateCustodialTransaction({
          transactionId,
          type: newType,
        });

        const updatedTransaction = controller.state.transactions[0];
        expect(updatedTransaction.txParams.type).toStrictEqual(newType);
      });

      it('updates from feeMarket to legacy', async () => {
        const newType = TransactionEnvelopeType.legacy;
        const { controller } = setupController({
          options: {
            state: {
              transactions: [
                {
                  ...transactionMeta,
                  txParams: {
                    ...transactionMeta.txParams,
                    maxFeePerGas: '0x1234',
                    maxPriorityFeePerGas: '0x1234',
                  },
                },
              ],
            },
          },
          updateToInitialState: true,
        });

        controller.updateCustodialTransaction({
          transactionId,
          type: newType,
        });

        const updatedTransaction = controller.state.transactions[0];
        expect(updatedTransaction.txParams.maxFeePerGas).toBeUndefined();
        expect(
          updatedTransaction.txParams.maxPriorityFeePerGas,
        ).toBeUndefined();
      });
    });
  });

  describe('getTransactions', () => {
    it('returns transactions matching values in search criteria', () => {
      const transactions: TransactionMeta[] = [
        {
          chainId: '0x1',
          id: 'testId1',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.confirmed,
          time: 1,
          txParams: { from: '0x1' },
        },
        {
          chainId: '0x1',
          id: 'testId2',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.unapproved,
          time: 2,
          txParams: { from: '0x2' },
        },
        {
          chainId: '0x1',
          id: 'testId3',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.submitted,
          time: 1,
          txParams: { from: '0x3' },
        },
      ];

      const { controller } = setupController({
        options: {
          state: { transactions },
        },
        updateToInitialState: true,
      });

      expect(
        controller.getTransactions({
          searchCriteria: { time: 1 },
        }),
      ).toStrictEqual([transactions[0], transactions[2]]);
    });

    it('returns transactions matching param values in search criteria', () => {
      const transactions: TransactionMeta[] = [
        {
          chainId: '0x1',
          id: 'testId1',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.confirmed,
          time: 1,
          txParams: { from: '0x1' },
        },
        {
          chainId: '0x1',
          id: 'testId2',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.unapproved,
          time: 2,
          txParams: { from: '0x2' },
        },
        {
          chainId: '0x1',
          id: 'testId3',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.submitted,
          time: 3,
          txParams: { from: '0x1' },
        },
      ];

      const { controller } = setupController({
        options: {
          state: { transactions },
        },
        updateToInitialState: true,
      });

      expect(
        controller.getTransactions({
          searchCriteria: { from: '0x1' },
        }),
      ).toStrictEqual([transactions[0], transactions[2]]);
    });

    it('returns transactions matching multiple values in search criteria', () => {
      const transactions: TransactionMeta[] = [
        {
          chainId: '0x1',
          id: 'testId1',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.confirmed,
          time: 1,
          txParams: { from: '0x1' },
        },
        {
          chainId: '0x1',
          id: 'testId2',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.unapproved,
          time: 2,
          txParams: { from: '0x2' },
        },
        {
          chainId: '0x1',
          id: 'testId3',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.submitted,
          time: 1,
          txParams: { from: '0x1' },
        },
      ];

      const { controller } = setupController({
        options: {
          state: { transactions },
        },
        updateToInitialState: true,
      });

      expect(
        controller.getTransactions({
          searchCriteria: { from: '0x1', time: 1 },
        }),
      ).toStrictEqual([transactions[0], transactions[2]]);
    });

    it('returns transactions matching function in search criteria', () => {
      const transactions: TransactionMeta[] = [
        {
          chainId: '0x1',
          id: 'testId1',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.confirmed,
          time: 1,
          txParams: { from: '0x1' },
        },
        {
          chainId: '0x1',
          id: 'testId2',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.unapproved,
          time: 2,
          txParams: { from: '0x2' },
        },
        {
          chainId: '0x1',
          id: 'testId3',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.submitted,
          time: 1,
          txParams: { from: '0x3' },
        },
      ];

      const { controller } = setupController({
        options: {
          state: { transactions },
        },
        updateToInitialState: true,
      });

      expect(
        controller.getTransactions({
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          searchCriteria: { time: (v: any) => v === 1 },
        }),
      ).toStrictEqual([transactions[0], transactions[2]]);
    });

    it('returns transactions matching specified chain', () => {
      const transactions: TransactionMeta[] = [
        {
          chainId: MOCK_NETWORK.chainId,
          id: 'testId1',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.confirmed,
          time: 1,
          txParams: { from: '0x1' },
        },
        {
          chainId: '0x2',
          id: 'testId2',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.unapproved,
          time: 2,
          txParams: { from: '0x2' },
        },
        {
          chainId: MOCK_NETWORK.chainId,
          id: 'testId3',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.submitted,
          time: 1,
          txParams: { from: '0x3' },
        },
      ];

      const { controller } = setupController({
        options: {
          state: { transactions },
        },
        updateToInitialState: true,
      });

      expect(
        controller.getTransactions({
          searchCriteria: { chainId: MOCK_NETWORK.chainId },
        }),
      ).toStrictEqual([transactions[0], transactions[2]]);
    });

    it('returns transactions from specified list', () => {
      const { controller } = setupController();

      const transactions: TransactionMeta[] = [
        {
          chainId: '0x1',
          id: 'testId1',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.confirmed,
          time: 1,
          txParams: { from: '0x1' },
        },
        {
          chainId: '0x1',
          id: 'testId2',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.unapproved,
          time: 2,
          txParams: { from: '0x2' },
        },
        {
          chainId: '0x1',
          id: 'testId3',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.submitted,
          time: 1,
          txParams: { from: '0x3' },
        },
      ];

      expect(
        controller.getTransactions({
          searchCriteria: { time: 1 },
          initialList: transactions,
        }),
      ).toStrictEqual([transactions[0], transactions[2]]);
    });

    it('returns limited number of transactions sorted by ascending time', () => {
      const transactions: TransactionMeta[] = [
        {
          chainId: '0x1',
          id: 'testId1',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.confirmed,
          time: 1,
          txParams: { from: '0x1', nonce: '0x1' },
        },
        {
          chainId: '0x1',
          id: 'testId2',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.confirmed,
          time: 2,
          txParams: { from: '0x1', nonce: '0x2' },
        },
        {
          chainId: '0x1',
          id: 'testId3',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.unapproved,
          time: 3,
          txParams: { from: '0x2', nonce: '0x3' },
        },
        {
          chainId: '0x1',
          id: 'testId4',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.submitted,
          time: 4,
          txParams: { from: '0x1', nonce: '0x4' },
        },
      ];

      const { controller } = setupController({
        options: {
          state: { transactions },
        },
        updateToInitialState: true,
      });

      expect(
        controller.getTransactions({
          searchCriteria: { from: '0x1' },
          limit: 2,
        }),
      ).toStrictEqual([transactions[1], transactions[3]]);
    });

    it('returns limited number of transactions except for duplicate nonces', () => {
      const transactions: TransactionMeta[] = [
        {
          chainId: '0x1',
          id: 'testId1',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.confirmed,
          time: 1,
          txParams: { from: '0x1', nonce: '0x1' },
        },
        {
          chainId: '0x1',
          id: 'testId2',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.unapproved,
          time: 2,
          txParams: { from: '0x2', nonce: '0x2' },
        },
        {
          chainId: '0x1',
          id: 'testId3',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.submitted,
          time: 3,
          txParams: { from: '0x1', nonce: '0x1' },
        },
        {
          chainId: '0x1',
          id: 'testId4',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          status: TransactionStatus.submitted,
          time: 4,
          txParams: { from: '0x1', nonce: '0x3' },
        },
      ];

      const { controller } = setupController({
        options: {
          state: { transactions },
        },
        updateToInitialState: true,
      });

      expect(
        controller.getTransactions({
          searchCriteria: { from: '0x1' },
          limit: 2,
        }),
      ).toStrictEqual([transactions[0], transactions[2], transactions[3]]);
    });
  });

  describe('updateEditableParams', () => {
    const transactionId = '1';
    const params = {
      data: '0x12',
      from: ACCOUNT_2_MOCK,
      gas: '0x0',
      gasPrice: '0x50fd51da',
      to: ACCOUNT_MOCK,
      value: '0x0',
    };

    const baseTransaction = {
      id: transactionId,
      chainId: toHex(5),
      networkClientId: NETWORK_CLIENT_ID_MOCK,
      status: TransactionStatus.unapproved as const,
      time: 123456789,
      txParams: {
        data: 'originalData',
        gas: '50000',
        gasPrice: '1000000000',
        from: ACCOUNT_MOCK,
        to: ACCOUNT_2_MOCK,
        value: '5000000000000000000',
      },
    };
    const transactionMeta: TransactionMeta = {
      ...baseTransaction,
      history: [{ ...baseTransaction }],
    };

    it('updates editable params and returns updated transaction metadata', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [transactionMeta],
          },
        },
        updateToInitialState: true,
      });

      const updatedTransaction = await controller.updateEditableParams(
        transactionId,
        params,
      );

      expect(updatedTransaction?.txParams).toStrictEqual(params);
    });

    it('updates EIP-1559 properties and returns updated transaction metadata', async () => {
      const transactionMeta1559 = {
        ...transactionMeta,
        txParams: {
          ...transactionMeta.txParams,
          gasPrice: undefined,
          maxFeePerGas: '0xdef',
          maxPriorityFeePerGas: '0xabc',
        },
      };

      const params1559: Partial<TransactionParams> = {
        ...params,
        maxFeePerGas: '0x456',
        maxPriorityFeePerGas: '0x123',
      };

      delete params1559.gasPrice;

      const { controller } = setupController({
        options: {
          state: {
            transactions: [transactionMeta1559],
          },
        },
        updateToInitialState: true,
      });

      const updatedTransaction = await controller.updateEditableParams(
        transactionId,
        params1559,
      );

      expect(updatedTransaction?.txParams).toStrictEqual(params1559);
    });

    it('updates transaction layer 1 gas fee updater', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [transactionMeta],
          },
        },
        updateToInitialState: true,
      });

      const updatedTransaction = await controller.updateEditableParams(
        transactionId,
        params,
      );

      expect(updateTransactionLayer1GasFee).toHaveBeenCalledTimes(1);
      expect(updateTransactionLayer1GasFee).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionMeta: {
            ...updatedTransaction,
            history: expect.any(Array),
          },
        }),
      );
    });

    it('updates container types', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [transactionMeta],
          },
        },
        updateToInitialState: true,
      });

      const updatedTransaction = await controller.updateEditableParams(
        transactionId,
        {
          ...params,
          containerTypes: [TransactionContainerType.EnforcedSimulations],
        },
      );

      expect(updatedTransaction?.containerTypes).toStrictEqual([
        TransactionContainerType.EnforcedSimulations,
      ]);
    });

    it('throws an error if no transaction metadata is found', async () => {
      const { controller } = setupController();
      await expect(
        controller.updateEditableParams(transactionId, params),
      ).rejects.toThrow(
        'Cannot update editable params as no transaction metadata found',
      );
    });

    it('throws an error if the transaction is not unapproved', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                ...transactionMeta,
                status: TransactionStatus.submitted as const,
              },
            ],
          },
        },
      });
      await expect(controller.updateEditableParams(transactionId, params))
        .rejects
        .toThrow(`TransactionsController: Can only call updateEditableParams on an unapproved transaction.
      Current tx status: ${TransactionStatus.submitted}`);
    });
  });

  describe('abortTransactionSigning', () => {
    it('throws if transaction does not exist', () => {
      const { controller } = setupController();

      expect(() =>
        controller.abortTransactionSigning(TRANSACTION_META_MOCK.id),
      ).toThrow('Cannot abort signing as no transaction metadata found');
    });

    it('throws if transaction not being signed', () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [TRANSACTION_META_MOCK],
          },
        },
      });

      expect(() =>
        controller.abortTransactionSigning(TRANSACTION_META_MOCK.id),
      ).toThrow(
        'Cannot abort signing as transaction is not waiting for signing',
      );
    });

    it('sets status to failed if transaction being signed', async () => {
      const { controller } = setupController({
        options: {
          sign: jest.fn().mockReturnValue(createDeferredPromise().promise),
        },
        messengerOptions: {
          addTransactionApprovalRequest: {
            state: 'approved',
          },
        },
      });

      const { transactionMeta, result } = await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        },
      );

      result.catch(() => {
        // Ignore error
      });

      await flushPromises();

      controller.abortTransactionSigning(transactionMeta.id);

      await flushPromises();

      expect(controller.state.transactions[0].status).toBe(
        TransactionStatus.failed,
      );
      expect(controller.state.transactions[0].error?.message).toBe(
        'Signing aborted by user',
      );
    });
  });

  describe('getLayer1GasFee', () => {
    it('calls getTransactionLayer1GasFee with the correct parameters', async () => {
      const chainIdMock = '0x1';
      const networkClientIdMock = 'mainnet';
      const layer1GasFeeMock = '0x12356';

      getTransactionLayer1GasFeeMock.mockResolvedValueOnce(layer1GasFeeMock);

      const { controller } = setupController();

      const result = await controller.getLayer1GasFee({
        transactionParams: TRANSACTION_META_MOCK.txParams,
        chainId: chainIdMock,
        networkClientId: networkClientIdMock,
      });

      expect(result).toBe(layer1GasFeeMock);
      expect(getTransactionLayer1GasFee).toHaveBeenCalledTimes(1);
    });
  });

  describe('estimateGasFee', () => {
    it('returns estimates from gas fee flow', async () => {
      const gasFeeFlowMock = buildMockGasFeeFlow();

      gasFeeFlowMock.getGasFees.mockResolvedValueOnce(GAS_FEE_ESTIMATES_MOCK);
      getGasFeeFlowMock.mockReturnValueOnce(gasFeeFlowMock);

      const { controller } = setupController();

      const result = await controller.estimateGasFee({
        transactionParams: TRANSACTION_META_MOCK.txParams,
        networkClientId: NETWORK_CLIENT_ID_MOCK,
      });

      expect(result).toStrictEqual(GAS_FEE_ESTIMATES_MOCK);
    });

    it('calls flow with transaction metadata matching args', async () => {
      const gasFeeFlowMock = buildMockGasFeeFlow();

      gasFeeFlowMock.getGasFees.mockResolvedValueOnce(GAS_FEE_ESTIMATES_MOCK);
      getGasFeeFlowMock.mockReturnValueOnce(gasFeeFlowMock);

      const { controller } = setupController();

      await controller.estimateGasFee({
        transactionParams: TRANSACTION_META_MOCK.txParams,
        chainId: CHAIN_ID_MOCK,
        networkClientId: NETWORK_CLIENT_ID_MOCK,
      });

      expect(gasFeeFlowMock.getGasFees).toHaveBeenCalledTimes(1);
      expect(gasFeeFlowMock.getGasFees).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionMeta: {
            txParams: TRANSACTION_META_MOCK.txParams,
            chainId: CHAIN_ID_MOCK,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        }),
      );
    });
  });

  describe('resimulate', () => {
    it('triggers simulation if re-simulation detected on state update', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                ...TRANSACTION_META_MOCK,
                status: TransactionStatus.unapproved,
              },
            ],
          },
        },
        updateToInitialState: true,
      });

      expect(getBalanceChangesMock).toHaveBeenCalledTimes(0);

      shouldResimulateMock.mockReturnValueOnce({
        blockTime: 123,
        resimulate: true,
      });

      await controller.updateEditableParams(TRANSACTION_META_MOCK.id, {});

      await flushPromises();

      expect(getBalanceChangesMock).toHaveBeenCalledTimes(1);
      expect(getBalanceChangesMock).toHaveBeenCalledWith({
        blockTime: 123,
        ethQuery: expect.any(Object),
        nestedTransactions: undefined,
        txParams: {
          data: undefined,
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
          value: TRANSACTION_META_MOCK.txParams.value,
        },
      });
    });

    it('does not trigger simulation loop', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                ...TRANSACTION_META_MOCK,
                status: TransactionStatus.unapproved,
              },
            ],
          },
        },
        updateToInitialState: true,
      });

      expect(getBalanceChangesMock).toHaveBeenCalledTimes(0);

      shouldResimulateMock.mockReturnValue({
        blockTime: 123,
        resimulate: true,
      });

      await controller.updateEditableParams(TRANSACTION_META_MOCK.id, {});

      await flushPromises();

      expect(getBalanceChangesMock).toHaveBeenCalledTimes(1);
      expect(getBalanceChangesMock).toHaveBeenCalledWith({
        blockTime: 123,
        ethQuery: expect.any(Object),
        nestedTransactions: undefined,
        txParams: {
          data: undefined,
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
          value: TRANSACTION_META_MOCK.txParams.value,
        },
      });
    });
  });

  describe('setTransactionActive', () => {
    it('throws if transaction does not exist', async () => {
      const { controller } = setupController();
      expect(() => controller.setTransactionActive('123', true)).toThrow(
        'Transaction with id 123 not found',
      );
    });

    it('updates the isActive state of a transaction', async () => {
      const transactionId = '123';
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: transactionId,
                status: TransactionStatus.unapproved,
                history: [{}],
                txParams: {
                  from: ACCOUNT_MOCK,
                  to: ACCOUNT_2_MOCK,
                },
              } as unknown as TransactionMeta,
            ],
          },
        },
        updateToInitialState: true,
      });

      controller.setTransactionActive(transactionId, true);

      const transaction = controller.state.transactions[0];

      expect(transaction?.isActive).toBe(true);
    });
  });

  describe('addTransactionBatch', () => {
    it('invokes util', async () => {
      const { controller } = setupController();

      await controller.addTransactionBatch({
        from: ACCOUNT_MOCK,
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        transactions: [
          {
            params: {
              to: ACCOUNT_2_MOCK,
              data: '0x123456',
              value: '0x123',
            },
          },
        ],
      });

      expect(addTransactionBatchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateAtomicBatchData', () => {
    /**
     * Template for updateAtomicBatchData test.
     *
     * @returns The controller instance and function result;
     */
    async function updateAtomicBatchDataTemplate() {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                ...TRANSACTION_META_MOCK,
                nestedTransactions: [
                  {
                    to: ACCOUNT_2_MOCK,
                    data: '0x1234',
                  },
                  {
                    to: ACCOUNT_2_MOCK,
                    data: '0x4567',
                  },
                ],
              },
            ],
          },
        },
      });

      const result = await controller.updateAtomicBatchData({
        transactionId: TRANSACTION_META_MOCK.id,
        transactionIndex: 1,
        transactionData: '0x89AB',
      });

      return { controller, result };
    }

    it('updates transaction params', async () => {
      const { controller } = await updateAtomicBatchDataTemplate();

      expect(controller.state.transactions[0]?.txParams.data).toContain('89ab');
      expect(controller.state.transactions[0]?.txParams.data).not.toContain(
        '4567',
      );
    });

    it('updates nested transaction', async () => {
      const { controller } = await updateAtomicBatchDataTemplate();

      expect(
        controller.state.transactions[0]?.nestedTransactions?.[1]?.data,
      ).toBe('0x89AB');
    });

    it('returns updated batch transaction data', async () => {
      const { result } = await updateAtomicBatchDataTemplate();

      expect(result).toContain('89ab');
      expect(result).not.toContain('4567');
    });

    it('updates gas', async () => {
      const gasMock = '0x1234';
      const gasLimitNoBufferMock = '0x123';
      const simulationFailsMock = { reason: 'testReason', debug: {} };

      updateGasMock.mockImplementationOnce(async (request) => {
        request.txMeta.txParams.gas = gasMock;
        request.txMeta.simulationFails = simulationFailsMock;
        request.txMeta.gasLimitNoBuffer = gasLimitNoBufferMock;
      });

      const { controller } = await updateAtomicBatchDataTemplate();

      const stateTransaction = controller.state.transactions[0];

      expect(stateTransaction.txParams.gas).toBe(gasMock);
      expect(stateTransaction.simulationFails).toStrictEqual(
        simulationFailsMock,
      );
      expect(stateTransaction.gasLimitNoBuffer).toBe(gasLimitNoBufferMock);
    });

    it('throws if nested transaction does not exist', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [TRANSACTION_META_MOCK],
          },
        },
      });

      await expect(
        controller.updateAtomicBatchData({
          transactionId: TRANSACTION_META_MOCK.id,
          transactionIndex: 0,
          transactionData: '0x89AB',
        }),
      ).rejects.toThrow('Nested transaction not found');
    });

    it('throws if batch transaction does not exist', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [TRANSACTION_META_MOCK],
          },
        },
      });

      await expect(
        controller.updateAtomicBatchData({
          transactionId: 'invalidId',
          transactionIndex: 0,
          transactionData: '0x89AB',
        }),
      ).rejects.toThrow(
        'Cannot update transaction as ID not found - invalidId',
      );
    });
  });

  describe('updateSelectedGasFeeToken', () => {
    it('updates selected gas fee token in state', () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                ...TRANSACTION_META_MOCK,
                gasFeeTokens: [GAS_FEE_TOKEN_MOCK],
              },
            ],
          },
        },
      });

      controller.updateSelectedGasFeeToken(
        TRANSACTION_META_MOCK.id,
        GAS_FEE_TOKEN_MOCK.tokenAddress,
      );

      expect(controller.state.transactions[0].selectedGasFeeToken).toBe(
        GAS_FEE_TOKEN_MOCK.tokenAddress,
      );
    });

    it('throws if transaction does not exist', () => {
      const { controller } = setupController();

      expect(() =>
        controller.updateSelectedGasFeeToken(
          TRANSACTION_META_MOCK.id,
          GAS_FEE_TOKEN_MOCK.tokenAddress,
        ),
      ).toThrow(
        `Cannot update transaction as ID not found - ${TRANSACTION_META_MOCK.id}`,
      );
    });

    it('throws if no matching gas fee token', () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              { ...TRANSACTION_META_MOCK, gasFeeTokens: [GAS_FEE_TOKEN_MOCK] },
            ],
          },
        },
      });

      expect(() =>
        controller.updateSelectedGasFeeToken(TRANSACTION_META_MOCK.id, '0x123'),
      ).toThrow('No matching gas fee token found');
    });
  });
});
