/* eslint-disable jest/expect-expect,jsdoc/match-description */

import type {
  AcceptResultCallbacks,
  AddResult,
} from '@metamask/approval-controller';
import { NetworkType, NetworksChainId } from '@metamask/controller-utils';
import { NetworkStatus, type NetworkState } from '@metamask/network-controller';
import HttpProvider from 'ethjs-provider-http';
import NonceTracker from 'nonce-tracker';

import { errorCodes } from 'eth-rpc-errors';
import { IncomingTransactionHelper } from './helpers/IncomingTransactionHelper';
import { PendingTransactionTracker } from './helpers/PendingTransactionTracker';
import type {
  TransactionControllerMessenger,
  TransactionConfig,
} from './TransactionController';
import { TransactionController } from './TransactionController';
import type { TransactionMeta } from './types';
import { WalletDevice, TransactionStatus } from './types';
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

jest.mock('eth-query', () =>
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
  reject: (reason: any) => void;
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
    approve: approve as any,
    reject: reject as any,
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
  provider: typeof HttpProvider;
  blockTracker: { getLatestBlock: () => string };
  state: NetworkState;
  subscribe: (listener: (state: NetworkState) => void) => void;
};

const MOCK_NETWORK: MockNetwork = {
  provider: MAINNET_PROVIDER,
  blockTracker: { getLatestBlock: () => '0x102833C' },
  state: {
    networkId: '5',
    networkStatus: NetworkStatus.Available,
    networkDetails: { isEIP1559Compatible: false },
    providerConfig: {
      type: NetworkType.goerli,
      chainId: NetworksChainId.goerli,
    },
    networkConfigurations: {},
  },
  subscribe: () => undefined,
};
const MOCK_NETWORK_WITHOUT_CHAIN_ID: MockNetwork = {
  provider: GOERLI_PROVIDER,
  blockTracker: { getLatestBlock: () => '0x102833C' },
  state: {
    networkId: '5',
    networkStatus: NetworkStatus.Available,
    networkDetails: { isEIP1559Compatible: false },
    providerConfig: {
      type: NetworkType.goerli,
    } as NetworkState['providerConfig'],
    networkConfigurations: {},
  },
  subscribe: () => undefined,
};
const MOCK_MAINNET_NETWORK: MockNetwork = {
  provider: MAINNET_PROVIDER,
  blockTracker: { getLatestBlock: () => '0x102833C' },
  state: {
    networkId: '1',
    networkStatus: NetworkStatus.Available,
    networkDetails: { isEIP1559Compatible: false },
    providerConfig: {
      type: NetworkType.mainnet,
      chainId: NetworksChainId.mainnet,
    },
    networkConfigurations: {},
  },
  subscribe: () => undefined,
};
const MOCK_CUSTOM_NETWORK: MockNetwork = {
  provider: PALM_PROVIDER,
  blockTracker: { getLatestBlock: () => '0xA6EDFC' },
  state: {
    networkId: '11297108109',
    networkStatus: NetworkStatus.Available,
    networkDetails: { isEIP1559Compatible: false },
    providerConfig: {
      type: NetworkType.rpc,
      chainId: '11297108109',
    },
    networkConfigurations: {},
  },
  subscribe: () => undefined,
};

const ACCOUNT_MOCK = '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207';
const NONCE_MOCK = 12;

const TRANSACTION_META_MOCK = {
  status: TransactionStatus.confirmed,
  time: 123456789,
  transaction: {
    from: ACCOUNT_MOCK,
  },
  transactionHash: '0x1',
} as TransactionMeta;

const TRANSACTION_META_2_MOCK = {
  status: TransactionStatus.confirmed,
  time: 987654321,
  transaction: {
    from: '0x3',
  },
  transactionHash: '0x2',
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
    } as any;

    pendingTransactionTrackerMock = {
      start: jest.fn(),
      hub: {
        on: jest.fn(),
      },
    } as any;

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
      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          deviceConfirmedOn: mockDeviceConfirmedOn,
          origin: mockOrigin,
          securityAlertResponse: mockSecurityAlertResponse,
        },
      );

      const transactionMeta = controller.state.transactions[0];

      expect(transactionMeta.transaction.from).toBe(ACCOUNT_MOCK);
      expect(transactionMeta.chainId).toBe(
        MOCK_NETWORK.state.providerConfig.chainId,
      );
      expect(transactionMeta.deviceConfirmedOn).toBe(mockDeviceConfirmedOn);
      expect(transactionMeta.origin).toBe(mockOrigin);
      expect(transactionMeta.status).toBe(TransactionStatus.unapproved);
      expect(transactionMeta.securityAlertResponse).toBe(
        mockSecurityAlertResponse,
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

        expect(controller.state.transactions[0].transaction.from).toBe(
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
      await expect(
        controller.addTransaction({ from: 'foo' } as any),
      ).rejects.toThrow('Invalid "from" address');
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

      expect(firstTransaction.transaction.nonce).toBe(
        `0x${NONCE_MOCK.toString(16)}`,
      );

      expect(secondTransaction.transaction.nonce).toBe(
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

        const { result } = await controller.addTransaction({
          from: ACCOUNT_MOCK,
          gas: '0x0',
          gasPrice: '0x0',
          to: ACCOUNT_MOCK,
          value: '0x0',
        });

        await result;

        const { transaction, status } = controller.state.transactions[0];
        expect(transaction.from).toBe(ACCOUNT_MOCK);
        expect(transaction.nonce).toBe(`0x${NONCE_MOCK.toString(16)}`);
        expect(status).toBe(TransactionStatus.submitted);
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

          const { transaction, status } = controller.state.transactions[0];
          expect(transaction.from).toBe(ACCOUNT_MOCK);
          expect(transaction.to).toBe(ACCOUNT_MOCK);
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

        const { transaction, status } = await finishedPromise;
        expect(transaction.from).toBe(ACCOUNT_MOCK);
        expect(status).toBe(TransactionStatus.rejected);
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
  });

  describe('handleMethodData', () => {
    it('loads method data from registry', async () => {
      const controller = newController({ network: MOCK_MAINNET_NETWORK });

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

      await controller.handleMethodData('0xf39b5b9b');

      const registryLookup = jest.spyOn(controller, 'registryLookup' as any);

      await controller.handleMethodData('0xf39b5b9b');

      expect(registryLookup).not.toHaveBeenCalled();
    });
  });

  describe('stopTransaction', () => {
    it('rejects result promise', async () => {
      const controller = newController({
        network: MOCK_MAINNET_NETWORK,
      });

      const { result, transactionMeta } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x0',
        gasPrice: '0x1',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      const finishedPromise = waitForTransactionFinished(controller);

      await controller.stopTransaction(transactionMeta.id, undefined);
      await finishedPromise;

      approveTransaction();

      const { transactions } = controller.state;
      await expect(result).rejects.toThrow('User cancelled the transaction');
      expect(transactions[0].status).toStrictEqual(TransactionStatus.cancelled);
    });

    it('rejects unknown transaction', async () => {
      const controller = newController({
        network: MOCK_MAINNET_NETWORK,
      });

      await controller.stopTransaction('transactionIdMock', {
        gasPrice: '0x1',
      });

      const signSpy = jest.spyOn(controller, 'sign' as any);

      expect(signSpy).toHaveBeenCalledTimes(0);
    });

    it('throws if no sign method', async () => {
      const controller = newController({ config: { sign: undefined } });

      await controller.addTransaction({ from: ACCOUNT_MOCK, to: ACCOUNT_MOCK });

      await expect(
        controller.stopTransaction(controller.state.transactions[0].id),
      ).rejects.toThrow('No sign method defined');
    });
  });

  describe('speedUpTransaction', () => {
    it('creates additional transaction with increased gas', async () => {
      const controller = newController({
        network: MOCK_MAINNET_NETWORK,
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
      expect(transactions[1].transaction.gasPrice).toBe(
        '0x5916a6d6', // 1.1 * 0x50fd51da
      );
    });

    it('creates additional transaction specifying the gasPrice', async () => {
      const controller = newController({
        network: MOCK_MAINNET_NETWORK,
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
      expect(transactions[1].transaction.gasPrice).toBe('0x62DEF4DA');
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
      await controller.speedUpTransaction(transactionMeta.id, undefined);

      const { transactions } = controller.state;
      expect(getNonceLockSpy).toHaveBeenCalledTimes(1);
      expect(transactions).toHaveLength(2);
      expect(transactions[0].transaction.nonce).toBeDefined();
      expect(transactions[0].transaction.nonce).toStrictEqual(
        transactions[1].transaction.nonce,
      );
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

  describe('on pending transactions event', () => {
    it('updates existing transactions in state', async () => {
      const controller = newController();

      controller.state.transactions = [
        { ...TRANSACTION_META_MOCK, status: TransactionStatus.submitted },
        { ...TRANSACTION_META_2_MOCK, status: TransactionStatus.submitted },
      ];

      const updatedTransaction = TRANSACTION_META_MOCK;
      const updatedTransaction_2 = TRANSACTION_META_2_MOCK;

      await (pendingTransactionTrackerMock.hub.on as any).mock.calls[0][1]([
        updatedTransaction,
        updatedTransaction_2,
      ]);

      expect(controller.state.transactions).toStrictEqual([
        updatedTransaction,
        updatedTransaction_2,
      ]);
    });

    it('limits max transactions when adding to state', async () => {
      const controller = newController({ config: { txHistoryLimit: 1 } });

      await (pendingTransactionTrackerMock.hub.on as any).mock.calls[0][1]([
        TRANSACTION_META_MOCK,
        TRANSACTION_META_2_MOCK,
      ]);

      expect(controller.state.transactions).toStrictEqual([
        TRANSACTION_META_2_MOCK,
      ]);
    });
  });
});
