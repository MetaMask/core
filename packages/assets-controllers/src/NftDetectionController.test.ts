import { NFT_API_BASE_URL, ChainId, toHex } from '@metamask/controller-utils';
import {
  NetworkClientType,
  defaultState as defaultNetworkState,
} from '@metamask/network-controller';
import type {
  NetworkClient,
  NetworkClientConfiguration,
  NetworkClientId,
  NetworkState,
} from '@metamask/network-controller';
import {
  getDefaultPreferencesState,
  type PreferencesState,
} from '@metamask/preferences-controller';
import nock from 'nock';
import * as sinon from 'sinon';

import { FakeBlockTracker } from '../../../tests/fake-block-tracker';
import { FakeProvider } from '../../../tests/fake-provider';
import { advanceTime } from '../../../tests/helpers';
import {
  buildCustomNetworkClientConfiguration,
  buildMockGetNetworkClientById,
} from '../../network-controller/tests/helpers';
import { Source } from './constants';
import { getDefaultNftState, type NftState } from './NftController';
import {
  type NftDetectionConfig,
  NftDetectionController,
  BlockaidResultType,
} from './NftDetectionController';

const DEFAULT_INTERVAL = 180000;

describe('NftDetectionController', () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(async () => {
    clock = sinon.useFakeTimers();

    nock(NFT_API_BASE_URL)
      .persist()
      .get(
        `/users/0x1/tokens?chainIds=1&limit=50&includeTopBid=true&continuation=`,
      )
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
      .get(
        `/users/0x9/tokens?chainIds=1&limit=50&includeTopBid=true&continuation=`,
      )
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
      })
      .get(
        `/users/0x123/tokens?chainIds=1&limit=50&includeTopBid=true&continuation=`,
      )
      .reply(200, {
        tokens: [
          {
            token: {
              contract: '0xtest1',
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
            blockaidResult: {
              result_type: BlockaidResultType.Benign,
            },
          },
          {
            token: {
              contract: '0xtest2',
              kind: 'erc721',
              name: 'ID 2575',
              description: 'Description 2575',
              image: 'image/2575.png',
              tokenId: '2575',
              metadata: {
                imageOriginal: 'imageOriginal/2575.png',
                imageMimeType: 'image/png',
                tokenURI: 'tokenURITest',
              },
              isSpam: false,
            },
            blockaidResult: {
              result_type: BlockaidResultType.Benign,
            },
          },
        ],
      })
      .get(
        `/users/0x12345/tokens?chainIds=1&limit=50&includeTopBid=true&continuation=`,
      )
      .reply(200, {
        tokens: [
          {
            token: {
              contract: '0xtestCollection1',
              kind: 'erc721',
              name: 'ID 1',
              description: 'Description 1',
              image: 'image/1.png',
              tokenId: '1',
              metadata: {
                imageOriginal: 'imageOriginal/1.png',
                imageMimeType: 'image/png',
                tokenURI: 'tokenURITest',
              },
              isSpam: false,
            },
            blockaidResult: {
              result_type: BlockaidResultType.Benign,
            },
          },
          {
            token: {
              contract: '0xtestCollection2',
              kind: 'erc721',
              name: 'ID 2',
              description: 'Description 2',
              image: 'image/2.png',
              tokenId: '2',
              metadata: {
                imageOriginal: 'imageOriginal/2.png',
                imageMimeType: 'image/png',
                tokenURI: 'tokenURITest',
              },
              isSpam: false,
            },
          },
          {
            token: {
              contract: '0xtestCollection3',
              kind: 'erc721',
              name: 'ID 3',
              description: 'Description 3',
              image: 'image/3.png',
              tokenId: '3',
              metadata: {
                imageOriginal: 'imageOriginal/3.png',
                imageMimeType: 'image/png',
                tokenURI: 'tokenURITest',
              },
              isSpam: false,
            },
            blockaidResult: {
              result_type: BlockaidResultType.Malicious,
            },
          },
          {
            token: {
              contract: '0xtestCollection4',
              kind: 'erc721',
              name: 'ID 4',
              description: 'Description 4',
              image: 'image/4.png',
              tokenId: '4',
              metadata: {
                imageOriginal: 'imageOriginal/4.png',
                imageMimeType: 'image/png',
                tokenURI: 'tokenURITest',
              },
              isSpam: true,
            },
            blockaidResult: {
              result_type: BlockaidResultType.Benign,
            },
          },
          {
            token: {
              contract: '0xtestCollection5',
              kind: 'erc721',
              name: 'ID 5',
              description: 'Description 5',
              image: 'image/5.png',
              tokenId: '5',
              metadata: {
                imageOriginal: 'imageOriginal/5.png',
                imageMimeType: 'image/png',
                tokenURI: 'tokenURITest',
              },
              isSpam: true,
            },
            blockaidResult: {
              result_type: BlockaidResultType.Malicious,
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
      async ({ controller, controllerEvents }) => {
        const mockNfts = sinon
          .stub(controller, 'detectNfts')
          .returns(Promise.resolve());
        controllerEvents.preferencesStateChange({
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

  it('should not rely on the currently selected chain to poll for NFTs when a specific chain is being targeted for polling', async () => {
    await withController(
      {
        mockNetworkClientConfigurationsByNetworkClientId: {
          'AAAA-AAAA-AAAA-AAAA': buildCustomNetworkClientConfiguration({
            chainId: '0x1337',
          }),
        },
      },
      async ({ controller, controllerEvents }) => {
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

        controllerEvents.networkStateChange({
          ...defaultNetworkState,
          selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
        });
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
          [
            {
              networkClientId: 'mainnet',
              userAddress: '0x1',
            },
          ],
        ]);
      },
    );
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

  it('should respond to chain ID changing when using legacy polling', async () => {
    const mockAddNft = jest.fn();
    const pollingInterval = 100;

    await withController(
      {
        config: {
          interval: pollingInterval,
        },
        options: {
          addNft: mockAddNft,
          chainId: '0x1',
          disabled: false,
          selectedAddress: '0x1',
        },
        mockNetworkClientConfigurationsByNetworkClientId: {
          'AAAA-AAAA-AAAA-AAAA': buildCustomNetworkClientConfiguration({
            chainId: '0x123',
          }),
        },
      },
      async ({ controller, controllerEvents }) => {
        await controller.start();
        // await clock.tickAsync(pollingInterval);

        expect(mockAddNft).toHaveBeenNthCalledWith(
          1,
          '0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc',
          '2577',
          {
            nftMetadata: {
              description:
                "Redacted Remilio Babies is a collection of 10,000 neochibi pfpNFT's expanding the Milady Maker paradigm with the introduction of young J.I.T. energy and schizophrenic reactionary aesthetics. We are #REMILIONAIREs.",
              image: 'https://imgtest',
              imageOriginal: 'https://remilio.org/remilio/632.png',
              imageThumbnail: 'https://imgSmall',
              name: 'Remilio 632',
              rarityRank: 8872,
              rarityScore: 343.443,
              standard: 'ERC721',
            },
            userAddress: '0x1',
            source: Source.Detected,
          },
        );
        expect(mockAddNft).toHaveBeenNthCalledWith(
          2,
          '0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d',
          '2578',
          {
            nftMetadata: {
              description: 'Description 2578',
              image: 'https://imgtest',
              imageOriginal: 'https://remilio.org/remilio/632.png',
              imageThumbnail: 'https://imgSmall',
              name: 'ID 2578',
              rarityRank: 8872,
              rarityScore: 343.443,
              standard: 'ERC721',
            },
            userAddress: '0x1',
            source: Source.Detected,
          },
        );
        expect(mockAddNft).toHaveBeenNthCalledWith(
          3,
          '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
          '2574',
          {
            nftMetadata: {
              description: 'Description 2574',
              image: 'image/2574.png',
              imageOriginal: 'imageOriginal/2574.png',
              name: 'ID 2574',
              standard: 'ERC721',
            },
            userAddress: '0x1',
            source: Source.Detected,
          },
        );

        controllerEvents.networkStateChange({
          ...defaultNetworkState,
          selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
        });
        await clock.tickAsync(pollingInterval);

        // Not 6 times, which is what would happen if detectNfts were called
        // again
        expect(mockAddNft).toHaveBeenCalledTimes(3);
      },
    );
  });

  it('should detect and add NFTs correctly when blockaid result is not included in response', async () => {
    const mockAddNft = jest.fn();
    await withController(
      { options: { addNft: mockAddNft } },
      async ({ controller, controllerEvents }) => {
        const selectedAddress = '0x1';
        controllerEvents.preferencesStateChange({
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

  it('should detect and add NFTs correctly when blockaid result is in response', async () => {
    const mockAddNft = jest.fn();
    await withController(
      { options: { addNft: mockAddNft } },
      async ({ controller, controllerEvents }) => {
        const selectedAddress = '0x123';
        controllerEvents.preferencesStateChange({
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

        // Expect to be called twice
        expect(mockAddNft).toHaveBeenNthCalledWith(1, '0xtest1', '2574', {
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
        });
        expect(mockAddNft).toHaveBeenNthCalledWith(2, '0xtest2', '2575', {
          nftMetadata: {
            description: 'Description 2575',
            image: 'image/2575.png',
            name: 'ID 2575',
            standard: 'ERC721',
            imageOriginal: 'imageOriginal/2575.png',
          },
          userAddress: selectedAddress,
          source: Source.Detected,
          networkClientId: undefined,
        });
      },
    );
  });

  it('should detect and add NFTs and filter them correctly', async () => {
    const mockAddNft = jest.fn();
    await withController(
      { options: { addNft: mockAddNft } },
      async ({ controller, controllerEvents }) => {
        const selectedAddress = '0x12345';
        controllerEvents.preferencesStateChange({
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

        expect(mockAddNft).toHaveBeenCalledTimes(2);
        // In this test we mocked that reservoir returned 5 NFTs
        // the only NFTs we want to add are when isSpam=== false and (either no blockaid result returned or blockaid says "Benign")
        expect(mockAddNft).toHaveBeenNthCalledWith(
          1,
          '0xtestCollection1',
          '1',
          {
            nftMetadata: {
              description: 'Description 1',
              image: 'image/1.png',
              name: 'ID 1',
              standard: 'ERC721',
              imageOriginal: 'imageOriginal/1.png',
            },
            userAddress: selectedAddress,
            source: Source.Detected,
            networkClientId: undefined,
          },
        );
        expect(mockAddNft).toHaveBeenNthCalledWith(
          2,
          '0xtestCollection2',
          '2',
          {
            nftMetadata: {
              description: 'Description 2',
              image: 'image/2.png',
              name: 'ID 2',
              standard: 'ERC721',
              imageOriginal: 'imageOriginal/2.png',
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
      async ({ controller, controllerEvents }) => {
        const selectedAddress = '0x1';
        controllerEvents.preferencesStateChange({
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
      async ({ controller, controllerEvents }) => {
        const selectedAddress = '0x9';
        controllerEvents.preferencesStateChange({
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
      async ({ controller, controllerEvents }) => {
        const selectedAddress = ''; // Emtpy selected address
        controllerEvents.preferencesStateChange({
          ...getDefaultPreferencesState(),
          selectedAddress,
          useNftDetection: true, // auto-detect is enabled so it proceeds to check userAddress
        });

        // confirm that default selected address is an empty string
        expect(controller.config.selectedAddress).toBe('');

        await controller.detectNfts();

        expect(mockAddNft).not.toHaveBeenCalled();
      },
    );
  });

  it('should return true if mainnet is detected', async () => {
    const mockAddNft = jest.fn();
    const mockNetworkClient: NetworkClient = {
      configuration: {
        chainId: toHex(1),
        rpcUrl: 'https://test.network',
        ticker: 'TEST',
        type: NetworkClientType.Custom,
      },
      provider: new FakeProvider(),
      blockTracker: new FakeBlockTracker(),
      destroy: () => {
        // do nothing
      },
    };
    await withController(
      { options: { addNft: mockAddNft } },
      async ({ controller }) => {
        const result = controller.isMainnetByNetworkClientId(mockNetworkClient);
        expect(result).toBe(true);
      },
    );
  });

  it('should not detectNfts when disabled is false and useNftDetection is true', async () => {
    await withController(
      { config: { interval: 10 }, options: { disabled: false } },
      async ({ controller, controllerEvents }) => {
        const mockNfts = sinon.stub(controller, 'detectNfts');
        controllerEvents.preferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
        });
        // Wait for detect call triggered by preferences state change to settle
        await advanceTime({
          clock,
          duration: 1,
        });

        expect(mockNfts.calledOnce).toBe(false);

        await advanceTime({
          clock,
          duration: 10,
        });

        expect(mockNfts.calledTwice).toBe(false);
      },
    );
  });

  it('should not detect and add NFTs if preferences controller useNftDetection is set to false', async () => {
    const mockAddNft = jest.fn();
    await withController(
      { options: { addNft: mockAddNft } },
      async ({ controller, controllerEvents }) => {
        const selectedAddress = '0x9';
        controllerEvents.preferencesStateChange({
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
    nock(NFT_API_BASE_URL)
      .get(`/users/${selectedAddress}/tokens`)
      .query({
        continuation: '',
        limit: '50',
        chainIds: '1',
        includeTopBid: true,
      })
      .replyWithError(new Error('Failed to fetch'))
      .persist();
    const mockAddNft = jest.fn();
    await withController(
      { options: { addNft: mockAddNft } },
      async ({ controller, controllerEvents }) => {
        controllerEvents.preferencesStateChange({
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
    await withController(async ({ controller, controllerEvents }) => {
      // This mock is for the initial detect call after preferences change
      nock(NFT_API_BASE_URL)
        .get(`/users/${selectedAddress}/tokens`)
        .query({
          continuation: '',
          limit: '50',
          chainIds: '1',
          includeTopBid: true,
        })
        .reply(200, {
          tokens: [],
        });
      controllerEvents.preferencesStateChange({
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
      nock(NFT_API_BASE_URL)
        .get(`/users/${selectedAddress}/tokens`)
        .query({
          continuation: '',
          limit: '50',
          chainIds: '1',
          includeTopBid: true,
        })
        .replyWithError(new Error('UNEXPECTED ERROR'));

      await expect(() => controller.detectNfts()).rejects.toThrow(
        'UNEXPECTED ERROR',
      );
    });
  });

  it('should rethrow error when attempt to add NFT fails', async () => {
    const mockAddNft = jest.fn();
    await withController(
      { options: { addNft: mockAddNft } },
      async ({ controller, controllerEvents }) => {
        const selectedAddress = '0x1';
        controllerEvents.preferencesStateChange({
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
    await withController({}, async ({ controller, controllerEvents }) => {
      const detectNfts = sinon.stub(controller, 'detectNfts');

      // Repeated preference changes should only trigger 1 detection
      for (let i = 0; i < 5; i++) {
        controllerEvents.preferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
        });
      }
      await advanceTime({ clock, duration: 1 });
      expect(detectNfts.callCount).toBe(1);

      // Irrelevant preference changes shouldn't trigger a detection
      controllerEvents.preferencesStateChange({
        ...getDefaultPreferencesState(),
        useNftDetection: true,
        securityAlertsEnabled: true,
      });
      await advanceTime({ clock, duration: 1 });
      expect(detectNfts.callCount).toBe(1);
    });
  });
});

/**
 * A collection of mock external controller events.
 */
type ControllerEvents = {
  nftsStateChange: (state: NftState) => void;
  preferencesStateChange: (state: PreferencesState) => void;
  networkStateChange: (state: NetworkState) => void;
};

type WithControllerCallback<ReturnValue> = ({
  controller,
}: {
  controller: NftDetectionController;
  controllerEvents: ControllerEvents;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<ConstructorParameters<typeof NftDetectionController>[0]>;
  config?: Partial<NftDetectionConfig>;
  mockNetworkClientConfigurationsByNetworkClientId?: Record<
    NetworkClientId,
    NetworkClientConfiguration
  >;
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
  const [
    {
      options = {},
      config = {},
      mockNetworkClientConfigurationsByNetworkClientId = {},
    },
    testFunction,
  ] = args.length === 2 ? args : [{}, args[0]];

  // Explicit cast used here because we know the `on____` functions are always
  // set in the constructor.
  const controllerEvents = {} as ControllerEvents;

  const getNetworkClientById = buildMockGetNetworkClientById(
    mockNetworkClientConfigurationsByNetworkClientId,
  );

  const controller = new NftDetectionController(
    {
      chainId: ChainId.mainnet,
      onNftsStateChange: (listener) => {
        controllerEvents.nftsStateChange = listener;
      },
      onPreferencesStateChange: (listener) => {
        controllerEvents.preferencesStateChange = listener;
      },
      onNetworkStateChange: (listener) => {
        controllerEvents.networkStateChange = listener;
      },
      getOpenSeaApiKey: jest.fn(),
      addNft: jest.fn(),
      getNftApi: jest.fn(),
      getNetworkClientById,
      getNftState: getDefaultNftState,
      disabled: true,
      selectedAddress: '',
      ...options,
    },
    config,
  );
  try {
    return await testFunction({
      controller,
      controllerEvents,
    });
  } finally {
    controller.stop();
    controller.stopAllPolling();
  }
}
