/* eslint-disable jest/expect-expect */

import { Common } from '@ethereumjs/common';
import {
  ChainId,
  NetworkType,
  NetworksTicker,
  toHex,
  BUILT_IN_NETWORKS,
} from '@metamask/controller-utils';
import type {
  BlockTracker,
  NetworkState,
  Provider,
} from '@metamask/network-controller';
import { NetworkClientType, NetworkStatus } from '@metamask/network-controller';
import { errorCodes } from 'eth-rpc-errors';
import HttpProvider from 'ethjs-provider-http';
import NonceTracker from 'nonce-tracker';

import { IncomingTransactionHelper } from './IncomingTransactionHelper';
import type {
  TransactionControllerMessenger,
  TransactionConfig,
} from './TransactionController';
import { TransactionController, HARDFORK } from './TransactionController';
import type { TransactionMeta } from './types';
import { WalletDevice, TransactionStatus } from './types';
import { ESTIMATE_GAS_ERROR } from './utils';
import { FakeBlockTracker } from '../../../tests/fake-block-tracker';
import { mockNetwork } from '../../../tests/mock-network';
import type {
  AcceptResultCallbacks,
  AddResult,
} from '../../approval-controller/src';

const v1Stub = jest
  .fn()
  .mockImplementation(() => '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');

jest.mock('uuid', () => {
  return {
    ...jest.requireActual('uuid'),
    v1: () => v1Stub(),
  };
});

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
          { transactionHash: '1337', blockNumber: '0x1' },
          { transactionHash: '1338', blockNumber: null },
        ];
        const tx: any = txs.find(
          (element: any) => element.transactionHash === _hash,
        );
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
          { transactionHash: '1337', gasUsed: '0x5208', status: '0x1' },
          { transactionHash: '1111', gasUsed: '0x1108', status: '0x0' },
        ];
        const tx: any = txs.find(
          (element: any) => element.transactionHash === _hash,
        );
        callback(undefined, tx);
      },
    };
  }),
);

jest.mock('./IncomingTransactionHelper');

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
    networkId: '5',
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
    networkId: '5',
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
    networkId: '1',
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
    networkId: '59144',
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
    networkId: '59140',
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
    networkId: '11297108109',
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
const NONCE_MOCK = 12;
const BLOCK_NUMBER_MOCK = '999';
const ETHERSCAN_API_KEY_MOCK = 'testApiKey';

const TRANSACTION_META_MOCK = {
  transaction: { from: ACCOUNT_MOCK },
} as TransactionMeta;

describe('TransactionController', () => {
  let resultCallbacksMock: AcceptResultCallbacks;
  let messengerMock: TransactionControllerMessenger;
  let rejectMessengerMock: TransactionControllerMessenger;
  let delayMessengerMock: TransactionControllerMessenger;
  let approveTransaction: () => void;
  let getNonceLockSpy: jest.Mock;

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
        getNetworkState: () => finalNetwork.state,
        onNetworkStateChange: finalNetwork.subscribe,
        provider: finalNetwork.provider,
        blockTracker: finalNetwork.blockTracker,
        messenger,
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
    for (const key in mockFlags) {
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
      });
    });

    it('sets default config', () => {
      const controller = newController();
      expect(controller.config).toStrictEqual({
        interval: 15000,
        txHistoryLimit: 40,
        sign: expect.any(Function),
      });
    });
  });

  describe('poll', () => {
    it('updates transaction statuses in the right interval', async () => {
      const mock = jest.spyOn(
        TransactionController.prototype,
        'queryTransactionStatuses',
      );

      newController({ config: { interval: 10 } });

      expect(mock).toHaveBeenCalledTimes(1);
      await wait(15);
      expect(mock).toHaveBeenCalledTimes(2);
    });

    it('clears previous interval', async () => {
      const mock = jest.spyOn(global, 'clearTimeout');
      const controller = newController({ config: { interval: 1337 } });

      await wait(100);
      controller.poll(1338);
      expect(mock).toHaveBeenCalled();
    });

    it('does not update the state if there are no updates on transaction statuses', async () => {
      const controller = newController({ config: { interval: 10 } });
      const func = jest.spyOn(controller, 'update');

      await wait(20);
      expect(func).not.toHaveBeenCalled();
    });
  });

  describe('estimateGas', () => {
    /**
     * Test template to assert estimate gas succeeds.
     *
     * @param opts - Options to use when testing.
     * @param opts.network - The network to use.
     * @param opts.estimateGasValue - The value to return from the estimate gas call.
     * @param opts.getBlockByNumberValue - The value to return from the get block by number call.
     */
    async function estimateGasSucceeds({
      network,
      estimateGasValue,
      getBlockByNumberValue,
    }: {
      network: MockNetwork;
      estimateGasValue?: string;
      getBlockByNumberValue?: string;
    }) {
      const controller = newController({ network });

      if (estimateGasValue) {
        mockFlags.estimateGasValue = estimateGasValue;
      }

      if (getBlockByNumberValue) {
        mockFlags.getBlockByNumberValue = getBlockByNumberValue;
      }

      const result = await controller.estimateGas({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      expect(result.estimateGasError).toBeUndefined();
    }

    /**
     * Test template to assert estimate gas fails.
     *
     * @param opts - Options to use when testing.
     * @param opts.network - The network to use.
     * @param opts.getBlockByNumberValue - The value to return from the get block by number call.
     */
    async function estimateGasFails({
      network,
      getBlockByNumberValue,
    }: {
      network: MockNetwork;
      getBlockByNumberValue?: string;
    }) {
      const controller = newController({ network });

      if (getBlockByNumberValue) {
        mockFlags.getBlockByNumberValue = getBlockByNumberValue;
      }

      mockFlags.estimateGasError = ESTIMATE_GAS_ERROR;

      const result = await controller.estimateGas({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      expect(result.estimateGasError).toBe(ESTIMATE_GAS_ERROR);
    }

    it('succeeds when gasBn is greater than maxGasBN', async () => {
      await estimateGasSucceeds({
        network: MOCK_NETWORK,
        estimateGasValue: '0x12a05f200',
      });
    });

    it('succeeds on mainnet when gasBn is higher than maxGasBN', async () => {
      await estimateGasSucceeds({
        network: MOCK_MAINNET_NETWORK,
        estimateGasValue: '0x12a05f200',
      });
    });

    it('succeeds on custom network when gasBN is equal to maxGasBN', async () => {
      await estimateGasSucceeds({
        network: MOCK_CUSTOM_NETWORK,
      });
    });

    it('succeed on custom network when gasBN is less than maxGasBN', async () => {
      await estimateGasSucceeds({
        network: MOCK_CUSTOM_NETWORK,
        getBlockByNumberValue: '0x12a05f200',
      });
    });

    it('succeeds when gasBN is less than maxGasBN and paddedGasBN is less than MaxGasBN', async () => {
      await estimateGasSucceeds({
        network: MOCK_NETWORK,
        getBlockByNumberValue: '0x12a05f200',
      });
    });

    it('fails on custom network when gasBN is equal to maxGasBN', async () => {
      await estimateGasFails({ network: MOCK_CUSTOM_NETWORK });
    });

    it('fails on custom network when gasBN is less than maxGasBN', async () => {
      await estimateGasFails({
        network: MOCK_CUSTOM_NETWORK,
        getBlockByNumberValue: '0x12a05f200',
      });
    });

    it('fails when gasBN is less than maxGasBN and paddedGasBN is less than MaxGasBN', async () => {
      await estimateGasFails({
        network: MOCK_NETWORK,
        getBlockByNumberValue: '0x12a05f200',
      });
    });
  });

  describe('addTransaction', () => {
    it('adds unapproved transaction to state', async () => {
      const controller = newController();

      const mockDeviceConfirmedOn = WalletDevice.OTHER;
      const mockOrigin = 'origin';

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          deviceConfirmedOn: mockDeviceConfirmedOn,
          origin: mockOrigin,
        },
      );

      expect(controller.state.transactions[0].transaction.from).toBe(
        ACCOUNT_MOCK,
      );
      expect(controller.state.transactions[0].networkID).toBe(
        MOCK_NETWORK.state.networkId,
      );
      expect(controller.state.transactions[0].chainId).toBe(
        MOCK_NETWORK.state.providerConfig.chainId,
      );
      expect(controller.state.transactions[0].deviceConfirmedOn).toBe(
        mockDeviceConfirmedOn,
      );
      expect(controller.state.transactions[0].origin).toBe(mockOrigin);
      expect(controller.state.transactions[0].status).toBe(
        TransactionStatus.unapproved,
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
        expect(controller.state.transactions[0].networkID).toBe(
          newNetwork.state.networkId,
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

    it.each([
      ['mainnet', MOCK_MAINNET_NETWORK],
      ['custom network', MOCK_CUSTOM_NETWORK],
    ])(
      'populates estimateGasError if gas calculation fails on %s',
      async (_title, network) => {
        const controller = newController({ network });

        mockFlags.estimateGasError = ESTIMATE_GAS_ERROR;

        await controller.addTransaction({
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        });

        const {
          transaction: { estimateGasError },
        } = controller.state.transactions[0];

        expect(estimateGasError).toBe(ESTIMATE_GAS_ERROR);
      },
    );

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
            controller.state.transactions[0].status =
              TransactionStatus.confirmed;

            throw new Error('TestError');
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
            throw new Error('TestError');
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

    // This tests the fallback to networkId only when there is no chainId present.
    // It should be removed when networkID is completely removed.
    it('removes all transactions with matching networkId when there is no chainId', async () => {
      const controller = newController();

      controller.wipeTransactions();

      controller.state.transactions.push({
        from: MOCK_PREFERENCES.state.selectedAddress,
        id: 'foo',
        networkID: '5',
        status: TransactionStatus.submitted,
        transactionHash: '1337',
      } as any);

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
        transaction: {
          from: mockFromAccount1,
        },
      } as any);

      controller.state.transactions.push({
        id: '2',
        chainId: mockCurrentChainId,
        transaction: {
          from: mockFromAccount2,
        },
      } as any);

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
        transaction: {
          from: mockFromAccount1,
        },
      } as any);

      controller.state.transactions.push({
        id: '4',
        chainId: mockDifferentChainId,
        transaction: {
          from: mockFromAccount1,
        },
      } as any);

      controller.wipeTransactions(false, mockFromAccount1);

      expect(controller.state.transactions).toHaveLength(1);
      expect(controller.state.transactions[0].id).toBe('4');
    });
  });

  describe('queryTransactionStatus', () => {
    it('updates transaction status to confirmed', async () => {
      const controller = newController();

      controller.state.transactions.push({
        from: MOCK_PREFERENCES.state.selectedAddress,
        id: 'foo',
        networkID: '5',
        chainId: toHex(5),
        status: TransactionStatus.submitted,
        transactionHash: '1337',
      } as any);

      controller.state.transactions.push({} as any);

      const confirmedPromise = waitForTransactionFinished(controller, {
        confirmed: true,
      });

      await controller.queryTransactionStatuses();

      const { status } = await confirmedPromise;
      expect(status).toBe(TransactionStatus.confirmed);
    });

    // This tests the fallback to networkId only when there is no chainId present.
    // It should be removed when networkId is completely removed.
    it('uses networkId only when there is no chainId', async () => {
      const controller = newController();

      controller.state.transactions.push({
        from: MOCK_PREFERENCES.state.selectedAddress,
        id: 'foo',
        networkID: '5',
        status: TransactionStatus.submitted,
        transactionHash: '1337',
      } as any);

      controller.state.transactions.push({} as any);

      const confirmedPromise = waitForTransactionFinished(controller, {
        confirmed: true,
      });

      await controller.queryTransactionStatuses();

      const { status } = await confirmedPromise;
      expect(status).toBe(TransactionStatus.confirmed);
    });

    it('leaves transaction status as submitted if transaction was not added to a block', async () => {
      const controller = newController();

      controller.state.transactions.push({
        from: MOCK_PREFERENCES.state.selectedAddress,
        id: 'foo',
        networkID: '5',
        status: TransactionStatus.submitted,
        transactionHash: '1338',
      } as any);

      await controller.queryTransactionStatuses();

      const { status } = controller.state.transactions[0];
      expect(status).toBe(TransactionStatus.submitted);
    });

    it('verifies transactions using the correct blockchain', async () => {
      const controller = newController();

      controller.state.transactions.push({
        from: MOCK_PREFERENCES.state.selectedAddress,
        id: 'foo',
        networkID: '5',
        chainId: toHex(5),
        status: TransactionStatus.confirmed,
        transactionHash: '1337',
        verifiedOnBlockchain: false,
        transaction: {
          gasUsed: undefined,
        },
      } as any);

      await controller.queryTransactionStatuses();

      const transactionMeta = controller.state.transactions[0];
      expect(transactionMeta.verifiedOnBlockchain).toBe(true);
      expect(transactionMeta.transaction.gasUsed).toBe('0x5208');
    });
  });

  describe('fetchAll', () => {
    const mockIncomingTransactionHelperConstructor =
      IncomingTransactionHelper as jest.MockedClass<
        typeof IncomingTransactionHelper
      >;

    const mockIncomingTransactionHelper = {
      reconcile: jest.fn(),
    } as unknown as jest.Mocked<IncomingTransactionHelper>;

    beforeEach(() => {
      mockIncomingTransactionHelper.reconcile.mockResolvedValueOnce({
        updateRequired: false,
        transactions: [],
      });

      mockIncomingTransactionHelperConstructor.mockReturnValueOnce(
        mockIncomingTransactionHelper,
      );
    });

    it('reconciles incoming transactions using helper', async () => {
      const controller = newController();
      controller.state.transactions = [
        TRANSACTION_META_MOCK,
        TRANSACTION_META_MOCK,
      ];

      controller.fetchAll(ACCOUNT_MOCK, {
        fromBlock: BLOCK_NUMBER_MOCK,
        etherscanApiKey: ETHERSCAN_API_KEY_MOCK,
      });

      expect(mockIncomingTransactionHelper.reconcile).toHaveBeenCalledTimes(1);
      expect(mockIncomingTransactionHelper.reconcile).toHaveBeenCalledWith({
        address: ACCOUNT_MOCK,
        apiKey: ETHERSCAN_API_KEY_MOCK,
        fromBlock: BLOCK_NUMBER_MOCK,
        localTransactions: [TRANSACTION_META_MOCK, TRANSACTION_META_MOCK],
      });
    });

    it('updates state with transactions from helper if update is required', async () => {
      mockIncomingTransactionHelper.reconcile.mockReset();
      mockIncomingTransactionHelper.reconcile.mockResolvedValueOnce({
        updateRequired: true,
        transactions: [TRANSACTION_META_MOCK, TRANSACTION_META_MOCK],
      });

      const controller = newController();

      await controller.fetchAll(ACCOUNT_MOCK);

      expect(controller.state.transactions).toStrictEqual([
        TRANSACTION_META_MOCK,
        TRANSACTION_META_MOCK,
      ]);
    });

    it('does not updates state if update is not required', async () => {
      mockIncomingTransactionHelper.reconcile.mockReset();
      mockIncomingTransactionHelper.reconcile.mockResolvedValueOnce({
        updateRequired: false,
        transactions: [TRANSACTION_META_MOCK, TRANSACTION_META_MOCK],
      });

      const controller = newController();

      await controller.fetchAll(ACCOUNT_MOCK);

      expect(controller.state.transactions).toStrictEqual([]);
    });

    it('returns latest block number from helper', async () => {
      mockIncomingTransactionHelper.reconcile.mockReset();
      mockIncomingTransactionHelper.reconcile.mockResolvedValueOnce({
        updateRequired: false,
        transactions: [],
        latestBlockNumber: BLOCK_NUMBER_MOCK,
      });

      const latestBlockNumber = await newController().fetchAll(ACCOUNT_MOCK);

      expect(latestBlockNumber).toBe(BLOCK_NUMBER_MOCK);
    });
  });

  describe('handleMethodData', () => {
    it('loads method data from registry', async () => {
      const controller = newController({ network: MOCK_MAINNET_NETWORK });
      mockNetwork({
        networkClientConfiguration: {
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

      const registryLookup = jest.spyOn(controller, 'registryLookup' as any);

      await controller.handleMethodData('0xf39b5b9b');

      expect(registryLookup).not.toHaveBeenCalled();
    });
  });

  describe('stopTransaction', () => {
    it('rejects result promise', async () => {
      const controller = newController();

      const { result, transactionMeta } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x0',
        gasPrice: '0x1',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      await controller.stopTransaction(transactionMeta.id);

      approveTransaction();

      await expect(result).rejects.toThrow('User cancelled the transaction');
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
      const controller = newController();

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

    it('uses the same nonce', async () => {
      const controller = newController({ approve: true });

      const { transactionMeta, result } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x0',
        gasPrice: '0x50fd51da',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      await result;
      await controller.speedUpTransaction(transactionMeta.id);

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

  describe('getCommonConfiguration', () => {
    it('should get the common  network configuration for mainnet', async () => {
      const controller = new TransactionController({
        getNetworkState: () => MOCK_MAINNET_NETWORK.state,
        onNetworkStateChange: MOCK_MAINNET_NETWORK.subscribe,
        provider: MOCK_MAINNET_NETWORK.provider,
        blockTracker: MOCK_MAINNET_NETWORK.blockTracker,
        messenger: messengerMock,
      });

      const config = await controller.getCommonConfiguration();
      expect(config).toStrictEqual(
        new Common({ chain: 'mainnet', hardfork: HARDFORK }),
      );
    });

    it.each([
      ['linea-mainnet', MOCK_LINEA_MAINNET_NETWORK, 59144],
      ['linea-goerli', MOCK_LINEA_GOERLI_NETWORK, 59140],
    ])(
      'should get a custom network configuration for %s',
      async (
        _,
        { state, subscribe, provider, blockTracker }: MockNetwork,
        chainId: number,
      ) => {
        const controller = new TransactionController({
          getNetworkState: () => state,
          onNetworkStateChange: subscribe,
          provider,
          blockTracker,
          messenger: messengerMock,
        });

        const config = controller.getCommonConfiguration();
        expect(config).toStrictEqual(
          Common.custom({
            name: undefined,
            chainId,
            networkId: chainId,
            defaultHardfork: HARDFORK,
          }),
        );
      },
    );
  });
});
