import { ApprovalController } from '@metamask/approval-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import { BUILT_IN_NETWORKS, NetworkType } from '@metamask/controller-utils';
import {
  NetworkController,
  NetworkClientType,
} from '@metamask/network-controller';
import nock from 'nock';

import { mockNetwork } from '../../../tests/mock-network';
import {
  ETHERSCAN_TRANSACTION_BASE_MOCK,
  ETHERSCAN_TRANSACTION_RESPONSE_MOCK,
} from './helpers/EtherscanMocks';
import { TransactionController } from './TransactionController';
import type { TransactionMeta } from './types';
import { TransactionStatus, TransactionType } from './types';
import { getEtherscanApiHost } from './utils/etherscan';

const ACCOUNT_MOCK = '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207';
const ACCOUNT_2_MOCK = '0x08f137f335ea1b8f193b8f6ea92561a60d23a211';

const networkClientConfiguration = {
  type: NetworkClientType.Infura,
  network: NetworkType.mainnet,
  chainId: BUILT_IN_NETWORKS[NetworkType.mainnet].chainId,
  infuraProjectId: 'foo',
  ticker: BUILT_IN_NETWORKS[NetworkType.mainnet].ticker,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const newController = async (options: any) => {
  const messenger = new ControllerMessenger();
  const networkController = new NetworkController({
    messenger: messenger.getRestricted({ name: 'NetworkController' }),
    trackMetaMetricsEvent: () => {
      // noop
    },
    infuraProjectId: 'foo',
  });
  await networkController.initializeProvider();
  const { provider, blockTracker } =
    networkController.getProviderAndBlockTracker();

  const approvalController = new ApprovalController({
    messenger: messenger.getRestricted({
      name: 'ApprovalController',
    }),
    showApprovalRequest: jest.fn(),
  });

  const opts = {
    provider,
    blockTracker,
    messenger,
    onNetworkStateChange: () => {
      // noop
    },
    getCurrentNetworkEIP1559Compatibility:
      networkController.getEIP1559Compatibility.bind(networkController),
    getNetworkClientRegistry:
      networkController.getNetworkClientRegistry.bind(networkController),
    findNetworkClientIdByChainId:
      networkController.findNetworkClientIdByChainId.bind(networkController),
    getNetworkClientById:
      networkController.getNetworkClientById.bind(networkController),
    getNetworkState: () => networkController.state,
    getSelectedAddress: () => '0xdeadbeef',
    ...options,
  };
  const transactionController = new TransactionController(opts, {
    // TODO(JL): fix this type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sign: async (transaction: any) => transaction,
  });

  return {
    transactionController,
    approvalController,
    networkController,
  };
};

describe('TransactionController Integration', () => {
  describe('constructor', () => {
    // it('should create a new instance of TransactionController', async () => {
    //   mockNetwork({
    //     networkClientConfiguration,
    //     mocks: [
    //       {
    //         request: {
    //           method: 'eth_blockNumber',
    //           params: [],
    //         },
    //         response: {
    //           result: '0x1',
    //         },
    //       },
    //       {
    //         request: {
    //           method: 'eth_blockNumber',
    //           params: [],
    //         },
    //         response: {
    //           result: '0x2',
    //         },
    //       },
    //       {
    //         request: {
    //           method: 'eth_blockNumber',
    //           params: [],
    //         },
    //         response: {
    //           result: '0x3',
    //         },
    //       },
    //     ],
    //   });
    //   const transactionController = await newController({});
    //   transactionController.stopTrackingByNetworkClientId('mainnet');
    //   expect(transactionController).toBeDefined();
    // });

    describe('multichain transaction lifecycle', () => {
      it('should add a new unapproved transaction', async () => {
        mockNetwork({
          networkClientConfiguration,
          mocks: [
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x2',
              },
            },
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x3',
              },
            },
            {
              request: {
                method: 'eth_getCode',
                params: [ACCOUNT_2_MOCK, '0x1'],
              },
              response: {
                result:
                  // what should this be?
                  '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000024657468546f546f6b656e53776170496e7075742875696e743235362c75696e743235362900000000000000000000000000000000000000000000000000000000',
              },
            },
            {
              request: {
                method: 'eth_getBlockByNumber',
                params: ['0x1', false],
              },
              response: {
                result: {
                  baseFeePerGas: '0x63c498a46',
                  number: '0x42',
                },
              },
            },
            {
              request: {
                method: 'eth_gasPrice',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
          ],
        });
        const { transactionController } = await newController({});
        await transactionController.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_2_MOCK,
          },
          { networkClientId: 'mainnet' },
        );
        expect(transactionController.state.transactions).toHaveLength(1);
        expect(transactionController.state.transactions[0].status).toBe(
          'unapproved',
        );
      });
      it('should be able to get to submitted state', async () => {
        expect(true).toBe(true);
      });
      it('should be able to get to completed state', async () => {
        expect(true).toBe(true);
      });
      it('should be able to get to cancelled state', async () => {
        expect(true).toBe(true);
      });
      it('should be able to get to speedup state', async () => {
        expect(true).toBe(true);
      });
    });
  });

  describe('startIncomingTransactionPolling', () => {
    // TODO(JL): IncomingTransactionHelper doesn't populate networkClientId on the generated tx object. Should it?..
    it('should add incoming transactions to state with the correct chainId and networkClientId', async () => {
      // this is needed or the globally selected mainnet PollingBlockTracker makes this test fail
      mockNetwork({
        networkClientConfiguration,
        mocks: [
          {
            request: {
              method: 'eth_blockNumber',
              params: [],
            },
            response: {
              result: '0x1',
            },
          },
          {
            request: {
              method: 'eth_getBlockByNumber',
              params: ['0x1', false],
            },
            response: {
              result: {
                number: '0x42',
              },
            },
          },
        ],
      });

      const selectedAddress = ETHERSCAN_TRANSACTION_BASE_MOCK.to;

      const { networkController, transactionController } = await newController({
        getSelectedAddress: () => selectedAddress,
      });

      const expectedLastFetchedBlockNumbers: Record<string, number> = {};
      const expectedTransactions: Partial<TransactionMeta>[] = [];

      const networkClients = networkController.getNetworkClientRegistry();
      // NOTE(JL): This doesn't seem to work for the globally selected provider because of nock getting stacked on mainnet.infura.io twice
      const networkClientIds = Object.keys(networkClients).filter(
        (v) => v !== networkClientConfiguration.network,
      );
      for (const networkClientId of networkClientIds) {
        const config = networkClients[networkClientId].configuration;
        console.log(config);
        mockNetwork({
          networkClientConfiguration: config,
          mocks: [
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
          ],
        });
        nock(getEtherscanApiHost(config.chainId))
          .get(
            `/api?module=account&address=${selectedAddress}&offset=40&sort=desc&action=txlist&tag=latest&page=1`,
          )
          .reply(200, ETHERSCAN_TRANSACTION_RESPONSE_MOCK);

        const receivedIncomingTransaction = new Promise((resolve) => {
          transactionController.hub.once('incomingTransactionBlock', resolve);
        });

        transactionController.startIncomingTransactionPolling([
          networkClientId,
        ]);

        await receivedIncomingTransaction;

        transactionController.stopIncomingTransactionPolling([networkClientId]);

        expectedLastFetchedBlockNumbers[
          `${config.chainId}#${selectedAddress}#normal`
        ] = parseInt(ETHERSCAN_TRANSACTION_BASE_MOCK.blockNumber, 10);
        expectedTransactions.push({
          blockNumber: ETHERSCAN_TRANSACTION_BASE_MOCK.blockNumber,
          chainId: config.chainId,
          type: TransactionType.incoming,
          verifiedOnBlockchain: false,
          status: TransactionStatus.confirmed,
        });
        expectedTransactions.push({
          blockNumber: ETHERSCAN_TRANSACTION_BASE_MOCK.blockNumber,
          chainId: config.chainId,
          type: TransactionType.incoming,
          verifiedOnBlockchain: false,
          status: TransactionStatus.failed,
        });
      }

      expect(transactionController.state.transactions).toHaveLength(
        2 * networkClientIds.length,
      );
      expect(transactionController.state.transactions).toStrictEqual(
        expect.arrayContaining(
          expectedTransactions.map(expect.objectContaining),
        ),
      );
      expect(transactionController.state.lastFetchedBlockNumbers).toStrictEqual(
        expectedLastFetchedBlockNumbers,
      );
    });
  });
  // describe('stopIncomingTransactionPolling', () => {});
  // describe('stopAllIncomingTransactionPolling', () => {});
  // describe('updateIncomingTransactions', () => {});
});
