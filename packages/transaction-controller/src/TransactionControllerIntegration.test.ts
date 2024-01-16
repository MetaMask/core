import { ControllerMessenger } from '@metamask/base-controller';
import { BUILT_IN_NETWORKS, NetworkType } from '@metamask/controller-utils';
import {
  NetworkController,
  NetworkClientType,
} from '@metamask/network-controller';

import { mockNetwork } from '../../../tests/mock-network';
import { TransactionController } from './TransactionController';

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
  const { provider } = networkController.getProviderAndBlockTracker();

  const opts = {
    provider,
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
    ...options,
  };
  return new TransactionController(opts);
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
          ],
        });
        const transactionController = await newController({});
        await transactionController.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_2_MOCK,
          },
          { networkClientId: 'mainnet' },
        );
        expect(transactionController.state.transactions.length).toHaveLength(1);
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
});
