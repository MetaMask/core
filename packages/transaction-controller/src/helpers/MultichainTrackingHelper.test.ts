/* eslint-disable jest/prefer-spy-on */
/* eslint-disable jsdoc/require-jsdoc */
import { ChainId, toHex } from '@metamask/controller-utils';

import type { MultichainTrackingHelperOptions } from './MultichainTrackingHelper';
import { MultichainTrackingHelper } from './MultichainTrackingHelper';

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
): {
  helper: MultichainTrackingHelper;
  options: MultichainTrackingHelperOptions;
} {
  const mockGetNetworkClientById = jest
    .fn()
    .mockImplementation((networkClientId) => {
      switch (networkClientId) {
        case 'mainnet':
          return {
            configuration: {
              chainId: toHex(1),
            },
            blockTracker: {},
            provider: {},
          };
        case 'sepolia':
          return {
            configuration: {
              chainId: ChainId.sepolia,
            },
            blockTracker: {},
            provider: {},
          };
        case 'goerli':
          return {
            configuration: {
              chainId: ChainId.goerli,
            },
            blockTracker: {},
            provider: {},
          };
        case 'customNetworkClientId-1':
          return {
            configuration: {
              chainId: '0xa',
            },
            blockTracker: {},
            provider: {},
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
        chainId: toHex(1),
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

  const options = {
    isMultichainEnabled: true,
    provider: {},
    nonceTracker: {},
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
    createNonceTracker: jest.fn(),
    createIncomingTransactionHelper: jest.fn(),
    createPendingTransactionTracker: jest.fn(),
    onNetworkStateChange: jest.fn(),
    ...opts,
  };

  const helper = new MultichainTrackingHelper(options);

  return {
    helper,
    options,
  };
}

describe('MultichainTrackingHelper', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    it('does not init the tracking map when isMultichainEnabled: false', () => {
      const { options } = newMultichainTrackingHelper({
        isMultichainEnabled: false,
      });

      expect(options.getNetworkClientRegistry).not.toHaveBeenCalled();
    });

    it('does refresh the tracking map onNetworkStateChange when isMultichainEnabled: false', () => {
      const { options } = newMultichainTrackingHelper({
        isMultichainEnabled: false,
      });

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (options.onNetworkStateChange as any).mock.calls[0][0]({}, [
        {
          op: 'add',
          path: ['networkConfigurations', 'foo'],
          value: 'foo',
        },
      ]);

      expect(options.getNetworkClientRegistry).not.toHaveBeenCalled();
    });
  });
});
