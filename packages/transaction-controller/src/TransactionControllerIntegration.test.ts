import { ApprovalController } from '@metamask/approval-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import {
  ApprovalType,
  BUILT_IN_NETWORKS,
  NetworkType,
} from '@metamask/controller-utils';
import {
  NetworkController,
  NetworkClientType,
} from '@metamask/network-controller';
import nock from 'nock';
import type { SinonFakeTimers } from 'sinon';
import { useFakeTimers } from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import { mockNetwork } from '../../../tests/mock-network';
import {
  ETHERSCAN_TRANSACTION_BASE_MOCK,
  ETHERSCAN_TRANSACTION_RESPONSE_MOCK,
  ETHERSCAN_TOKEN_TRANSACTION_MOCK,
  ETHERSCAN_TRANSACTION_SUCCESS_MOCK,
} from './helpers/EtherscanMocks';
import { TransactionController } from './TransactionController';
import type { TransactionMeta } from './types';
import { TransactionStatus, TransactionType } from './types';
import { getEtherscanApiHost } from './utils/etherscan';
import * as etherscanUtils from './utils/etherscan';

const ACCOUNT_MOCK = '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207';
const ACCOUNT_2_MOCK = '0x08f137f335ea1b8f193b8f6ea92561a60d23a211';
const ACCOUNT_3_MOCK = '0xe688b84b23f322a994a53dbf8e15fa82cdb71127';
const infuraProjectId = '341eacb578dd44a1a049cbc5f6fd4035';

const networkClientConfiguration = {
  type: NetworkClientType.Infura,
  network: NetworkType.goerli,
  chainId: BUILT_IN_NETWORKS[NetworkType.goerli].chainId,
  infuraProjectId,
  ticker: BUILT_IN_NETWORKS[NetworkType.goerli].ticker,
} as const;

const sepoliaNetworkClientConfiguration = {
  type: NetworkClientType.Infura,
  network: NetworkType.sepolia,
  chainId: BUILT_IN_NETWORKS[NetworkType.sepolia].chainId,
  infuraProjectId,
  ticker: BUILT_IN_NETWORKS[NetworkType.sepolia].ticker,
} as const;

const mainnetNetworkClientConfiguration = {
  type: NetworkClientType.Infura,
  network: NetworkType.mainnet,
  chainId: BUILT_IN_NETWORKS[NetworkType.mainnet].chainId,
  infuraProjectId,
  ticker: BUILT_IN_NETWORKS[NetworkType.mainnet].ticker,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const newController = async (options: any = {}) => {
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
    typesExcludedFromRateLimiting: [ApprovalType.Transaction],
  });

  const { state, config, ...opts } = options;

  const transactionController = new TransactionController(
    {
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
      getPermittedAccounts: () => [ACCOUNT_MOCK],
      enableMultichain: true,
      ...opts,
    },
    {
      sign: (transaction) => Promise.resolve(transaction),
      ...config,
    },
    state,
  );

  return {
    transactionController,
    approvalController,
    networkController,
  };
};

describe('TransactionController Integration', () => {
  let clock: SinonFakeTimers;
  beforeEach(() => {
    clock = useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

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
      expect(transactionController).toBeDefined();
      transactionController.destroy();
    });

    it('should submit all approved transactions in state', async () => {
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

      mockNetwork({
        networkClientConfiguration: sepoliaNetworkClientConfiguration,
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
          // publishTransaction
          {
            request: {
              method: 'eth_sendRawTransaction',
              params: [
                '0x02e583aa36a70101018252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
              ],
            },
            response: {
              result: '0x1',
            },
          },
        ],
      });

      const { transactionController } = await newController({
        state: {
          transactions: [
            {
              actionId: undefined,
              chainId: '0x5',
              dappSuggestedGasFees: undefined,
              deviceConfirmedOn: undefined,
              id: 'ecfe8c60-ba27-11ee-8643-dfd28279a442',
              origin: undefined,
              securityAlertResponse: undefined,
              status: 'approved',
              time: 1706039113766,
              txParams: {
                from: '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207',
                gas: '0x5208',
                nonce: '0x1',
                to: '0x08f137f335ea1b8f193b8f6ea92561a60d23a211',
                value: '0x0',
                maxFeePerGas: '0x1',
                maxPriorityFeePerGas: '0x1',
              },
              userEditedGasLimit: false,
              verifiedOnBlockchain: false,
              type: 'simpleSend',
              networkClientId: 'goerli',
              simulationFails: undefined,
              originalGasEstimate: '0x5208',
              defaultGasEstimates: {
                gas: '0x5208',
                maxFeePerGas: '0x1',
                maxPriorityFeePerGas: '0x1',
                gasPrice: undefined,
                estimateType: 'dappSuggested',
              },
              userFeeLevel: 'dappSuggested',
              sendFlowHistory: [],
              history: [{}, []],
            },
            {
              actionId: undefined,
              chainId: '0xaa36a7',
              dappSuggestedGasFees: undefined,
              deviceConfirmedOn: undefined,
              id: 'c4cc0ff0-ba28-11ee-926f-55a7f9c2c2c6',
              origin: undefined,
              securityAlertResponse: undefined,
              status: 'approved',
              time: 1706039113766,
              txParams: {
                from: '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207',
                gas: '0x5208',
                nonce: '0x1',
                to: '0x08f137f335ea1b8f193b8f6ea92561a60d23a211',
                value: '0x0',
                maxFeePerGas: '0x1',
                maxPriorityFeePerGas: '0x1',
              },
              userEditedGasLimit: false,
              verifiedOnBlockchain: false,
              type: 'simpleSend',
              networkClientId: 'sepolia',
              simulationFails: undefined,
              originalGasEstimate: '0x5208',
              defaultGasEstimates: {
                gas: '0x5208',
                maxFeePerGas: '0x1',
                maxPriorityFeePerGas: '0x1',
                gasPrice: undefined,
                estimateType: 'dappSuggested',
              },
              userFeeLevel: 'dappSuggested',
              sendFlowHistory: [],
              history: [{}, []],
            },
          ],
        },
      });
      await advanceTime({ clock, duration: 1 });

      expect(transactionController.state.transactions).toHaveLength(2);
      expect(transactionController.state.transactions[0].status).toBe(
        'submitted',
      );
      expect(transactionController.state.transactions[1].status).toBe(
        'submitted',
      );
      transactionController.destroy();
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
                result: '0x', // non contract
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
        expect(transactionController.state.transactions).toHaveLength(1);
        expect(transactionController.state.transactions[0].status).toBe(
          'unapproved',
        );
        transactionController.destroy();
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
                result: '0x', // non contract
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
        await advanceTime({ clock, duration: 1 });

        await result;

        expect(transactionController.state.transactions).toHaveLength(1);
        expect(transactionController.state.transactions[0].status).toBe(
          'submitted',
        );
        transactionController.destroy();
      });
      it('should be able to get to confirmed state', async () => {
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
                result: '0x', // non contract
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
        transactionController.destroy();
      });
      it('should be able to send and confirm transactions on different chains', async () => {
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
                result: '0x', // non contract
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
        mockNetwork({
          networkClientConfiguration: sepoliaNetworkClientConfiguration,
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
                result: '0x', // non contract
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
                  '0x02e583aa36a70101018252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
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
        const firstTransaction = await transactionController.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_2_MOCK,
          },
          { networkClientId: 'goerli' },
        );
        const secondTransaction = await transactionController.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_2_MOCK,
          },
          { networkClientId: 'sepolia', origin: 'test' },
        );

        await Promise.all([
          approvalController.accept(firstTransaction.transactionMeta.id),
          approvalController.accept(secondTransaction.transactionMeta.id),
        ]);
        await advanceTime({ clock, duration: 1 });
        await advanceTime({ clock, duration: 1 });

        await Promise.all([firstTransaction.result, secondTransaction.result]);

        // blocktracker polling is 20s
        await advanceTime({ clock, duration: 20000 });
        await advanceTime({ clock, duration: 1 });
        await advanceTime({ clock, duration: 1 });

        expect(transactionController.state.transactions).toHaveLength(2);
        expect(transactionController.state.transactions[0].status).toBe(
          'confirmed',
        );
        expect(
          transactionController.state.transactions[0].networkClientId,
        ).toBe('sepolia');
        expect(transactionController.state.transactions[1].status).toBe(
          'confirmed',
        );
        expect(
          transactionController.state.transactions[1].networkClientId,
        ).toBe('goerli');
        transactionController.destroy();
      });
      it('should be able to cancel a transaction', async () => {
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
                result: '0x', // non contract
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
            // publishTransaction
            {
              request: {
                method: 'eth_sendRawTransaction',
                params: [
                  '0x02e205010101825208946bf137f335ea1b8f193b8f6ea92561a60d23a2078080c0808080',
                ],
              },
              response: {
                result: '0x2',
              },
            },
            // PendingTransactionTracker.#checkTransaction
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
        await advanceTime({ clock, duration: 1 });

        await result;

        await transactionController.stopTransaction(transactionMeta.id);

        expect(transactionController.state.transactions).toHaveLength(2);
        expect(transactionController.state.transactions[1].status).toBe(
          'submitted',
        );
        transactionController.destroy();
      });
      it('should be able to confirm a cancelled transaction', async () => {
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
                result: '0x', // non contract
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
            // publishTransaction
            {
              request: {
                method: 'eth_sendRawTransaction',
                params: [
                  '0x02e205010101825208946bf137f335ea1b8f193b8f6ea92561a60d23a2078080c0808080',
                ],
              },
              response: {
                result: '0x2',
              },
            },
            // PendingTransactionTracker.#checkTransaction
            {
              request: {
                method: 'eth_getTransactionReceipt',
                params: ['0x1'],
              },
              response: {
                result: null,
              },
            },
            // BlockTracker
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x4',
              },
            },
            // BlockTracker
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x4',
              },
            },
            // PendingTransactionTracker.#checkTransaction
            {
              request: {
                method: 'eth_getTransactionReceipt',
                params: ['0x1'],
              },
              response: {
                result: null,
              },
            },
            // PendingTransactionTracker.#checkTransaction
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
            // PendingTransactionTracker.#onTransactionConfirmed
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
        transactionController.destroy();
      });
      it('should be able to get to speedup state', async () => {
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
                result: '0x', // non contract
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
                  '0x02e605018203e88203e88252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
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
                result: null,
              },
            },
            // publishTransaction
            {
              request: {
                method: 'eth_sendRawTransaction',
                params: [
                  '0x02e6050182044c82044c8252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
                ],
              },
              response: {
                result: '0x2',
              },
            },
            // BlockTracker
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x4',
              },
            },
            // BlockTracker
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x4',
              },
            },
            // PendingTransactionTracker.#checkTransaction
            {
              request: {
                method: 'eth_getTransactionReceipt',
                params: ['0x1'],
              },
              response: {
                result: null,
              },
            },
            // PendingTransactionTracker.#checkTransaction
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
            // PendingTransactionTracker.#onTransactionConfirmed
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
        transactionController.destroy();
      });
    });

    describe('when transactions are added concurrently with different networkClientIds but on the same chainId', () => {
      it('should add each transaction with consecutive nonces', async () => {
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
                result: '1',
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
                result: '0x', // non contract
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

        mockNetwork({
          networkClientConfiguration: {
            ...networkClientConfiguration,
            type: NetworkClientType.Custom,
            rpcUrl: 'https://mock.rpc.url',
          },
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
                result: '0x', // non contract
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
                  '0x02e0050201018094e688b84b23f322a994a53dbf8e15fa82cdb711278080c0808080',
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

        const { approvalController, networkController, transactionController } =
          await newController({
            getPermittedAccounts: () => [ACCOUNT_MOCK],
            getSelectedAddress: () => ACCOUNT_MOCK,
          });
        const otherNetworkClientIdOnGoerli =
          await networkController.upsertNetworkConfiguration(
            {
              rpcUrl: 'https://mock.rpc.url',
              chainId: networkClientConfiguration.chainId,
              ticker: networkClientConfiguration.ticker,
            },
            {
              referrer: 'https://mock.referrer',
              source: 'dapp',
            },
          );

        const addTx1 = await transactionController.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_2_MOCK,
          },
          { networkClientId: 'goerli' },
        );

        const addTx2 = await transactionController.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_3_MOCK,
          },
          {
            networkClientId: otherNetworkClientIdOnGoerli,
          },
        );

        await Promise.all([
          approvalController.accept(addTx1.transactionMeta.id),
          approvalController.accept(addTx2.transactionMeta.id),
        ]);
        await advanceTime({ clock, duration: 1 });

        await Promise.all([addTx1.result, addTx2.result]);

        const nonces = transactionController.state.transactions
          .map((tx) => tx.txParams.nonce)
          .sort();
        expect(nonces).toStrictEqual(['0x1', '0x2']);
        transactionController.destroy();
      });
    });

    describe('when transactions are added concurrently with the same networkClientId', () => {
      it('should add each transaction with consecutive nonces', async () => {
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
                result: '0x', // non contract
              },
            },
            // readAddressAsContract
            // requiresFixedGas (cached)
            {
              request: {
                method: 'eth_getCode',
                params: [ACCOUNT_3_MOCK, '0x1'],
              },
              response: {
                result: '0x', // non contract
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
            // publishTransaction
            {
              request: {
                method: 'eth_sendRawTransaction',
                params: [
                  '0x02e20502010182520894e688b84b23f322a994a53dbf8e15fa82cdb711278080c0808080',
                ],
              },
              response: {
                result: '0x2',
              },
            },
            // PendingTransactionTracker.#checkTransaction
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
          ],
        });
        const { approvalController, transactionController } =
          await newController({
            getPermittedAccounts: () => [ACCOUNT_MOCK],
            getSelectedAddress: () => ACCOUNT_MOCK,
          });

        const addTx1 = await transactionController.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_2_MOCK,
          },
          { networkClientId: 'goerli' },
        );

        await advanceTime({ clock, duration: 1 });

        const addTx2 = await transactionController.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_3_MOCK,
          },
          {
            networkClientId: 'goerli',
          },
        );

        await advanceTime({ clock, duration: 1 });

        await Promise.all([
          approvalController.accept(addTx1.transactionMeta.id),
          approvalController.accept(addTx2.transactionMeta.id),
        ]);

        await advanceTime({ clock, duration: 1 });

        await Promise.all([addTx1.result, addTx2.result]);

        const nonces = transactionController.state.transactions
          .map((tx) => tx.txParams.nonce)
          .sort();
        expect(nonces).toStrictEqual(['0x1', '0x2']);
        transactionController.destroy();
      });
    });
    it.todo('markNonceDuplicatesDropped');
  });

  describe('when changing rpcUrl of networkClient', () => {
    it('should start tracking when a new network is added', async () => {
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
      mockNetwork({
        networkClientConfiguration: {
          ...networkClientConfiguration,
          type: NetworkClientType.Custom,
          rpcUrl: 'https://mock.rpc.url',
        },
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
          // readAddressAsContract
          // requiresFixedGas (cached)
          {
            request: {
              method: 'eth_getCode',
              params: [ACCOUNT_2_MOCK, '0x1'],
            },
            response: {
              result: '0x', // non contract
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
      const { networkController, transactionController } =
        await newController();

      const otherNetworkClientIdOnGoerli =
        await networkController.upsertNetworkConfiguration(
          {
            ...networkClientConfiguration,
            rpcUrl: 'https://mock.rpc.url',
          },
          {
            setActive: false,
            referrer: 'https://mock.referrer',
            source: 'dapp',
          },
        );

      await transactionController.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_3_MOCK,
        },
        {
          networkClientId: otherNetworkClientIdOnGoerli,
        },
      );

      expect(transactionController.state.transactions[0]).toStrictEqual(
        expect.objectContaining({
          networkClientId: otherNetworkClientIdOnGoerli,
        }),
      );
      transactionController.destroy();
    });
    it('should stop tracking when a network is removed', async () => {
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
        ],
      });
      const { networkController, transactionController } =
        await newController();

      const configurationId =
        await networkController.upsertNetworkConfiguration(
          {
            ...networkClientConfiguration,
            rpcUrl: 'https://mock.rpc.url',
          },
          {
            setActive: false,
            referrer: 'https://mock.referrer',
            source: 'dapp',
          },
        );

      networkController.removeNetworkConfiguration(configurationId);

      await expect(
        transactionController.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_2_MOCK,
          },
          { networkClientId: configurationId },
        ),
      ).rejects.toThrow(
        'The networkClientId for this transaction could not be found',
      );

      expect(transactionController).toBeDefined();
      transactionController.destroy();
    });
  });

  describe('feature flag', () => {
    it('should not track multichain transactions on network stateChange when feature flag is disabled', async () => {
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
          // eth_getCode
          {
            request: {
              method: 'eth_getCode',
              params: [ACCOUNT_2_MOCK, '0x1'],
            },
            response: {
              result: '0x', // non contract
            },
          },
        ],
      });

      const { networkController, transactionController } = await newController({
        enableMultichain: false,
      });

      const configurationId =
        await networkController.upsertNetworkConfiguration(
          {
            ...networkClientConfiguration,
            rpcUrl: 'https://mock.rpc.url',
          },
          {
            setActive: false,
            referrer: 'https://mock.referrer',
            source: 'dapp',
          },
        );

      // add a transaction with the networkClientId of the newly added network
      // and expect it to throw since the networkClientId won't be found in the trackingMap
      await expect(
        transactionController.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_2_MOCK,
          },
          { networkClientId: configurationId },
        ),
      ).rejects.toThrow(
        'The networkClientId for this transaction could not be found',
      );

      // adding a transaction without a networkClientId should work
      expect(
        await transactionController.addTransaction({
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        }),
      ).toBeDefined();
      transactionController.destroy();
    });
  });

  describe('startIncomingTransactionPolling', () => {
    // TODO(JL): IncomingTransactionHelper doesn't populate networkClientId on the generated tx object. Should it?..
    it('should add incoming transactions to state with the correct chainId for the given networkClientId on the next block', async () => {
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
        ],
      });

      const selectedAddress = ETHERSCAN_TRANSACTION_BASE_MOCK.to;

      const { networkController, transactionController } = await newController({
        getSelectedAddress: () => selectedAddress,
      });

      const expectedLastFetchedBlockNumbers: Record<string, number> = {};
      const expectedTransactions: Partial<TransactionMeta>[] = [];

      const networkClients = networkController.getNetworkClientRegistry();
      // Skip the globally selected provider because we can't use nock to mock it twice
      const networkClientIds = Object.keys(networkClients).filter(
        (v) => v !== networkClientConfiguration.network,
      );
      await Promise.all(
        networkClientIds.map(async (networkClientId) => {
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
        }),
      );
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
      transactionController.destroy();
    });

    describe('when called with multiple networkClients which share the same chainId', () => {
      it('should only call the etherscan API max every 5 seconds, alternating between the token and txlist endpoints', async () => {
        const fetchEtherscanNativeTxFetchSpy = jest.spyOn(
          etherscanUtils,
          'fetchEtherscanTransactions',
        );

        const fetchEtherscanTokenTxFetchSpy = jest.spyOn(
          etherscanUtils,
          'fetchEtherscanTokenTransactions',
        );

        // mocking infura mainnet
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
          ],
        });

        // mocking infura goerli
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
          ],
        });

        // mock the other goerli network client node requests
        mockNetwork({
          networkClientConfiguration: {
            ...networkClientConfiguration,
            type: NetworkClientType.Custom,
            rpcUrl: 'https://mock.rpc.url',
          },
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
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x4',
              },
            },
          ],
        });

        const selectedAddress = ETHERSCAN_TRANSACTION_BASE_MOCK.to;

        const { networkController, transactionController } =
          await newController({
            getSelectedAddress: () => selectedAddress,
          });

        const otherGoerliClientNetworkClientId =
          await networkController.upsertNetworkConfiguration(
            {
              rpcUrl: 'https://mock.rpc.url',
              chainId: networkClientConfiguration.chainId,
              ticker: networkClientConfiguration.ticker,
            },
            {
              referrer: 'https://mock.referrer',
              source: 'dapp',
            },
          );

        // Etherscan API Mocks

        // Non-token transactions
        nock(getEtherscanApiHost(networkClientConfiguration.chainId))
          .get(
            `/api?module=account&address=${ETHERSCAN_TRANSACTION_BASE_MOCK.to}&offset=40&sort=desc&action=txlist&tag=latest&page=1`,
          )
          .reply(200, {
            status: '1',
            result: [{ ...ETHERSCAN_TRANSACTION_SUCCESS_MOCK, blockNumber: 1 }],
          })
          // block 2
          .get(
            `/api?module=account&address=${ETHERSCAN_TRANSACTION_BASE_MOCK.to}&startBlock=2&offset=40&sort=desc&action=txlist&tag=latest&page=1`,
          )
          .reply(200, {
            status: '1',
            result: [{ ...ETHERSCAN_TRANSACTION_SUCCESS_MOCK, blockNumber: 2 }],
          })
          .persist();

        // token transactions
        nock(getEtherscanApiHost(networkClientConfiguration.chainId))
          .get(
            `/api?module=account&address=${ETHERSCAN_TRANSACTION_BASE_MOCK.to}&offset=40&sort=desc&action=tokentx&tag=latest&page=1`,
          )
          .reply(200, {
            status: '1',
            result: [{ ...ETHERSCAN_TOKEN_TRANSACTION_MOCK, blockNumber: 1 }],
          })
          .get(
            `/api?module=account&address=${ETHERSCAN_TRANSACTION_BASE_MOCK.to}&startBlock=2&offset=40&sort=desc&action=tokentx&tag=latest&page=1`,
          )
          .reply(200, {
            status: '1',
            result: [{ ...ETHERSCAN_TOKEN_TRANSACTION_MOCK, blockNumber: 2 }],
          })
          .persist();

        // start polling with two clients which share the same chainId
        transactionController.startIncomingTransactionPolling([
          networkClientConfiguration.network, // 'goerli'
          otherGoerliClientNetworkClientId,
        ]);
        await advanceTime({ clock, duration: 1 });
        expect(fetchEtherscanNativeTxFetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchEtherscanTokenTxFetchSpy).toHaveBeenCalledTimes(0);
        await advanceTime({ clock, duration: 4999 });
        // after 5 seconds we can call to the etherscan API again, this time to the token transactions endpoint
        expect(fetchEtherscanNativeTxFetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchEtherscanTokenTxFetchSpy).toHaveBeenCalledTimes(1);
        await advanceTime({ clock, duration: 5000 });
        // after another 5 seconds there should be no new calls to the etherscan API
        // since no new blocks events have occurred
        expect(fetchEtherscanNativeTxFetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchEtherscanTokenTxFetchSpy).toHaveBeenCalledTimes(1);
        // next block arrives after 20 seconds elapsed from first call
        await advanceTime({ clock, duration: 10000 });
        await advanceTime({ clock, duration: 1 }); // flushes extra promises/setTimeouts
        // first the native transactions are fetched
        expect(fetchEtherscanNativeTxFetchSpy).toHaveBeenCalledTimes(2);
        expect(fetchEtherscanTokenTxFetchSpy).toHaveBeenCalledTimes(1);
        await advanceTime({ clock, duration: 4000 });
        // no new calls to the etherscan API since 5 seconds have not passed
        expect(fetchEtherscanNativeTxFetchSpy).toHaveBeenCalledTimes(2);
        expect(fetchEtherscanTokenTxFetchSpy).toHaveBeenCalledTimes(1);
        await advanceTime({ clock, duration: 1000 }); // flushes extra promises/setTimeouts
        // then once 5 seconds have passed since the previous call to the etherscan API
        // we call the token transactions endpoint
        expect(fetchEtherscanNativeTxFetchSpy).toHaveBeenCalledTimes(2);
        expect(fetchEtherscanTokenTxFetchSpy).toHaveBeenCalledTimes(2);

        transactionController.destroy();
      });
    });
  });

  describe('stopIncomingTransactionPolling', () => {
    it('should not poll for new incoming transactions for the given networkClientId', async () => {
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
        ],
      });

      const selectedAddress = ETHERSCAN_TRANSACTION_BASE_MOCK.to;

      const { networkController, transactionController } = await newController({
        getSelectedAddress: () => selectedAddress,
      });

      const networkClients = networkController.getNetworkClientRegistry();
      // Skip the globally selected provider because we can't use nock to mock it twice
      const networkClientIds = Object.keys(networkClients).filter(
        (v) => v !== networkClientConfiguration.network,
      );
      await Promise.all(
        networkClientIds.map(async (networkClientId) => {
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

          transactionController.stopIncomingTransactionPolling([
            networkClientId,
          ]);
        }),
      );
      await advanceTime({ clock, duration: 20000 });

      expect(transactionController.state.transactions).toStrictEqual([]);
      expect(transactionController.state.lastFetchedBlockNumbers).toStrictEqual(
        {},
      );
      transactionController.destroy();
    });
  });

  describe('stopAllIncomingTransactionPolling', () => {
    it('should not poll for incoming transactions on any network client', async () => {
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

      const selectedAddress = ETHERSCAN_TRANSACTION_BASE_MOCK.to;

      const { networkController, transactionController } = await newController({
        getSelectedAddress: () => selectedAddress,
      });

      const networkClients = networkController.getNetworkClientRegistry();
      // Skip the globally selected provider because we can't use nock to mock it twice
      const networkClientIds = Object.keys(networkClients).filter(
        (v) => v !== networkClientConfiguration.network,
      );
      await Promise.all(
        networkClientIds.map(async (networkClientId) => {
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
        }),
      );

      transactionController.stopAllIncomingTransactionPolling();
      await advanceTime({ clock, duration: 20000 });

      expect(transactionController.state.transactions).toStrictEqual([]);
      expect(transactionController.state.lastFetchedBlockNumbers).toStrictEqual(
        {},
      );
      transactionController.destroy();
    });
  });

  describe('updateIncomingTransactions', () => {
    it('should add incoming transactions to state with the correct chainId for the given networkClientId without waiting for the next block', async () => {
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

      const selectedAddress = ETHERSCAN_TRANSACTION_BASE_MOCK.to;

      const { networkController, transactionController } = await newController({
        getSelectedAddress: () => selectedAddress,
      });

      const expectedLastFetchedBlockNumbers: Record<string, number> = {};
      const expectedTransactions: Partial<TransactionMeta>[] = [];

      const networkClients = networkController.getNetworkClientRegistry();
      // Skip the globally selected provider because we can't use nock to mock it twice
      const networkClientIds = Object.keys(networkClients).filter(
        (v) => v !== networkClientConfiguration.network,
      );
      await Promise.all(
        networkClientIds.map(async (networkClientId) => {
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
            ],
          });
          nock(getEtherscanApiHost(config.chainId))
            .get(
              `/api?module=account&address=${selectedAddress}&offset=40&sort=desc&action=txlist&tag=latest&page=1`,
            )
            .reply(200, ETHERSCAN_TRANSACTION_RESPONSE_MOCK);

          transactionController.updateIncomingTransactions([networkClientId]);

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
        }),
      );

      // we have to wait for the mutex to be released after the 5 second API rate limit timer
      await advanceTime({ clock, duration: 5000 });

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
      transactionController.destroy();
    });
  });

  describe('getNonceLock', () => {
    it('should get the nonce lock from the nonceTracker for the given networkClientId', async () => {
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

      const { networkController, transactionController } = await newController(
        {},
      );

      const networkClients = networkController.getNetworkClientRegistry();
      // Skip the globally selected provider because we can't use nock to mock it twice
      const networkClientIds = Object.keys(networkClients).filter(
        (v) => v !== networkClientConfiguration.network,
      );
      await Promise.all(
        networkClientIds.map(async (networkClientId) => {
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

          const nonceLockPromise = transactionController.getNonceLock(
            ACCOUNT_MOCK,
            networkClientId,
          );
          await advanceTime({ clock, duration: 1 });

          const nonceLock = await nonceLockPromise;

          expect(nonceLock.nextNonce).toBe(10);
        }),
      );
      transactionController.destroy();
    });

    it('should block other attempts to get the nonce lock from the nonceTracker until the first one is released for the given networkClientId', async () => {
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

      const { networkController, transactionController } = await newController(
        {},
      );

      const networkClients = networkController.getNetworkClientRegistry();
      // Skip the globally selected provider because we can't use nock to mock it twice
      const networkClientIds = Object.keys(networkClients).filter(
        (v) => v !== networkClientConfiguration.network,
      );
      await Promise.all(
        networkClientIds.map(async (networkClientId) => {
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

          const firstNonceLockPromise = transactionController.getNonceLock(
            ACCOUNT_MOCK,
            networkClientId,
          );
          await advanceTime({ clock, duration: 1 });

          const firstNonceLock = await firstNonceLockPromise;

          expect(firstNonceLock.nextNonce).toBe(10);

          const secondNonceLockPromise = transactionController.getNonceLock(
            ACCOUNT_MOCK,
            networkClientId,
          );
          const delay = () =>
            new Promise<null>(async (resolve) => {
              await advanceTime({ clock, duration: 100 });
              resolve(null);
            });

          let secondNonceLockIfAcquired = await Promise.race([
            secondNonceLockPromise,
            delay(),
          ]);
          expect(secondNonceLockIfAcquired).toBeNull();

          await firstNonceLock.releaseLock();
          await advanceTime({ clock, duration: 1 });

          secondNonceLockIfAcquired = await Promise.race([
            secondNonceLockPromise,
            delay(),
          ]);
          expect(secondNonceLockIfAcquired?.nextNonce).toBe(10);
        }),
      );
      transactionController.destroy();
    });

    it('should get the nonce lock from the globally selected nonceTracker if no networkClientId is provided', async () => {
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

      const nonceLockPromise = transactionController.getNonceLock(ACCOUNT_MOCK);
      await advanceTime({ clock, duration: 1 });

      const nonceLock = await nonceLockPromise;

      expect(nonceLock.nextNonce).toBe(10);
      transactionController.destroy();
    });

    it('should block other attempts to get the nonce lock from the globally selected nonceTracker until the first one is released if no networkClientId is provided', async () => {
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

      const firstNonceLockPromise =
        transactionController.getNonceLock(ACCOUNT_MOCK);
      await advanceTime({ clock, duration: 1 });

      const firstNonceLock = await firstNonceLockPromise;

      expect(firstNonceLock.nextNonce).toBe(10);

      const secondNonceLockPromise =
        transactionController.getNonceLock(ACCOUNT_MOCK);
      const delay = () =>
        new Promise<null>(async (resolve) => {
          await advanceTime({ clock, duration: 100 });
          resolve(null);
        });

      let secondNonceLockIfAcquired = await Promise.race([
        secondNonceLockPromise,
        delay(),
      ]);
      expect(secondNonceLockIfAcquired).toBeNull();

      await firstNonceLock.releaseLock();

      secondNonceLockIfAcquired = await Promise.race([
        secondNonceLockPromise,
        delay(),
      ]);
      expect(secondNonceLockIfAcquired?.nextNonce).toBe(10);
      transactionController.destroy();
    });
  });
});
