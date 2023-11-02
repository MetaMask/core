/* eslint-disable jest/expect-expect */
import { TransactionFactory } from '@ethereumjs/tx';
import type {
  AcceptResultCallbacks,
  AddResult,
} from '@metamask/approval-controller';
import {
  ChainId,
  NetworkType,
  NetworksTicker,
  toHex,
  BUILT_IN_NETWORKS,
  ORIGIN_METAMASK,
} from '@metamask/controller-utils';
import type {
  BlockTracker,
  NetworkState,
  Provider,
} from '@metamask/network-controller';
import { NetworkClientType, NetworkStatus } from '@metamask/network-controller';
import { errorCodes, providerErrors, rpcErrors } from '@metamask/rpc-errors';
import HttpProvider from 'ethjs-provider-http';
import NonceTracker from 'nonce-tracker';

import { FakeBlockTracker } from '../../../tests/fake-block-tracker';
import { mockNetwork } from '../../../tests/mock-network';
import { IncomingTransactionHelper } from './helpers/IncomingTransactionHelper';
import { PendingTransactionTracker } from './helpers/PendingTransactionTracker';
import type {
  TransactionControllerMessenger,
  TransactionConfig,
} from './TransactionController';
import { TransactionController } from './TransactionController';
import type {
  TransactionMeta,
  DappSuggestedGasFees,
  TransactionParams,
  TransactionHistoryEntry,
} from './types';
import { WalletDevice, TransactionStatus, TransactionType } from './types';
import { estimateGas, updateGas } from './utils/gas';
import { updateGasFees } from './utils/gas-fees';

const MOCK_V1_UUID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const v1Stub = jest.fn().mockImplementation(() => MOCK_V1_UUID);

jest.mock('uuid', () => {
  return {
    ...jest.requireActual('uuid'),
    v1: () => v1Stub(),
  };
});

jest.mock('./utils/gas');
jest.mock('./utils/gas-fees');

const mockFlags: { [key: string]: any } = {
  estimateGasError: null,
  estimateGasValue: null,
  getBlockByNumberValue: null,
};

jest.mock('@metamask/eth-query', () =>
  jest.fn().mockImplementation(() => {
    return {
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
      gasPrice: (callback: any) => {
        callback(undefined, '0x0');
      },
      getBlockByNumber: (
        _blocknumber: any,
        _fetchTxs: boolean,
        callback: any,
      ) => {
        if (mockFlags.getBlockByNumberValue) {
          callback(undefined, { gasLimit: '0x12a05f200' });
          return;
        }
        callback(undefined, { gasLimit: '0x0' });
      },
      getCode: (_to: any, callback: any) => {
        callback(undefined, '0x0');
      },
      getTransactionByHash: (_hash: string, callback: any) => {
        const txs: any = [
          { blockNumber: '0x1', hash: '1337' },
          { blockNumber: null, hash: '1338' },
        ];
        const tx: any = txs.find((element: any) => element.hash === _hash);
        callback(undefined, tx);
      },
      getTransactionCount: (_from: any, _to: any, callback: any) => {
        callback(undefined, '0x0');
      },
      sendRawTransaction: (_transaction: any, callback: any) => {
        callback(undefined, '1337');
      },
      getTransactionReceipt: (_hash: any, callback: any) => {
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
        const tx: any = txs.find((element: any) => element.hash === _hash);
        callback(undefined, tx);
      },
      getBlockByHash: (_blockHash: any, callback: any) => {
        const blocks: any = [
          {
            baseFeePerGas: '0x14',
            hash: '1337',
            number: '0x1',
            timestamp: '628dc0c8',
          },
          { hash: '1338', number: '0x2' },
        ];
        const block: any = blocks.find(
          (element: any) => element.hash === _blockHash,
        );
        callback(undefined, block);
      },
    };
  }),
);

jest.mock('./helpers/IncomingTransactionHelper');
jest.mock('./helpers/PendingTransactionTracker');

/**
 * Builds a mock block tracker with a canned block number that can be used in
 * tests.
 *
 * @param latestBlockNumber - The block number that the block tracker should
 * always return.
 * @returns The mocked block tracker.
 */
function buildMockBlockTracker(latestBlockNumber: string): BlockTracker {
  const fakeBlockTracker = new FakeBlockTracker();
  fakeBlockTracker.mockLatestBlockNumber(latestBlockNumber);
  return fakeBlockTracker;
}

/**
 * Create an object containing mock result callbacks to be used when testing the approval process.
 *
 * @returns The mock result callbacks.
 */
function buildMockResultCallbacks(): AcceptResultCallbacks {
  return {
    success: jest.fn(),
    error: jest.fn(),
  };
}

/**
 * Create a mock controller messenger.
 *
 * @param opts - Options to customize the mock messenger.
 * @param opts.approved - Whether transactions should immediately be approved or rejected.
 * @param opts.delay - Whether to delay approval or rejection until the returned functions are called.
 * @param opts.resultCallbacks - The result callbacks to return when a request is approved.
 * @returns The mock controller messenger.
 */
function buildMockMessenger({
  approved,
  delay,
  resultCallbacks,
}: {
  approved?: boolean;
  delay?: boolean;
  resultCallbacks?: AcceptResultCallbacks;
}): {
  messenger: TransactionControllerMessenger;
  approve: () => void;
  reject: (reason: unknown) => void;
} {
  let approve, reject;
  let promise: Promise<AddResult>;

  if (delay) {
    promise = new Promise((res, rej) => {
      approve = () => res({ resultCallbacks });
      reject = rej;
    });
  }

  const messenger = {
    call: jest.fn().mockImplementation(() => {
      if (approved) {
        return Promise.resolve({ resultCallbacks });
      }

      if (delay) {
        return promise;
      }

      // eslint-disable-next-line prefer-promise-reject-errors
      return Promise.reject({
        code: errorCodes.provider.userRejectedRequest,
      });
    }),
  } as unknown as TransactionControllerMessenger;

  return {
    messenger,
    approve: approve as unknown as () => void,
    reject: reject as unknown as (reason: unknown) => void,
  };
}

/**
 * Wait for the controller to emit a transaction finished event.
 *
 * @param controller - The transaction controller to monitor.
 * @param options - Options to customize the wait.
 * @param options.confirmed - Whether to wait for the transaction to be confirmed or just finished.
 * @returns A promise that resolves with the transaction meta when the transaction is finished.
 */
function waitForTransactionFinished(
  controller: TransactionController,
  { confirmed = false } = {},
): Promise<TransactionMeta> {
  return new Promise((resolve) => {
    controller.hub.once(
      `${controller.state.transactions[0].id}:${
        confirmed ? 'confirmed' : 'finished'
      }`,
      (txMeta) => {
        resolve(txMeta);
      },
    );
  });
}

const MOCK_PREFERENCES = { state: { selectedAddress: 'foo' } };
const INFURA_PROJECT_ID = '341eacb578dd44a1a049cbc5f6fd4035';
const GOERLI_PROVIDER = new HttpProvider(
  `https://goerli.infura.io/v3/${INFURA_PROJECT_ID}`,
);
const MAINNET_PROVIDER = new HttpProvider(
  `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
);
const PALM_PROVIDER = new HttpProvider(
  `https://palm-mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
);

type MockNetwork = {
  provider: Provider;
  blockTracker: BlockTracker;
  state: NetworkState;
  subscribe: (listener: (state: NetworkState) => void) => void;
};

const MOCK_NETWORK: MockNetwork = {
  provider: MAINNET_PROVIDER,
  blockTracker: buildMockBlockTracker('0x102833C'),
  state: {
    selectedNetworkClientId: NetworkType.goerli,
    networksMetadata: {
      [NetworkType.goerli]: {
        EIPS: { 1559: false },
        status: NetworkStatus.Available,
      },
    },
    providerConfig: {
      type: NetworkType.goerli,
      chainId: ChainId.goerli,
      ticker: NetworksTicker.goerli,
    },
    networkConfigurations: {},
  },
  subscribe: () => undefined,
};
const MOCK_NETWORK_WITHOUT_CHAIN_ID: MockNetwork = {
  provider: GOERLI_PROVIDER,
  blockTracker: buildMockBlockTracker('0x102833C'),
  state: {
    selectedNetworkClientId: NetworkType.goerli,
    networksMetadata: {
      [NetworkType.goerli]: {
        EIPS: { 1559: false },
        status: NetworkStatus.Available,
      },
    },
    providerConfig: {
      type: NetworkType.goerli,
    } as NetworkState['providerConfig'],
    networkConfigurations: {},
  },
  subscribe: () => undefined,
};
const MOCK_MAINNET_NETWORK: MockNetwork = {
  provider: MAINNET_PROVIDER,
  blockTracker: buildMockBlockTracker('0x102833C'),
  state: {
    selectedNetworkClientId: NetworkType.mainnet,
    networksMetadata: {
      [NetworkType.mainnet]: {
        EIPS: { 1559: false },
        status: NetworkStatus.Available,
      },
    },
    providerConfig: {
      type: NetworkType.mainnet,
      chainId: ChainId.mainnet,
      ticker: NetworksTicker.mainnet,
    },
    networkConfigurations: {},
  },
  subscribe: () => undefined,
};

const MOCK_LINEA_MAINNET_NETWORK: MockNetwork = {
  provider: PALM_PROVIDER,
  blockTracker: buildMockBlockTracker('0xA6EDFC'),
  state: {
    selectedNetworkClientId: NetworkType['linea-mainnet'],
    networksMetadata: {
      [NetworkType['linea-mainnet']]: {
        EIPS: { 1559: false },
        status: NetworkStatus.Available,
      },
    },
    providerConfig: {
      type: NetworkType['linea-mainnet'],
      chainId: toHex(59144),
      ticker: NetworksTicker['linea-mainnet'],
    },
    networkConfigurations: {},
  },
  subscribe: () => undefined,
};

const MOCK_LINEA_GOERLI_NETWORK: MockNetwork = {
  provider: PALM_PROVIDER,
  blockTracker: buildMockBlockTracker('0xA6EDFC'),
  state: {
    selectedNetworkClientId: NetworkType['linea-goerli'],
    networksMetadata: {
      [NetworkType['linea-goerli']]: {
        EIPS: { 1559: false },
        status: NetworkStatus.Available,
      },
    },
    providerConfig: {
      type: NetworkType['linea-goerli'],
      chainId: toHex(59140),
      ticker: NetworksTicker['linea-goerli'],
    },
    networkConfigurations: {},
  },
  subscribe: () => undefined,
};

const MOCK_CUSTOM_NETWORK: MockNetwork = {
  provider: PALM_PROVIDER,
  blockTracker: buildMockBlockTracker('0xA6EDFC'),
  state: {
    selectedNetworkClientId: 'uuid-1',
    networksMetadata: {
      'uuid-1': {
        EIPS: { 1559: false },
        status: NetworkStatus.Available,
      },
    },
    providerConfig: {
      type: NetworkType.rpc,
      chainId: toHex(11297108109),
      ticker: 'TEST',
    },
    networkConfigurations: {},
  },
  subscribe: () => undefined,
};

const ACCOUNT_MOCK = '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207';
const ACCOUNT_2_MOCK = '0x08f137f335ea1b8f193b8f6ea92561a60d23a211';
const NONCE_MOCK = 12;
const ACTION_ID_MOCK = '123456';

const TRANSACTION_META_MOCK = {
  hash: '0x1',
  status: TransactionStatus.confirmed as const,
  time: 123456789,
  txParams: {
    from: ACCOUNT_MOCK,
    to: ACCOUNT_2_MOCK,
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

describe('TransactionController', () => {
  const updateGasMock = jest.mocked(updateGas);
  const updateGasFeesMock = jest.mocked(updateGasFees);
  const estimateGasMock = jest.mocked(estimateGas);

  let resultCallbacksMock: AcceptResultCallbacks;
  let messengerMock: TransactionControllerMessenger;
  let rejectMessengerMock: TransactionControllerMessenger;
  let delayMessengerMock: TransactionControllerMessenger;
  let approveTransaction: () => void;
  let getNonceLockSpy: jest.Mock;
  let incomingTransactionHelperMock: jest.Mocked<IncomingTransactionHelper>;
  let pendingTransactionTrackerMock: jest.Mocked<PendingTransactionTracker>;
  let timeCounter = 0;

  const incomingTransactionHelperClassMock =
    IncomingTransactionHelper as jest.MockedClass<
      typeof IncomingTransactionHelper
    >;

  const pendingTransactionTrackerClassMock =
    PendingTransactionTracker as jest.MockedClass<
      typeof PendingTransactionTracker
    >;

  /**
   * Create a new instance of the TransactionController.
   *
   * @param opts - Options to use when creating the controller.
   * @param opts.options - Any controller options to override the test defaults.
   * @param opts.config - Any configuration to override the test defaults.
   * @param opts.network - The mock network to use with the controller.
   * @param opts.approve - Whether transactions should be immediately approved.
   * @param opts.reject - Whether transactions should be immediately rejected.
   * @returns The new TransactionController instance.
   */
  function newController({
    options,
    config,
    network,
    approve,
    reject,
  }: {
    options?: any;
    config?: Partial<TransactionConfig>;
    network?: MockNetwork;
    approve?: boolean;
    reject?: boolean;
  } = {}): TransactionController {
    const finalNetwork = network ?? MOCK_NETWORK;
    let messenger = delayMessengerMock;

    if (approve) {
      messenger = messengerMock;
    }

    if (reject) {
      messenger = rejectMessengerMock;
    }

    return new TransactionController(
      {
        blockTracker: finalNetwork.blockTracker,
        getNetworkState: () => finalNetwork.state,
        getCurrentAccountEIP1559Compatibility: () => true,
        getCurrentNetworkEIP1559Compatibility: () => true,
        getGasFeeEstimates: () => ({}),
        getPermittedAccounts: () => [ACCOUNT_MOCK],
        getSelectedAddress: () => ACCOUNT_MOCK,
        messenger,
        onNetworkStateChange: finalNetwork.subscribe,
        provider: finalNetwork.provider,
        ...options,
      },
      {
        sign: async (transaction: any) => transaction,
        ...config,
      },
    );
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
    jest.spyOn(Date, 'now').mockImplementation(() => {
      timeCounter += 1;
      return timeCounter;
    });

    for (const key of Object.keys(mockFlags)) {
      mockFlags[key] = null;
    }

    resultCallbacksMock = buildMockResultCallbacks();

    messengerMock = buildMockMessenger({
      approved: true,
      resultCallbacks: resultCallbacksMock,
    }).messenger;

    rejectMessengerMock = buildMockMessenger({
      approved: false,
      resultCallbacks: resultCallbacksMock,
    }).messenger;

    ({ messenger: delayMessengerMock, approve: approveTransaction } =
      buildMockMessenger({
        delay: true,
        resultCallbacks: resultCallbacksMock,
      }));

    getNonceLockSpy = jest.fn().mockResolvedValue({
      nextNonce: NONCE_MOCK,
      releaseLock: () => Promise.resolve(),
    });

    NonceTracker.prototype.getNonceLock = getNonceLockSpy;

    incomingTransactionHelperMock = {
      hub: {
        on: jest.fn(),
      },
    } as unknown as jest.Mocked<IncomingTransactionHelper>;

    pendingTransactionTrackerMock = {
      start: jest.fn(),
      hub: {
        on: jest.fn(),
      },
    } as unknown as jest.Mocked<PendingTransactionTracker>;

    incomingTransactionHelperClassMock.mockReturnValue(
      incomingTransactionHelperMock,
    );

    pendingTransactionTrackerClassMock.mockReturnValue(
      pendingTransactionTrackerMock,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('sets default state', () => {
      const controller = newController();
      expect(controller.state).toStrictEqual({
        methodData: {},
        transactions: [],
        lastFetchedBlockNumbers: {},
      });
    });

    it('sets default config', () => {
      const controller = newController();
      expect(controller.config).toStrictEqual({
        txHistoryLimit: 40,
        sign: expect.any(Function),
      });
    });
  });

  describe('estimateGas', () => {
    it('returns estimatedGas and simulation fails', async () => {
      const gasMock = '0x123';

      const simulationFailsMock = {
        errorKey: 'testKey',
      };

      const controller = newController();

      estimateGasMock.mockResolvedValue({
        estimatedGas: gasMock,
        simulationFails: simulationFailsMock,
      } as any);

      const { gas, simulationFails } = await controller.estimateGas({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      expect(gas).toBe(gasMock);
      expect(simulationFails).toBe(simulationFailsMock);
    });
  });

  describe('with actionId', () => {
    it('adds single unapproved transaction when called twice with same actionId', async () => {
      const controller = newController();

      const mockOrigin = 'origin';

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          origin: mockOrigin,
          actionId: ACTION_ID_MOCK,
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
        },
      );
      const secondTransactionCount = controller.state.transactions.length;

      expect(firstTransactionCount).toStrictEqual(secondTransactionCount);
      expect(delayMessengerMock.call).toHaveBeenCalledTimes(1);
      expect(delayMessengerMock.call).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
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
      const controller = newController();

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
        },
      );

      firstResult
        .then(() => {
          firstTransactionCompleted = true;
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
        },
      );
      secondResult
        .then(() => {
          secondTransactionCompleted = true;
        })
        .catch(() => undefined);

      await wait(0);

      expect(firstTransactionCompleted).toBe(false);
      expect(secondTransactionCompleted).toBe(false);

      approveTransaction();
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
        const controller = newController();
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
          },
        );
        const { transactions } = controller.state;

        expect(transactions).toHaveLength(expectedTransactionCount);
        expect(delayMessengerMock.call).toHaveBeenCalledTimes(
          expectedRequestApprovalCalledTimes,
        );
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
        const controller = newController();
        const signSpy = jest.spyOn(controller, 'sign');

        const { transactionMeta } = await controller.addTransaction({
          from: ACCOUNT_MOCK,
          gas: '0x0',
          gasPrice: '0x50fd51da',
          to: ACCOUNT_MOCK,
          value: '0x0',
        });
        await controller.speedUpTransaction(transactionMeta.id, undefined, {
          actionId: ACTION_ID_MOCK,
        });

        await controller.speedUpTransaction(transactionMeta.id, undefined, {
          actionId,
        });

        const { transactions } = controller.state;
        expect(transactions).toHaveLength(expectedTransactionCount);
        expect(signSpy).toHaveBeenCalledTimes(expectedSignCalledTimes);
      },
    );
  });

  describe('addTransaction', () => {
    it('adds unapproved transaction to state', async () => {
      const controller = newController();

      const mockDeviceConfirmedOn = WalletDevice.OTHER;
      const mockOrigin = 'origin';
      const mockSecurityAlertResponse = {
        resultType: 'Malicious',
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
        },
      );

      const transactionMeta = controller.state.transactions[0];

      expect(transactionMeta.txParams.from).toBe(ACCOUNT_MOCK);
      expect(transactionMeta.chainId).toBe(
        MOCK_NETWORK.state.providerConfig.chainId,
      );
      expect(transactionMeta.deviceConfirmedOn).toBe(mockDeviceConfirmedOn);
      expect(transactionMeta.origin).toBe(mockOrigin);
      expect(transactionMeta.status).toBe(TransactionStatus.unapproved);
      expect(transactionMeta.securityAlertResponse).toBe(
        mockSecurityAlertResponse,
      );
      expect(controller.state.transactions[0].sendFlowHistory).toStrictEqual(
        mockSendFlowHistory,
      );
    });

    it('generates initial history', async () => {
      const controller = newController();

      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      const expectedInitialSnapshot = {
        actionId: undefined,
        chainId: expect.any(String),
        dappSuggestedGasFees: undefined,
        deviceConfirmedOn: undefined,
        id: expect.any(String),
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
      expect(controller.state.transactions[0]?.history).toStrictEqual([
        expectedInitialSnapshot,
      ]);
    });

    describe('adds dappSuggestedGasFees to transaction', () => {
      it.each([
        ['origin is MM', ORIGIN_METAMASK],
        ['origin is not defined', undefined],
        ['no fee information is given', 'MockDappOrigin'],
      ])('as undefined if %s', async (_testName, origin) => {
        const controller = newController();
        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            origin,
          },
        );
        expect(
          controller.state.transactions[0]?.dappSuggestedGasFees,
        ).toBeUndefined();
      });

      it.each<[keyof DappSuggestedGasFees]>([
        ['gasPrice'],
        ['maxFeePerGas'],
        ['maxPriorityFeePerGas'],
        ['gas'],
      ])(
        'if %s is defined',
        async (gasPropName: keyof DappSuggestedGasFees) => {
          const controller = newController();
          const mockDappOrigin = 'MockDappOrigin';
          const mockGasValue = '0x1';
          await controller.addTransaction(
            {
              from: ACCOUNT_MOCK,
              to: ACCOUNT_MOCK,
              [gasPropName]: mockGasValue,
            },
            {
              origin: mockDappOrigin,
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

    it.each([
      ['mainnet', MOCK_MAINNET_NETWORK],
      ['custom network', MOCK_CUSTOM_NETWORK],
    ])(
      'adds unapproved transaction to state after switching to %s',
      async (_networkName, newNetwork) => {
        const getNetworkState = jest.fn().mockReturnValue(MOCK_NETWORK.state);

        let networkStateChangeListener: ((state: NetworkState) => void) | null =
          null;

        const onNetworkStateChange = (
          listener: (state: NetworkState) => void,
        ) => {
          networkStateChangeListener = listener;
        };

        const controller = newController({
          options: { getNetworkState, onNetworkStateChange },
        });

        // switch from Goerli to Mainnet
        getNetworkState.mockReturnValue(newNetwork.state);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        networkStateChangeListener!(newNetwork.state);

        await controller.addTransaction({
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        });

        expect(controller.state.transactions[0].txParams.from).toBe(
          ACCOUNT_MOCK,
        );
        expect(controller.state.transactions[0].chainId).toBe(
          newNetwork.state.providerConfig.chainId,
        );
        expect(controller.state.transactions[0].status).toBe(
          TransactionStatus.unapproved,
        );
      },
    );

    it('throws if address invalid', async () => {
      const controller = newController();
      await expect(controller.addTransaction({ from: 'foo' })).rejects.toThrow(
        'Invalid "from" address',
      );
    });

    it('increments nonce when adding a new non-cancel non-speedup transaction', async () => {
      v1Stub
        .mockImplementationOnce(() => 'aaaab1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')
        .mockImplementationOnce(() => 'bbbb1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');

      const controller = newController({ approve: true });

      const { result: firstResult } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x0',
        gasPrice: '0x50fd51da',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      await firstResult.catch(() => undefined);

      const firstTransaction = controller.state.transactions[0];

      // eslint-disable-next-line jest/prefer-spy-on
      NonceTracker.prototype.getNonceLock = jest.fn().mockResolvedValue({
        nextNonce: NONCE_MOCK + 1,
        releaseLock: () => Promise.resolve(),
      });

      const { result: secondResult } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x2',
        gasPrice: '0x50fd51da',
        to: ACCOUNT_MOCK,
        value: '0x1290',
      });

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
      const controller = newController();

      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      expect(delayMessengerMock.call).toHaveBeenCalledTimes(1);
      expect(delayMessengerMock.call).toHaveBeenCalledWith(
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
      const controller = newController();

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          requireApproval: false,
        },
      );

      expect(delayMessengerMock.call).toHaveBeenCalledTimes(0);
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

      const controller = newController({
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
      expect(securityProviderResponse).toBe(mockSecurityProviderResponse);
    });

    it('updates gas properties', async () => {
      const controller = newController();

      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      expect(updateGasMock).toHaveBeenCalledTimes(1);
      expect(updateGasMock).toHaveBeenCalledWith({
        ethQuery: expect.any(Object),
        providerConfig: MOCK_NETWORK.state.providerConfig,
        txMeta: expect.any(Object),
      });
    });

    it('updates gas fee properties', async () => {
      const controller = newController();

      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      expect(updateGasFeesMock).toHaveBeenCalledTimes(1);
      expect(updateGasFeesMock).toHaveBeenCalledWith({
        eip1559: true,
        ethQuery: expect.any(Object),
        getGasFeeEstimates: expect.any(Function),
        txMeta: expect.any(Object),
      });
    });

    describe('on approve', () => {
      it('submits transaction', async () => {
        const controller = newController({ approve: true });
        const submittedEventListener = jest.fn();
        controller.hub.on('transaction-submitted', submittedEventListener);

        const { result } = await controller.addTransaction({
          from: ACCOUNT_MOCK,
          gas: '0x0',
          gasPrice: '0x0',
          to: ACCOUNT_MOCK,
          value: '0x0',
        });

        await result;

        const { txParams, status, submittedTime } =
          controller.state.transactions[0];
        expect(txParams.from).toBe(ACCOUNT_MOCK);
        expect(txParams.nonce).toBe(`0x${NONCE_MOCK.toString(16)}`);
        expect(status).toBe(TransactionStatus.submitted);
        expect(submittedTime).toStrictEqual(expect.any(Number));

        expect(submittedEventListener).toHaveBeenCalledTimes(1);
        expect(submittedEventListener).toHaveBeenCalledWith({
          transactionMeta: controller.state.transactions[0],
        });
      });

      it('reports success to approval acceptor', async () => {
        const controller = newController({ approve: true });

        const { result } = await controller.addTransaction({
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        });

        await result;

        expect(resultCallbacksMock.success).toHaveBeenCalledTimes(1);
      });

      it('reports error to approval acceptor on error', async () => {
        const controller = newController({
          approve: true,
          config: { sign: undefined },
        });

        const { result } = await controller.addTransaction({
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        });

        try {
          await result;
        } catch {
          // Expected error
        }

        expect(resultCallbacksMock.error).toHaveBeenCalledTimes(1);
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
          const { result } = await controller.addTransaction({
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          });

          await expect(result).rejects.toThrow(expectedError);

          const { txParams, status } = controller.state.transactions[0];
          expect(txParams.from).toBe(ACCOUNT_MOCK);
          expect(txParams.to).toBe(ACCOUNT_MOCK);
          expect(status).toBe(TransactionStatus.failed);
        }

        it('if signing error', async () => {
          const controller = newController({
            approve: true,
            config: {
              sign: () => {
                throw new Error('foo');
              },
            },
          });

          await expectTransactionToFail(controller, 'foo');
        });

        it('if no sign method defined', async () => {
          const controller = newController({
            approve: true,
            config: {
              sign: undefined,
            },
          });

          await expectTransactionToFail(controller, 'No sign method defined');
        });

        it('if no chainId defined', async () => {
          const controller = newController({
            approve: true,
            network: MOCK_NETWORK_WITHOUT_CHAIN_ID,
          });

          await expectTransactionToFail(controller, 'No chainId defined');
        });

        it('if unexpected status', async () => {
          const controller = newController();

          (
            delayMessengerMock.call as jest.MockedFunction<any>
          ).mockImplementationOnce(() => {
            throw new Error('Unknown problem');
          });

          const { result } = await controller.addTransaction({
            from: ACCOUNT_MOCK,
            gas: '0x0',
            gasPrice: '0x0',
            to: ACCOUNT_MOCK,
            value: '0x0',
          });

          await expect(result).rejects.toThrow('Unknown problem');
        });

        it('if unrecognised error', async () => {
          const controller = newController();

          (
            delayMessengerMock.call as jest.MockedFunction<any>
          ).mockImplementationOnce(() => {
            throw new Error('TestError');
          });

          const { result } = await controller.addTransaction({
            from: ACCOUNT_MOCK,
            gas: '0x0',
            gasPrice: '0x0',
            to: ACCOUNT_MOCK,
            value: '0x0',
          });

          await expect(result).rejects.toThrow('TestError');
        });

        it('if transaction removed', async () => {
          const controller = newController();

          (
            delayMessengerMock.call as jest.MockedFunction<any>
          ).mockImplementationOnce(() => {
            controller.state.transactions = [];
            throw new Error('Unknown problem');
          });

          const { result } = await controller.addTransaction({
            from: ACCOUNT_MOCK,
            gas: '0x0',
            gasPrice: '0x0',
            to: ACCOUNT_MOCK,
            value: '0x0',
          });

          await expect(result).rejects.toThrow('Unknown problem');
        });
      });
    });

    describe('on reject', () => {
      it('cancels transaction', async () => {
        const controller = newController({ reject: true });

        const { result } = await controller.addTransaction({
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        });

        const finishedPromise = waitForTransactionFinished(controller);

        await expect(result).rejects.toThrow('User rejected the transaction');

        const { txParams, status } = await finishedPromise;
        expect(txParams.from).toBe(ACCOUNT_MOCK);
        expect(status).toBe(TransactionStatus.rejected);
      });

      it('emits rejected and finished event', async () => {
        const controller = newController({ reject: true });
        const rejectedEventListener = jest.fn();
        const finishedEventListener = jest.fn();

        controller.hub.on('transaction-rejected', rejectedEventListener);

        const mockActionId = 'mockActionId';

        const { result, transactionMeta } = await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            actionId: mockActionId,
          },
        );

        controller.hub.on(
          `${transactionMeta.id}:finished`,
          finishedEventListener,
        );

        const finishedPromise = waitForTransactionFinished(controller);

        try {
          await result;
        } catch (error) {
          // Ignore user rejected error as it is expected
        }
        await finishedPromise;

        expect(rejectedEventListener).toHaveBeenCalledTimes(1);
        expect(rejectedEventListener).toHaveBeenCalledWith({
          transactionMeta,
          actionId: mockActionId,
        });

        expect(finishedEventListener).toHaveBeenCalledTimes(1);
        expect(finishedEventListener).toHaveBeenCalledWith(transactionMeta);
      });
    });

    describe('checks from address origin', () => {
      it('throws if `from` address is different from current selected address', async () => {
        const controller = newController();
        const origin = ORIGIN_METAMASK;
        const notSelectedFromAddress = ACCOUNT_2_MOCK;
        await expect(
          controller.addTransaction(
            {
              from: notSelectedFromAddress,
              to: ACCOUNT_MOCK,
            },
            { origin: ORIGIN_METAMASK },
          ),
        ).rejects.toThrow(
          rpcErrors.internal({
            message: `Internally initiated transaction is using invalid account.`,
            data: {
              origin,
              fromAddress: notSelectedFromAddress,
              selectedAddress: ACCOUNT_MOCK,
            },
          }),
        );
      });

      it('throws if the origin does not have permissions to initiate transactions from the specified address', async () => {
        const controller = newController();
        const expectedOrigin = 'originMocked';
        await expect(
          controller.addTransaction(
            { from: ACCOUNT_2_MOCK, to: ACCOUNT_MOCK },
            { origin: expectedOrigin },
          ),
        ).rejects.toThrow(
          providerErrors.unauthorized({ data: { origin: expectedOrigin } }),
        );
      });
    });
  });

  describe('wipeTransactions', () => {
    it('removes all transactions on current network', async () => {
      const controller = newController();

      controller.wipeTransactions();

      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      controller.wipeTransactions();

      expect(controller.state.transactions).toHaveLength(0);
    });

    it('removes only txs with given address', async () => {
      const controller = newController();

      controller.wipeTransactions();

      const mockFromAccount1 = '0x1bf137f335ea1b8f193b8f6ea92561a60d23a207';
      const mockFromAccount2 = '0x2bf137f335ea1b8f193b8f6ea92561a60d23a207';
      const mockCurrentChainId = toHex(5);

      controller.state.transactions.push({
        id: '1',
        chainId: mockCurrentChainId,
        status: TransactionStatus.confirmed as const,
        time: 123456789,
        txParams: {
          from: mockFromAccount1,
        },
      });

      controller.state.transactions.push({
        id: '2',
        chainId: mockCurrentChainId,
        status: TransactionStatus.confirmed as const,
        time: 987654321,
        txParams: {
          from: mockFromAccount2,
        },
      });

      controller.wipeTransactions(true, mockFromAccount2);

      expect(controller.state.transactions).toHaveLength(1);
      expect(controller.state.transactions[0].id).toBe('1');
    });

    it('removes only txs with given address only on current network', async () => {
      const controller = newController();

      controller.wipeTransactions();

      const mockFromAccount1 = '0x1bf137f335ea1b8f193b8f6ea92561a60d23a207';
      const mockDifferentChainId = toHex(1);
      const mockCurrentChainId = toHex(5);

      controller.state.transactions.push({
        id: '1',
        chainId: mockCurrentChainId,
        txParams: {
          from: mockFromAccount1,
        },
        status: TransactionStatus.confirmed as const,
        time: 123456789,
      });

      controller.state.transactions.push({
        id: '4',
        chainId: mockDifferentChainId,
        txParams: {
          from: mockFromAccount1,
        },
        status: TransactionStatus.confirmed as const,
        time: 987654321,
      });

      controller.wipeTransactions(false, mockFromAccount1);

      expect(controller.state.transactions).toHaveLength(1);
      expect(controller.state.transactions[0].id).toBe('4');
    });
  });

  describe('handleMethodData', () => {
    it('loads method data from registry', async () => {
      const controller = newController({ network: MOCK_MAINNET_NETWORK });
      mockNetwork({
        networkClientConfiguration: {
          chainId: BUILT_IN_NETWORKS.mainnet.chainId,
          ticker: BUILT_IN_NETWORKS.mainnet.ticker,
          type: NetworkClientType.Infura,
          network: 'mainnet',
          infuraProjectId: INFURA_PROJECT_ID,
        },
        mocks: [
          {
            request: {
              method: 'eth_call',
              params: [
                {
                  to: '0x44691B39d1a75dC4E0A0346CBB15E310e6ED1E86',
                  data: '0xb46bcdaaf39b5b9b00000000000000000000000000000000000000000000000000000000',
                },
                'latest',
              ],
            },
            response: {
              result:
                '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000024657468546f546f6b656e53776170496e7075742875696e743235362c75696e743235362900000000000000000000000000000000000000000000000000000000',
            },
          },
        ],
      });
      const registry = await controller.handleMethodData('0xf39b5b9b');

      expect(registry.parsedRegistryMethod).toStrictEqual({
        args: [{ type: 'uint256' }, { type: 'uint256' }],
        name: 'Eth To Token Swap Input',
      });
      expect(registry.registryMethod).toBe(
        'ethToTokenSwapInput(uint256,uint256)',
      );
    });

    it('skips reading registry if already cached in state', async () => {
      const controller = newController({ network: MOCK_MAINNET_NETWORK });
      mockNetwork({
        networkClientConfiguration: {
          ticker: BUILT_IN_NETWORKS.mainnet.ticker,
          chainId: BUILT_IN_NETWORKS.mainnet.chainId,
          type: NetworkClientType.Infura,
          network: 'mainnet',
          infuraProjectId: INFURA_PROJECT_ID,
        },
        mocks: [
          {
            request: {
              method: 'eth_call',
              params: [
                {
                  to: '0x44691B39d1a75dC4E0A0346CBB15E310e6ED1E86',
                  data: '0xb46bcdaaf39b5b9b00000000000000000000000000000000000000000000000000000000',
                },
                'latest',
              ],
            },
            response: {
              result:
                '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000024657468546f546f6b656e53776170496e7075742875696e743235362c75696e743235362900000000000000000000000000000000000000000000000000000000',
            },
          },
        ],
      });

      await controller.handleMethodData('0xf39b5b9b');

      const registryLookup = jest.spyOn<TransactionController, never>(
        controller,
        'registryLookup' as never,
      );

      await controller.handleMethodData('0xf39b5b9b');

      expect(registryLookup).not.toHaveBeenCalled();
    });
  });

  describe('stopTransaction', () => {
    it('rejects result promise', async () => {
      const controller = newController({
        network: MOCK_LINEA_GOERLI_NETWORK,
      });

      const { result, transactionMeta } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x0',
        gasPrice: '0x1',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      const finishedPromise = waitForTransactionFinished(controller);

      await controller.stopTransaction(transactionMeta.id, undefined, {
        estimatedBaseFee: '0x123',
      });

      const { estimatedBaseFee } = await finishedPromise;

      approveTransaction();

      const { transactions } = controller.state;
      await expect(result).rejects.toThrow('User cancelled the transaction');
      expect(estimatedBaseFee).toBe('0x123');
      expect(transactions[0].status).toStrictEqual(TransactionStatus.cancelled);
      expect(transactions[0].type).toStrictEqual(TransactionType.simpleSend);
    });

    it('rejects unknown transaction', async () => {
      const controller = newController({
        network: MOCK_LINEA_GOERLI_NETWORK,
      });

      await controller.stopTransaction('transactionIdMock', {
        gasPrice: '0x1',
      });

      const signSpy = jest.spyOn(controller, 'sign');

      expect(signSpy).toHaveBeenCalledTimes(0);
    });

    it('throws if no sign method', async () => {
      const controller = newController({ config: { sign: undefined } });

      await controller.addTransaction({ from: ACCOUNT_MOCK, to: ACCOUNT_MOCK });

      await expect(
        controller.stopTransaction(controller.state.transactions[0].id),
      ).rejects.toThrow('No sign method defined');
    });

    it('emits transaction events', async () => {
      const controller = newController({
        network: MOCK_LINEA_GOERLI_NETWORK,
      });

      const approvedEventListener = jest.fn();
      const submittedEventListener = jest.fn();
      const finishedEventListener = jest.fn();

      const mockActionId = 'mockActionId';

      controller.hub.on('transaction-approved', approvedEventListener);
      controller.hub.on('transaction-approved', submittedEventListener);

      const { result, transactionMeta } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x0',
        gasPrice: '0x1',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      controller.hub.on(
        `${transactionMeta.id}:finished`,
        finishedEventListener,
      );

      const finishedPromise = waitForTransactionFinished(controller);

      await controller.stopTransaction(transactionMeta.id, undefined, {
        estimatedBaseFee: '0x123',
        actionId: mockActionId,
      });

      await finishedPromise;

      approveTransaction();

      try {
        await result;
      } catch (error) {
        // Ignore user rejected error as it is expected
      }

      expect(approvedEventListener).toHaveBeenCalledTimes(1);
      expect(approvedEventListener).toHaveBeenCalledWith({
        actionId: mockActionId,
        transactionMeta,
      });

      expect(submittedEventListener).toHaveBeenCalledTimes(1);
      expect(submittedEventListener).toHaveBeenCalledWith({
        actionId: mockActionId,
        transactionMeta,
      });

      expect(finishedEventListener).toHaveBeenCalledTimes(1);
      expect(finishedEventListener).toHaveBeenCalledWith(transactionMeta);
    });
  });

  describe('speedUpTransaction', () => {
    it('creates additional transaction with increased gas', async () => {
      const controller = newController({
        network: MOCK_LINEA_MAINNET_NETWORK,
        options: {
          getCurrentNetworkEIP1559Compatibility: () => false,
        },
      });

      const { transactionMeta } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x0',
        gasPrice: '0x50fd51da',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      await controller.speedUpTransaction(transactionMeta.id);

      const { transactions } = controller.state;
      expect(transactions).toHaveLength(2);
      expect(transactions[1].txParams.gasPrice).toBe(
        '0x5916a6d6', // 1.1 * 0x50fd51da
      );
    });

    it('verifies s,r and v values are correctly populated', async () => {
      const controller = newController({
        network: MOCK_LINEA_MAINNET_NETWORK,
        config: {
          sign: async (transaction: any) => {
            transaction.r = '1b';
            transaction.s = 'abc';
            transaction.v = '123';
            return transaction;
          },
        },
      });

      const { transactionMeta } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x0',
        gasPrice: '0x50fd51da',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      await controller.speedUpTransaction(transactionMeta.id);

      const { transactions } = controller.state;
      expect(transactions).toHaveLength(2);
      const speedUpTransaction = transactions[1];
      expect(speedUpTransaction.r).toBe('0x1b');
      expect(speedUpTransaction.s).toBe('0xabc');
      expect(speedUpTransaction.v).toBe('0x123');
    });

    it('creates additional transaction specifying the gasPrice', async () => {
      const controller = newController({
        network: MOCK_LINEA_MAINNET_NETWORK,
        options: {
          getCurrentNetworkEIP1559Compatibility: () => false,
        },
      });

      const { transactionMeta } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x0',
        gasPrice: '0x50fd51da',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      await controller.speedUpTransaction(transactionMeta.id, {
        gasPrice: '0x62DEF4DA',
      });

      const { transactions } = controller.state;
      expect(transactions).toHaveLength(2);
      expect(transactions[1].txParams.gasPrice).toBe('0x62DEF4DA');
    });

    it('uses the same nonce', async () => {
      const controller = newController({ approve: true });

      const { transactionMeta, result } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x1',
        gasPrice: '0x50fd51da',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

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
      const controller = newController({
        approve: true,
        config: {
          txHistoryLimit: 1,
        },
      });

      const { transactionMeta, result } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        nonce: '1111111',
        gas: '0x0',
        gasPrice: '0x50fd51da',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      await result;
      await controller.speedUpTransaction(transactionMeta.id);

      expect(controller.state.transactions).toHaveLength(2);
    });

    it('emits transaction events', async () => {
      const controller = newController({
        network: MOCK_LINEA_MAINNET_NETWORK,
      });

      const approvedEventListener = jest.fn();
      const submittedEventListener = jest.fn();
      const finishedEventListener = jest.fn();

      const mockActionId = 'mockActionId';

      controller.hub.on('transaction-approved', approvedEventListener);
      controller.hub.on('transaction-approved', submittedEventListener);

      const { transactionMeta: firstTransactionMeta } =
        await controller.addTransaction({
          from: ACCOUNT_MOCK,
          gas: '0x0',
          gasPrice: '0x1',
          to: ACCOUNT_MOCK,
          value: '0x0',
        });

      controller.hub.on(
        `${firstTransactionMeta.id}:speedup`,
        finishedEventListener,
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

      expect(finishedEventListener).toHaveBeenCalledTimes(1);
      expect(finishedEventListener).toHaveBeenCalledWith(speedUpTransaction);
    });
  });

  describe('getNonceLock', () => {
    it('gets the next nonce according to the nonce-tracker', async () => {
      const controller = newController({
        network: MOCK_LINEA_MAINNET_NETWORK,
      });

      const { nextNonce } = await controller.getNonceLock(ACCOUNT_MOCK);

      expect(getNonceLockSpy).toHaveBeenCalledTimes(1);
      expect(getNonceLockSpy).toHaveBeenCalledWith(ACCOUNT_MOCK);
      expect(nextNonce).toBe(NONCE_MOCK);
    });
  });

  describe('initApprovals', () => {
    const txMeta: TransactionMeta = {
      hash: '1337',
      id: 'mocked',
      chainId: toHex(5),
      status: TransactionStatus.unapproved as const,
      txParams: { data: '0x', from: ACCOUNT_MOCK },
      time: 123456789,
    };
    it('creates approvals for all unapproved transaction', async () => {
      const controller = newController();
      controller.state.transactions.push(txMeta);
      controller.state.transactions.push({
        ...txMeta,
        id: 'mocked1',
        hash: '1338',
      });

      controller.initApprovals();

      expect(delayMessengerMock.call).toHaveBeenCalledTimes(2);
      expect(delayMessengerMock.call).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          expectsResult: true,
          id: 'mocked',
          origin: 'metamask',
          requestData: { txId: 'mocked' },
          type: 'transaction',
        },
        false,
      );
      expect(delayMessengerMock.call).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          expectsResult: true,
          id: 'mocked1',
          origin: 'metamask',
          requestData: { txId: 'mocked1' },
          type: 'transaction',
        },
        false,
      );
    });

    it('does not create any approval when there is no unapproved transaction', async () => {
      const controller = newController();
      controller.initApprovals();

      expect(delayMessengerMock.call).not.toHaveBeenCalled();
    });

    it('catches error without code property in error object', async () => {
      const mockedErrorMessage = 'mocked error';
      (
        delayMessengerMock.call as jest.MockedFunction<any>
      ).mockImplementationOnce(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw { message: mockedErrorMessage };
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const controller = newController({
        options: {
          disableHistory: true,
        },
      });

      controller.state.transactions.push(txMeta);

      controller.initApprovals();
      await wait(0);

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error during persisted transaction approval',
        new Error(mockedErrorMessage),
      );
      expect(delayMessengerMock.call).toHaveBeenCalledTimes(1);
    });

    it('catches error when user reject approval', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      (
        delayMessengerMock.call as jest.MockedFunction<any>
      ).mockImplementationOnce(() => {
        throw providerErrors.userRejectedRequest();
      });

      const controller = newController();
      controller.state.transactions.push(txMeta);

      controller.initApprovals();
      await wait(0);

      expect(consoleSpy).toHaveBeenCalledTimes(0);
      expect(delayMessengerMock.call).toHaveBeenCalledTimes(1);
    });
  });

  describe('confirmExternalTransaction', () => {
    it('adds external transaction to the state as confirmed', async () => {
      const controller = newController();

      const externalTransactionToConfirm = {
        id: '1',
        chainId: toHex(1),
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
      const controller = newController();

      const externalTransactionToConfirm = {
        from: ACCOUNT_MOCK,
        to: ACCOUNT_2_MOCK,
        id: '1',
        chainId: toHex(1),
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

    it('marks the same nonce local transactions statuses as dropped and defines replacedBy properties', async () => {
      const droppedEventListener = jest.fn();
      const controller = newController({
        options: {
          disableHistory: true,
        },
      });
      controller.hub.on('transaction-dropped', droppedEventListener);

      const externalTransactionId = '1';
      const externalTransactionHash = '0x1';
      const externalTransactionToConfirm = {
        from: ACCOUNT_MOCK,
        to: ACCOUNT_2_MOCK,
        hash: externalTransactionHash,
        id: externalTransactionId,
        chainId: toHex(5),
        status: TransactionStatus.confirmed as const,
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
          nonce: String(NONCE_MOCK),
        },
      };
      const externalTransactionReceipt = {
        gasUsed: '0x5208',
      };
      const externalBaseFeePerGas = '0x14';

      // Submitted local unapproved transaction
      const localTransactionIdWithSameNonce = '9';
      controller.state.transactions.push({
        id: localTransactionIdWithSameNonce,
        chainId: toHex(5),
        status: TransactionStatus.unapproved as const,
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
          nonce: String(NONCE_MOCK),
        },
      });

      await controller.confirmExternalTransaction(
        externalTransactionToConfirm,
        externalTransactionReceipt,
        externalBaseFeePerGas,
      );

      const droppedTx = controller.state.transactions.find(
        (transaction) => transaction.id === localTransactionIdWithSameNonce,
      );

      expect(droppedTx?.status).toBe(TransactionStatus.dropped);

      expect(droppedTx?.replacedById).toBe(externalTransactionId);

      expect(droppedTx?.replacedBy).toBe(externalTransactionHash);
      expect(droppedEventListener).toHaveBeenCalledTimes(1);
      expect(droppedEventListener).toHaveBeenCalledWith({
        transactionMeta: droppedTx,
      });
    });

    it('doesnt mark transaction as dropped if same nonce local transaction status is failed', async () => {
      const controller = newController();
      const externalTransactionId = '1';
      const externalTransactionHash = '0x1';
      const externalTransactionToConfirm = {
        from: ACCOUNT_MOCK,
        to: ACCOUNT_2_MOCK,
        hash: externalTransactionHash,
        id: externalTransactionId,
        chainId: toHex(5),
        status: TransactionStatus.confirmed as const,
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
          nonce: String(NONCE_MOCK),
        },
      };
      const externalTransactionReceipt = {
        gasUsed: '0x5208',
      };
      const externalBaseFeePerGas = '0x14';

      // Off-chain failed local transaction
      const localTransactionIdWithSameNonce = '9';
      controller.state.transactions.push({
        id: localTransactionIdWithSameNonce,
        chainId: toHex(5),
        status: TransactionStatus.failed as const,
        error: new Error('mock error'),
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
          nonce: String(NONCE_MOCK),
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

    it('emits confirmed event', async () => {
      const controller = newController();

      const confirmedEventListener = jest.fn();

      controller.hub.on('transaction-confirmed', confirmedEventListener);

      const externalTransactionToConfirm = {
        from: ACCOUNT_MOCK,
        to: ACCOUNT_2_MOCK,
        id: '1',
        chainId: toHex(1),
        status: TransactionStatus.confirmed,
        txParams: {
          gasUsed: undefined,
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        },
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

      const externalTransaction = controller.state.transactions[0];

      expect(confirmedEventListener).toHaveBeenCalledTimes(1);
      expect(confirmedEventListener).toHaveBeenCalledWith({
        transactionMeta: externalTransaction,
      });
    });
  });

  describe('updateTransactionSendFlowHistory', () => {
    it('appends sendFlowHistory entries to transaction meta', async () => {
      const controller = newController();
      const mockSendFlowHistory = [
        {
          entry:
            'sendFlow - user selected transfer to my accounts on recipient screen',
          timestamp: 1650663928211,
        },
      ];
      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });
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
      const controller = newController();
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
      const controller = newController();
      const mockSendFlowHistory = [
        {
          entry:
            'sendFlow - user selected transfer to my accounts on recipient screen',
          timestamp: 1650663928211,
        },
      ];
      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });
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
      const controller = newController({
        options: { disableSendFlowHistory: true },
      });
      const mockSendFlowHistory = [
        {
          entry:
            'sendFlow - user selected transfer to my accounts on recipient screen',
          timestamp: 1650663928211,
        },
      ];
      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });
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
      const controller = newController();
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
      const controller = newController();
      const mockSendFlowHistory = [
        {
          entry:
            'sendFlow - user selected transfer to my accounts on recipient screen',
          timestamp: 1650663928211,
        },
      ];
      controller.state.transactions.push({
        id: 'foo',
        chainId: toHex(5),
        hash: '1337',
        status: TransactionStatus.submitted as const,
        time: 123456789,
        txParams: {
          from: MOCK_PREFERENCES.state.selectedAddress,
        },
      });
      expect(() =>
        controller.updateTransactionSendFlowHistory(
          'foo',
          0,
          mockSendFlowHistory,
        ),
      )
        .toThrow(`Can only call updateTransactionSendFlowHistory on an unapproved transaction.
      Current tx status: submitted`);
    });
  });

  describe('on incoming transaction helper transactions event', () => {
    it('adds new transactions to state', async () => {
      const controller = newController();

      await (incomingTransactionHelperMock.hub.on as any).mock.calls[0][1]({
        added: [TRANSACTION_META_MOCK, TRANSACTION_META_2_MOCK],
        updated: [],
      });

      expect(controller.state.transactions).toStrictEqual([
        TRANSACTION_META_MOCK,
        TRANSACTION_META_2_MOCK,
      ]);
    });

    it('updates existing transactions in state', async () => {
      const controller = newController();

      controller.state.transactions = [
        TRANSACTION_META_MOCK,
        TRANSACTION_META_2_MOCK,
      ];

      const updatedTransaction = {
        ...TRANSACTION_META_MOCK,
        status: 'failed',
      };

      await (incomingTransactionHelperMock.hub.on as any).mock.calls[0][1]({
        added: [],
        updated: [updatedTransaction],
      });

      expect(controller.state.transactions).toStrictEqual([
        updatedTransaction,
        TRANSACTION_META_2_MOCK,
      ]);
    });

    it('limits max transactions when adding to state', async () => {
      const controller = newController({ config: { txHistoryLimit: 1 } });

      await (incomingTransactionHelperMock.hub.on as any).mock.calls[0][1]({
        added: [TRANSACTION_META_MOCK, TRANSACTION_META_2_MOCK],
        updated: [],
      });

      expect(controller.state.transactions).toStrictEqual([
        TRANSACTION_META_2_MOCK,
      ]);
    });
  });

  describe('on incoming transaction helper lastFetchedBlockNumbers event', () => {
    it('updates state', async () => {
      const controller = newController();

      const lastFetchedBlockNumbers = {
        key: 234,
      };

      await (incomingTransactionHelperMock.hub.on as any).mock.calls[1][1]({
        lastFetchedBlockNumbers,
        blockNumber: 123,
      });

      expect(controller.state.lastFetchedBlockNumbers).toStrictEqual(
        lastFetchedBlockNumbers,
      );
    });

    it('emits incomingTransactionBlock event', async () => {
      const blockNumber = 123;
      const listener = jest.fn();

      const controller = newController();
      controller.hub.on('incomingTransactionBlock', listener);

      await (incomingTransactionHelperMock.hub.on as any).mock.calls[1][1]({
        lastFetchedBlockNumbers: {
          key: 234,
        },
        blockNumber,
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(blockNumber);
    });
  });

  describe('updateTransactionGasFees', () => {
    it('throws if transaction does not exist', async () => {
      const controller = newController();
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
      const controller = newController();
      controller.state.transactions.push({
        id: transactionId,
        status,
        error: new Error('mock error'),
        chainId: '0x1',
        time: 123456789,
        txParams: {} as TransactionParams,
      });
      expect(() =>
        controller.updateTransactionGasFees(transactionId, {
          gasPrice: '0x1',
        }),
      ).toThrow(`Can only call ${fnName} on an unapproved transaction.
      Current tx status: ${status}`);
    });

    it('updates provided gas values', async () => {
      const transactionId = '123';
      const controller = newController();

      const gas = '0xgas';
      const gasLimit = '0xgasLimit';
      const gasPrice = '0xgasPrice';
      const maxPriorityFeePerGas = '0xmaxPriorityFeePerGas';
      const maxFeePerGas = '0xmaxFeePerGas';
      const estimateUsed = '0xestimateUsed';
      const estimateSuggested = '0xestimateSuggested';
      const defaultGasEstimates = '0xdefaultGasEstimates';
      const originalGasEstimate = '0xoriginalGasEstimate';
      const userEditedGasLimit = true;
      const userFeeLevel = '0xuserFeeLevel';

      controller.state.transactions.push({
        id: transactionId,
        chainId: '0x1',
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
      });

      controller.updateTransactionGasFees(transactionId, {
        gas,
        gasLimit,
        gasPrice,
        maxPriorityFeePerGas,
        maxFeePerGas,
        estimateUsed,
        estimateSuggested,
        defaultGasEstimates,
        originalGasEstimate,
        userEditedGasLimit,
        userFeeLevel,
      });

      const transaction = controller.state.transactions[0];

      expect(transaction?.txParams?.gas).toBe(gas);
      expect(transaction?.txParams?.gasLimit).toBe(gasLimit);
      expect(transaction?.txParams?.gasPrice).toBe(gasPrice);
      expect(transaction?.txParams?.maxPriorityFeePerGas).toBe(
        maxPriorityFeePerGas,
      );
      expect(transaction?.txParams?.maxFeePerGas).toBe(maxFeePerGas);
      expect(transaction?.estimateUsed).toBe(estimateUsed);
      expect(transaction?.estimateSuggested).toBe(estimateSuggested);
      expect(transaction?.defaultGasEstimates).toBe(defaultGasEstimates);
      expect(transaction?.originalGasEstimate).toBe(originalGasEstimate);
      expect(transaction?.userEditedGasLimit).toBe(userEditedGasLimit);
      expect(transaction?.userFeeLevel).toBe(userFeeLevel);
    });
  });

  describe('updatePreviousGasParams', () => {
    it('throws if transaction does not exist', async () => {
      const controller = newController();
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
      const controller = newController();
      controller.state.transactions.push({
        id: transactionId,
        status,
      } as any);
      expect(() =>
        controller.updatePreviousGasParams(transactionId, {
          maxFeePerGas: '0x1',
        }),
      ).toThrow(`Can only call ${fnName} on an unapproved transaction.
      Current tx status: ${status}`);
    });

    it('updates previous gas values', async () => {
      const transactionId = '123';
      const controller = newController();

      const gasLimit = '0xgasLimit';
      const maxFeePerGas = '0xmaxFeePerGas';
      const maxPriorityFeePerGas = '0xmaxPriorityFeePerGas';

      controller.state.transactions.push({
        id: transactionId,
        status: TransactionStatus.unapproved,
        history: [{}],
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        },
      } as any);

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
      ...args: any
    ) {
      (pendingTransactionTrackerMock.hub.on as jest.Mock).mock.calls.find(
        (call) => call[0] === eventName,
      )[1](...args);
    }

    it('bubbles on transaction-confirmed event', async () => {
      const listener = jest.fn();
      const controller = newController();

      controller.hub.on(`${TRANSACTION_META_MOCK.id}:confirmed`, listener);

      firePendingTransactionTrackerEvent(
        'transaction-confirmed',
        TRANSACTION_META_MOCK,
      );

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(TRANSACTION_META_MOCK);
    });

    it('sets status to dropped on transaction-dropped event', async () => {
      const controller = newController({
        options: { disableHistory: true },
      });

      controller.state.transactions = [{ ...TRANSACTION_META_MOCK }];

      firePendingTransactionTrackerEvent(
        'transaction-dropped',
        TRANSACTION_META_MOCK,
      );

      expect(controller.state.transactions).toStrictEqual([
        { ...TRANSACTION_META_MOCK, status: TransactionStatus.dropped },
      ]);
    });

    it('sets status to failed on transaction-failed event', async () => {
      const controller = newController({
        options: { disableHistory: true },
      });

      controller.state.transactions = [{ ...TRANSACTION_META_MOCK }];

      firePendingTransactionTrackerEvent(
        'transaction-failed',
        TRANSACTION_META_MOCK,
        new Error('TestError'),
      );

      expect(controller.state.transactions).toStrictEqual([
        {
          ...TRANSACTION_META_MOCK,
          status: TransactionStatus.failed,
          error: new Error('TestError'),
        },
      ]);
    });

    it('updates transaction on transaction-updated event', async () => {
      const controller = newController({
        options: { disableHistory: true },
      });

      controller.state.transactions = [{ ...TRANSACTION_META_MOCK }];

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
      const controller = newController({
        config: {
          sign: undefined,
        },
      });
      const mockTransactionParam2 = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x222',
        to: ACCOUNT_2_MOCK,
        value: '0x1',
      };

      await expect(
        controller.approveTransactionsWithSameNonce([mockTransactionParam2]),
      ).rejects.toThrow('No sign method defined.');
    });

    it('returns empty string if no transactions are provided', async () => {
      const controller = newController();
      const result = await controller.approveTransactionsWithSameNonce([]);
      expect(result).toBe('');
    });

    it('return empty string if transaction is already being signed', async () => {
      const controller = newController({
        config: {
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
      };

      // Send the transaction to put it in the process of being signed
      controller.approveTransactionsWithSameNonce([mockTransactionParam]);

      // Now send it one more time to test that it doesn't get signed again
      const result = await controller.approveTransactionsWithSameNonce([
        mockTransactionParam,
      ]);

      expect(result).toBe('');
    });

    it('signs transactions and return raw transactions', async () => {
      const signMock = jest
        .fn()
        .mockImplementation(async (transactionParams) =>
          Promise.resolve(TransactionFactory.fromTxData(transactionParams)),
        );
      const controller = newController({
        config: {
          sign: signMock,
        },
      });
      const mockTransactionParam = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x111',
        to: ACCOUNT_2_MOCK,
        value: '0x0',
      };
      const mockTransactionParam2 = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x222',
        to: ACCOUNT_2_MOCK,
        value: '0x1',
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

      const signMock = jest
        .fn()
        .mockImplementation(async () =>
          Promise.reject(new Error(mockSignError)),
        );
      const controller = newController({
        config: {
          sign: signMock,
        },
      });
      const mockTransactionParam = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x111',
        to: ACCOUNT_2_MOCK,
        value: '0x0',
      };
      const mockTransactionParam2 = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x222',
        to: ACCOUNT_2_MOCK,
        value: '0x1',
      };

      await expect(
        controller.approveTransactionsWithSameNonce([
          mockTransactionParam,
          mockTransactionParam2,
        ]),
      ).rejects.toThrow(mockSignError);
    });
  });
});
