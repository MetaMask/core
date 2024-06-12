/* eslint-disable jsdoc/require-jsdoc */
import { ChainId } from '@metamask/controller-utils';
import type { NetworkClientId, Provider } from '@metamask/network-controller';
import type { NonceTracker } from '@metamask/nonce-tracker';
import type { Hex } from '@metamask/utils';
import { useFakeTimers } from 'sinon';

import { advanceTime } from '../../../../tests/helpers';
import { EtherscanRemoteTransactionSource } from './EtherscanRemoteTransactionSource';
import type { IncomingTransactionHelper } from './IncomingTransactionHelper';
import { MultichainTrackingHelper } from './MultichainTrackingHelper';
import type { PendingTransactionTracker } from './PendingTransactionTracker';

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

  const mockNonceLock = { releaseLock: jest.fn() };
  const mockNonceTrackers: Record<Hex, jest.Mocked<NonceTracker>> = {};
  const mockCreateNonceTracker = jest
    .fn()
    .mockImplementation(({ chainId }: { chainId: Hex }) => {
      const mockNonceTracker = {
        getNonceLock: jest.fn().mockResolvedValue(mockNonceLock),
      } as unknown as jest.Mocked<NonceTracker>;
      mockNonceTrackers[chainId] = mockNonceTracker;
      return mockNonceTracker;
    });

  const mockIncomingTransactionHelpers: Record<
    Hex,
    jest.Mocked<IncomingTransactionHelper>
  > = {};
  const mockCreateIncomingTransactionHelper = jest
    .fn()
    .mockImplementation(({ chainId }: { chainId: Hex }) => {
      const mockIncomingTransactionHelper = {
        start: jest.fn(),
        stop: jest.fn(),
        update: jest.fn(),
      } as unknown as jest.Mocked<IncomingTransactionHelper>;
      mockIncomingTransactionHelpers[chainId] = mockIncomingTransactionHelper;
      return mockIncomingTransactionHelper;
    });

  const mockPendingTransactionTrackers: Record<
    Hex,
    jest.Mocked<PendingTransactionTracker>
  > = {};
  const mockCreatePendingTransactionTracker = jest
    .fn()
    .mockImplementation(({ chainId }: { chainId: Hex }) => {
      const mockPendingTransactionTracker = {
        start: jest.fn(),
        stop: jest.fn(),
      } as unknown as jest.Mocked<PendingTransactionTracker>;
      mockPendingTransactionTrackers[chainId] = mockPendingTransactionTracker;
      return mockPendingTransactionTracker;
    });

  const options = {
    isMultichainEnabled: true,
    provider: MOCK_PROVIDERS.mainnet,
    nonceTracker: {
      getNonceLock: jest.fn().mockResolvedValue(mockNonceLock),
    },
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

  return {
    helper,
    options,
    mockNonceLock,
    mockNonceTrackers,
    mockIncomingTransactionHelpers,
    mockPendingTransactionTrackers,
  };
}

describe('MultichainTrackingHelper', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    for (const network of [
      'mainnet',
      'goerli',
      'sepolia',
      'customNetworkClientId-1',
    ] as const) {
      MOCK_BLOCK_TRACKERS[network] = buildMockBlockTracker(network);
      MOCK_PROVIDERS[network] = buildMockProvider(network);
    }
  });

  describe('onNetworkStateChange', () => {
    it('refreshes the tracking map', () => {
      const { options, helper } = newMultichainTrackingHelper();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (options.onNetworkStateChange as any).mock.calls[0][0]({}, []);

      expect(options.getNetworkClientRegistry).toHaveBeenCalledTimes(1);
      expect(helper.has('mainnet')).toBe(true);
      expect(helper.has('goerli')).toBe(true);
      expect(helper.has('sepolia')).toBe(true);
      expect(helper.has('customNetworkClientId-1')).toBe(true);
    });

    it('refreshes the tracking map and excludes removed networkClientIds in the patches', () => {
      const { options, helper } = newMultichainTrackingHelper();

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
      const { options, helper } = newMultichainTrackingHelper();

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
      const { helper } = newMultichainTrackingHelper();

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
      const { mockIncomingTransactionHelpers, helper } =
        newMultichainTrackingHelper();

      helper.initialize();

      helper.startIncomingTransactionPolling(['mainnet', 'goerli']);
      expect(mockIncomingTransactionHelpers['0x1'].start).toHaveBeenCalled();
      expect(
        mockIncomingTransactionHelpers[ChainId.goerli].start,
      ).toHaveBeenCalled();
      expect(
        mockIncomingTransactionHelpers[ChainId.sepolia].start,
      ).not.toHaveBeenCalled();
      expect(
        mockIncomingTransactionHelpers['0xa'].start,
      ).not.toHaveBeenCalled();
    });
  });

  describe('stopIncomingTransactionPolling', () => {
    it('stops polling on the IncomingTransactionHelper for the networkClientIds', () => {
      const { mockIncomingTransactionHelpers, helper } =
        newMultichainTrackingHelper();

      helper.initialize();

      helper.stopIncomingTransactionPolling(['mainnet', 'goerli']);
      expect(mockIncomingTransactionHelpers['0x1'].stop).toHaveBeenCalled();
      expect(
        mockIncomingTransactionHelpers[ChainId.goerli].stop,
      ).toHaveBeenCalled();
      expect(
        mockIncomingTransactionHelpers[ChainId.sepolia].stop,
      ).not.toHaveBeenCalled();
      expect(mockIncomingTransactionHelpers['0xa'].stop).not.toHaveBeenCalled();
    });
  });

  describe('stopAllIncomingTransactionPolling', () => {
    it('stops polling on all IncomingTransactionHelpers', () => {
      const { mockIncomingTransactionHelpers, helper } =
        newMultichainTrackingHelper();

      helper.initialize();

      helper.stopAllIncomingTransactionPolling();
      expect(mockIncomingTransactionHelpers['0x1'].stop).toHaveBeenCalled();
      expect(
        mockIncomingTransactionHelpers[ChainId.goerli].stop,
      ).toHaveBeenCalled();
      expect(
        mockIncomingTransactionHelpers[ChainId.sepolia].stop,
      ).toHaveBeenCalled();
      expect(mockIncomingTransactionHelpers['0xa'].stop).toHaveBeenCalled();
    });
  });

  describe('updateIncomingTransactions', () => {
    it('calls update on the IncomingTransactionHelper for the networkClientIds', () => {
      const { mockIncomingTransactionHelpers, helper } =
        newMultichainTrackingHelper();

      helper.initialize();

      helper.updateIncomingTransactions(['mainnet', 'goerli']);
      expect(mockIncomingTransactionHelpers['0x1'].update).toHaveBeenCalled();
      expect(
        mockIncomingTransactionHelpers[ChainId.goerli].update,
      ).toHaveBeenCalled();
      expect(
        mockIncomingTransactionHelpers[ChainId.sepolia].update,
      ).not.toHaveBeenCalled();
      expect(
        mockIncomingTransactionHelpers['0xa'].update,
      ).not.toHaveBeenCalled();
    });
  });

  describe('getNonceLock', () => {
    describe('when given a networkClientId', () => {
      it('gets the shared nonce lock by chainId for the networkClientId', async () => {
        const { helper } = newMultichainTrackingHelper();

        const mockAcquireNonceLockForChainIdKey = jest
          .spyOn(helper, 'acquireNonceLockForChainIdKey')
          .mockResolvedValue(jest.fn());

        helper.initialize();

        await helper.getNonceLock('0xdeadbeef', 'mainnet');

        expect(mockAcquireNonceLockForChainIdKey).toHaveBeenCalledWith({
          chainId: '0x1',
          key: '0xdeadbeef',
        });
      });

      it('gets the nonce lock from the NonceTracker for the networkClientId', async () => {
        const { mockNonceTrackers, helper } = newMultichainTrackingHelper({});

        jest
          .spyOn(helper, 'acquireNonceLockForChainIdKey')
          .mockResolvedValue(jest.fn());

        helper.initialize();

        await helper.getNonceLock('0xdeadbeef', 'mainnet');

        expect(mockNonceTrackers['0x1'].getNonceLock).toHaveBeenCalledWith(
          '0xdeadbeef',
        );
      });

      it('merges the nonce lock by chainId release with the NonceTracker releaseLock function', async () => {
        const { mockNonceLock, helper } = newMultichainTrackingHelper({});

        const releaseLockForChainIdKey = jest.fn();
        jest
          .spyOn(helper, 'acquireNonceLockForChainIdKey')
          .mockResolvedValue(releaseLockForChainIdKey);

        helper.initialize();

        const nonceLock = await helper.getNonceLock('0xdeadbeef', 'mainnet');

        expect(releaseLockForChainIdKey).not.toHaveBeenCalled();
        expect(mockNonceLock.releaseLock).not.toHaveBeenCalled();

        nonceLock.releaseLock();

        expect(releaseLockForChainIdKey).toHaveBeenCalled();
        expect(mockNonceLock.releaseLock).toHaveBeenCalled();
      });

      it('throws an error if the networkClientId does not exist in the tracking map', async () => {
        const { helper } = newMultichainTrackingHelper();

        jest
          .spyOn(helper, 'acquireNonceLockForChainIdKey')
          .mockResolvedValue(jest.fn());

        await expect(
          helper.getNonceLock('0xdeadbeef', 'mainnet'),
        ).rejects.toThrow('missing nonceTracker for networkClientId');
      });

      it('throws an error and releases nonce lock by chainId if unable to acquire nonce lock from the NonceTracker', async () => {
        const { mockNonceTrackers, helper } = newMultichainTrackingHelper({});

        const releaseLockForChainIdKey = jest.fn();
        jest
          .spyOn(helper, 'acquireNonceLockForChainIdKey')
          .mockResolvedValue(releaseLockForChainIdKey);

        helper.initialize();

        mockNonceTrackers['0x1'].getNonceLock.mockRejectedValue(
          'failed to acquire lock from nonceTracker',
        );

        // for some reason jest expect().rejects.toThrow doesn't work here
        let error = '';
        try {
          await helper.getNonceLock('0xdeadbeef', 'mainnet');
        } catch (err: unknown) {
          error = err as string;
        }
        expect(error).toBe('failed to acquire lock from nonceTracker');
        expect(releaseLockForChainIdKey).toHaveBeenCalled();
      });
    });

    describe('when no networkClientId given', () => {
      it('does not get the shared nonce lock by chainId', async () => {
        const { helper } = newMultichainTrackingHelper();

        const mockAcquireNonceLockForChainIdKey = jest
          .spyOn(helper, 'acquireNonceLockForChainIdKey')
          .mockResolvedValue(jest.fn());

        helper.initialize();

        await helper.getNonceLock('0xdeadbeef');

        expect(mockAcquireNonceLockForChainIdKey).not.toHaveBeenCalled();
      });

      it('gets the nonce lock from the global NonceTracker', async () => {
        const { options, helper } = newMultichainTrackingHelper({});

        helper.initialize();

        await helper.getNonceLock('0xdeadbeef');

        expect(options.nonceTracker.getNonceLock).toHaveBeenCalledWith(
          '0xdeadbeef',
        );
      });

      it('throws an error if unable to acquire nonce lock from the global NonceTracker', async () => {
        const { options, helper } = newMultichainTrackingHelper({});

        helper.initialize();

        options.nonceTracker.getNonceLock.mockRejectedValue(
          'failed to acquire lock from nonceTracker',
        );

        // for some reason jest expect().rejects.toThrow doesn't work here
        let error = '';
        try {
          await helper.getNonceLock('0xdeadbeef');
        } catch (err: unknown) {
          error = err as string;
        }
        expect(error).toBe('failed to acquire lock from nonceTracker');
      });
    });

    describe('when passed a networkClientId and isMultichainEnabled: false', () => {
      it('does not get the shared nonce lock by chainId', async () => {
        const { helper } = newMultichainTrackingHelper({
          isMultichainEnabled: false,
        });

        const mockAcquireNonceLockForChainIdKey = jest
          .spyOn(helper, 'acquireNonceLockForChainIdKey')
          .mockResolvedValue(jest.fn());

        helper.initialize();

        await helper.getNonceLock('0xdeadbeef', '0xabc');

        expect(mockAcquireNonceLockForChainIdKey).not.toHaveBeenCalled();
      });

      it('gets the nonce lock from the global NonceTracker', async () => {
        const { options, helper } = newMultichainTrackingHelper({
          isMultichainEnabled: false,
        });

        helper.initialize();

        await helper.getNonceLock('0xdeadbeef', '0xabc');

        expect(options.nonceTracker.getNonceLock).toHaveBeenCalledWith(
          '0xdeadbeef',
        );
      });

      it('throws an error if unable to acquire nonce lock from the global NonceTracker', async () => {
        const { options, helper } = newMultichainTrackingHelper({
          isMultichainEnabled: false,
        });

        helper.initialize();

        options.nonceTracker.getNonceLock.mockRejectedValue(
          'failed to acquire lock from nonceTracker',
        );

        // for some reason jest expect().rejects.toThrow doesn't work here
        let error = '';
        try {
          await helper.getNonceLock('0xdeadbeef', '0xabc');
        } catch (err: unknown) {
          error = err as string;
        }
        expect(error).toBe('failed to acquire lock from nonceTracker');
      });
    });
  });

  describe('acquireNonceLockForChainIdKey', () => {
    it('returns a unqiue mutex for each chainId and key combination', async () => {
      const { helper } = newMultichainTrackingHelper();

      await helper.acquireNonceLockForChainIdKey({ chainId: '0x1', key: 'a' });
      await helper.acquireNonceLockForChainIdKey({ chainId: '0x1', key: 'b' });
      await helper.acquireNonceLockForChainIdKey({ chainId: '0xa', key: 'a' });
      await helper.acquireNonceLockForChainIdKey({ chainId: '0xa', key: 'b' });

      // nothing to exepect as this spec will pass if all locks are acquired
    });

    it('should block on attempts to get the lock for the same chainId and key combination', async () => {
      const clock = useFakeTimers();
      const { helper } = newMultichainTrackingHelper();

      const firstReleaseLockPromise = helper.acquireNonceLockForChainIdKey({
        chainId: '0x1',
        key: 'a',
      });

      const firstReleaseLock = await firstReleaseLockPromise;

      const secondReleaseLockPromise = helper.acquireNonceLockForChainIdKey({
        chainId: '0x1',
        key: 'a',
      });

      const delay = () =>
        new Promise<null>(async (resolve) => {
          await advanceTime({ clock, duration: 100 });
          resolve(null);
        });

      let secondReleaseLockIfAcquired = await Promise.race([
        secondReleaseLockPromise,
        delay(),
      ]);
      expect(secondReleaseLockIfAcquired).toBeNull();

      await firstReleaseLock();
      await advanceTime({ clock, duration: 1 });

      secondReleaseLockIfAcquired = await Promise.race([
        secondReleaseLockPromise,
        delay(),
      ]);

      expect(secondReleaseLockIfAcquired).toStrictEqual(expect.any(Function));

      clock.restore();
    });
  });

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

  describe('getProvider', () => {
    describe('when given networkClientId and chainId', () => {
      it('returns the provider of the networkClientId when available', () => {
        const { options, helper } = newMultichainTrackingHelper();

        const provider = helper.getProvider({
          networkClientId: 'goerli',
          chainId: '0xa',
        });
        expect(provider).toBe(MOCK_PROVIDERS.goerli);

        expect(options.getNetworkClientById).toHaveBeenCalledTimes(1);
        expect(options.getNetworkClientById).toHaveBeenCalledWith('goerli');
      });

      it('returns a fallback networkClient provider matching the chainId when available', () => {
        const { options, helper } = newMultichainTrackingHelper();

        const provider = helper.getProvider({
          networkClientId: 'missingNetworkClientId',
          chainId: '0xa',
        });
        expect(provider).toBe(MOCK_PROVIDERS['customNetworkClientId-1']);

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

      it('returns the fallback global provider if networkClientId and chainId cannot be satisfied', () => {
        const { options, helper } = newMultichainTrackingHelper();

        const provider = helper.getProvider({
          networkClientId: 'missingNetworkClientId',
          chainId: '0xdeadbeef',
        });
        expect(provider).toBe(MOCK_PROVIDERS.mainnet);

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
      it('returns the provider of the networkClientId when available', () => {
        const { options, helper } = newMultichainTrackingHelper();

        const provider = helper.getProvider({ networkClientId: 'goerli' });
        expect(provider).toBe(MOCK_PROVIDERS.goerli);

        expect(options.getNetworkClientById).toHaveBeenCalledTimes(1);
        expect(options.getNetworkClientById).toHaveBeenCalledWith('goerli');
      });

      it('returns the fallback global provider if networkClientId cannot be satisfied', () => {
        const { options, helper } = newMultichainTrackingHelper();

        const provider = helper.getProvider({
          networkClientId: 'missingNetworkClientId',
        });
        expect(provider).toBe(MOCK_PROVIDERS.mainnet);

        expect(options.getNetworkClientById).toHaveBeenCalledTimes(1);
        expect(options.getNetworkClientById).toHaveBeenCalledWith(
          'missingNetworkClientId',
        );
      });
    });

    describe('when given only chainId', () => {
      it('returns a fallback networkClient provider matching the chainId when available', () => {
        const { options, helper } = newMultichainTrackingHelper();

        const provider = helper.getProvider({ chainId: '0xa' });
        expect(provider).toBe(MOCK_PROVIDERS['customNetworkClientId-1']);

        expect(options.getNetworkClientById).toHaveBeenCalledTimes(1);
        expect(options.findNetworkClientIdByChainId).toHaveBeenCalledWith(
          '0xa',
        );
        expect(options.getNetworkClientById).toHaveBeenCalledWith(
          'customNetworkClientId-1',
        );
      });

      it('returns the fallback global provider if chainId cannot be satisfied', () => {
        const { options, helper } = newMultichainTrackingHelper();

        const provider = helper.getProvider({ chainId: '0xdeadbeef' });
        expect(provider).toBe(MOCK_PROVIDERS.mainnet);

        expect(options.findNetworkClientIdByChainId).toHaveBeenCalledWith(
          '0xdeadbeef',
        );
      });
    });

    it('returns the global provider when no arguments are provided', () => {
      const { options, helper } = newMultichainTrackingHelper();

      const provider = helper.getProvider();
      expect(provider).toBe(MOCK_PROVIDERS.mainnet);

      expect(options.getNetworkClientById).not.toHaveBeenCalled();
    });

    it('always returns the global provider when isMultichainEnabled: false', () => {
      const { options, helper } = newMultichainTrackingHelper({
        isMultichainEnabled: false,
      });

      let provider = helper.getProvider({
        networkClientId: 'goerli',
        chainId: '0x5',
      });
      expect(provider).toBe(MOCK_PROVIDERS.mainnet);
      provider = helper.getProvider({ networkClientId: 'goerli' });
      expect(provider).toBe(MOCK_PROVIDERS.mainnet);
      provider = helper.getProvider({ chainId: '0x5' });
      expect(provider).toBe(MOCK_PROVIDERS.mainnet);
      provider = helper.getProvider();
      expect(provider).toBe(MOCK_PROVIDERS.mainnet);

      expect(options.getNetworkClientById).not.toHaveBeenCalled();
    });
  });
});
