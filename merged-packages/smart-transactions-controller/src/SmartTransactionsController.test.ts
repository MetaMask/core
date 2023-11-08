import nock from 'nock';
import { NetworkState } from '@metamask/network-controller';
import { convertHexToDecimal } from '@metamask/controller-utils';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import packageJson from '../package.json';

import SmartTransactionsController, {
  DEFAULT_INTERVAL,
} from './SmartTransactionsController';
import { API_BASE_URL, CHAIN_IDS } from './constants';
import { SmartTransaction, SmartTransactionStatuses } from './types';
import * as utils from './utils';

/**
 * Resolve all pending promises.
 * This method is used for async tests that use fake timers.
 * See https://stackoverflow.com/a/58716087 and https://jestjs.io/docs/timer-mocks.
 */
function flushPromises(): Promise<unknown> {
  return new Promise(jest.requireActual('timers').setImmediate);
}

jest.mock('@ethersproject/bytes', () => ({
  ...jest.requireActual('@ethersproject/bytes'),
  hexlify: (str: string) => `0x${str}`,
}));

jest.mock('@metamask/eth-query', () => {
  const EthQuery = jest.requireActual('@metamask/eth-query');
  return class FakeEthQuery extends EthQuery {
    sendAsync = jest.fn(({ method }, callback) => {
      switch (method) {
        case 'eth_getBalance': {
          callback(null, '0x1000');
          break;
        }

        case 'eth_getTransactionReceipt': {
          callback(null, { blockNumber: '123' });
          break;
        }

        case 'eth_getBlockByNumber': {
          callback(null, { baseFeePerGas: '0x123' });
          break;
        }

        case 'eth_getTransactionByHash': {
          callback(null, {
            maxFeePerGas: '0x123',
            maxPriorityFeePerGas: '0x123',
          });
          break;
        }

        default: {
          throw new Error('Invalid method');
        }
      }
    });
  };
});

const addressFrom = '0x268392a24B6b093127E8581eAfbD1DA228bAdAe3';

const createUnsignedTransaction = (chainId: number) => {
  return {
    from: addressFrom,
    to: '0x0000000000000000000000000000000000000000',
    value: 0,
    data: '0x',
    nonce: 0,
    type: 2,
    chainId,
  };
};

const createGetFeesApiResponse = () => {
  return {
    txs: [
      {
        // Approval tx.
        cancelFees: [
          { maxFeePerGas: 2100001000, maxPriorityFeePerGas: 466503987 },
          { maxFeePerGas: 2310003200, maxPriorityFeePerGas: 513154852 },
          { maxFeePerGas: 2541005830, maxPriorityFeePerGas: 564470851 },
          { maxFeePerGas: 2795108954, maxPriorityFeePerGas: 620918500 },
          { maxFeePerGas: 3074622644, maxPriorityFeePerGas: 683010971 },
          { maxFeePerGas: 3382087983, maxPriorityFeePerGas: 751312751 },
          { maxFeePerGas: 3720300164, maxPriorityFeePerGas: 826444778 },
          { maxFeePerGas: 4092333900, maxPriorityFeePerGas: 909090082 },
          { maxFeePerGas: 4501571383, maxPriorityFeePerGas: 1000000000 },
          { maxFeePerGas: 4951733023, maxPriorityFeePerGas: 1100001000 },
          { maxFeePerGas: 5446911277, maxPriorityFeePerGas: 1210002200 },
          { maxFeePerGas: 5991607851, maxPriorityFeePerGas: 1331003630 },
          { maxFeePerGas: 6590774628, maxPriorityFeePerGas: 1464105324 },
          { maxFeePerGas: 7249858682, maxPriorityFeePerGas: 1610517320 },
          { maxFeePerGas: 7974851800, maxPriorityFeePerGas: 1771570663 },
          { maxFeePerGas: 8772344955, maxPriorityFeePerGas: 1948729500 },
          { maxFeePerGas: 9649588222, maxPriorityFeePerGas: 2143604399 },
          { maxFeePerGas: 10614556694, maxPriorityFeePerGas: 2357966983 },
          { maxFeePerGas: 11676022978, maxPriorityFeePerGas: 2593766039 },
        ],
        feeEstimate: 42000000000000,
        fees: [
          { maxFeePerGas: 2310003200, maxPriorityFeePerGas: 513154852 },
          { maxFeePerGas: 2541005830, maxPriorityFeePerGas: 564470850 },
          { maxFeePerGas: 2795108954, maxPriorityFeePerGas: 620918500 },
          { maxFeePerGas: 3074622644, maxPriorityFeePerGas: 683010970 },
          { maxFeePerGas: 3382087983, maxPriorityFeePerGas: 751312751 },
          { maxFeePerGas: 3720300163, maxPriorityFeePerGas: 826444777 },
          { maxFeePerGas: 4092333900, maxPriorityFeePerGas: 909090082 },
          { maxFeePerGas: 4501571382, maxPriorityFeePerGas: 999999999 },
          { maxFeePerGas: 4951733022, maxPriorityFeePerGas: 1100001000 },
          { maxFeePerGas: 5446911277, maxPriorityFeePerGas: 1210002200 },
          { maxFeePerGas: 5991607851, maxPriorityFeePerGas: 1331003630 },
          { maxFeePerGas: 6590774627, maxPriorityFeePerGas: 1464105324 },
          { maxFeePerGas: 7249858681, maxPriorityFeePerGas: 1610517320 },
          { maxFeePerGas: 7974851800, maxPriorityFeePerGas: 1771570662 },
          { maxFeePerGas: 8772344954, maxPriorityFeePerGas: 1948729500 },
          { maxFeePerGas: 9649588222, maxPriorityFeePerGas: 2143604398 },
          { maxFeePerGas: 10614556693, maxPriorityFeePerGas: 2357966982 },
          { maxFeePerGas: 11676022977, maxPriorityFeePerGas: 2593766039 },
          { maxFeePerGas: 12843636951, maxPriorityFeePerGas: 2853145236 },
        ],
        gasLimit: 21000,
        gasUsed: 21000,
      },
      {
        // Trade tx.
        cancelFees: [
          { maxFeePerGas: 2100001000, maxPriorityFeePerGas: 466503987 },
          { maxFeePerGas: 2310003200, maxPriorityFeePerGas: 513154852 },
          { maxFeePerGas: 2541005830, maxPriorityFeePerGas: 564470851 },
          { maxFeePerGas: 2795108954, maxPriorityFeePerGas: 620918500 },
          { maxFeePerGas: 3074622644, maxPriorityFeePerGas: 683010971 },
          { maxFeePerGas: 3382087983, maxPriorityFeePerGas: 751312751 },
          { maxFeePerGas: 3720300164, maxPriorityFeePerGas: 826444778 },
          { maxFeePerGas: 4092333900, maxPriorityFeePerGas: 909090082 },
          { maxFeePerGas: 4501571383, maxPriorityFeePerGas: 1000000000 },
          { maxFeePerGas: 4951733023, maxPriorityFeePerGas: 1100001000 },
          { maxFeePerGas: 5446911277, maxPriorityFeePerGas: 1210002200 },
          { maxFeePerGas: 5991607851, maxPriorityFeePerGas: 1331003630 },
          { maxFeePerGas: 6590774628, maxPriorityFeePerGas: 1464105324 },
          { maxFeePerGas: 7249858682, maxPriorityFeePerGas: 1610517320 },
          { maxFeePerGas: 7974851800, maxPriorityFeePerGas: 1771570663 },
          { maxFeePerGas: 8772344955, maxPriorityFeePerGas: 1948729500 },
          { maxFeePerGas: 9649588222, maxPriorityFeePerGas: 2143604399 },
          { maxFeePerGas: 10614556694, maxPriorityFeePerGas: 2357966983 },
          { maxFeePerGas: 11676022978, maxPriorityFeePerGas: 2593766039 },
        ],
        feeEstimate: 42000000000000,
        fees: [
          { maxFeePerGas: 2310003200, maxPriorityFeePerGas: 513154852 },
          { maxFeePerGas: 2541005830, maxPriorityFeePerGas: 564470850 },
          { maxFeePerGas: 2795108954, maxPriorityFeePerGas: 620918500 },
          { maxFeePerGas: 3074622644, maxPriorityFeePerGas: 683010970 },
          { maxFeePerGas: 3382087983, maxPriorityFeePerGas: 751312751 },
          { maxFeePerGas: 3720300163, maxPriorityFeePerGas: 826444777 },
          { maxFeePerGas: 4092333900, maxPriorityFeePerGas: 909090082 },
          { maxFeePerGas: 4501571382, maxPriorityFeePerGas: 999999999 },
          { maxFeePerGas: 4951733022, maxPriorityFeePerGas: 1100001000 },
          { maxFeePerGas: 5446911277, maxPriorityFeePerGas: 1210002200 },
          { maxFeePerGas: 5991607851, maxPriorityFeePerGas: 1331003630 },
          { maxFeePerGas: 6590774627, maxPriorityFeePerGas: 1464105324 },
          { maxFeePerGas: 7249858681, maxPriorityFeePerGas: 1610517320 },
          { maxFeePerGas: 7974851800, maxPriorityFeePerGas: 1771570662 },
          { maxFeePerGas: 8772344954, maxPriorityFeePerGas: 1948729500 },
          { maxFeePerGas: 9649588222, maxPriorityFeePerGas: 2143604398 },
          { maxFeePerGas: 10614556693, maxPriorityFeePerGas: 2357966982 },
          { maxFeePerGas: 11676022977, maxPriorityFeePerGas: 2593766039 },
          { maxFeePerGas: 12843636951, maxPriorityFeePerGas: 2853145236 },
        ],
        gasLimit: 21000,
        gasUsed: 21000,
      },
    ],
  };
};

const createSubmitTransactionsApiResponse = () => {
  return { uuid: 'dP23W7c2kt4FK9TmXOkz1UM2F20' };
};

// TODO: How exactly a signed transaction should look like?
const createSignedTransaction = () => {
  return {
    from: '0x268392a24B6b093127E8581eAfbD1DA228bAdAe3',
    to: '0x0000000000000000000000000000000000000000',
    value: 0,
    data: '0x',
    nonce: 0,
    type: 2,
    chainId: 4,
    maxFeePerGas: 2310003200,
    maxPriorityFeePerGas: 513154852,
  };
};

// TODO: How exactly a signed canceled transaction should look like?
const createSignedCanceledTransaction = () => {
  return {
    from: '0x268392a24B6b093127E8581eAfbD1DA228bAdAe3',
    to: '0x0000000000000000000000000000000000000000',
    value: 0,
    data: '0x',
    nonce: 0,
    type: 2,
    chainId: 4,
    maxFeePerGas: 2100001000,
    maxPriorityFeePerGas: 466503987,
  };
};

const createPendingBatchStatusApiResponse = () => ({
  uuid1: {
    cancellationFeeWei: 0,
    cancellationReason: 'not_cancelled',
    deadlineRatio: 0.0006295545895894369,
    minedTx: 'not_mined',
    minedHash: '',
  },
});

const createStateAfterPending = () => {
  return [
    {
      uuid: 'uuid1',
      status: 'pending',
      cancellable: true,
      statusMetadata: {
        cancellationFeeWei: 0,
        cancellationReason: 'not_cancelled',
        deadlineRatio: 0.0006295545895894369,
        minedTx: 'not_mined',
        minedHash: '',
      },
    },
  ];
};

const createSuccessBatchStatusApiResponse = () => ({
  uuid2: {
    cancellationFeeWei: 36777567771000,
    cancellationReason: 'not_cancelled',
    deadlineRatio: 0.6400288486480713,
    minedHash:
      '0x55ad39634ee10d417b6e190cfd3736098957e958879cffe78f1f00f4fd2654d6',
    minedTx: 'success',
  },
});

const createStateAfterSuccess = () => {
  return [
    {
      uuid: 'uuid2',
      status: 'success',
      cancellable: false,
      statusMetadata: {
        cancellationFeeWei: 36777567771000,
        cancellationReason: 'not_cancelled',
        deadlineRatio: 0.6400288486480713,
        minedHash:
          '0x55ad39634ee10d417b6e190cfd3736098957e958879cffe78f1f00f4fd2654d6',
        minedTx: 'success',
      },
    },
  ];
};

const createSuccessLivenessApiResponse = () => ({
  lastBlock: 123456,
});

const testHistory = [
  {
    op: 'add',
    path: '/swapTokenValue',
    value: '0.001',
  },
];

const ethereumChainIdDec = parseInt(CHAIN_IDS.ETHEREUM, 16);
const goerliChainIdDec = parseInt(CHAIN_IDS.GOERLI, 16);

const trackMetaMetricsEventSpy = jest.fn();
const defaultState = {
  smartTransactionsState: {
    smartTransactions: {
      [CHAIN_IDS.ETHEREUM]: [],
    },
    userOptIn: undefined,
    userOptInV2: undefined,
    fees: {
      approvalTxFees: undefined,
      tradeTxFees: undefined,
    },
    feesByChainId: {
      [CHAIN_IDS.ETHEREUM]: {
        approvalTxFees: undefined,
        tradeTxFees: undefined,
      },
      [CHAIN_IDS.GOERLI]: {
        approvalTxFees: undefined,
        tradeTxFees: undefined,
      },
    },
    liveness: true,
    livenessByChainId: {
      [CHAIN_IDS.ETHEREUM]: true,
      [CHAIN_IDS.GOERLI]: true,
    },
  },
};

describe('SmartTransactionsController', () => {
  let smartTransactionsController: SmartTransactionsController;
  let networkListener: (networkState: NetworkState) => void;
  beforeEach(() => {
    smartTransactionsController = new SmartTransactionsController({
      onNetworkStateChange: (listener) => {
        networkListener = listener;
      },
      getNonceLock: jest.fn(() => {
        return {
          nextNonce: 'nextNonce',
          releaseLock: jest.fn(),
        };
      }),
      provider: jest.fn(),
      confirmExternalTransaction: jest.fn(),
      trackMetaMetricsEvent: trackMetaMetricsEventSpy,
      getNetworkClientById: jest.fn().mockImplementation((networkClientId) => {
        switch (networkClientId) {
          case 'mainnet':
            return {
              configuration: {
                chainId: CHAIN_IDS.ETHEREUM,
              },
            };
          case 'goerli':
            return {
              configuration: {
                chainId: CHAIN_IDS.GOERLI,
              },
            };
          default:
            throw new Error('Invalid network client id');
        }
      }),
    });
    // eslint-disable-next-line jest/prefer-spy-on
    smartTransactionsController.subscribe = jest.fn();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    nock.cleanAll();
    await smartTransactionsController.stop();
  });

  it('initializes with default config', () => {
    expect(smartTransactionsController.config).toStrictEqual({
      interval: DEFAULT_INTERVAL,
      supportedChainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.GOERLI],
      chainId: CHAIN_IDS.ETHEREUM,
      clientId: 'default',
    });
  });

  it('initializes with default state', () => {
    expect(smartTransactionsController.state).toStrictEqual(defaultState);
  });

  describe('onNetworkChange', () => {
    it('is triggered', () => {
      networkListener({
        providerConfig: { chainId: '0x32', type: 'rpc', ticker: 'CET' },
        selectedNetworkClientId: 'networkClientId',
        networkConfigurations: {},
        networksMetadata: {},
      } as NetworkState);
      expect(smartTransactionsController.config.chainId).toBe('0x32');
    });

    it('calls poll', () => {
      const checkPollSpy = jest.spyOn(smartTransactionsController, 'checkPoll');
      networkListener({
        providerConfig: { chainId: '0x32', type: 'rpc', ticker: 'CET' },
        selectedNetworkClientId: 'networkClientId',
        networkConfigurations: {},
        networksMetadata: {},
      } as NetworkState);
      expect(checkPollSpy).toHaveBeenCalled();
    });
  });

  describe('checkPoll', () => {
    it('calls poll if there is no pending transaction and pending transactions', () => {
      const pollSpy = jest
        .spyOn(smartTransactionsController, 'poll')
        .mockImplementation(() => {
          return new Promise(() => ({}));
        });
      const { smartTransactionsState } = smartTransactionsController.state;
      const pendingStx = createStateAfterPending();
      smartTransactionsController.update({
        smartTransactionsState: {
          ...smartTransactionsState,
          smartTransactions: {
            [CHAIN_IDS.ETHEREUM]: pendingStx as SmartTransaction[],
          },
        },
      });
      expect(pollSpy).toHaveBeenCalled();
    });

    it('calls stop if there is a timeoutHandle and no pending transactions', () => {
      const stopSpy = jest.spyOn(smartTransactionsController, 'stop');
      smartTransactionsController.timeoutHandle = setTimeout(() => ({}));
      smartTransactionsController.checkPoll(smartTransactionsController.state);
      expect(stopSpy).toHaveBeenCalled();
      clearInterval(smartTransactionsController.timeoutHandle);
    });
  });

  describe('poll', () => {
    it('does not call updateSmartTransactions on unsupported networks', async () => {
      const updateSmartTransactionsSpy = jest.spyOn(
        smartTransactionsController,
        'updateSmartTransactions',
      );
      expect(updateSmartTransactionsSpy).not.toHaveBeenCalled();
      networkListener({
        providerConfig: { chainId: '0x32', type: 'rpc', ticker: 'CET' },
        selectedNetworkClientId: 'networkClientId',
        networkConfigurations: {},
        networksMetadata: {},
      } as NetworkState);
      expect(updateSmartTransactionsSpy).not.toHaveBeenCalled();
    });
  });

  describe('updateSmartTransactions', () => {
    // TODO rewrite this test... updateSmartTransactions is getting called via the checkPoll method which is called whenever state is updated.
    // this test should be more isolated to the updateSmartTransactions method.
    it('calls fetchSmartTransactionsStatus if there are pending transactions', () => {
      const fetchSmartTransactionsStatusSpy = jest
        .spyOn(smartTransactionsController, 'fetchSmartTransactionsStatus')
        .mockImplementation(() => {
          return new Promise(() => ({}));
        });
      const { smartTransactionsState } = smartTransactionsController.state;
      const pendingStx = createStateAfterPending();
      smartTransactionsController.update({
        smartTransactionsState: {
          ...smartTransactionsState,
          smartTransactions: {
            [CHAIN_IDS.ETHEREUM]: pendingStx as SmartTransaction[],
          },
        },
      });
      expect(fetchSmartTransactionsStatusSpy).toHaveBeenCalled();
    });
  });

  describe('trackStxStatusChange', () => {
    it('does not track if no prevSmartTransactions', () => {
      const smartTransaction = createStateAfterPending()[0];
      smartTransactionsController.trackStxStatusChange(
        smartTransaction as SmartTransaction,
      );
      expect(trackMetaMetricsEventSpy).not.toHaveBeenCalled();
    });

    it('does not track if smartTransaction and prevSmartTransaction have the same status', () => {
      const smartTransaction = createStateAfterPending()[0];
      smartTransactionsController.trackStxStatusChange(
        smartTransaction as SmartTransaction,
        smartTransaction as SmartTransaction,
      );
      expect(trackMetaMetricsEventSpy).not.toHaveBeenCalled();
    });

    it('tracks status change if smartTransaction and prevSmartTransaction have different statuses', () => {
      const smartTransaction = {
        ...createStateAfterPending()[0],
        swapMetaData: {},
      };
      const prevSmartTransaction = { ...smartTransaction, status: '' };
      smartTransactionsController.trackStxStatusChange(
        smartTransaction as SmartTransaction,
        prevSmartTransaction as SmartTransaction,
      );
      expect(trackMetaMetricsEventSpy).toHaveBeenCalled();
    });
  });

  describe('setOptInState', () => {
    it('sets optIn state', () => {
      smartTransactionsController.setOptInState(true);
      expect(
        smartTransactionsController.state.smartTransactionsState.userOptInV2,
      ).toBe(true);
      smartTransactionsController.setOptInState(false);
      expect(
        smartTransactionsController.state.smartTransactionsState.userOptInV2,
      ).toBe(false);
      smartTransactionsController.setOptInState(undefined);
      expect(
        smartTransactionsController.state.smartTransactionsState.userOptInV2,
      ).toBeUndefined();
    });
  });

  describe('getFees', () => {
    it('gets unsigned transactions and estimates based on an unsigned transaction', async () => {
      const tradeTx = createUnsignedTransaction(ethereumChainIdDec);
      const approvalTx = createUnsignedTransaction(ethereumChainIdDec);
      const getFeesApiResponse = createGetFeesApiResponse();
      nock(API_BASE_URL)
        .post(`/networks/${ethereumChainIdDec}/getFees`)
        .reply(200, getFeesApiResponse);
      const fees = await smartTransactionsController.getFees(
        tradeTx,
        approvalTx,
      );
      expect(fees).toMatchObject({
        approvalTxFees: getFeesApiResponse.txs[0],
        tradeTxFees: getFeesApiResponse.txs[1],
      });
    });

    it('should add fee data to feesByChainId state using the networkClientId passed in to identify the appropriate chain', async () => {
      const tradeTx = createUnsignedTransaction(goerliChainIdDec);
      const approvalTx = createUnsignedTransaction(goerliChainIdDec);
      const getFeesApiResponse = createGetFeesApiResponse();
      nock(API_BASE_URL)
        .post(`/networks/${goerliChainIdDec}/getFees`)
        .reply(200, getFeesApiResponse);

      expect(
        smartTransactionsController.state.smartTransactionsState.feesByChainId,
      ).toStrictEqual(defaultState.smartTransactionsState.feesByChainId);

      await smartTransactionsController.getFees(tradeTx, approvalTx, {
        networkClientId: 'goerli',
      });

      expect(
        smartTransactionsController.state.smartTransactionsState.feesByChainId,
      ).toMatchObject({
        [CHAIN_IDS.ETHEREUM]: {
          approvalTxFees: undefined,
          tradeTxFees: undefined,
        },
        [CHAIN_IDS.GOERLI]: {
          approvalTxFees: getFeesApiResponse.txs[0],
          tradeTxFees: getFeesApiResponse.txs[1],
        },
      });
    });
  });

  describe('submitSignedTransactions', () => {
    beforeEach(() => {
      // eslint-disable-next-line jest/prefer-spy-on
      smartTransactionsController.checkPoll = jest.fn(() => ({}));
    });

    it('submits a smart transaction with signed transactions', async () => {
      const signedTransaction = createSignedTransaction();
      const signedCanceledTransaction = createSignedCanceledTransaction();
      const submitTransactionsApiResponse =
        createSubmitTransactionsApiResponse(); // It has uuid.
      nock(API_BASE_URL)
        .post(
          `/networks/${ethereumChainIdDec}/submitTransactions?stxControllerVersion=${packageJson.version}`,
        )
        .reply(200, submitTransactionsApiResponse);

      await smartTransactionsController.submitSignedTransactions({
        signedTransactions: [signedTransaction],
        signedCanceledTransactions: [signedCanceledTransaction],
        txParams: signedTransaction,
      });

      expect(
        smartTransactionsController.state.smartTransactionsState
          .smartTransactions[CHAIN_IDS.ETHEREUM][0].uuid,
      ).toBe('dP23W7c2kt4FK9TmXOkz1UM2F20');
    });
  });

  describe('fetchSmartTransactionsStatus', () => {
    beforeEach(() => {
      // eslint-disable-next-line jest/prefer-spy-on
      smartTransactionsController.checkPoll = jest.fn(() => ({}));
    });

    it('fetches a pending status for a single smart transaction via batchStatus API', async () => {
      const uuids = ['uuid1'];
      const pendingBatchStatusApiResponse =
        createPendingBatchStatusApiResponse();
      nock(API_BASE_URL)
        .get(`/networks/${ethereumChainIdDec}/batchStatus?uuids=uuid1`)
        .reply(200, pendingBatchStatusApiResponse);

      await smartTransactionsController.fetchSmartTransactionsStatus(uuids, {
        networkClientId: 'mainnet',
      });
      const pendingState = createStateAfterPending()[0];
      const pendingTransaction = { ...pendingState, history: [pendingState] };
      expect(smartTransactionsController.state).toStrictEqual({
        smartTransactionsState: {
          smartTransactions: {
            [CHAIN_IDS.ETHEREUM]: [pendingTransaction],
          },
          userOptIn: undefined,
          userOptInV2: undefined,
          fees: {
            approvalTxFees: undefined,
            tradeTxFees: undefined,
          },
          feesByChainId: {
            [CHAIN_IDS.ETHEREUM]: {
              approvalTxFees: undefined,
              tradeTxFees: undefined,
            },
            [CHAIN_IDS.GOERLI]: {
              approvalTxFees: undefined,
              tradeTxFees: undefined,
            },
          },
          liveness: true,
          livenessByChainId: {
            [CHAIN_IDS.ETHEREUM]: true,
            [CHAIN_IDS.GOERLI]: true,
          },
        },
      });
    });

    it('fetches a success status for a single smart transaction via batchStatus API', async () => {
      const uuids = ['uuid2'];
      const successBatchStatusApiResponse =
        createSuccessBatchStatusApiResponse();
      smartTransactionsController.update({
        smartTransactionsState: {
          ...smartTransactionsController.state.smartTransactionsState,
          smartTransactions: {
            [CHAIN_IDS.ETHEREUM]:
              createStateAfterPending() as SmartTransaction[],
          },
        },
      });

      nock(API_BASE_URL)
        .get(`/networks/${ethereumChainIdDec}/batchStatus?uuids=uuid2`)
        .reply(200, successBatchStatusApiResponse);

      await smartTransactionsController.fetchSmartTransactionsStatus(uuids, {
        networkClientId: 'mainnet',
      });
      const successState = createStateAfterSuccess()[0];
      const successTransaction = { ...successState, history: [successState] };
      expect(smartTransactionsController.state).toStrictEqual({
        smartTransactionsState: {
          smartTransactions: {
            [CHAIN_IDS.ETHEREUM]: [
              ...createStateAfterPending(),
              ...[successTransaction],
            ],
          },
          userOptIn: undefined,
          userOptInV2: undefined,
          fees: {
            approvalTxFees: undefined,
            tradeTxFees: undefined,
          },
          liveness: true,
          feesByChainId: {
            '0x1': {
              approvalTxFees: undefined,
              tradeTxFees: undefined,
            },
            '0x5': {
              approvalTxFees: undefined,
              tradeTxFees: undefined,
            },
          },
          livenessByChainId: {
            '0x1': true,
            '0x5': true,
          },
        },
      });
    });
  });

  describe('fetchLiveness', () => {
    it('fetches a liveness for Smart Transactions API', async () => {
      const successLivenessApiResponse = createSuccessLivenessApiResponse();
      nock(API_BASE_URL)
        .get(`/networks/${ethereumChainIdDec}/health`)
        .reply(200, successLivenessApiResponse);
      const liveness = await smartTransactionsController.fetchLiveness();
      expect(liveness).toBe(true);
    });

    it('fetches liveness and sets in feesByChainId state for the Smart Transactions API for the chainId of the networkClientId passed in', async () => {
      nock(API_BASE_URL)
        .get(`/networks/${goerliChainIdDec}/health`)
        .replyWithError('random error');

      expect(
        smartTransactionsController.state.smartTransactionsState
          .livenessByChainId,
      ).toStrictEqual({
        [CHAIN_IDS.ETHEREUM]: true,
        [CHAIN_IDS.GOERLI]: true,
      });

      await smartTransactionsController.fetchLiveness({
        networkClientId: 'goerli',
      });

      expect(
        smartTransactionsController.state.smartTransactionsState
          .livenessByChainId,
      ).toStrictEqual({
        [CHAIN_IDS.ETHEREUM]: true,
        [CHAIN_IDS.GOERLI]: false,
      });
    });
  });

  describe('updateSmartTransaction', () => {
    beforeEach(() => {
      // eslint-disable-next-line jest/prefer-spy-on
      smartTransactionsController.checkPoll = jest.fn(() => ({}));
    });

    it('updates smart transaction based on uuid', () => {
      const pendingStx = {
        ...createStateAfterPending()[0],
        history: testHistory,
      };
      const { smartTransactionsState } = smartTransactionsController.state;
      smartTransactionsController.update({
        smartTransactionsState: {
          ...smartTransactionsState,
          smartTransactions: {
            [CHAIN_IDS.ETHEREUM]: [pendingStx] as SmartTransaction[],
          },
        },
      });
      const updateTransaction = {
        ...pendingStx,
        status: 'test',
      };
      smartTransactionsController.updateSmartTransaction(
        updateTransaction as SmartTransaction,
        {
          networkClientId: 'mainnet',
        },
      );

      expect(
        smartTransactionsController.state.smartTransactionsState
          .smartTransactions[CHAIN_IDS.ETHEREUM][0].status,
      ).toBe('test');
    });

    it('confirms a smart transaction that has status success', async () => {
      const { smartTransactionsState } = smartTransactionsController.state;
      const pendingStx = {
        ...createStateAfterPending()[0],
        history: testHistory,
      };
      smartTransactionsController.update({
        smartTransactionsState: {
          ...smartTransactionsState,
          smartTransactions: {
            [CHAIN_IDS.ETHEREUM]: [pendingStx] as SmartTransaction[],
          },
        },
      });
      const updateTransaction = {
        ...pendingStx,
        status: SmartTransactionStatuses.SUCCESS,
      };

      smartTransactionsController.updateSmartTransaction(
        updateTransaction as SmartTransaction,
        {
          networkClientId: 'mainnet',
        },
      );

      await flushPromises();

      expect(
        smartTransactionsController.state.smartTransactionsState
          .smartTransactions[CHAIN_IDS.ETHEREUM],
      ).toStrictEqual([
        {
          ...updateTransaction,
          confirmed: true,
        },
      ]);
    });
  });

  describe('cancelSmartTransaction', () => {
    it('sends POST call to Transactions API', async () => {
      const apiCall = nock(API_BASE_URL)
        .post(`/networks/${ethereumChainIdDec}/cancel`)
        .reply(200, { message: 'successful' });
      await smartTransactionsController.cancelSmartTransaction('uuid1');
      expect(apiCall.isDone()).toBe(true);
    });
  });

  describe('setStatusRefreshInterval', () => {
    it('sets refresh interval if different', () => {
      smartTransactionsController.setStatusRefreshInterval(100);
      expect(smartTransactionsController.config.interval).toBe(100);
    });

    it('does not set refresh interval if they are the same', () => {
      const configureSpy = jest.spyOn(smartTransactionsController, 'configure');
      smartTransactionsController.setStatusRefreshInterval(DEFAULT_INTERVAL);
      expect(configureSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe('getTransactions', () => {
    beforeEach(() => {
      // eslint-disable-next-line jest/prefer-spy-on
      smartTransactionsController.checkPoll = jest.fn(() => ({}));
    });

    it('retrieves smart transactions by addressFrom and status', () => {
      const { smartTransactionsState } = smartTransactionsController.state;
      const pendingStx = {
        ...createStateAfterPending()[0],
        history: testHistory,
        txParams: {
          from: addressFrom,
        },
      };
      smartTransactionsController.update({
        smartTransactionsState: {
          ...smartTransactionsState,
          smartTransactions: {
            [CHAIN_IDS.ETHEREUM]: [pendingStx] as SmartTransaction[],
          },
        },
      });
      const pendingStxs = smartTransactionsController.getTransactions({
        addressFrom,
        status: SmartTransactionStatuses.PENDING,
      });
      expect(pendingStxs).toStrictEqual([pendingStx]);
    });

    it('returns empty array if there are no smart transactions', () => {
      const transactions = smartTransactionsController.getTransactions({
        addressFrom,
        status: SmartTransactionStatuses.PENDING,
      });
      expect(transactions).toStrictEqual([]);
    });
  });

  describe('isNewSmartTransaction', () => {
    it('returns true if it is a new STX', () => {
      const actual =
        smartTransactionsController.isNewSmartTransaction('newUuid');
      expect(actual).toBe(true);
    });

    it('returns false if an STX already exist', () => {
      smartTransactionsController.update({
        smartTransactionsState: {
          ...smartTransactionsController.state.smartTransactionsState,
          smartTransactions: {
            [CHAIN_IDS.ETHEREUM]:
              createStateAfterPending() as SmartTransaction[],
          },
        },
      });
      const actual = smartTransactionsController.isNewSmartTransaction('uuid1');
      expect(actual).toBe(false);
    });
  });

  describe('startPollingByNetworkClientId', () => {
    it('starts and stops calling smart transactions batch status api endpoint with the correct chainId at the polling interval', async () => {
      // mock this to a noop because it causes an extra fetch call to the API upon state changes
      jest
        .spyOn(smartTransactionsController, 'checkPoll')
        .mockImplementation(() => undefined);

      // pending transactions in state are required to test polling
      smartTransactionsController.update({
        smartTransactionsState: {
          ...defaultState.smartTransactionsState,
          smartTransactions: {
            '0x1': [
              {
                uuid: 'uuid1',
                status: 'pending',
                cancellable: true,
                chainId: '0x1',
              },
            ],
            '0x5': [
              {
                uuid: 'uuid2',
                status: 'pending',
                cancellable: true,
                chainId: '0x5',
              },
            ],
          },
        },
      });

      jest.useFakeTimers();
      const handleFetchSpy = jest.spyOn(utils, 'handleFetch');

      const mainnetPollingToken =
        smartTransactionsController.startPollingByNetworkClientId('mainnet');

      await Promise.all([
        jest.advanceTimersByTime(DEFAULT_INTERVAL),
        flushPromises(),
      ]);

      expect(handleFetchSpy.mock.calls[0]).toStrictEqual(
        expect.arrayContaining([
          `${API_BASE_URL}/networks/${convertHexToDecimal(
            CHAIN_IDS.ETHEREUM,
          )}/batchStatus?uuids=uuid1`,
        ]),
      );

      smartTransactionsController.startPollingByNetworkClientId('goerli');
      await jest.advanceTimersByTime(DEFAULT_INTERVAL);

      expect(
        JSON.stringify(handleFetchSpy.mock.calls.map((arg) => arg[0])),
      ).toStrictEqual(
        JSON.stringify([
          `${API_BASE_URL}/networks/${convertHexToDecimal(
            CHAIN_IDS.ETHEREUM,
          )}/batchStatus?uuids=uuid1`,
          `${API_BASE_URL}/networks/${convertHexToDecimal(
            CHAIN_IDS.ETHEREUM,
          )}/batchStatus?uuids=uuid1`,
          `${API_BASE_URL}/networks/${convertHexToDecimal(
            CHAIN_IDS.GOERLI,
          )}/batchStatus?uuids=uuid2`,
        ]),
      );

      // stop the mainnet polling
      smartTransactionsController.stopPollingByPollingToken(
        mainnetPollingToken,
      );

      // cycle two polling intervals
      await jest.advanceTimersByTime(DEFAULT_INTERVAL);
      await jest.advanceTimersByTime(DEFAULT_INTERVAL);

      // check that the mainnet polling has stopped while the goerli polling continues
      expect(
        JSON.stringify(handleFetchSpy.mock.calls.map((arg) => arg[0])),
      ).toStrictEqual(
        JSON.stringify([
          `${API_BASE_URL}/networks/${convertHexToDecimal(
            CHAIN_IDS.ETHEREUM,
          )}/batchStatus?uuids=uuid1`,
          `${API_BASE_URL}/networks/${convertHexToDecimal(
            CHAIN_IDS.ETHEREUM,
          )}/batchStatus?uuids=uuid1`,
          `${API_BASE_URL}/networks/${convertHexToDecimal(
            CHAIN_IDS.GOERLI,
          )}/batchStatus?uuids=uuid2`,
          `${API_BASE_URL}/networks/${convertHexToDecimal(
            CHAIN_IDS.GOERLI,
          )}/batchStatus?uuids=uuid2`,
          `${API_BASE_URL}/networks/${convertHexToDecimal(
            CHAIN_IDS.GOERLI,
          )}/batchStatus?uuids=uuid2`,
        ]),
      );

      // cleanup
      smartTransactionsController.update(defaultState);

      smartTransactionsController.stopAllPolling();
      jest.clearAllTimers();
    });
  });
});
