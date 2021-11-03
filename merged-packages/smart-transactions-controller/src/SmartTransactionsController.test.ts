import nock from 'nock';
import { NetworkState } from '@metamask/controllers';
import SmartTransactionsController, {
  DEFAULT_INTERVAL,
} from './SmartTransactionsController';
import { API_BASE_URL, CHAIN_IDS, CHAIN_IDS_HEX_TO_DEC } from './constants';
import { SmartTransaction } from './types';

const confirmExternalMock = jest.fn();

jest.mock('ethers', () => ({
  ethers: {
    providers: {
      Web3Provider: class Web3Provider {
        getBalance = () => ({ toHexString: () => '0x1000' });

        getTransactionReceipt = jest.fn(() => ({ blockNumber: '123' }));

        getBlock = jest.fn();
      },
    },
    utils: {
      hexlify: (str: string) => `0x${str}`,
    },
    BigNumber: class BigNumber {},
  },
}));

const createUnsignedTransaction = () => {
  return {
    from: '0x268392a24B6b093127E8581eAfbD1DA228bAdAe3',
    to: '0x0000000000000000000000000000000000000000',
    value: 0,
    data: '0x',
    nonce: 0,
    type: 2,
    chainId: 4,
  };
};

const createGetTransactionsApiResponse = () => {
  return {
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

const ethereumChainIdDec = CHAIN_IDS_HEX_TO_DEC[CHAIN_IDS.ETHEREUM];

describe('SmartTransactionsController', () => {
  let smartTransactionsController: SmartTransactionsController;
  let networkListener: (networkState: NetworkState) => void;

  beforeEach(() => {
    smartTransactionsController = new SmartTransactionsController({
      onNetworkStateChange: (listener) => {
        networkListener = listener;
      },
      nonceTracker: {
        getNonceLock: jest.fn(() => {
          return {
            nextNonce: 'nextNonce',
            releaseLock: jest.fn(),
          };
        }),
      },
      getNetwork: jest.fn(() => '1'),
      provider: jest.fn(),
      txController: {
        confirmExternalTransaction: confirmExternalMock,
      },
    });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    nock.cleanAll();
    await smartTransactionsController.stop();
  });

  it('initializes with default config', () => {
    expect(smartTransactionsController.config).toStrictEqual({
      interval: DEFAULT_INTERVAL,
      supportedChainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.RINKEBY],
      chainId: CHAIN_IDS.ETHEREUM,
      clientId: 'default',
    });
  });

  it('initializes with default state', () => {
    expect(smartTransactionsController.state).toStrictEqual({
      smartTransactions: {
        [CHAIN_IDS.ETHEREUM]: [],
      },
      userOptIn: undefined,
    });
  });

  describe('onNetworkChange', () => {
    it('is triggered', () => {
      networkListener({ provider: { chainId: '52' } } as NetworkState);
      expect(smartTransactionsController.config.chainId).toBe('52');
    });

    it('calls poll', () => {
      const pollSpy = jest.spyOn(smartTransactionsController, 'poll');
      networkListener({ provider: { chainId: '2' } } as NetworkState);
      expect(pollSpy).toHaveBeenCalled();
    });
  });

  describe('poll', () => {
    it('is called with interval', async () => {
      const interval = 35000;
      const pollSpy = jest.spyOn(smartTransactionsController, 'poll');
      const updateSmartTransactionsSpy = jest.spyOn(
        smartTransactionsController,
        'updateSmartTransactions',
      );
      expect(pollSpy).toHaveBeenCalledTimes(0);
      expect(updateSmartTransactionsSpy).toHaveBeenCalledTimes(0);
      networkListener({
        provider: { chainId: CHAIN_IDS.ETHEREUM },
      } as NetworkState);
      expect(pollSpy).toHaveBeenCalledTimes(1);
      expect(updateSmartTransactionsSpy).toHaveBeenCalledTimes(1);
      await smartTransactionsController.stop();
      jest.useFakeTimers();
      await smartTransactionsController.poll(interval);
      expect(pollSpy).toHaveBeenCalledTimes(2);
      expect(updateSmartTransactionsSpy).toHaveBeenCalledTimes(2);
      jest.advanceTimersByTime(interval);
      expect(pollSpy).toHaveBeenCalledTimes(3);
      expect(updateSmartTransactionsSpy).toHaveBeenCalledTimes(3);
      await smartTransactionsController.stop();
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('does not call updateSmartTransactions on unsupported networks', async () => {
      const updateSmartTransactionsSpy = jest.spyOn(
        smartTransactionsController,
        'updateSmartTransactions',
      );
      expect(updateSmartTransactionsSpy).not.toHaveBeenCalled();
      networkListener({ provider: { chainId: '56' } } as NetworkState);
      expect(updateSmartTransactionsSpy).not.toHaveBeenCalled();
    });
  });

  describe('setOptInState', () => {
    it('sets optIn state', () => {
      smartTransactionsController.setOptInState(true);
      expect(smartTransactionsController.state.userOptIn).toBe(true);
      smartTransactionsController.setOptInState(false);
      expect(smartTransactionsController.state.userOptIn).toBe(false);
      smartTransactionsController.setOptInState(undefined);
      expect(smartTransactionsController.state.userOptIn).toBeUndefined();
    });
  });

  describe('getUnsignedTransactionsAndEstimates', () => {
    it('gets unsigned transactions and estimates based on an unsigned transaction', async () => {
      const unsignedTransaction = createUnsignedTransaction();
      const getTransactionsApiResponse = createGetTransactionsApiResponse();
      nock(API_BASE_URL)
        .post(`/networks/${ethereumChainIdDec}/getTransactions`)
        .reply(200, getTransactionsApiResponse);
      const unsignedTransactionsAndEstimates = await smartTransactionsController.getUnsignedTransactionsAndEstimates(
        unsignedTransaction,
      );
      expect(unsignedTransactionsAndEstimates).toStrictEqual(
        getTransactionsApiResponse,
      );
    });
  });

  describe('submitSignedTransactions', () => {
    it('submits a smart transaction with signed transactions', async () => {
      const signedTransaction = createSignedTransaction();
      const signedCanceledTransaction = createSignedCanceledTransaction();
      const submitTransactionsApiResponse = createSubmitTransactionsApiResponse(); // It has uuid.
      nock(API_BASE_URL)
        .post(`/networks/${ethereumChainIdDec}/submitTransactions`)
        .reply(200, submitTransactionsApiResponse);

      await smartTransactionsController.submitSignedTransactions({
        signedTransactions: [signedTransaction],
        signedCanceledTransactions: [signedCanceledTransaction],
        txParams: signedTransaction,
      });

      expect(
        smartTransactionsController.state.smartTransactions[
          CHAIN_IDS.ETHEREUM
        ][0].uuid,
      ).toStrictEqual('dP23W7c2kt4FK9TmXOkz1UM2F20');
    });
  });

  describe('fetchSmartTransactionsStatus', () => {
    it('fetches a pending status for a single smart transaction via batchStatus API', async () => {
      const uuids = ['uuid1'];
      const pendingBatchStatusApiResponse = createPendingBatchStatusApiResponse();
      nock(API_BASE_URL)
        .get(`/networks/${ethereumChainIdDec}/batchStatus?uuids=uuid1`)
        .reply(200, pendingBatchStatusApiResponse);
      await smartTransactionsController.fetchSmartTransactionsStatus(uuids);
      expect(smartTransactionsController.state).toStrictEqual({
        smartTransactions: {
          [CHAIN_IDS.ETHEREUM]: createStateAfterPending(),
        },
        userOptIn: undefined,
      });
    });

    it('fetches a success status for a single smart transaction via batchStatus API', async () => {
      const uuids = ['uuid2'];
      const successBatchStatusApiResponse = createSuccessBatchStatusApiResponse();
      smartTransactionsController.update({
        smartTransactions: {
          [CHAIN_IDS.ETHEREUM]: createStateAfterPending() as SmartTransaction[],
        },
      });

      nock(API_BASE_URL)
        .get(`/networks/${ethereumChainIdDec}/batchStatus?uuids=uuid2`)
        .reply(200, successBatchStatusApiResponse);
      await smartTransactionsController.fetchSmartTransactionsStatus(uuids);
      expect(smartTransactionsController.state).toStrictEqual({
        smartTransactions: {
          [CHAIN_IDS.ETHEREUM]: [
            ...createStateAfterPending(),
            ...createStateAfterSuccess(),
          ],
        },
        userOptIn: undefined,
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
  });

  describe('updateSmartTransaction', () => {
    it('updates smart transaction based on uuid', () => {
      const pendingStx = createStateAfterPending()[0];
      smartTransactionsController.update({
        smartTransactions: {
          [CHAIN_IDS.ETHEREUM]: [pendingStx] as SmartTransaction[],
        },
      });
      const updateTransaction = {
        ...pendingStx,
        status: 'test',
      };
      smartTransactionsController.updateSmartTransaction(
        updateTransaction as SmartTransaction,
      );

      expect(
        smartTransactionsController.state.smartTransactions[
          CHAIN_IDS.ETHEREUM
        ][0].status,
      ).toStrictEqual('test');
    });

    it('confirms a smart transaction that has status success', async () => {
      const confirmSpy = jest.spyOn(
        smartTransactionsController,
        'confirmSmartTransaction',
      );
      const pendingStx = createStateAfterPending()[0];
      smartTransactionsController.update({
        smartTransactions: {
          [CHAIN_IDS.ETHEREUM]: [pendingStx] as SmartTransaction[],
        },
      });
      const updateTransaction = {
        ...pendingStx,
        status: 'success',
      };
      smartTransactionsController.updateSmartTransaction(
        updateTransaction as SmartTransaction,
      );
      expect(confirmSpy).toHaveBeenCalled();
    });
  });

  describe('confirmSmartTransaction', () => {
    it('calls confirm external transaction', async () => {
      const successfulStx = createStateAfterSuccess()[0];
      await smartTransactionsController.confirmSmartTransaction(
        successfulStx as SmartTransaction,
      );
      expect(confirmExternalMock).toHaveBeenCalled();
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
      expect(smartTransactionsController.config.interval).toStrictEqual(100);
    });

    it('does not set refresh interval if they are the same', () => {
      const configureSpy = jest.spyOn(smartTransactionsController, 'configure');
      smartTransactionsController.setStatusRefreshInterval(DEFAULT_INTERVAL);
      expect(configureSpy).toHaveBeenCalledTimes(0);
    });
  });
});
