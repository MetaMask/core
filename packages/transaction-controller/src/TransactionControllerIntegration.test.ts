import { ApprovalController } from '@metamask/approval-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import { BUILT_IN_NETWORKS, NetworkType } from '@metamask/controller-utils';
import {
  NetworkController,
  NetworkClientType,
} from '@metamask/network-controller';
import nock from 'nock';
import { useFakeTimers } from 'sinon';

import { advanceTime } from '../../../tests/helpers';
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
const infuraProjectId = '341eacb578dd44a1a049cbc5f6fd4035';

const networkClientConfiguration = {
  type: NetworkClientType.Infura,
  network: NetworkType.goerli,
  chainId: BUILT_IN_NETWORKS[NetworkType.goerli].chainId,
  infuraProjectId,
  ticker: BUILT_IN_NETWORKS[NetworkType.goerli].ticker,
} as const;

const mainnetNetworkClientConfiguration = {
  type: NetworkClientType.Infura,
  network: NetworkType.mainnet,
  chainId: BUILT_IN_NETWORKS[NetworkType.mainnet].chainId,
  infuraProjectId,
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
    infuraProjectId,
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
    it('should create a new instance of TransactionController', async () => {
      mockNetwork({
        networkClientConfiguration: mainnetNetworkClientConfiguration,
        mocks: [
          // NetworkController
          // BlockTracker
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
      const { transactionController } = await newController({});
      transactionController.stopTrackingByNetworkClientId('goerli');
      expect(transactionController).toBeDefined();
    });
  });
  describe('multichain transaction lifecycle', () => {
    describe('when a transaction is added with a networkClientId that does not match the globally selected network', () => {
      it('should add a new unapproved transaction', async () => {
        mockNetwork({
          networkClientConfiguration: mainnetNetworkClientConfiguration,
          mocks: [
            // NetworkController
            // BlockTracker
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x3b3301',
              },
            },
          ],
        });
        mockNetwork({
          networkClientConfiguration,
          mocks: [
            // NetworkController
            // BlockTracker
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
            // readAddressAsContract
            // requiresFixedGas (cached)
            {
              request: {
                method: 'eth_getCode',
                params: [ACCOUNT_2_MOCK, '0x1'],
              },
              response: {
                result:
                  '0x', // non contract
              },
            },
            // getSuggestedGasFees
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
          { networkClientId: 'goerli' },
        );
        transactionController.stopTrackingByNetworkClientId('goerli');
        expect(transactionController.state.transactions).toHaveLength(1);
        expect(transactionController.state.transactions[0].status).toBe(
          'unapproved',
        );
      });
      it('should be able to get to submitted state', async () => {
        mockNetwork({
          networkClientConfiguration: mainnetNetworkClientConfiguration,
          mocks: [
            // NetworkController
            // BlockTracker
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x3b3301',
              },
            },
          ],
        });
        mockNetwork({
          networkClientConfiguration,
          mocks: [
            // NetworkController
            // BlockTracker
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
            // NetworkController
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
            // BlockTracker
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x2',
              },
            },
            // readAddressAsContract
            // requiresFixedGas (cached)
            {
              request: {
                method: 'eth_getCode',
                params: [ACCOUNT_2_MOCK, '0x1'],
              },
              response: {
                result:
                  '0x' // non contract
              },
            },
            // estimateGas
            {
              request: {
                method: 'eth_estimateGas',
                params: [
                  {
                    from: '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207',
                    to: '0x08f137f335ea1b8f193b8f6ea92561a60d23a211',
                    value: '0x0',
                    gas: '0x0',
                  },
                ],
              },
              response: {
                result: '0x1',
              },
            },
            // getSuggestedGasFees
            {
              request: {
                method: 'eth_gasPrice',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
            // NonceTracker
            {
              request: {
                method: 'eth_getTransactionCount',
                params: ['0x6bf137f335ea1b8f193b8f6ea92561a60d23a207', '0x1'],
              },
              response: {
                result: '0x1',
              },
            },
            // publishTransaction
            {
              request: {
                method: 'eth_sendRawTransaction',
                params: [
                  '0x02e2050101018252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
                ],
              },
              response: {
                result: '0x1',
              },
            },
          ],
        });
        const { transactionController, approvalController } =
          await newController({});
        const { result, transactionMeta } =
          await transactionController.addTransaction(
            {
              from: ACCOUNT_MOCK,
              to: ACCOUNT_2_MOCK,
            },
            { networkClientId: 'goerli' },
          );

        await approvalController.accept(transactionMeta.id);

        await result;

        transactionController.stopTrackingByNetworkClientId('goerli');
        expect(transactionController.state.transactions).toHaveLength(1);
        expect(transactionController.state.transactions[0].status).toBe(
          'submitted',
        );
      });
      it('should be able to get to confirmed state', async () => {
        const clock = useFakeTimers();
        mockNetwork({
          networkClientConfiguration: mainnetNetworkClientConfiguration,
          mocks: [
            // NetworkController
            // BlockTracker
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x3b3301',
              },
            },
          ],
        });
        mockNetwork({
          networkClientConfiguration,
          mocks: [
            // NetworkController
            // BlockTracker
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
            // NetworkController
            {
              request: {
                method: 'eth_getBlockByNumber',
                params: ['0x1', false],
              },
              response: {
                result: {
                  baseFeePerGas: '0x63c498a46',
                  number: '0x1',
                },
              },
            },
            // readAddressAsContract
            // requiresFixedGas (cached)
            {
              request: {
                method: 'eth_getCode',
                params: [ACCOUNT_2_MOCK, '0x1'],
              },
              response: {
                result:
                  '0x' // non contract
              },
            },
            // estimateGas
            {
              request: {
                method: 'eth_estimateGas',
                params: [
                  {
                    from: '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207',
                    to: '0x08f137f335ea1b8f193b8f6ea92561a60d23a211',
                    value: '0x0',
                    gas: '0x0',
                  },
                ],
              },
              response: {
                result: '0x1',
              },
            },
            // getSuggestedGasFees
            {
              request: {
                method: 'eth_gasPrice',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
            // NonceTracker
            {
              request: {
                method: 'eth_getTransactionCount',
                params: ['0x6bf137f335ea1b8f193b8f6ea92561a60d23a207', '0x1'],
              },
              response: {
                result: '0x1',
              },
            },
            // publishTransaction
            {
              request: {
                method: 'eth_sendRawTransaction',
                params: [
                  '0x02e2050101018252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
                ],
              },
              response: {
                result: '0x1',
              },
            },
            // BlockTracker
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x3',
              },
            },
            // PendingTransactionTracker.#checkTransaction
            {
              request: {
                method: 'eth_getTransactionReceipt',
                params: ['0x1'],
              },
              response: {
                result: {
                  blockHash: '0x1',
                  blockNumber: '0x3', // we need at least 2 blocks mocked since the first one is used for when the blockTracker is instantied before we have listeners
                  status: '0x1', // 0x1 = success
                },
              },
            },
            // PendingTransactionTracker.#onTransactionConfirmed
            {
              request: {
                method: 'eth_getBlockByHash',
                params: ['0x1', false],
              },
              response: {
                result: {
                  transactions: [],
                },
              },
            },
          ],
        });
        const { transactionController, approvalController } =
          await newController({});
        const { result, transactionMeta } =
          await transactionController.addTransaction(
            {
              from: ACCOUNT_MOCK,
              to: ACCOUNT_2_MOCK,
            },
            { networkClientId: 'goerli' },
          );

        await approvalController.accept(transactionMeta.id);
        await advanceTime({ clock, duration: 1 });

        await result;
        // blocktracker polling is 20s
        await advanceTime({ clock, duration: 20000 });
        await advanceTime({ clock, duration: 1 });
        await advanceTime({ clock, duration: 1 });

        expect(transactionController.state.transactions).toHaveLength(1);
        expect(transactionController.state.transactions[0].status).toBe(
          'confirmed',
        );
        clock.restore();
      });
      it('should be able to cancel a transaction', async () => {
        mockNetwork({
          networkClientConfiguration: mainnetNetworkClientConfiguration,
          mocks: [
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x3b3301',
              },
            },
            {
              request: {
                method: 'eth_getBlockByNumber',
                params: ['0x3b3301'],
              },
              response: {
                result: {
                  baseFeePerGas: '0x63c498a46',
                  number: '0x3b3301',
                },
              },
            },
            {
              request: {
                method: 'eth_getTransactionCount',
                params: [
                  '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207',
                  '0x3b3301',
                ],
              },
              response: {
                result: '0x1',
              },
            },
          ],
        });
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
                result: '0x3',
              },
            },
            {
              request: {
                method: 'eth_getBlockByHash',
                params: ['0x1', false],
              },
              response: {
                result: {
                  transactions: [],
                },
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
                  number: '0x1',
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
            {
              request: {
                method: 'eth_estimateGas',
                params: [
                  {
                    from: '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207',
                    to: '0x08f137f335ea1b8f193b8f6ea92561a60d23a211',
                    value: '0x0',
                    gas: '0x0',
                  },
                ],
              },
              response: {
                result: '0x1',
              },
            },
            {
              request: {
                method: 'eth_getTransactionCount',
                params: ['0x6bf137f335ea1b8f193b8f6ea92561a60d23a207', '0x1'],
              },
              response: {
                result: '0x1',
              },
            },
            {
              request: {
                method: 'eth_sendRawTransaction',
                params: [
                  '0x02e005010101019408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
                ],
              },
              response: {
                result: '0x1',
              },
            },
            {
              request: {
                method: 'eth_getTransactionReceipt',
                params: ['0x1'],
              },
              response: {
                result: {
                  blockHash: '0x1',
                  blockNumber: '0x3', // we need at least 2 blocks mocked since the first one is used for when the blockTracker is instantied before we have listeners
                  status: '0x1', // 0x1 = success
                },
              },
            },
            {
              request: {
                method: 'eth_sendRawTransaction',
                params: [
                  '0x02e00501010101946bf137f335ea1b8f193b8f6ea92561a60d23a2078080c0808080',
                ],
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
                result: '0x2',
              },
            },
            {
              request: {
                method: 'eth_getTransactionReceipt',
                params: ['0x2'],
              },
              response: {
                result: {
                  blockHash: '0x1',
                  blockNumber: '0x3', // we need at least 2 blocks mocked since the first one is used for when the blockTracker is instantied before we have listeners
                  status: '0x1', // 0x1 = success
                },
              },
            },
          ],
        });
        const { transactionController, approvalController } =
          await newController({});
        const { result, transactionMeta } =
          await transactionController.addTransaction(
            {
              from: ACCOUNT_MOCK,
              to: ACCOUNT_2_MOCK,
            },
            { networkClientId: 'goerli' },
          );

        await approvalController.accept(transactionMeta.id);

        await result;

        await transactionController.stopTransaction(transactionMeta.id);
        transactionController.stopTrackingByNetworkClientId('goerli');

        expect(transactionController.state.transactions).toHaveLength(2);
        expect(transactionController.state.transactions[1].status).toBe(
          'submitted',
        );
      });
      it('should be able to confirm a cancelled transaction', async () => {
        const clock = useFakeTimers();
        mockNetwork({
          networkClientConfiguration: mainnetNetworkClientConfiguration,
          mocks: [
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x3b3301',
              },
            },
            {
              request: {
                method: 'eth_getBlockByNumber',
                params: ['0x3b3301'],
              },
              response: {
                result: {
                  baseFeePerGas: '0x63c498a46',
                  number: '0x3b3301',
                },
              },
            },
            {
              request: {
                method: 'eth_getTransactionCount',
                params: [
                  '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207',
                  '0x3b3301',
                ],
              },
              response: {
                result: '0x1',
              },
            },
          ],
        });
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
                result: '0x3',
              },
            },
            {
              request: {
                method: 'eth_getBlockByHash',
                params: ['0x1', false],
              },
              response: {
                result: {
                  transactions: [],
                },
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
                  number: '0x1',
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
            {
              request: {
                method: 'eth_estimateGas',
                params: [
                  {
                    from: '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207',
                    to: '0x08f137f335ea1b8f193b8f6ea92561a60d23a211',
                    value: '0x0',
                    gas: '0x0',
                  },
                ],
              },
              response: {
                result: '0x1',
              },
            },
            {
              request: {
                method: 'eth_getTransactionCount',
                params: ['0x6bf137f335ea1b8f193b8f6ea92561a60d23a207', '0x1'],
              },
              response: {
                result: '0x1',
              },
            },
            {
              request: {
                method: 'eth_sendRawTransaction',
                params: [
                  '0x02e005010101019408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
                ],
              },
              response: {
                result: '0x1',
              },
            },
            {
              request: {
                method: 'eth_getTransactionReceipt',
                params: ['0x1'],
              },
              response: {
                result: null,
              },
            },
            {
              request: {
                method: 'eth_getTransactionReceipt',
                params: ['0x1'],
              },
              response: {
                result: null,
              },
            },
            {
              request: {
                method: 'eth_sendRawTransaction',
                params: [
                  '0x02e00501010101946bf137f335ea1b8f193b8f6ea92561a60d23a2078080c0808080',
                ],
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
                result: '0x4',
              },
            },
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x4',
              },
            },
            {
              request: {
                method: 'eth_getTransactionReceipt',
                params: ['0x2'],
              },
              response: {
                result: {
                  blockHash: '0x2',
                  blockNumber: '0x4', // we need at least 2 blocks mocked since the first one is used for when the blockTracker is instantied before we have listeners
                  status: '0x1', // 0x1 = success
                },
              },
            },
            {
              request: {
                method: 'eth_getBlockByHash',
                params: ['0x2', false],
              },
              response: {
                result: {
                  transactions: [],
                },
              },
            },
          ],
        });
        const { transactionController, approvalController } =
          await newController({});
        const { result, transactionMeta } =
          await transactionController.addTransaction(
            {
              from: ACCOUNT_MOCK,
              to: ACCOUNT_2_MOCK,
            },
            { networkClientId: 'goerli' },
          );

        await approvalController.accept(transactionMeta.id);
        await advanceTime({ clock, duration: 1 });

        await result;

        await transactionController.stopTransaction(transactionMeta.id);

        // blocktracker polling is 20s
        await advanceTime({ clock, duration: 20000 });
        await advanceTime({ clock, duration: 1 });
        await advanceTime({ clock, duration: 1 });
        await advanceTime({ clock, duration: 20000 });
        await advanceTime({ clock, duration: 1 });
        await advanceTime({ clock, duration: 1 });

        expect(transactionController.state.transactions).toHaveLength(2);
        expect(transactionController.state.transactions[1].status).toBe(
          'confirmed',
        );
        transactionController.stopTrackingByNetworkClientId('goerli');
        clock.restore();
      });
      it('should be able to get to speedup state', async () => {
        const clock = useFakeTimers();
        mockNetwork({
          networkClientConfiguration: mainnetNetworkClientConfiguration,
          mocks: [
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x3b3301',
              },
            },
            {
              request: {
                method: 'eth_getBlockByNumber',
                params: ['0x3b3301'],
              },
              response: {
                result: {
                  baseFeePerGas: '0x63c498a46',
                  number: '0x3b3301',
                },
              },
            },
            {
              request: {
                method: 'eth_getTransactionCount',
                params: [
                  '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207',
                  '0x3b3301',
                ],
              },
              response: {
                result: '0x1',
              },
            },
          ],
        });
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
                result: '0x3',
              },
            },
            {
              request: {
                method: 'eth_getBlockByHash',
                params: ['0x1', false],
              },
              response: {
                result: {
                  transactions: [],
                },
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
                  number: '0x1',
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
            {
              request: {
                method: 'eth_estimateGas',
                params: [
                  {
                    from: '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207',
                    to: '0x08f137f335ea1b8f193b8f6ea92561a60d23a211',
                    value: '0x0',
                    gas: '0x0',
                  },
                ],
              },
              response: {
                result: '0x1',
              },
            },
            {
              request: {
                method: 'eth_getTransactionCount',
                params: ['0x6bf137f335ea1b8f193b8f6ea92561a60d23a207', '0x1'],
              },
              response: {
                result: '0x1',
              },
            },
            {
              request: {
                method: 'eth_sendRawTransaction',
                params: [
                  '0x02e405018203e88203e8809408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
                ],
              },
              response: {
                result: '0x1',
              },
            },
            {
              request: {
                method: 'eth_getTransactionReceipt',
                params: ['0x1'],
              },
              response: {
                result: null,
              },
            },
            {
              request: {
                method: 'eth_getTransactionReceipt',
                params: ['0x1'],
              },
              response: {
                result: null,
              },
            },
            {
              request: {
                method: 'eth_sendRawTransaction',
                params: [
                  '0x02e4050182044c82044c809408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
                ],
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
                result: '0x4',
              },
            },
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x4',
              },
            },
            {
              request: {
                method: 'eth_getTransactionReceipt',
                params: ['0x2'],
              },
              response: {
                result: {
                  blockHash: '0x2',
                  blockNumber: '0x4', // we need at least 2 blocks mocked since the first one is used for when the blockTracker is instantied before we have listeners
                  status: '0x1', // 0x1 = success
                },
              },
            },
            {
              request: {
                method: 'eth_getBlockByHash',
                params: ['0x2', false],
              },
              response: {
                result: {
                  transactions: [],
                },
              },
            },
          ],
        });
        const { transactionController, approvalController } =
          await newController({});
        const { result, transactionMeta } =
          await transactionController.addTransaction(
            {
              from: ACCOUNT_MOCK,
              to: ACCOUNT_2_MOCK,
              maxFeePerGas: '0x3e8',
            },
            { networkClientId: 'goerli' },
          );

        await approvalController.accept(transactionMeta.id);
        await advanceTime({ clock, duration: 1 });

        await result;

        await transactionController.speedUpTransaction(transactionMeta.id);

        // blocktracker polling is 20s
        await advanceTime({ clock, duration: 20000 });
        await advanceTime({ clock, duration: 1 });
        await advanceTime({ clock, duration: 1 });
        await advanceTime({ clock, duration: 20000 });
        await advanceTime({ clock, duration: 1 });
        await advanceTime({ clock, duration: 1 });

        expect(transactionController.state.transactions).toHaveLength(2);
        expect(transactionController.state.transactions[1].status).toBe(
          'confirmed',
        );
        const baseFee =
          transactionController.state.transactions[0].txParams.maxFeePerGas;
        expect(
          Number(
            transactionController.state.transactions[1].txParams.maxFeePerGas,
          ),
        ).toBeGreaterThan(Number(baseFee));
        transactionController.stopTrackingByNetworkClientId('goerli');
        clock.restore();
      });
    });
  });

  describe('startIncomingTransactionPolling', () => {
    // TODO(JL): IncomingTransactionHelper doesn't populate networkClientId on the generated tx object. Should it?..
    it('should add incoming transactions to state with the correct chainId for the given networkClientId on the next block', async () => {
      const clock = useFakeTimers();
      // this is needed or the globally selected mainnet PollingBlockTracker makes this test fail
      mockNetwork({
        networkClientConfiguration: mainnetNetworkClientConfiguration,
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
        mockNetwork({
          networkClientConfiguration: config,
          mocks: [
            //  blockTracker on instantiation
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
            // blockTracker loop
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x2',
              },
            },
          ],
        });
        nock(getEtherscanApiHost(config.chainId))
          .get(
            `/api?module=account&address=${selectedAddress}&offset=40&sort=desc&action=txlist&tag=latest&page=1`,
          )
          .reply(200, ETHERSCAN_TRANSACTION_RESPONSE_MOCK);

        transactionController.startIncomingTransactionPolling([
          networkClientId,
        ]);

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
      await advanceTime({ clock, duration: 20000 });

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
      clock.restore();
    });
  });

  describe('stopIncomingTransactionPolling', () => {
    it('should not poll for new incoming transactions for the given networkClientId', async () => {
      const clock = useFakeTimers();
      // this is needed or the globally selected mainnet PollingBlockTracker makes this test fail
      mockNetwork({
        networkClientConfiguration: mainnetNetworkClientConfiguration,
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

      const selectedAddress = ETHERSCAN_TRANSACTION_BASE_MOCK.to;

      const { networkController, transactionController } = await newController({
        getSelectedAddress: () => selectedAddress,
      });

      const networkClients = networkController.getNetworkClientRegistry();
      // NOTE(JL): This doesn't seem to work for the globally selected provider because of nock getting stacked on mainnet.infura.io twice
      const networkClientIds = Object.keys(networkClients).filter(
        (v) => v !== networkClientConfiguration.network,
      );
      for (const networkClientId of networkClientIds) {
        const config = networkClients[networkClientId].configuration;
        mockNetwork({
          networkClientConfiguration: config,
          mocks: [
            //  blockTracker on instantiation
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
            // blockTracker loop
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x2',
              },
            },
          ],
        });
        nock(getEtherscanApiHost(config.chainId))
          .get(
            `/api?module=account&address=${selectedAddress}&offset=40&sort=desc&action=txlist&tag=latest&page=1`,
          )
          .reply(200, ETHERSCAN_TRANSACTION_RESPONSE_MOCK);

        transactionController.startIncomingTransactionPolling([
          networkClientId,
        ]);

        transactionController.stopIncomingTransactionPolling([networkClientId]);
      }
      await advanceTime({ clock, duration: 20000 });

      expect(transactionController.state.transactions).toStrictEqual([]);
      expect(transactionController.state.lastFetchedBlockNumbers).toStrictEqual(
        {},
      );
      clock.restore();
    });
  });

  describe('stopAllIncomingTransactionPolling', () => {
    it('should not poll for incoming transactions on any network client', async () => {
      const clock = useFakeTimers();
      // this is needed or the globally selected mainnet PollingBlockTracker makes this test fail
      mockNetwork({
        networkClientConfiguration: mainnetNetworkClientConfiguration,
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

      const selectedAddress = ETHERSCAN_TRANSACTION_BASE_MOCK.to;

      const { networkController, transactionController } = await newController({
        getSelectedAddress: () => selectedAddress,
      });

      const networkClients = networkController.getNetworkClientRegistry();
      // NOTE(JL): This doesn't seem to work for the globally selected provider because of nock getting stacked on mainnet.infura.io twice
      const networkClientIds = Object.keys(networkClients).filter(
        (v) => v !== networkClientConfiguration.network,
      );
      for (const networkClientId of networkClientIds) {
        const config = networkClients[networkClientId].configuration;
        mockNetwork({
          networkClientConfiguration: config,
          mocks: [
            //  blockTracker on instantiation
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
            // blockTracker loop
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x2',
              },
            },
          ],
        });
        nock(getEtherscanApiHost(config.chainId))
          .get(
            `/api?module=account&address=${selectedAddress}&offset=40&sort=desc&action=txlist&tag=latest&page=1`,
          )
          .reply(200, ETHERSCAN_TRANSACTION_RESPONSE_MOCK);

        transactionController.startIncomingTransactionPolling([
          networkClientId,
        ]);
      }

      transactionController.stopAllIncomingTransactionPolling();
      await advanceTime({ clock, duration: 20000 });

      expect(transactionController.state.transactions).toStrictEqual([]);
      expect(transactionController.state.lastFetchedBlockNumbers).toStrictEqual(
        {},
      );
      clock.restore();
    });
  });

  describe('updateIncomingTransactions', () => {
    it('should add incoming transactions to state with the correct chainId for the given networkClientId without waiting for the next block', async () => {
      const clock = useFakeTimers();
      // this is needed or the globally selected mainnet PollingBlockTracker makes this test fail
      mockNetwork({
        networkClientConfiguration: mainnetNetworkClientConfiguration,
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
        mockNetwork({
          networkClientConfiguration: config,
          mocks: [
            //  blockTracker on instantiation
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

        await transactionController.updateIncomingTransactions([
          networkClientId,
        ]);

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
      clock.restore();
    });
  });

  describe('getNonceLock', () => {
    it('should get the nonce lock from the nonceTracker for the given networkClientId', async () => {
      mockNetwork({
        networkClientConfiguration: mainnetNetworkClientConfiguration,
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

      const { networkController, transactionController } = await newController(
        {},
      );

      const networkClients = networkController.getNetworkClientRegistry();
      // NOTE(JL): This doesn't seem to work for the globally selected provider because of nock getting stacked on mainnet.infura.io twice
      const networkClientIds = Object.keys(networkClients).filter(
        (v) => v !== networkClientConfiguration.network,
      );
      for (const networkClientId of networkClientIds) {
        const config = networkClients[networkClientId].configuration;
        mockNetwork({
          networkClientConfiguration: config,
          mocks: [
            // BlockTracker
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
            // NonceTracker
            {
              request: {
                method: 'eth_getTransactionCount',
                params: [ACCOUNT_MOCK, '0x1'],
              },
              response: {
                result: '0xa',
              },
            },
          ],
        });

        const nonceLock = await transactionController.getNonceLock(
          ACCOUNT_MOCK,
          networkClientId,
        );
        expect(nonceLock.nextNonce).toBe(10);
      }
    });

    it('should block other attempts to get the nonce lock from the nonceTracker until the first one is released for the given networkClientId', async () => {
      mockNetwork({
        networkClientConfiguration: mainnetNetworkClientConfiguration,
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

      const { networkController, transactionController } = await newController(
        {},
      );

      const networkClients = networkController.getNetworkClientRegistry();
      // NOTE(JL): This doesn't seem to work for the globally selected provider because of nock getting stacked on mainnet.infura.io twice
      const networkClientIds = Object.keys(networkClients).filter(
        (v) => v !== networkClientConfiguration.network,
      );
      for (const networkClientId of networkClientIds) {
        const config = networkClients[networkClientId].configuration;
        mockNetwork({
          networkClientConfiguration: config,
          mocks: [
            // BlockTracker
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
            // NonceTracker
            {
              request: {
                method: 'eth_getTransactionCount',
                params: [ACCOUNT_MOCK, '0x1'],
              },
              response: {
                result: '0xa',
              },
            },
          ],
        });

        const firstNonceLock = await transactionController.getNonceLock(
          ACCOUNT_MOCK,
          networkClientId,
        );

        expect(firstNonceLock.nextNonce).toBe(10);

        const secondNonceLock = transactionController.getNonceLock(
          ACCOUNT_MOCK,
          networkClientId,
        );
        const delay = () =>
          new Promise<null>((resolve) => {
            setTimeout(resolve, 100, null);
          });

        let secondNonceLockIfAcquired = await Promise.race([
          secondNonceLock,
          delay(),
        ]);
        expect(secondNonceLockIfAcquired).toBeNull();

        await firstNonceLock.releaseLock();

        secondNonceLockIfAcquired = await Promise.race([
          secondNonceLock,
          delay(),
        ]);
        expect(secondNonceLockIfAcquired?.nextNonce).toBe(10);
      }
    });

    it('should get the nonce lock from the globally selected nonceTracker if no networkClientId is provided', async () => {
      mockNetwork({
        networkClientConfiguration: mainnetNetworkClientConfiguration,
        mocks: [
          // BlockTracker
          {
            request: {
              method: 'eth_blockNumber',
              params: [],
            },
            response: {
              result: '0x1',
            },
          },
          // NonceTracker
          {
            request: {
              method: 'eth_getTransactionCount',
              params: [ACCOUNT_MOCK, '0x1'],
            },
            response: {
              result: '0xa',
            },
          },
        ],
      });

      const { transactionController } = await newController({});

      const nonceLock = await transactionController.getNonceLock(ACCOUNT_MOCK);
      expect(nonceLock.nextNonce).toBe(10);
    });

    it('should block other attempts to get the nonce lock from the globally selected nonceTracker until the first one is released if no networkClientId is provided', async () => {
      mockNetwork({
        networkClientConfiguration: mainnetNetworkClientConfiguration,
        mocks: [
          // BlockTracker
          {
            request: {
              method: 'eth_blockNumber',
              params: [],
            },
            response: {
              result: '0x1',
            },
          },
          // NonceTracker
          {
            request: {
              method: 'eth_getTransactionCount',
              params: [ACCOUNT_MOCK, '0x1'],
            },
            response: {
              result: '0xa',
            },
          },
        ],
      });

      const { transactionController } = await newController({});

      const firstNonceLock = await transactionController.getNonceLock(
        ACCOUNT_MOCK,
      );

      expect(firstNonceLock.nextNonce).toBe(10);

      const secondNonceLock = transactionController.getNonceLock(ACCOUNT_MOCK);
      const delay = () =>
        new Promise<null>((resolve) => {
          setTimeout(resolve, 100, null);
        });

      let secondNonceLockIfAcquired = await Promise.race([
        secondNonceLock,
        delay(),
      ]);
      expect(secondNonceLockIfAcquired).toBeNull();

      await firstNonceLock.releaseLock();

      secondNonceLockIfAcquired = await Promise.race([
        secondNonceLock,
        delay(),
      ]);
      expect(secondNonceLockIfAcquired?.nextNonce).toBe(10);
    });
  });
});
