/* eslint-disable jsdoc/require-jsdoc */
import { ChainId } from '@metamask/controller-utils';
import type { NetworkClientId, Provider } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

import { EtherscanRemoteTransactionSource } from './EtherscanRemoteTransactionSource';
import { MultichainTrackingHelper } from './MultichainTrackingHelper';
import { IncomingTransactionHelper } from './IncomingTransactionHelper';
import { PendingTransactionTracker } from './PendingTransactionTracker';

jest.mock(
  '@metamask/eth-query',
  () =>
    function (provider: Provider) {
      return { provider };
    },
);

function buildMockProvider(networkClientId: NetworkClientId) {
  return {
    mockProvider: networkClientId,
  };
}

function buildMockBlockTracker(networkClientId: NetworkClientId) {
  return {
    mockBlockTracker: networkClientId,
  };
}

const MOCK_BLOCK_TRACKERS = {
  mainnet: buildMockBlockTracker('mainnet'),
  sepolia: buildMockBlockTracker('sepolia'),
  goerli: buildMockBlockTracker('goerli'),
  'customNetworkClientId-1': buildMockBlockTracker('customNetworkClientId-1'),
};

const MOCK_PROVIDERS = {
  mainnet: buildMockProvider('mainnet'),
  sepolia: buildMockProvider('sepolia'),
  goerli: buildMockProvider('goerli'),
  'customNetworkClientId-1': buildMockProvider('customNetworkClientId-1'),
};

/**
 * Create a new instance of the MultichainTrackingHelper.
 *
 * @param opts - Options to use when creating the instance.
 * @param opts.options - Any options to override the test defaults.
 * @returns The new MultichainTrackingHelper instance.
 */
function newMultichainTrackingHelper(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opts: any = {},
) {
  const mockGetNetworkClientById = jest
    .fn()
    .mockImplementation((networkClientId) => {
      switch (networkClientId) {
        case 'mainnet':
          return {
            configuration: {
              chainId: '0x1',
            },
            blockTracker: MOCK_BLOCK_TRACKERS.mainnet,
            provider: MOCK_PROVIDERS.mainnet,
          };
        case 'sepolia':
          return {
            configuration: {
              chainId: ChainId.sepolia,
            },
            blockTracker: MOCK_BLOCK_TRACKERS.sepolia,
            provider: MOCK_PROVIDERS.sepolia,
          };
        case 'goerli':
          return {
            configuration: {
              chainId: ChainId.goerli,
            },
            blockTracker: MOCK_BLOCK_TRACKERS.goerli,
            provider: MOCK_PROVIDERS.goerli,
          };
        case 'customNetworkClientId-1':
          return {
            configuration: {
              chainId: '0xa',
            },
            blockTracker: MOCK_BLOCK_TRACKERS['customNetworkClientId-1'],
            provider: MOCK_PROVIDERS['customNetworkClientId-1'],
          };
        default:
          throw new Error(`Invalid network client id ${networkClientId}`);
      }
    });

  const mockFindNetworkClientIdByChainId = jest
    .fn()
    .mockImplementation((chainId) => {
      switch (chainId) {
        case '0x1':
          return 'mainnet';
        case ChainId.sepolia:
          return 'sepolia';
        case ChainId.goerli:
          return 'goerli';
        case '0xa':
          return 'customNetworkClientId-1';
        default:
          throw new Error("Couldn't find networkClientId for chainId");
      }
    });

  const mockGetNetworkClientRegistry = jest.fn().mockReturnValue({
    mainnet: {
      configuration: {
        chainId: '0x1',
      },
    },
    sepolia: {
      configuration: {
        chainId: ChainId.sepolia,
      },
    },
    goerli: {
      configuration: {
        chainId: ChainId.goerli,
      },
    },
    'customNetworkClientId-1': {
      configuration: {
        chainId: '0xa',
      },
    },
  });

  const mockCreateNonceTracker = jest.fn().mockReturnValue({});

  const mockIncomingTransactionHelpers: Record<Hex, jest.Mocked<IncomingTransactionHelper>> = {}
  const mockCreateIncomingTransactionHelper = jest
    .fn()
    .mockImplementation(({chainId}: {chainId: Hex}) => {
      const mockIncomingTransactionHelper = {
        start: jest.fn(),
        stop: jest.fn(),
        update: jest.fn()
      } as unknown as jest.Mocked<IncomingTransactionHelper>
      mockIncomingTransactionHelpers[chainId] = mockIncomingTransactionHelper
      return mockIncomingTransactionHelper
    });

  const mockPendingTransactionTrackers: Record<Hex, jest.Mocked<PendingTransactionTracker>> = {}
  const mockCreatePendingTransactionTracker = jest
    .fn()
    .mockImplementation(({chainId}: {chainId: Hex}) => {
      const mockPendingTransactionTracker = {
        start: jest.fn(),
        stop: jest.fn(),
      } as unknown as jest.Mocked<PendingTransactionTracker>
      mockPendingTransactionTrackers[chainId] = mockPendingTransactionTracker
      return mockPendingTransactionTracker
    });

  const options = {
    isMultichainEnabled: true,
    provider: MOCK_PROVIDERS.mainnet,
    blockTracker: MOCK_BLOCK_TRACKERS.mainnet,
    incomingTransactionOptions: {
      // make this a comparable reference
      includeTokenTransfers: true,
      isEnabled: () => true,
      queryEntireHistory: true,
      updateTransactions: true,
    },
    findNetworkClientIdByChainId: mockFindNetworkClientIdByChainId,
    getNetworkClientById: mockGetNetworkClientById,
    getNetworkClientRegistry: mockGetNetworkClientRegistry,
    removeIncomingTransactionHelperListeners: jest.fn(),
    removePendingTransactionTrackerListeners: jest.fn(),
    createNonceTracker: mockCreateNonceTracker,
    createIncomingTransactionHelper: mockCreateIncomingTransactionHelper,
    createPendingTransactionTracker: mockCreatePendingTransactionTracker,
    onNetworkStateChange: jest.fn(),
    ...opts,
  };

  const helper = new MultichainTrackingHelper(options);

  // may not need this anymore since init is no longer in constructor
  // helper to ignore calls from instantiation side effects
  if (opts.clearMocks !== false) {
    jest.clearAllMocks();
  }

  return {
    helper,
    options,
    mockIncomingTransactionHelpers,
    mockPendingTransactionTrackers,
  };
}

describe('MultichainTrackingHelper', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('onNetworkStateChange', () => {
    it('refreshes the tracking map', () => {
      const { options, helper } = newMultichainTrackingHelper({
        clearMocks: false,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (options.onNetworkStateChange as any).mock.calls[0][0]({}, []);

      expect(options.getNetworkClientRegistry).toHaveBeenCalledTimes(1);
      expect(helper.has('mainnet')).toBe(true);
      expect(helper.has('goerli')).toBe(true);
      expect(helper.has('sepolia')).toBe(true);
      expect(helper.has('customNetworkClientId-1')).toBe(true);
    });

    it('refreshes the tracking map and excludes removed networkClientIds in the patches', () => {
      const { options, helper } = newMultichainTrackingHelper({
        clearMocks: false,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (options.onNetworkStateChange as any).mock.calls[0][0]({}, [
        {
          op: 'remove',
          path: ['networkConfigurations', 'mainnet'],
          value: 'foo',
        },
      ]);

      expect(options.getNetworkClientRegistry).toHaveBeenCalledTimes(1);
      expect(helper.has('mainnet')).toBe(false);
      expect(helper.has('goerli')).toBe(true);
      expect(helper.has('sepolia')).toBe(true);
      expect(helper.has('customNetworkClientId-1')).toBe(true);
    });

    it('does not refresh the tracking map when isMultichainEnabled: false', () => {
      const { options, helper } = newMultichainTrackingHelper({
        isMultichainEnabled: false,
        clearMocks: false,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (options.onNetworkStateChange as any).mock.calls[0][0]({}, []);

      expect(options.getNetworkClientRegistry).not.toHaveBeenCalled();
      expect(helper.has('mainnet')).toBe(false);
      expect(helper.has('goerli')).toBe(false);
      expect(helper.has('sepolia')).toBe(false);
      expect(helper.has('customNetworkClientId-1')).toBe(false);
    });
  });

  describe('initialize', () => {
    it('initializes the tracking map', () => {
      const { options, helper } = newMultichainTrackingHelper({
        clearMocks: false,
      });

      helper.initialize();

      expect(options.getNetworkClientRegistry).toHaveBeenCalledTimes(1);
      expect(helper.has('mainnet')).toBe(true);
      expect(helper.has('goerli')).toBe(true);
      expect(helper.has('sepolia')).toBe(true);
      expect(helper.has('customNetworkClientId-1')).toBe(true);
    });

    it('does not initialize the tracking map when isMultichainEnabled: false', () => {
      const { options, helper } = newMultichainTrackingHelper({
        isMultichainEnabled: false,
        clearMocks: false,
      });

      helper.initialize();

      expect(options.getNetworkClientRegistry).not.toHaveBeenCalled();
      expect(helper.has('mainnet')).toBe(false);
      expect(helper.has('goerli')).toBe(false);
      expect(helper.has('sepolia')).toBe(false);
      expect(helper.has('customNetworkClientId-1')).toBe(false);
    });
  });

  describe('stopAllTracking', () => {
    it('clears the tracking map', () => {
      const { helper } = newMultichainTrackingHelper({ clearMocks: false });

      helper.initialize();

      expect(helper.has('mainnet')).toBe(true);
      expect(helper.has('goerli')).toBe(true);
      expect(helper.has('sepolia')).toBe(true);
      expect(helper.has('customNetworkClientId-1')).toBe(true);

      helper.stopAllTracking();

      expect(helper.has('mainnet')).toBe(false);
      expect(helper.has('goerli')).toBe(false);
      expect(helper.has('sepolia')).toBe(false);
      expect(helper.has('customNetworkClientId-1')).toBe(false);
    });
  });

  describe('#startTrackingByNetworkClientId', () => {
    it('instantiates trackers and adds them to the tracking map', () => {
      const { options, helper } = newMultichainTrackingHelper({
        getNetworkClientRegistry: jest.fn().mockReturnValue({
          mainnet: {
            configuration: {
              chainId: '0x1',
            },
          },
        }),
      });

      helper.initialize();

      expect(options.createNonceTracker).toHaveBeenCalledTimes(1);
      expect(options.createNonceTracker).toHaveBeenCalledWith({
        provider: MOCK_PROVIDERS.mainnet,
        blockTracker: MOCK_BLOCK_TRACKERS.mainnet,
        chainId: '0x1',
      });

      expect(options.createIncomingTransactionHelper).toHaveBeenCalledTimes(1);
      expect(options.createIncomingTransactionHelper).toHaveBeenCalledWith({
        blockTracker: MOCK_BLOCK_TRACKERS.mainnet,
        etherscanRemoteTransactionSource: expect.any(
          EtherscanRemoteTransactionSource,
        ),
        chainId: '0x1',
      });

      expect(options.createPendingTransactionTracker).toHaveBeenCalledTimes(1);
      expect(options.createPendingTransactionTracker).toHaveBeenCalledWith({
        provider: MOCK_PROVIDERS.mainnet,
        blockTracker: MOCK_BLOCK_TRACKERS.mainnet,
        chainId: '0x1',
      });

      expect(helper.has('mainnet')).toBe(true);
    });
  });

  describe('#stopTrackingByNetworkClientId', () => {
    it('stops trackers and removes them from the tracking map', () => {
      const {
        options,
        mockIncomingTransactionHelpers,
        mockPendingTransactionTrackers,
        helper,
      } = newMultichainTrackingHelper({
        getNetworkClientRegistry: jest.fn().mockReturnValue({
          mainnet: {
            configuration: {
              chainId: '0x1',
            },
          },
        }),
      });

      helper.initialize();

      expect(helper.has('mainnet')).toBe(true);

      helper.stopAllTracking();

      expect(mockPendingTransactionTrackers['0x1'].stop).toHaveBeenCalled();
      expect(
        options.removePendingTransactionTrackerListeners,
      ).toHaveBeenCalledWith(mockPendingTransactionTrackers['0x1']);
      expect(mockIncomingTransactionHelpers['0x1'].stop).toHaveBeenCalled();
      expect(
        options.removeIncomingTransactionHelperListeners,
      ).toHaveBeenCalledWith(mockIncomingTransactionHelpers['0x1']);
      expect(helper.has('mainnet')).toBe(false);
    });
  });

  describe('startIncomingTransactionPolling', () => {
    it('starts polling on the IncomingTransactionHelper for the networkClientIds', () => {
      const { mockIncomingTransactionHelpers, helper } = newMultichainTrackingHelper({ clearMocks: false });

      helper.initialize();

      helper.startIncomingTransactionPolling(['mainnet', 'goerli'])
      expect(mockIncomingTransactionHelpers['0x1'].start).toHaveBeenCalled()
      expect(mockIncomingTransactionHelpers[ChainId.goerli].start).toHaveBeenCalled()
      expect(mockIncomingTransactionHelpers[ChainId.sepolia].start).not.toHaveBeenCalled()
      expect(mockIncomingTransactionHelpers['0xa'].start).not.toHaveBeenCalled()
    })
  })

  describe('stopIncomingTransactionPolling', () => {
    it('stops polling on the IncomingTransactionHelper for the networkClientIds', () => {
      const { mockIncomingTransactionHelpers, helper } = newMultichainTrackingHelper({ clearMocks: false });

      helper.initialize();

      helper.stopIncomingTransactionPolling(['mainnet', 'goerli'])
      expect(mockIncomingTransactionHelpers['0x1'].stop).toHaveBeenCalled()
      expect(mockIncomingTransactionHelpers[ChainId.goerli].stop).toHaveBeenCalled()
      expect(mockIncomingTransactionHelpers[ChainId.sepolia].stop).not.toHaveBeenCalled()
      expect(mockIncomingTransactionHelpers['0xa'].stop).not.toHaveBeenCalled()
    })
  })

  describe('stopAllIncomingTransactionPolling', () => {
    it('stops polling on all IncomingTransactionHelpers', () => {
      const { mockIncomingTransactionHelpers, helper } = newMultichainTrackingHelper({ clearMocks: false });

      helper.initialize();

      helper.stopAllIncomingTransactionPolling()
      expect(mockIncomingTransactionHelpers['0x1'].stop).toHaveBeenCalled()
      expect(mockIncomingTransactionHelpers[ChainId.goerli].stop).toHaveBeenCalled()
      expect(mockIncomingTransactionHelpers[ChainId.sepolia].stop).toHaveBeenCalled()
      expect(mockIncomingTransactionHelpers['0xa'].stop).toHaveBeenCalled()
    })
  })

  describe('updateIncomingTransactions', () => {
    it('calls update on the IncomingTransactionHelper for the networkClientIds', () => {
      const { mockIncomingTransactionHelpers, helper } = newMultichainTrackingHelper({ clearMocks: false });

      helper.initialize();

      helper.updateIncomingTransactions(['mainnet', 'goerli'])
      expect(mockIncomingTransactionHelpers['0x1'].update).toHaveBeenCalled()
      expect(mockIncomingTransactionHelpers[ChainId.goerli].update).toHaveBeenCalled()
      expect(mockIncomingTransactionHelpers[ChainId.sepolia].update).not.toHaveBeenCalled()
      expect(mockIncomingTransactionHelpers['0xa'].update).not.toHaveBeenCalled()
    })
  })

  // describe('getNonceLock', () => {
  // })

  // describe('acquireNonceLockForChainIdKey', () => {
  // })

  describe('getEthQuery', () => {
    describe('when given networkClientId and chainId', () => {
      it('returns EthQuery with the networkClientId provider when available', () => {
        const { options, helper } = newMultichainTrackingHelper();

        const ethQuery = helper.getEthQuery({
          networkClientId: 'goerli',
          chainId: '0xa',
        });
        expect(ethQuery.provider).toBe(MOCK_PROVIDERS.goerli);

        expect(options.getNetworkClientById).toHaveBeenCalledTimes(1);
        expect(options.getNetworkClientById).toHaveBeenCalledWith('goerli');
      });

      it('returns EthQuery with a fallback networkClient provider matching the chainId when available', () => {
        const { options, helper } = newMultichainTrackingHelper();

        const ethQuery = helper.getEthQuery({
          networkClientId: 'missingNetworkClientId',
          chainId: '0xa',
        });
        expect(ethQuery.provider).toBe(
          MOCK_PROVIDERS['customNetworkClientId-1'],
        );

        expect(options.getNetworkClientById).toHaveBeenCalledTimes(2);
        expect(options.getNetworkClientById).toHaveBeenCalledWith(
          'missingNetworkClientId',
        );
        expect(options.findNetworkClientIdByChainId).toHaveBeenCalledWith(
          '0xa',
        );
        expect(options.getNetworkClientById).toHaveBeenCalledWith(
          'customNetworkClientId-1',
        );
      });

      it('returns EthQuery with the fallback global provider if networkClientId and chainId cannot be satisfied', () => {
        const { options, helper } = newMultichainTrackingHelper();

        const ethQuery = helper.getEthQuery({
          networkClientId: 'missingNetworkClientId',
          chainId: '0xdeadbeef',
        });
        expect(ethQuery.provider).toBe(MOCK_PROVIDERS.mainnet);

        expect(options.getNetworkClientById).toHaveBeenCalledTimes(1);
        expect(options.getNetworkClientById).toHaveBeenCalledWith(
          'missingNetworkClientId',
        );
        expect(options.findNetworkClientIdByChainId).toHaveBeenCalledWith(
          '0xdeadbeef',
        );
      });
    });

    describe('when given only networkClientId', () => {
      it('returns EthQuery with the networkClientId provider when available', () => {
        const { options, helper } = newMultichainTrackingHelper();

        const ethQuery = helper.getEthQuery({ networkClientId: 'goerli' });
        expect(ethQuery.provider).toBe(MOCK_PROVIDERS.goerli);

        expect(options.getNetworkClientById).toHaveBeenCalledTimes(1);
        expect(options.getNetworkClientById).toHaveBeenCalledWith('goerli');
      });

      it('returns EthQuery with the fallback global provider if networkClientId cannot be satisfied', () => {
        const { options, helper } = newMultichainTrackingHelper();

        const ethQuery = helper.getEthQuery({
          networkClientId: 'missingNetworkClientId',
        });
        expect(ethQuery.provider).toBe(MOCK_PROVIDERS.mainnet);

        expect(options.getNetworkClientById).toHaveBeenCalledTimes(1);
        expect(options.getNetworkClientById).toHaveBeenCalledWith(
          'missingNetworkClientId',
        );
      });
    });

    describe('when given only chainId', () => {
      it('returns EthQuery with a fallback networkClient provider matching the chainId when available', () => {
        const { options, helper } = newMultichainTrackingHelper();

        const ethQuery = helper.getEthQuery({ chainId: '0xa' });
        expect(ethQuery.provider).toBe(
          MOCK_PROVIDERS['customNetworkClientId-1'],
        );

        expect(options.getNetworkClientById).toHaveBeenCalledTimes(1);
        expect(options.findNetworkClientIdByChainId).toHaveBeenCalledWith(
          '0xa',
        );
        expect(options.getNetworkClientById).toHaveBeenCalledWith(
          'customNetworkClientId-1',
        );
      });

      it('returns EthQuery with the fallback global provider if chainId cannot be satisfied', () => {
        const { options, helper } = newMultichainTrackingHelper();

        const ethQuery = helper.getEthQuery({ chainId: '0xdeadbeef' });
        expect(ethQuery.provider).toBe(MOCK_PROVIDERS.mainnet);

        expect(options.findNetworkClientIdByChainId).toHaveBeenCalledWith(
          '0xdeadbeef',
        );
      });
    });

    it('returns EthQuery with the global provider when no arguments are provided', () => {
      const { options, helper } = newMultichainTrackingHelper();

      const ethQuery = helper.getEthQuery();
      expect(ethQuery.provider).toBe(MOCK_PROVIDERS.mainnet);

      expect(options.getNetworkClientById).not.toHaveBeenCalled();
    });

    it('always returns EthQuery with the global provider when isMultichainEnabled: false', () => {
      const { options, helper } = newMultichainTrackingHelper({
        isMultichainEnabled: false,
      });

      let ethQuery = helper.getEthQuery({
        networkClientId: 'goerli',
        chainId: '0x5',
      });
      expect(ethQuery.provider).toBe(MOCK_PROVIDERS.mainnet);
      ethQuery = helper.getEthQuery({ networkClientId: 'goerli' });
      expect(ethQuery.provider).toBe(MOCK_PROVIDERS.mainnet);
      ethQuery = helper.getEthQuery({ chainId: '0x5' });
      expect(ethQuery.provider).toBe(MOCK_PROVIDERS.mainnet);
      ethQuery = helper.getEthQuery();
      expect(ethQuery.provider).toBe(MOCK_PROVIDERS.mainnet);

      expect(options.getNetworkClientById).not.toHaveBeenCalled();
    });
  });
});
