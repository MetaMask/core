import type { TypedTransaction } from '@ethereumjs/tx';
import type { AccountsControllerGetSelectedAccountAction } from '@metamask/accounts-controller';
import type {
  ApprovalControllerActions,
  ApprovalControllerEvents,
} from '@metamask/approval-controller';
import { ApprovalController } from '@metamask/approval-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import {
  ApprovalType,
  BUILT_IN_NETWORKS,
  ChainId,
  InfuraNetworkType,
  NetworkType,
} from '@metamask/controller-utils';
import {
  NetworkController,
  NetworkClientType,
} from '@metamask/network-controller';
import type {
  NetworkClientConfiguration,
  NetworkControllerActions,
  NetworkControllerEvents,
  NetworkClientId,
} from '@metamask/network-controller';
import assert from 'assert';
import type { SinonFakeTimers } from 'sinon';
import { useFakeTimers } from 'sinon';
import { v4 as uuidV4 } from 'uuid';

import { advanceTime } from '../../../tests/helpers';
import { mockNetwork } from '../../../tests/mock-network';
import {
  buildAddNetworkFields,
  buildCustomNetworkClientConfiguration,
  buildUpdateNetworkCustomRpcEndpointFields,
} from '../../network-controller/tests/helpers';
import {
  buildEthGasPriceRequestMock,
  buildEthBlockNumberRequestMock,
  buildEthGetCodeRequestMock,
  buildEthGetBlockByNumberRequestMock,
  buildEthEstimateGasRequestMock,
  buildEthGetTransactionCountRequestMock,
  buildEthGetBlockByHashRequestMock,
  buildEthSendRawTransactionRequestMock,
  buildEthGetTransactionReceiptRequestMock,
} from '../tests/JsonRpcRequestMocks';
import type {
  TransactionControllerActions,
  TransactionControllerEvents,
  TransactionControllerOptions,
} from './TransactionController';
import { TransactionController } from './TransactionController';
import type { InternalAccount } from './types';
import { TransactionStatus, TransactionType } from './types';

jest.mock('uuid', () => {
  const actual = jest.requireActual('uuid');

  return {
    ...actual,
    v4: jest.fn(),
  };
});

type UnrestrictedControllerMessenger = ControllerMessenger<
  | NetworkControllerActions
  | ApprovalControllerActions
  | TransactionControllerActions
  | AccountsControllerGetSelectedAccountAction,
  | NetworkControllerEvents
  | ApprovalControllerEvents
  | TransactionControllerEvents
>;

const uuidV4Mock = jest.mocked(uuidV4);

const createMockInternalAccount = ({
  id = uuidV4(),
  address = '0x2990079bcdee240329a520d2444386fc119da21a',
  name = 'Account 1',
  importTime = Date.now(),
  lastSelected = Date.now(),
}: {
  id?: string;
  address?: string;
  name?: string;
  importTime?: number;
  lastSelected?: number;
} = {}): InternalAccount => {
  return {
    id,
    address,
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: ['eip155'],
    metadata: {
      name,
      keyring: { type: 'HD Key Tree' },
      importTime,
      lastSelected,
    },
  };
};

const ACCOUNT_MOCK = '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207';
const INTERNAL_ACCOUNT_MOCK = createMockInternalAccount({
  address: ACCOUNT_MOCK,
});

const ACCOUNT_2_MOCK = '0x08f137f335ea1b8f193b8f6ea92561a60d23a211';
const ACCOUNT_3_MOCK = '0xe688b84b23f322a994a53dbf8e15fa82cdb71127';
const infuraProjectId = 'fake-infura-project-id';

const BLOCK_TRACKER_POLLING_INTERVAL = 30000;

/**
 * Builds the Infura network client configuration.
 * @param network - The Infura network type.
 * @returns The network client configuration.
 */
function buildInfuraNetworkClientConfiguration(
  network: InfuraNetworkType,
): NetworkClientConfiguration {
  return {
    type: NetworkClientType.Infura,
    network,
    chainId: BUILT_IN_NETWORKS[network].chainId,
    infuraProjectId,
    ticker: BUILT_IN_NETWORKS[network].ticker,
  };
}

const setupController = async (
  givenOptions: Partial<
    ConstructorParameters<typeof TransactionController>[0]
  > = {},
  mockData: {
    selectedAccount?: InternalAccount;
  } = {
    selectedAccount: createMockInternalAccount({ address: '0xdeadbeef' }),
  },
) => {
  // Mainnet network must be mocked for NetworkController instantiation
  mockNetwork({
    networkClientConfiguration: buildInfuraNetworkClientConfiguration(
      InfuraNetworkType.mainnet,
    ),
    mocks: [
      buildEthBlockNumberRequestMock('0x1'),
      buildEthGetBlockByNumberRequestMock('0x1'),
    ],
  });

  const unrestrictedMessenger: UnrestrictedControllerMessenger =
    new ControllerMessenger();
  const networkController = new NetworkController({
    messenger: unrestrictedMessenger.getRestricted({
      name: 'NetworkController',
      allowedActions: [],
      allowedEvents: [],
    }),
    infuraProjectId,
  });
  await networkController.initializeProvider();
  const { provider, blockTracker } =
    networkController.getProviderAndBlockTracker();
  assert(provider, 'Provider must be available');
  assert(blockTracker, 'Provider must be available');

  const approvalController = new ApprovalController({
    messenger: unrestrictedMessenger.getRestricted({
      name: 'ApprovalController',
      allowedActions: [],
      allowedEvents: [],
    }),
    showApprovalRequest: jest.fn(),
    typesExcludedFromRateLimiting: [ApprovalType.Transaction],
  });

  const messenger = unrestrictedMessenger.getRestricted({
    name: 'TransactionController',
    allowedActions: [
      'ApprovalController:addRequest',
      'NetworkController:getNetworkClientById',
      'NetworkController:findNetworkClientIdByChainId',
      'AccountsController:getSelectedAccount',
    ],
    allowedEvents: ['NetworkController:stateChange'],
  });

  const mockGetSelectedAccount = jest
    .fn()
    .mockReturnValue(mockData.selectedAccount);

  unrestrictedMessenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    mockGetSelectedAccount,
  );

  const options: TransactionControllerOptions = {
    disableHistory: false,
    disableSendFlowHistory: false,
    disableSwaps: false,
    getCurrentNetworkEIP1559Compatibility: async (
      networkClientId?: NetworkClientId,
    ) => {
      return (
        (await networkController.getEIP1559Compatibility(networkClientId)) ??
        false
      );
    },
    getNetworkState: () => networkController.state,
    getNetworkClientRegistry: () =>
      networkController.getNetworkClientRegistry(),
    getPermittedAccounts: async () => [ACCOUNT_MOCK],
    hooks: {},
    messenger,
    pendingTransactions: {
      isResubmitEnabled: () => false,
    },
    sign: async (transaction: TypedTransaction) => transaction,
    transactionHistoryLimit: 40,
    ...givenOptions,
  };

  const transactionController = new TransactionController(options);

  return {
    transactionController,
    approvalController,
    networkController,
    messenger,
    mockGetSelectedAccount,
  };
};

describe('TransactionController Integration', () => {
  let clock: SinonFakeTimers;
  let uuidCounter = 0;

  beforeEach(() => {
    clock = useFakeTimers();

    uuidV4Mock.mockImplementation(() => {
      const uuid = `UUID-${uuidCounter}`;
      uuidCounter += 1;
      return uuid;
    });
  });

  afterEach(() => {
    clock.restore();
  });

  describe('constructor', () => {
    it('should create a new instance of TransactionController', async () => {
      const { transactionController } = await setupController();
      expect(transactionController).toBeDefined();
      transactionController.destroy();
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it('should fail all approved transactions in state', async () => {
      mockNetwork({
        networkClientConfiguration: buildInfuraNetworkClientConfiguration(
          InfuraNetworkType.goerli,
        ),
        mocks: [
          buildEthBlockNumberRequestMock('0x1'),
          buildEthSendRawTransactionRequestMock(
            '0x02e2050101018252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
            '0x1',
          ),
        ],
      });

      mockNetwork({
        networkClientConfiguration: buildInfuraNetworkClientConfiguration(
          InfuraNetworkType.sepolia,
        ),
        mocks: [
          buildEthBlockNumberRequestMock('0x1'),
          buildEthSendRawTransactionRequestMock(
            '0x02e583aa36a70101018252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
            '0x1',
          ),
        ],
      });

      const { transactionController } = await setupController({
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
              status: TransactionStatus.approved,
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
              type: TransactionType.simpleSend,
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
            },
            {
              actionId: undefined,
              chainId: '0xaa36a7',
              dappSuggestedGasFees: undefined,
              deviceConfirmedOn: undefined,
              id: 'c4cc0ff0-ba28-11ee-926f-55a7f9c2c2c6',
              origin: undefined,
              securityAlertResponse: undefined,
              status: TransactionStatus.approved,
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
              type: TransactionType.simpleSend,
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
            },
          ],
        },
      });

      await advanceTime({ clock, duration: 1 });
      await advanceTime({ clock, duration: 1 });

      expect(transactionController.state.transactions).toMatchObject([
        expect.objectContaining({
          status: 'failed',
        }),
        expect.objectContaining({
          status: 'failed',
        }),
      ]);
      transactionController.destroy();
    });
  });

  describe('multichain transaction lifecycle', () => {
    describe('when a transaction is added with a networkClientId', () => {
      it('should add a new unapproved transaction', async () => {
        mockNetwork({
          networkClientConfiguration: buildInfuraNetworkClientConfiguration(
            InfuraNetworkType.goerli,
          ),
          mocks: [
            buildEthBlockNumberRequestMock('0x1'),
            buildEthGetCodeRequestMock(ACCOUNT_2_MOCK),
            buildEthGasPriceRequestMock(),
          ],
        });
        const { transactionController } = await setupController();
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
          networkClientConfiguration: buildInfuraNetworkClientConfiguration(
            InfuraNetworkType.goerli,
          ),
          mocks: [
            buildEthBlockNumberRequestMock('0x1'),
            buildEthGetBlockByNumberRequestMock('0x1'),
            buildEthBlockNumberRequestMock('0x2'),
            buildEthGetCodeRequestMock(ACCOUNT_2_MOCK),
            buildEthEstimateGasRequestMock(ACCOUNT_MOCK, ACCOUNT_2_MOCK),
            buildEthGasPriceRequestMock(),
            buildEthGetTransactionCountRequestMock(ACCOUNT_MOCK),
            buildEthSendRawTransactionRequestMock(
              '0x02e2050101018252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
              '0x1',
            ),
          ],
        });
        const { transactionController, approvalController } =
          await setupController();
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
          networkClientConfiguration: buildInfuraNetworkClientConfiguration(
            InfuraNetworkType.goerli,
          ),
          mocks: [
            buildEthBlockNumberRequestMock('0x1'),
            buildEthGetBlockByNumberRequestMock('0x1'),
            buildEthGetCodeRequestMock(ACCOUNT_2_MOCK),
            buildEthEstimateGasRequestMock(ACCOUNT_MOCK, ACCOUNT_2_MOCK),
            buildEthGasPriceRequestMock(),
            buildEthGetTransactionCountRequestMock(ACCOUNT_MOCK),
            buildEthSendRawTransactionRequestMock(
              '0x02e2050101018252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
              '0x1',
            ),
            buildEthBlockNumberRequestMock('0x3'),
            buildEthGetTransactionReceiptRequestMock('0x1', '0x1', '0x3'),
            buildEthGetBlockByHashRequestMock('0x1'),
          ],
        });
        const { transactionController, approvalController } =
          await setupController();
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
        await advanceTime({ clock, duration: BLOCK_TRACKER_POLLING_INTERVAL });
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
          networkClientConfiguration: buildInfuraNetworkClientConfiguration(
            InfuraNetworkType.goerli,
          ),
          mocks: [
            buildEthBlockNumberRequestMock('0x1'),
            buildEthGetBlockByNumberRequestMock('0x1'),
            buildEthGetCodeRequestMock(ACCOUNT_2_MOCK),
            buildEthEstimateGasRequestMock(ACCOUNT_MOCK, ACCOUNT_2_MOCK),
            buildEthGasPriceRequestMock(),
            buildEthGetTransactionCountRequestMock(ACCOUNT_MOCK),
            buildEthSendRawTransactionRequestMock(
              '0x02e2050101018252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
              '0x1',
            ),
            buildEthBlockNumberRequestMock('0x3'),
            buildEthGetTransactionReceiptRequestMock('0x1', '0x1', '0x3'),
            buildEthGetBlockByHashRequestMock('0x1'),
          ],
        });
        mockNetwork({
          networkClientConfiguration: buildInfuraNetworkClientConfiguration(
            InfuraNetworkType.sepolia,
          ),
          mocks: [
            buildEthBlockNumberRequestMock('0x1'),
            buildEthGetBlockByNumberRequestMock('0x1'),
            buildEthGetCodeRequestMock(ACCOUNT_2_MOCK),
            buildEthEstimateGasRequestMock(ACCOUNT_MOCK, ACCOUNT_2_MOCK),
            buildEthGasPriceRequestMock(),
            buildEthGetTransactionCountRequestMock(ACCOUNT_MOCK),
            buildEthSendRawTransactionRequestMock(
              '0x02e583aa36a70101018252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
              '0x1',
            ),
            buildEthBlockNumberRequestMock('0x3'),
            buildEthGetTransactionReceiptRequestMock('0x1', '0x1', '0x3'),
            buildEthGetBlockByHashRequestMock('0x1'),
          ],
        });
        const { transactionController, approvalController } =
          await setupController();
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
        await advanceTime({ clock, duration: BLOCK_TRACKER_POLLING_INTERVAL });
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
          networkClientConfiguration: buildInfuraNetworkClientConfiguration(
            InfuraNetworkType.goerli,
          ),
          mocks: [
            buildEthBlockNumberRequestMock('0x1'),
            buildEthGetBlockByNumberRequestMock('0x1'),
            buildEthGetCodeRequestMock(ACCOUNT_2_MOCK),
            buildEthEstimateGasRequestMock(ACCOUNT_MOCK, ACCOUNT_2_MOCK),
            buildEthGasPriceRequestMock(),
            buildEthGetTransactionCountRequestMock(ACCOUNT_MOCK),
            buildEthSendRawTransactionRequestMock(
              '0x02e2050101018252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
              '0x1',
            ),
            buildEthBlockNumberRequestMock('0x3'),
            buildEthGetTransactionReceiptRequestMock('0x1', '0x1', '0x3'),
            buildEthGetBlockByHashRequestMock('0x1'),
            buildEthBlockNumberRequestMock('0x3'),
            buildEthSendRawTransactionRequestMock(
              '0x02e205010101825208946bf137f335ea1b8f193b8f6ea92561a60d23a2078080c0808080',
              '0x2',
            ),
            buildEthGetTransactionReceiptRequestMock('0x2', '0x1', '0x3'),
          ],
        });
        const { transactionController, approvalController } =
          await setupController();
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

      it('should be able to confirm a cancelled transaction and drop the original transaction', async () => {
        mockNetwork({
          networkClientConfiguration: buildInfuraNetworkClientConfiguration(
            InfuraNetworkType.goerli,
          ),
          mocks: [
            buildEthBlockNumberRequestMock('0x1'),
            buildEthGetBlockByNumberRequestMock('0x1'),
            buildEthGetCodeRequestMock(ACCOUNT_2_MOCK),
            buildEthEstimateGasRequestMock(ACCOUNT_MOCK, ACCOUNT_2_MOCK),
            buildEthGasPriceRequestMock(),
            buildEthGetTransactionCountRequestMock(ACCOUNT_MOCK),
            buildEthSendRawTransactionRequestMock(
              '0x02e2050101018252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
              '0x1',
            ),
            buildEthBlockNumberRequestMock('0x3'),
            buildEthSendRawTransactionRequestMock(
              '0x02e205010101825208946bf137f335ea1b8f193b8f6ea92561a60d23a2078080c0808080',
              '0x2',
            ),
            {
              ...buildEthGetTransactionReceiptRequestMock('0x1', '0x0', '0x0'),
              response: { result: null },
            },
            buildEthBlockNumberRequestMock('0x4'),
            buildEthBlockNumberRequestMock('0x4'),
            {
              ...buildEthGetTransactionReceiptRequestMock('0x1', '0x0', '0x0'),
              response: { result: null },
            },
            buildEthGetTransactionReceiptRequestMock('0x2', '0x2', '0x4'),
            buildEthGetBlockByHashRequestMock('0x2'),
            buildEthSendRawTransactionRequestMock(
              '0x02e2050101018252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
              '0x1',
            ),
          ],
        });
        const { transactionController, approvalController } =
          await setupController();
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
        await advanceTime({ clock, duration: BLOCK_TRACKER_POLLING_INTERVAL });
        await advanceTime({ clock, duration: 1 });
        await advanceTime({ clock, duration: 1 });
        await advanceTime({ clock, duration: BLOCK_TRACKER_POLLING_INTERVAL });
        await advanceTime({ clock, duration: 1 });
        await advanceTime({ clock, duration: 1 });

        expect(transactionController.state.transactions).toHaveLength(2);
        expect(transactionController.state.transactions[0].status).toBe(
          'dropped',
        );
        expect(transactionController.state.transactions[1].status).toBe(
          'confirmed',
        );
        transactionController.destroy();
      });

      it('should be able to get to speedup state and drop the original transaction', async () => {
        mockNetwork({
          networkClientConfiguration: buildInfuraNetworkClientConfiguration(
            InfuraNetworkType.goerli,
          ),
          mocks: [
            buildEthBlockNumberRequestMock('0x1'),
            buildEthGetBlockByNumberRequestMock('0x1'),
            buildEthGetCodeRequestMock(ACCOUNT_2_MOCK),
            buildEthEstimateGasRequestMock(ACCOUNT_MOCK, ACCOUNT_2_MOCK),
            buildEthGasPriceRequestMock(),
            buildEthGetTransactionCountRequestMock(ACCOUNT_MOCK),
            buildEthSendRawTransactionRequestMock(
              '0x02e605018203e88203e88252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
              '0x1',
            ),
            buildEthBlockNumberRequestMock('0x3'),
            {
              ...buildEthGetTransactionReceiptRequestMock('0x1', '0x0', '0x0'),
              response: { result: null },
            },
            buildEthSendRawTransactionRequestMock(
              '0x02e6050182044c82044c8252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
              '0x2',
            ),
            buildEthBlockNumberRequestMock('0x4'),
            buildEthBlockNumberRequestMock('0x4'),
            {
              ...buildEthGetTransactionReceiptRequestMock('0x1', '0x0', '0x0'),
              response: { result: null },
            },
            buildEthGetTransactionReceiptRequestMock('0x2', '0x2', '0x4'),
            buildEthGetBlockByHashRequestMock('0x2'),
            buildEthSendRawTransactionRequestMock(
              '0x02e605018203e88203e88252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
              '0x1',
            ),
          ],
        });
        const { transactionController, approvalController } =
          await setupController();
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
        await advanceTime({ clock, duration: BLOCK_TRACKER_POLLING_INTERVAL });
        await advanceTime({ clock, duration: 1 });
        await advanceTime({ clock, duration: 1 });
        await advanceTime({ clock, duration: BLOCK_TRACKER_POLLING_INTERVAL });
        await advanceTime({ clock, duration: 1 });
        await advanceTime({ clock, duration: 1 });

        expect(transactionController.state.transactions).toHaveLength(2);
        expect(transactionController.state.transactions[0].status).toBe(
          'dropped',
        );
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
      // eslint-disable-next-line jest/no-disabled-tests
      it('should add each transaction with consecutive nonces', async () => {
        const goerliNetworkClientConfiguration =
          buildInfuraNetworkClientConfiguration(InfuraNetworkType.goerli);

        mockNetwork({
          networkClientConfiguration: goerliNetworkClientConfiguration,
          mocks: [
            buildEthBlockNumberRequestMock('0x1'),
            buildEthGetBlockByNumberRequestMock('0x1'),
            buildEthGetCodeRequestMock(ACCOUNT_2_MOCK),
            buildEthEstimateGasRequestMock(ACCOUNT_MOCK, ACCOUNT_2_MOCK),
            buildEthGasPriceRequestMock(),
            buildEthGetTransactionCountRequestMock(ACCOUNT_MOCK),
            buildEthSendRawTransactionRequestMock(
              '0x02e2050101018252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
              '0x1',
            ),
            buildEthBlockNumberRequestMock('0x3'),
            buildEthGetTransactionReceiptRequestMock(
              '0x1',
              '0x1',
              '0x3',
              '0x2',
            ),
            buildEthGetBlockByHashRequestMock('0x1'),
            buildEthBlockNumberRequestMock('0x3'),
          ],
        });

        mockNetwork({
          networkClientConfiguration: buildCustomNetworkClientConfiguration({
            rpcUrl: 'https://mock.rpc.url',
            ticker: goerliNetworkClientConfiguration.ticker,
          }),
          mocks: [
            buildEthBlockNumberRequestMock('0x1'),
            buildEthBlockNumberRequestMock('0x1'),
            buildEthGetBlockByNumberRequestMock('0x1'),
            buildEthGetCodeRequestMock(ACCOUNT_2_MOCK),
            buildEthEstimateGasRequestMock(ACCOUNT_MOCK, ACCOUNT_2_MOCK),
            buildEthGasPriceRequestMock(),
            buildEthGetTransactionCountRequestMock(ACCOUNT_MOCK),
            buildEthSendRawTransactionRequestMock(
              '0x02e0050201018094e688b84b23f322a994a53dbf8e15fa82cdb711278080c0808080',
              '0x1',
            ),
            buildEthBlockNumberRequestMock('0x3'),
            buildEthGetTransactionReceiptRequestMock(
              '0x1',
              '0x1',
              '0x3',
              '0x2',
            ),
            buildEthGetBlockByHashRequestMock('0x1'),
          ],
        });

        const { approvalController, networkController, transactionController } =
          await setupController({
            getPermittedAccounts: async () => [ACCOUNT_MOCK],
          });
        const existingGoerliNetworkConfiguration =
          networkController.getNetworkConfigurationByChainId(ChainId.goerli);
        assert(
          existingGoerliNetworkConfiguration,
          'Could not find network configuration for Goerli',
        );
        const updatedGoerliNetworkConfiguration =
          await networkController.updateNetwork(ChainId.goerli, {
            ...existingGoerliNetworkConfiguration,
            rpcEndpoints: [
              ...existingGoerliNetworkConfiguration.rpcEndpoints,
              buildUpdateNetworkCustomRpcEndpointFields({
                url: 'https://mock.rpc.url',
              }),
            ],
          });
        const otherGoerliRpcEndpoint =
          updatedGoerliNetworkConfiguration.rpcEndpoints.find((rpcEndpoint) => {
            return rpcEndpoint.url === 'https://mock.rpc.url';
          });
        assert(
          otherGoerliRpcEndpoint,
          'Could not find other Goerli RPC endpoint',
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
            networkClientId: otherGoerliRpcEndpoint.networkClientId,
          },
        );

        await Promise.all([
          approvalController.accept(addTx1.transactionMeta.id),
          approvalController.accept(addTx2.transactionMeta.id),
        ]);
        await advanceTime({ clock, duration: 1 });
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
      // eslint-disable-next-line jest/no-disabled-tests
      it('should add each transaction with consecutive nonces', async () => {
        mockNetwork({
          networkClientConfiguration: buildInfuraNetworkClientConfiguration(
            InfuraNetworkType.goerli,
          ),
          mocks: [
            buildEthBlockNumberRequestMock('0x1'),
            buildEthGetBlockByNumberRequestMock('0x1'),
            buildEthGetCodeRequestMock(ACCOUNT_2_MOCK),
            buildEthGetCodeRequestMock(ACCOUNT_3_MOCK),
            buildEthEstimateGasRequestMock(ACCOUNT_MOCK, ACCOUNT_2_MOCK),
            buildEthGasPriceRequestMock(),
            buildEthGetTransactionCountRequestMock(ACCOUNT_MOCK),
            buildEthGetTransactionCountRequestMock(ACCOUNT_MOCK),
            buildEthSendRawTransactionRequestMock(
              '0x02e2050101018252089408f137f335ea1b8f193b8f6ea92561a60d23a2118080c0808080',
              '0x1',
            ),
            buildEthBlockNumberRequestMock('0x3'),
            buildEthGetTransactionReceiptRequestMock('0x1', '0x1', '0x3'),
            buildEthGetBlockByHashRequestMock('0x1'),
            buildEthSendRawTransactionRequestMock(
              '0x02e20502010182520894e688b84b23f322a994a53dbf8e15fa82cdb711278080c0808080',
              '0x2',
            ),
            buildEthGetTransactionReceiptRequestMock('0x2', '0x2', '0x4'),
          ],
        });
        const { approvalController, transactionController } =
          await setupController(
            {
              getPermittedAccounts: async () => [ACCOUNT_MOCK],
            },
            { selectedAccount: INTERNAL_ACCOUNT_MOCK },
          );

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
        await advanceTime({ clock, duration: 1 });

        await Promise.all([addTx1.result, addTx2.result]);

        const nonces = transactionController.state.transactions
          .map((tx) => tx.txParams.nonce)
          .sort();
        expect(nonces).toStrictEqual(['0x1', '0x2']);
        transactionController.destroy();
      });
    });
  });

  it('should start tracking when a new network is added', async () => {
    mockNetwork({
      networkClientConfiguration: buildInfuraNetworkClientConfiguration(
        InfuraNetworkType.goerli,
      ),
      mocks: [
        buildEthBlockNumberRequestMock('0x1'),
        buildEthBlockNumberRequestMock('0x1'),
        buildEthGetBlockByNumberRequestMock('0x1'),
        buildEthGetCodeRequestMock(ACCOUNT_2_MOCK),
        buildEthGasPriceRequestMock(),
      ],
    });
    mockNetwork({
      networkClientConfiguration: buildCustomNetworkClientConfiguration({
        rpcUrl: 'https://mock.rpc.url',
      }),
      mocks: [
        buildEthBlockNumberRequestMock('0x1'),
        buildEthBlockNumberRequestMock('0x1'),
        buildEthGetBlockByNumberRequestMock('0x1'),
        buildEthGetCodeRequestMock(ACCOUNT_2_MOCK),
        buildEthGasPriceRequestMock(),
      ],
    });
    const { networkController, transactionController } =
      await setupController();

    const existingGoerliNetworkConfiguration =
      networkController.getNetworkConfigurationByChainId(ChainId.goerli);
    assert(
      existingGoerliNetworkConfiguration,
      'Could not find network configuration for Goerli',
    );
    const updatedGoerliNetworkConfiguration =
      await networkController.updateNetwork(ChainId.goerli, {
        ...existingGoerliNetworkConfiguration,
        rpcEndpoints: [
          ...existingGoerliNetworkConfiguration.rpcEndpoints,
          buildUpdateNetworkCustomRpcEndpointFields({
            url: 'https://mock.rpc.url',
          }),
        ],
      });
    const otherGoerliRpcEndpoint =
      updatedGoerliNetworkConfiguration.rpcEndpoints.find((rpcEndpoint) => {
        return rpcEndpoint.url === 'https://mock.rpc.url';
      });
    assert(otherGoerliRpcEndpoint, 'Could not find other Goerli RPC endpoint');

    await transactionController.addTransaction(
      {
        from: ACCOUNT_MOCK,
        to: ACCOUNT_3_MOCK,
      },
      {
        networkClientId: otherGoerliRpcEndpoint.networkClientId,
      },
    );

    expect(transactionController.state.transactions[0]).toStrictEqual(
      expect.objectContaining({
        networkClientId: otherGoerliRpcEndpoint.networkClientId,
      }),
    );
    transactionController.destroy();
  });

  it('should stop tracking when a network is removed', async () => {
    const { networkController, transactionController } =
      await setupController();

    const networkConfiguration = networkController.addNetwork(
      buildAddNetworkFields(),
    );

    networkController.removeNetwork(networkConfiguration.chainId);

    await expect(
      transactionController.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        },
        {
          networkClientId: networkConfiguration.rpcEndpoints[0].networkClientId,
        },
      ),
    ).rejects.toThrow(
      `Network client not found - ${
        networkConfiguration.rpcEndpoints[0].networkClientId as string
      }`,
    );

    expect(transactionController).toBeDefined();
    transactionController.destroy();
  });

  describe('feature flag', () => {
    it('should call getNetworkClientRegistry on networkController:stateChange when feature flag is enabled', async () => {
      uuidV4Mock.mockReturnValue('AAAA-AAAA-AAAA-AAAA');

      const { networkController, transactionController } =
        await setupController();
      const getNetworkClientRegistrySpy = jest.spyOn(
        networkController,
        'getNetworkClientRegistry',
      );

      networkController.addNetwork(buildAddNetworkFields());

      expect(getNetworkClientRegistrySpy).toHaveBeenCalled();
      transactionController.destroy();
    });

    it('should call getNetworkClientRegistry on construction when feature flag is enabled', async () => {
      const getNetworkClientRegistrySpy = jest.fn().mockImplementation(() => {
        return {
          [NetworkType.goerli]: {
            configuration: BUILT_IN_NETWORKS[NetworkType.goerli],
          },
        };
      });

      await setupController({
        getNetworkClientRegistry: getNetworkClientRegistrySpy,
      });

      expect(getNetworkClientRegistrySpy).toHaveBeenCalled();
    });
  });

  describe('getNonceLock', () => {
    it('should get the nonce lock from the nonceTracker for the given networkClientId', async () => {
      const { networkController, transactionController } =
        await setupController();

      const networkClients = networkController.getNetworkClientRegistry();
      const networkClientIds = Object.keys(networkClients);
      await Promise.all(
        networkClientIds.map(async (networkClientId) => {
          const config = networkClients[networkClientId].configuration;
          mockNetwork({
            networkClientConfiguration: config,
            mocks: [
              buildEthBlockNumberRequestMock('0x1'),
              buildEthGetTransactionCountRequestMock(
                ACCOUNT_MOCK,
                '0x1',
                '0xa',
              ),
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

    it('should block attempts to get the nonce lock for the same address from the nonceTracker for the networkClientId until the previous lock is released', async () => {
      const { networkController, transactionController } =
        await setupController();

      const networkClients = networkController.getNetworkClientRegistry();
      const networkClientIds = Object.keys(networkClients);
      await Promise.all(
        networkClientIds.map(async (networkClientId) => {
          const config = networkClients[networkClientId].configuration;
          mockNetwork({
            networkClientConfiguration: config,
            mocks: [
              buildEthBlockNumberRequestMock('0x1'),
              buildEthGetTransactionCountRequestMock(
                ACCOUNT_MOCK,
                '0x1',
                '0xa',
              ),
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
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            new Promise<null>(async (resolve) => {
              await advanceTime({ clock, duration: 100 });
              resolve(null);
            });

          let secondNonceLockIfAcquired = await Promise.race([
            secondNonceLockPromise,
            delay(),
          ]);
          expect(secondNonceLockIfAcquired).toBeNull();

          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/await-thenable
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

    it('should block attempts to get the nonce lock for the same address from the nonceTracker for the different networkClientIds on the same chainId until the previous lock is released', async () => {
      const { networkController, transactionController } =
        await setupController();
      mockNetwork({
        networkClientConfiguration: buildInfuraNetworkClientConfiguration(
          InfuraNetworkType.goerli,
        ),
        mocks: [
          buildEthBlockNumberRequestMock('0x1'),
          buildEthGetTransactionCountRequestMock(ACCOUNT_MOCK, '0x1', '0xa'),
        ],
      });

      mockNetwork({
        networkClientConfiguration: {
          ...buildInfuraNetworkClientConfiguration(InfuraNetworkType.goerli),
          rpcUrl: 'https://mock.rpc.url',
          type: NetworkClientType.Custom,
        },
        mocks: [
          buildEthBlockNumberRequestMock('0x1'),
          buildEthGetTransactionCountRequestMock(ACCOUNT_MOCK, '0x1', '0xa'),
        ],
      });

      const existingGoerliNetworkConfiguration =
        networkController.getNetworkConfigurationByChainId(ChainId.goerli);
      assert(
        existingGoerliNetworkConfiguration,
        'Could not find network configuration for Goerli',
      );
      const updatedGoerliNetworkConfiguration =
        await networkController.updateNetwork(ChainId.goerli, {
          ...existingGoerliNetworkConfiguration,
          rpcEndpoints: [
            ...existingGoerliNetworkConfiguration.rpcEndpoints,
            buildUpdateNetworkCustomRpcEndpointFields({
              url: 'https://mock.rpc.url',
            }),
          ],
        });
      const otherGoerliRpcEndpoint =
        updatedGoerliNetworkConfiguration.rpcEndpoints.find((rpcEndpoint) => {
          return rpcEndpoint.url === 'https://mock.rpc.url';
        });
      assert(
        otherGoerliRpcEndpoint,
        'Could not find other Goerli RPC endpoint',
      );

      const firstNonceLockPromise = transactionController.getNonceLock(
        ACCOUNT_MOCK,
        'goerli',
      );
      await advanceTime({ clock, duration: 1 });

      const firstNonceLock = await firstNonceLockPromise;

      expect(firstNonceLock.nextNonce).toBe(10);

      const secondNonceLockPromise = transactionController.getNonceLock(
        ACCOUNT_MOCK,
        otherGoerliRpcEndpoint.networkClientId,
      );
      const delay = () =>
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        new Promise<null>(async (resolve) => {
          await advanceTime({ clock, duration: 100 });
          resolve(null);
        });

      let secondNonceLockIfAcquired = await Promise.race([
        secondNonceLockPromise,
        delay(),
      ]);
      expect(secondNonceLockIfAcquired).toBeNull();

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await firstNonceLock.releaseLock();
      await advanceTime({ clock, duration: 1 });

      secondNonceLockIfAcquired = await Promise.race([
        secondNonceLockPromise,
        delay(),
      ]);
      expect(secondNonceLockIfAcquired?.nextNonce).toBe(10);

      transactionController.destroy();
    });

    it('should not block attempts to get the nonce lock for the same addresses from the nonceTracker for different networkClientIds', async () => {
      const { transactionController } = await setupController();

      mockNetwork({
        networkClientConfiguration: buildInfuraNetworkClientConfiguration(
          InfuraNetworkType.goerli,
        ),
        mocks: [
          buildEthBlockNumberRequestMock('0x1'),
          buildEthGetTransactionCountRequestMock(ACCOUNT_MOCK, '0x1', '0xa'),
        ],
      });

      mockNetwork({
        networkClientConfiguration: buildInfuraNetworkClientConfiguration(
          InfuraNetworkType.sepolia,
        ),
        mocks: [
          buildEthBlockNumberRequestMock('0x1'),
          buildEthGetTransactionCountRequestMock(ACCOUNT_MOCK, '0x1', '0xf'),
        ],
      });

      const firstNonceLockPromise = transactionController.getNonceLock(
        ACCOUNT_MOCK,
        'goerli',
      );
      await advanceTime({ clock, duration: 1 });

      const firstNonceLock = await firstNonceLockPromise;

      expect(firstNonceLock.nextNonce).toBe(10);

      const secondNonceLockPromise = transactionController.getNonceLock(
        ACCOUNT_MOCK,
        'sepolia',
      );
      await advanceTime({ clock, duration: 1 });

      const secondNonceLock = await secondNonceLockPromise;

      expect(secondNonceLock.nextNonce).toBe(15);

      transactionController.destroy();
    });

    it('should not block attempts to get the nonce lock for different addresses from the nonceTracker for the networkClientId', async () => {
      const { networkController, transactionController } =
        await setupController();

      const networkClients = networkController.getNetworkClientRegistry();
      const networkClientIds = Object.keys(networkClients);
      await Promise.all(
        networkClientIds.map(async (networkClientId) => {
          const config = networkClients[networkClientId].configuration;
          mockNetwork({
            networkClientConfiguration: config,
            mocks: [
              buildEthBlockNumberRequestMock('0x1'),
              buildEthGetTransactionCountRequestMock(
                ACCOUNT_MOCK,
                '0x1',
                '0xa',
              ),
              buildEthGetTransactionCountRequestMock(
                ACCOUNT_2_MOCK,
                '0x1',
                '0xf',
              ),
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
            ACCOUNT_2_MOCK,
            networkClientId,
          );
          await advanceTime({ clock, duration: 1 });

          const secondNonceLock = await secondNonceLockPromise;

          expect(secondNonceLock.nextNonce).toBe(15);
        }),
      );
      transactionController.destroy();
    });
  });
});
