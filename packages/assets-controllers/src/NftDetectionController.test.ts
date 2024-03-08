import {
  RESERVOIR_API_BASE_URL,
  ChainId,
  toHex,
} from '@metamask/controller-utils';
import {
  getDefaultPreferencesState,
  type PreferencesState,
} from '@metamask/preferences-controller';
import nock from 'nock';
import * as sinon from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import { Source } from './constants';
import { getDefaultNftState, type NftState } from './NftController';
import {
  type NftDetectionConfig,
  NftDetectionController,
} from './NftDetectionController';

const DEFAULT_INTERVAL = 180000;

describe('NftDetectionController', () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(async () => {
    clock = sinon.useFakeTimers();

    nock(RESERVOIR_API_BASE_URL)
      .persist()
      .get(`/0x1/tokens?chainIds=1&limit=200&continuation=`)
      .reply(200, {
        tokens: [
          {
            token: {
              chainId: 1,
              contract: '0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc',
              tokenId: '2577',
              kind: 'erc721',
              name: 'Remilio 632',
              image: 'https://imgtest',
              imageSmall: 'https://imgSmall',
              imageLarge: 'https://imglarge',
              metadata: {
                imageOriginal: 'https://remilio.org/remilio/632.png',
                imageMimeType: 'image/png',
                tokenURI: 'https://remilio.org/remilio/json/632',
              },
              description:
                "Redacted Remilio Babies is a collection of 10,000 neochibi pfpNFT's expanding the Milady Maker paradigm with the introduction of young J.I.T. energy and schizophrenic reactionary aesthetics. We are #REMILIONAIREs.",
              rarityScore: 343.443,
              rarityRank: 8872,
              supply: '1',
              isSpam: false,
            },
          },
          {
            token: {
              contract: '0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d',
              kind: 'erc721',
              name: 'ID 2578',
              description: 'Description 2578',
              image: 'https://imgtest',
              imageSmall: 'https://imgSmall',
              imageLarge: 'https://imglarge',
              tokenId: '2578',
              metadata: {
                imageOriginal: 'https://remilio.org/remilio/632.png',
                imageMimeType: 'image/png',
                tokenURI: 'https://remilio.org/remilio/json/632',
              },
              rarityScore: 343.443,
              rarityRank: 8872,
              supply: '1',
              isSpam: false,
            },
          },
          {
            token: {
              contract: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
              kind: 'erc721',
              name: 'ID 2574',
              description: 'Description 2574',
              image: 'image/2574.png',
              tokenId: '2574',
              metadata: {
                imageOriginal: 'imageOriginal/2574.png',
                imageMimeType: 'image/png',
                tokenURI: 'tokenURITest',
              },
              isSpam: false,
            },
          },
        ],
      })
      .get(`/0x9/tokens?chainIds=1&limit=200&continuation=`)
      .reply(200, {
        tokens: [
          {
            token: {
              contract: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',

              kind: 'erc721',
              name: 'ID 2574',
              description: 'Description 2574',
              image: 'image/2574.png',
              tokenId: '2574',
              metadata: {
                imageOriginal: 'imageOriginal/2574.png',
                imageMimeType: 'image/png',
                tokenURI: 'tokenURITest',
              },
              isSpam: false,
            },
          },
        ],
      });
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();
  });

  it('should set default config', async () => {
    await withController(({ controller }) => {
      expect(controller.config).toStrictEqual({
        interval: DEFAULT_INTERVAL,
        chainId: toHex(1),
        selectedAddress: '',
        disabled: true,
      });
    });
  });

  it('should poll and detect NFTs on interval while on mainnet', async () => {
    await withController(
      { config: { interval: 10 } },
      async ({ controller, triggerPreferencesStateChange }) => {
        const mockNfts = sinon.stub(controller, 'detectNfts');
        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
        });
        // Wait for detect call triggered by preferences state change to settle
        await advanceTime({
          clock,
          duration: 1,
        });

        expect(mockNfts.calledOnce).toBe(true);

        await advanceTime({
          clock,
          duration: 10,
        });

        expect(mockNfts.calledTwice).toBe(true);
      },
    );
  });

  it('should poll and detect NFTs by networkClientId on interval while on mainnet', async () => {
    await withController(async ({ controller }) => {
      const spy = jest
        .spyOn(controller, 'detectNfts')
        .mockImplementation(() => {
          return Promise.resolve();
        });

      controller.startPollingByNetworkClientId('mainnet', {
        address: '0x1',
      });

      await advanceTime({ clock, duration: 0 });
      expect(spy.mock.calls).toHaveLength(1);
      await advanceTime({
        clock,
        duration: DEFAULT_INTERVAL / 2,
      });
      expect(spy.mock.calls).toHaveLength(1);
      await advanceTime({
        clock,
        duration: DEFAULT_INTERVAL / 2,
      });
      expect(spy.mock.calls).toHaveLength(2);
      await advanceTime({ clock, duration: DEFAULT_INTERVAL });
      expect(spy.mock.calls).toMatchObject([
        [
          {
            networkClientId: 'mainnet',
            userAddress: '0x1',
          },
        ],
        [
          {
            networkClientId: 'mainnet',
            userAddress: '0x1',
          },
        ],
        [
          {
            networkClientId: 'mainnet',
            userAddress: '0x1',
          },
        ],
      ]);
    });
  });

  it('should detect mainnet correctly', async () => {
    await withController(({ controller }) => {
      controller.configure({ chainId: ChainId.mainnet });
      expect(controller.isMainnet()).toBe(true);
      controller.configure({ chainId: ChainId.goerli });
      expect(controller.isMainnet()).toBe(false);
    });
  });

  it('should not autodetect while not on mainnet', async () => {
    await withController(async ({ controller }) => {
      const mockNfts = sinon.stub(controller, 'detectNfts');

      await controller.start();
      await advanceTime({ clock, duration: DEFAULT_INTERVAL });

      expect(mockNfts.called).toBe(false);
    });
  });

  it('should detect and add NFTs correctly', async () => {
    const mockAddNft = jest.fn();
    await withController(
      { options: { addNft: mockAddNft } },
      async ({ controller, triggerPreferencesStateChange }) => {
        const selectedAddress = '0x1';
        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          selectedAddress,
          useNftDetection: true,
        });
        // Wait for detect call triggered by preferences state change to settle
        await advanceTime({
          clock,
          duration: 1,
        });
        mockAddNft.mockReset();

        await controller.detectNfts();

        expect(mockAddNft).toHaveBeenCalledWith(
          '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
          '2574',
          {
            nftMetadata: {
              description: 'Description 2574',
              image: 'image/2574.png',
              name: 'ID 2574',
              standard: 'ERC721',
              imageOriginal: 'imageOriginal/2574.png',
            },
            userAddress: selectedAddress,
            source: Source.Detected,
            networkClientId: undefined,
          },
        );
      },
    );
  });

  it('should detect and add NFTs by networkClientId correctly', async () => {
    const mockAddNft = jest.fn();
    await withController(
      { options: { addNft: mockAddNft } },
      async ({ controller, triggerPreferencesStateChange }) => {
        const selectedAddress = '0x1';
        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          selectedAddress,
          useNftDetection: true,
        });
        // Wait for detect call triggered by preferences state change to settle
        await advanceTime({
          clock,
          duration: 1,
        });
        mockAddNft.mockReset();

        await controller.detectNfts({
          networkClientId: 'mainnet',
          userAddress: '0x9',
        });

        expect(mockAddNft).toHaveBeenCalledWith(
          '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
          '2574',
          {
            nftMetadata: {
              description: 'Description 2574',
              image: 'image/2574.png',
              name: 'ID 2574',
              standard: 'ERC721',
              imageOriginal: 'imageOriginal/2574.png',
            },
            userAddress: '0x9',
            source: Source.Detected,
            networkClientId: 'mainnet',
          },
        );
      },
    );
  });

  it('should not autodetect NFTs that exist in the ignoreList', async () => {
    const mockAddNft = jest.fn();
    const mockGetNftState = jest.fn().mockImplementation(() => {
      return {
        ...getDefaultNftState(),
        ignoredNfts: [
          // This address and token ID are always detected, as determined by
          // the nock mocks setup in `beforeEach`
          // TODO: Migrate nock setup into individual tests
          {
            address: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
            tokenId: '2574',
          },
        ],
      };
    });
    await withController(
      { options: { addNft: mockAddNft, getNftState: mockGetNftState } },
      async ({ controller, triggerPreferencesStateChange }) => {
        const selectedAddress = '0x9';
        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          selectedAddress,
          useNftDetection: true,
        });
        // Wait for detect call triggered by preferences state change to settle
        await advanceTime({
          clock,
          duration: 1,
        });
        mockAddNft.mockReset();

        await controller.detectNfts();

        expect(mockAddNft).not.toHaveBeenCalled();
      },
    );
  });

  it('should not detect and add NFTs if there is no selectedAddress', async () => {
    const mockAddNft = jest.fn();
    await withController(
      { options: { addNft: mockAddNft } },
      async ({ controller }) => {
        // confirm that default selected address is an empty string
        expect(controller.config.selectedAddress).toBe('');

        await controller.detectNfts();

        expect(mockAddNft).not.toHaveBeenCalled();
      },
    );
  });

  it('should not detect and add NFTs if preferences controller useNftDetection is set to false', async () => {
    const mockAddNft = jest.fn();
    await withController(
      { options: { addNft: mockAddNft } },
      async ({ controller, triggerPreferencesStateChange }) => {
        const selectedAddress = '0x9';
        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          selectedAddress,
          useNftDetection: false,
        });
        // Wait for detect call triggered by preferences state change to settle
        await advanceTime({
          clock,
          duration: 1,
        });
        mockAddNft.mockReset();

        await controller.detectNfts();

        expect(mockAddNft).not.toHaveBeenCalled();
      },
    );
  });

  it('should do nothing when the request to Nft API fails', async () => {
    const selectedAddress = '0x3';
    nock(RESERVOIR_API_BASE_URL)
      .get(`/${selectedAddress}/tokens`)
      .query({ continuation: '', limit: '200', chainIds: '1' })
      .replyWithError(new Error('Failed to fetch'))
      .persist();
    const mockAddNft = jest.fn();
    await withController(
      { options: { addNft: mockAddNft } },
      async ({ controller, triggerPreferencesStateChange }) => {
        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          selectedAddress,
          useNftDetection: true,
        });
        // Wait for detect call triggered by preferences state change to settle
        await advanceTime({
          clock,
          duration: 1,
        });
        mockAddNft.mockReset();

        await controller.detectNfts();

        expect(mockAddNft).not.toHaveBeenCalled();
      },
    );
  });

  it('should rethrow error when Nft APi server fails with error other than fetch failure', async () => {
    const selectedAddress = '0x4';
    await withController(
      async ({ controller, triggerPreferencesStateChange }) => {
        // This mock is for the initial detect call after preferences change
        nock(RESERVOIR_API_BASE_URL)
          .get(`/${selectedAddress}/tokens`)
          .query({ continuation: '', limit: '200', chainIds: '1' })
          .reply(200, {
            tokens: [],
          });
        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          selectedAddress,
          useNftDetection: true,
        });
        // Wait for detect call triggered by preferences state change to settle
        await advanceTime({
          clock,
          duration: 1,
        });
        // This mock is for the call under test
        nock(RESERVOIR_API_BASE_URL)
          .get(`/${selectedAddress}/tokens`)
          .query({ continuation: '', limit: '200', chainIds: '1' })
          .replyWithError(new Error('UNEXPECTED ERROR'));

        await expect(() => controller.detectNfts()).rejects.toThrow(
          'UNEXPECTED ERROR',
        );
      },
    );
  });

  it('should rethrow error when attempt to add NFT fails', async () => {
    const mockAddNft = jest.fn();
    await withController(
      { options: { addNft: mockAddNft } },
      async ({ controller, triggerPreferencesStateChange }) => {
        const selectedAddress = '0x1';
        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          selectedAddress,
          useNftDetection: true,
        });
        // Wait for detect call triggered by preferences state change to settle
        await advanceTime({
          clock,
          duration: 1,
        });
        mockAddNft.mockReset();
        mockAddNft.mockRejectedValueOnce(new Error('UNEXPECTED ERROR'));

        await expect(async () => await controller.detectNfts()).rejects.toThrow(
          'UNEXPECTED ERROR',
        );
      },
    );
  });

  it('should only re-detect when relevant settings change', async () => {
    await withController(
      {},
      async ({ controller, triggerPreferencesStateChange }) => {
        const detectNfts = sinon.stub(controller, 'detectNfts');

        // Repeated preference changes should only trigger 1 detection
        for (let i = 0; i < 5; i++) {
          triggerPreferencesStateChange({
            ...getDefaultPreferencesState(),
            useNftDetection: true,
          });
        }
        await advanceTime({ clock, duration: 1 });
        expect(detectNfts.callCount).toBe(1);

        // Irrelevant preference changes shouldn't trigger a detection
        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
          securityAlertsEnabled: true,
        });
        await advanceTime({ clock, duration: 1 });
        expect(detectNfts.callCount).toBe(1);
      },
    );
  });
});

type WithControllerCallback<ReturnValue> = ({
  controller,
}: {
  controller: NftDetectionController;
  triggerNftStateChange: (state: NftState) => void;
  triggerPreferencesStateChange: (state: PreferencesState) => void;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<ConstructorParameters<typeof NftDetectionController>[0]>;
  config?: Partial<NftDetectionConfig>;
};

type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [WithControllerOptions, WithControllerCallback<ReturnValue>];

/**
 * Builds a controller based on the given options, and calls the given function
 * with that controller.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag accepts controller options and config; the function
 * will be called with the built controller.
 * @returns Whatever the callback returns.
 */
async function withController<ReturnValue>(
  ...args: WithControllerArgs<ReturnValue>
): Promise<ReturnValue> {
  const [{ ...rest }, fn] = args.length === 2 ? args : [{}, args[0]];
  const { options, config } = rest;

  const getNetworkClientById = jest.fn().mockImplementation(() => {
    return {
      configuration: {
        chainId: ChainId.mainnet,
      },
      provider: jest.fn(),
      blockTracker: jest.fn(),
      destroy: jest.fn(),
    };
  });

  const nftStateChangeListeners: ((state: NftState) => void)[] = [];
  const preferencesStateChangeListeners: ((state: PreferencesState) => void)[] =
    [];
  const controller = new NftDetectionController(
    {
      chainId: ChainId.mainnet,
      onNftsStateChange: (listener) => {
        nftStateChangeListeners.push(listener);
      },
      onPreferencesStateChange: (listener) => {
        preferencesStateChangeListeners.push(listener);
      },
      onNetworkStateChange: jest.fn(),
      getOpenSeaApiKey: jest.fn(),
      addNft: jest.fn(),
      getNftApi: jest.fn(),
      getNetworkClientById,
      getNftState: getDefaultNftState,
      ...options,
    },
    config,
  );
  try {
    return await fn({
      controller,
      triggerNftStateChange: (state: NftState) => {
        for (const listener of nftStateChangeListeners) {
          listener(state);
        }
      },
      triggerPreferencesStateChange: (state: PreferencesState) => {
        for (const listener of preferencesStateChangeListeners) {
          listener(state);
        }
      },
    });
  } finally {
    controller.stop();
    controller.stopAllPolling();
  }
}
