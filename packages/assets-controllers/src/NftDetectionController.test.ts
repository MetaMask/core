import type { AccountsController } from '@metamask/accounts-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import {
  NFT_API_BASE_URL,
  ChainId,
  InfuraNetworkType,
} from '@metamask/controller-utils';
import {
  getDefaultNetworkControllerState,
  NetworkClientType,
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
import { createMockInternalAccount } from '../../accounts-controller/src/tests/mocks';
import { buildMockGetNetworkClientById } from '../../network-controller/tests/helpers';
import { Source } from './constants';
import { getDefaultNftControllerState } from './NftController';
import {
  NftDetectionController,
  BlockaidResultType,
  MAX_GET_COLLECTION_BATCH_SIZE,
  type AllowedActions,
  type AllowedEvents,
} from './NftDetectionController';
import * as constants from './NftDetectionController';

const controllerName = 'NftDetectionController' as const;

const defaultSelectedAccount = createMockInternalAccount();

describe('NftDetectionController', () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(async () => {
    clock = sinon.useFakeTimers();

    nock(NFT_API_BASE_URL)
      .persist()
      .get(
        `/users/0x1/tokens?chainIds=1&limit=50&includeTopBid=true&collection=0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc&collection=0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d&collection=0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD&continuation=`,
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
        `/users/0x9/tokens?chainIds=1&limit=50&includeTopBid=true&collection=0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD&continuation=`,
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
        `/users/0x123/tokens?chainIds=1&limit=50&includeTopBid=true&collection=0xtest1&collection=0xtest2&continuation=`,
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
              collection: {
                openseaVerificationStatus: 'verified',
                id: '0xtest1',
              },
            },
            blockaidResult: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
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
              collection: {
                openseaVerificationStatus: 'verified',
                id: '0xtest2',
              },
            },
            blockaidResult: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
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
              collection: {
                id: '0xtestCollection1',
              },
            },
            blockaidResult: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
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
              collection: {
                id: '0xtestCollection2',
              },
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
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
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
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
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
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              result_type: BlockaidResultType.Malicious,
            },
          },
        ],
      })
      .get(
        `/users/Oxuser/collections?chainId=1&limit=20&includeTopBid=true&offset=0`,
      )
      .reply(200, {
        collections: [
          {
            collection: {
              id: '0xtest1',
              slug: '',
              name: '',
              image: null,
              isSpam: false,
              tokenCount: '2',
              primaryContract: '0xtest1',
              rank: {
                '1day': null,
                '7day': null,
                '30day': null,
                allTime: null,
              },
              volume: {
                '1day': 0,
                '7day': 0,
                '30day': 0,
                allTime: 0,
              },
              volumeChange: {
                '1day': null,
                '7day': null,
                '30day': null,
              },
              floorSale: {
                '1day': null,
                '7day': null,
                '30day': null,
              },
              contractKind: 'erc721',
            },
            ownership: {
              tokenCount: '1',
              totalValue: 0,
            },
          },
          {
            collection: {
              id: '0xtest2',
              slug: '',
              name: '',
              image: null,
              isSpam: false,
              tokenCount: '2',
              primaryContract: '0xtest2',
              rank: {
                '1day': null,
                '7day': null,
                '30day': null,
                allTime: null,
              },
              volume: {
                '1day': 0,
                '7day': 0,
                '30day': 0,
                allTime: 0,
              },
              volumeChange: {
                '1day': null,
                '7day': null,
                '30day': null,
              },
              floorSale: {
                '1day': null,
                '7day': null,
                '30day': null,
              },
              contractKind: 'erc721',
            },
            ownership: {
              tokenCount: '1',
              totalValue: 0,
            },
          },
        ],
      })
      .get(
        `/users/Oxuser/collections?chainId=1&limit=20&includeTopBid=true&offset=20`,
      )
      .reply(200, {
        collections: [],
      })
      .get(`/collections?contract=0xtest1&contract=0xtest2&chainId=1`)
      .reply(200, {
        collections: [],
      });
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();
  });

  it('should call detect NFTs on mainnet', async () => {
    const mockGetSelectedAccount = jest
      .fn()
      .mockReturnValue(defaultSelectedAccount);
    await withController(
      {
        options: {},
        mockGetSelectedAccount,
      },
      async ({ controller, controllerEvents }) => {
        const mockNfts = sinon
          .stub(controller, 'detectNfts')
          .returns(Promise.resolve());
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
        });

        // call detectNfts
        await controller.detectNfts();
        expect(mockNfts.calledOnce).toBe(true);

        await advanceTime({
          clock,
          duration: 10,
        });

        expect(mockNfts.calledTwice).toBe(false);
      },
    );
  });

  it('should call detect NFTs by networkClientId on mainnet', async () => {
    await withController(async ({ controller }) => {
      const spy = jest
        .spyOn(controller, 'detectNfts')
        .mockImplementation(() => {
          return Promise.resolve();
        });

      // call detectNfts
      await controller.detectNfts({
        networkClientId: 'mainnet',
        userAddress: '0x1',
      });

      expect(spy.mock.calls).toMatchObject([
        [
          {
            networkClientId: 'mainnet',
            userAddress: '0x1',
          },
        ],
      ]);
    });
  });

  it('should detect mainnet truthy', async () => {
    await withController(
      {
        mockNetworkState: {
          selectedNetworkClientId: 'mainnet',
        },
        mockPreferencesState: {
          selectedAddress: '',
        },
      },
      ({ controller }) => {
        expect(controller.isMainnet()).toBe(true);
      },
    );
  });

  it('should detect NFTs on Linea mainnet', async () => {
    const selectedAddress = '0x1';
    const selectedAccount = createMockInternalAccount({
      address: selectedAddress,
    });
    const mockGetSelectedAccount = jest.fn().mockReturnValue(selectedAccount);

    await withController(
      {
        mockNetworkState: {
          selectedNetworkClientId: InfuraNetworkType['linea-mainnet'],
        },
        mockGetSelectedAccount,
      },
      async ({ controller, controllerEvents }) => {
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
          selectedAddress,
        });
        // nock
        const mockApiCallUserCollections = nock(NFT_API_BASE_URL)
          .get(`/users/${selectedAddress}/collections`)
          .query({
            chainId: '59144',
            limit: '20',
            includeTopBid: true,
            offset: '0',
          })
          .reply(200, {
            collections: [
              {
                collection: {
                  id: '0x8bec24c57d944779417ab93c6e745ccf56e47225',
                  slug: '',
                  name: '',
                  image: null,
                  isSpam: false,
                  tokenCount: '2',
                  primaryContract: '0x8bec24c57d944779417ab93c6e745ccf56e47225',
                  tokenSetId:
                    'contract:0x8bec24c57d944779417ab93c6e745ccf56e47225',
                  rank: {
                    '1day': null,
                    '7day': null,
                    '30day': null,
                    allTime: null,
                  },
                  volume: {
                    '1day': 0,
                    '7day': 0,
                    '30day': 0,
                    allTime: 0,
                  },
                  volumeChange: {
                    '1day': null,
                    '7day': null,
                    '30day': null,
                  },
                  floorSale: {
                    '1day': null,
                    '7day': null,
                    '30day': null,
                  },
                  contractKind: 'erc721',
                },
                ownership: {
                  tokenCount: '1',
                  totalValue: 0,
                },
              },
            ],
          });
        const mockApiCallUserCollections2 = nock(NFT_API_BASE_URL)
          .get(`/users/${selectedAddress}/collections`)
          .query({
            chainId: '59144',
            limit: '20',
            includeTopBid: true,
            offset: '20',
          })
          .reply(200, {
            collections: [],
          });

        const mockApiCallCollections = nock(NFT_API_BASE_URL)
          .get(`/collections`)
          .query({
            chainId: '59144',
            contract: '0x8bec24c57d944779417ab93c6e745ccf56e47225',
          })
          .reply(200, {
            collections: [
              {
                collection: {
                  id: '0x8bec24c57d944779417ab93c6e745ccf56e47225',
                  slug: '',
                  name: '',
                  image: null,
                  isSpam: false,
                  tokenCount: '2',
                  primaryContract: '0x8bec24c57d944779417ab93c6e745ccf56e47225',
                  tokenSetId:
                    'contract:0x8bec24c57d944779417ab93c6e745ccf56e47225',
                  rank: {
                    '1day': null,
                    '7day': null,
                    '30day': null,
                    allTime: null,
                  },
                  volume: {
                    '1day': 0,
                    '7day': 0,
                    '30day': 0,
                    allTime: 0,
                  },
                  volumeChange: {
                    '1day': null,
                    '7day': null,
                    '30day': null,
                  },
                  floorSale: {
                    '1day': null,
                    '7day': null,
                    '30day': null,
                  },
                  contractKind: 'erc721',
                },
                ownership: {
                  tokenCount: '1',
                  totalValue: 0,
                },
              },
            ],
          });

        const mockApiCall = nock(NFT_API_BASE_URL)
          .get(`/users/${selectedAddress}/tokens`)
          .query({
            continuation: '',
            limit: '50',
            chainIds: '59144',
            includeTopBid: true,
            collection: '0x8bec24c57d944779417ab93c6e745ccf56e47225',
          })
          .reply(200, {
            tokens: [],
          });

        // call detectNfts
        await controller.detectNfts();

        expect(mockApiCall.isDone()).toBe(true);
        expect(mockApiCallUserCollections.isDone()).toBe(true);
        expect(mockApiCallUserCollections2.isDone()).toBe(true);
        expect(mockApiCallCollections.isDone()).toBe(true);
      },
    );
  });

  it('should detect mainnet falsy', async () => {
    await withController(
      {
        mockNetworkState: {
          selectedNetworkClientId: 'goerli',
        },
        mockPreferencesState: {
          selectedAddress: '',
        },
      },
      ({ controller }) => {
        expect(controller.isMainnet()).toBe(false);
      },
    );
  });

  it('should return when detectNfts is called on a not supported network for detection', async () => {
    const selectedAddress = '0x1';
    const selectedAccount = createMockInternalAccount({
      address: selectedAddress,
    });
    const mockGetSelectedAccount = jest.fn().mockReturnValue(selectedAccount);
    await withController(
      {
        mockNetworkState: {
          selectedNetworkClientId: 'goerli',
        },
        mockPreferencesState: {},
        mockGetSelectedAccount,
      },
      async ({ controller }) => {
        const mockNfts = sinon.stub(controller, 'detectNfts');

        // nock
        const mockApiCall = nock(NFT_API_BASE_URL)
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

        // call detectNfts
        await controller.detectNfts({
          networkClientId: 'goerli',
          userAddress: selectedAddress,
        });

        expect(mockNfts.called).toBe(true);
        expect(mockApiCall.isDone()).toBe(false);
      },
    );
  });

  describe('getCollections', () => {
    it('should not call getCollections api when collection ids do not match contract address', async () => {
      const mockAddNft = jest.fn();
      const selectedAddress = 'Oxuser';
      const selectedAccount = createMockInternalAccount({
        address: selectedAddress,
      });
      const mockGetSelectedAccount = jest.fn().mockReturnValue(selectedAccount);
      await withController(
        {
          options: { addNft: mockAddNft },
          mockPreferencesState: {},
          mockGetSelectedAccount,
        },
        async ({ controller, controllerEvents }) => {
          controllerEvents.triggerPreferencesStateChange({
            ...getDefaultPreferencesState(),
            useNftDetection: true,
          });
          // Wait for detect call triggered by preferences state change to settle
          await advanceTime({
            clock,
            duration: 1,
          });
          mockAddNft.mockReset();
          nock(NFT_API_BASE_URL)
            .get(
              `/users/${selectedAddress}/tokens?chainIds=1&limit=50&includeTopBid=true&collection=0xtest1&collection=0xtest2&continuation=`,
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
                    collection: {
                      id: '0xtestCollection1:1223',
                    },
                  },
                  blockaidResult: {
                    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    result_type: BlockaidResultType.Benign,
                  },
                },
                {
                  token: {
                    contract: '0xtestCollection1',
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
                    collection: {
                      id: '0xtestCollection1:34567',
                    },
                  },
                },
              ],
            });

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
                collection: {
                  id: '0xtestCollection1:1223',
                },
              },
              userAddress: selectedAccount.address,
              source: Source.Detected,
              networkClientId: undefined,
            },
          );
          expect(mockAddNft).toHaveBeenNthCalledWith(
            2,
            '0xtestCollection1',
            '2',
            {
              nftMetadata: {
                description: 'Description 2',
                image: 'image/2.png',
                name: 'ID 2',
                standard: 'ERC721',
                imageOriginal: 'imageOriginal/2.png',
                collection: {
                  id: '0xtestCollection1:34567',
                },
              },
              userAddress: selectedAccount.address,
              source: Source.Detected,
              networkClientId: undefined,
            },
          );
        },
      );
    });
    it('should detect and add NFTs correctly when getCollections call is unsuccessful', async () => {
      const mockAddNft = jest.fn();
      const selectedAddress = '0x123';

      const selectedAccount = createMockInternalAccount({
        address: selectedAddress,
      });
      const mockGetSelectedAccount = jest.fn().mockReturnValue(selectedAccount);
      await withController(
        {
          options: { addNft: mockAddNft },
          mockPreferencesState: {},
          mockGetSelectedAccount,
        },
        async ({ controller, controllerEvents }) => {
          controllerEvents.triggerPreferencesStateChange({
            ...getDefaultPreferencesState(),
            useNftDetection: true,
          });
          // Wait for detect call triggered by preferences state change to settle
          await advanceTime({
            clock,
            duration: 1,
          });
          mockAddNft.mockReset();

          // Nock getUserNfts
          nock(NFT_API_BASE_URL)
            .get(
              `/users/${selectedAddress}/tokens?chainIds=1&limit=50&includeTopBid=true&collection=0xtest1&collection=0xtest2&continuation=`,
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
                    collection: {
                      openseaVerificationStatus: 'verified',
                      id: '0xtest1',
                    },
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
                    collection: {
                      openseaVerificationStatus: 'verified',
                      id: '0xtest2',
                    },
                  },
                },
              ],
            });

          // Nock successful getUserCollections api call
          nock(NFT_API_BASE_URL)
            .get(
              `/users/0x123/collections?chainId=1&limit=20&includeTopBid=true&offset=0`,
            )
            .reply(200, {
              collections: [
                {
                  collection: {
                    id: '0xtest1',
                    slug: '',
                    name: '',
                    image: null,
                    isSpam: false,
                    tokenCount: '2',
                    primaryContract: '0xtest1',

                    contractKind: 'erc721',
                  },
                  ownership: {
                    tokenCount: '1',
                    totalValue: 0,
                  },
                },
                {
                  collection: {
                    id: '0xtest2',
                    slug: '',
                    name: '',
                    image: null,
                    isSpam: false,
                    tokenCount: '2',
                    primaryContract: '0xtest2',

                    contractKind: 'erc721',
                  },
                  ownership: {
                    tokenCount: '1',
                    totalValue: 0,
                  },
                },
              ],
            });

          nock(NFT_API_BASE_URL)
            .get(
              `/users/0x123/collections?chainId=1&limit=20&includeTopBid=true&offset=20`,
            )
            .reply(200, {
              collections: [],
            });

          // Nock failed getCollections api call
          nock(NFT_API_BASE_URL)
            .get(`/collections?contract=0xtest1&contract=0xtest2&chainId=1`)
            .replyWithError(new Error('Failed to fetch'));

          await controller.detectNfts();

          // Expect to be called twice
          expect(mockAddNft).toHaveBeenNthCalledWith(1, '0xtest1', '2574', {
            nftMetadata: {
              description: 'Description 2574',
              image: 'image/2574.png',
              name: 'ID 2574',
              standard: 'ERC721',
              imageOriginal: 'imageOriginal/2574.png',
              collection: {
                id: '0xtest1',
                openseaVerificationStatus: 'verified',
              },
            },
            userAddress: selectedAccount.address,
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
              collection: {
                id: '0xtest2',
                openseaVerificationStatus: 'verified',
              },
            },
            userAddress: selectedAccount.address,
            source: Source.Detected,
            networkClientId: undefined,
          });
        },
      );
    });
    it('should detect and add NFTs correctly when getCollections call is successful', async () => {
      const mockAddNft = jest.fn();
      nock.cleanAll();
      const selectedAddress = '0x123';
      const selectedAccount = createMockInternalAccount({
        address: selectedAddress,
      });
      const mockGetSelectedAccount = jest.fn().mockReturnValue(selectedAccount);
      await withController(
        {
          options: { addNft: mockAddNft },
          mockPreferencesState: {},
          mockGetSelectedAccount,
        },
        async ({ controller, controllerEvents }) => {
          controllerEvents.triggerPreferencesStateChange({
            ...getDefaultPreferencesState(),
            useNftDetection: true,
          });
          // Wait for detect call triggered by preferences state change to settle
          await advanceTime({
            clock,
            duration: 1,
          });
          mockAddNft.mockReset();

          // Nock getUserNfts
          nock(NFT_API_BASE_URL)
            .get(
              `/users/${selectedAddress}/tokens?chainIds=1&limit=50&includeTopBid=true&collection=0xtest1&collection=0xtest2&continuation=`,
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
                    collection: {
                      id: '0xtest1',
                      openseaVerificationStatus: 'verified',
                    },
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
                    collection: {
                      id: '0xtest2',
                      openseaVerificationStatus: 'verified',
                    },
                  },
                },
              ],
            });

          // Nock successful getUserCollections api call
          nock(NFT_API_BASE_URL)
            .get(
              `/users/0x123/collections?chainId=1&limit=20&includeTopBid=true&offset=0`,
            )
            .reply(200, {
              collections: [
                {
                  collection: {
                    id: '0xtest1',
                    slug: '',
                    name: '',
                    image: null,
                    isSpam: false,
                    tokenCount: '2',
                    primaryContract: '0xtest1',
                    rank: {
                      '1day': null,
                      '7day': null,
                      '30day': null,
                      allTime: null,
                    },
                    volume: {
                      '1day': 0,
                      '7day': 0,
                      '30day': 0,
                      allTime: 0,
                    },
                    volumeChange: {
                      '1day': null,
                      '7day': null,
                      '30day': null,
                    },
                    floorSale: {
                      '1day': null,
                      '7day': null,
                      '30day': null,
                    },
                    contractKind: 'erc721',
                  },
                  ownership: {
                    tokenCount: '1',
                    totalValue: 0,
                  },
                },
                {
                  collection: {
                    id: '0xtest2',
                    slug: '',
                    name: '',
                    image: null,
                    isSpam: false,
                    tokenCount: '2',
                    primaryContract: '0xtest2',
                    rank: {
                      '1day': null,
                      '7day': null,
                      '30day': null,
                      allTime: null,
                    },
                    volume: {
                      '1day': 0,
                      '7day': 0,
                      '30day': 0,
                      allTime: 0,
                    },
                    volumeChange: {
                      '1day': null,
                      '7day': null,
                      '30day': null,
                    },
                    floorSale: {
                      '1day': null,
                      '7day': null,
                      '30day': null,
                    },
                    contractKind: 'erc721',
                  },
                  ownership: {
                    tokenCount: '1',
                    totalValue: 0,
                  },
                },
              ],
            });
          nock(NFT_API_BASE_URL)
            .get(
              `/users/0x123/collections?chainId=1&limit=20&includeTopBid=true&offset=20`,
            )
            .reply(200, {
              collections: [],
            });

          const testTopBid = {
            id: 'id',
            sourceDomain: 'opensea.io',
            price: {
              currency: {
                contract: '0x01',
                name: 'Wrapped Ether',
                symbol: 'WETH',
                decimals: 18,
              },
              amount: {
                raw: '201300000000000000',
                decimal: 0.2013,
                usd: 716.46131,
                native: 0.2013,
              },
              netAmount: {
                raw: '196267500000000000',
                decimal: 0.19627,
                usd: 698.54978,
                native: 0.19627,
              },
            },
            maker: 'testMaker',
            validFrom: 1719228327,
            validUntil: 1719228927,
          };

          nock(NFT_API_BASE_URL)
            .get(`/collections?contract=0xtest1&contract=0xtest2&chainId=1`)
            .reply(200, {
              collections: [
                {
                  id: '0xtest1',
                  creator: '0xcreator1',
                  openseaVerificationStatus: 'verified',
                  topBid: testTopBid,
                },
                {
                  id: '0xtest2',
                  creator: '0xcreator2',
                  openseaVerificationStatus: 'verified',
                },
              ],
            });

          await controller.detectNfts();

          // Expect to be called twice
          expect(mockAddNft).toHaveBeenNthCalledWith(1, '0xtest1', '2574', {
            nftMetadata: {
              description: 'Description 2574',
              image: 'image/2574.png',
              name: 'ID 2574',
              standard: 'ERC721',
              imageOriginal: 'imageOriginal/2574.png',
              collection: {
                id: '0xtest1',

                creator: '0xcreator1',
                openseaVerificationStatus: 'verified',

                topBid: testTopBid,
              },
            },
            userAddress: selectedAccount.address,
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
              collection: {
                id: '0xtest2',
                contractDeployedAt: undefined,
                creator: '0xcreator2',
                openseaVerificationStatus: 'verified',
                ownerCount: undefined,
                tokenCount: undefined,
              },
            },
            userAddress: selectedAccount.address,
            source: Source.Detected,
            networkClientId: undefined,
          });
        },
      );
    });
    it('should detect and add NFTs and filter them correctly', async () => {
      const mockAddNft = jest.fn();
      const selectedAddress = '0x12345';
      const selectedAccount = createMockInternalAccount({
        address: selectedAddress,
      });
      const mockGetSelectedAccount = jest.fn().mockReturnValue(selectedAccount);
      await withController(
        {
          options: { addNft: mockAddNft },
          mockPreferencesState: {},
          mockGetSelectedAccount,
        },
        async ({ controller, controllerEvents }) => {
          controllerEvents.triggerPreferencesStateChange({
            ...getDefaultPreferencesState(),
            useNftDetection: true,
          });
          // Wait for detect call triggered by preferences state change to settle
          await advanceTime({
            clock,
            duration: 1,
          });
          mockAddNft.mockReset();

          // Nock successful getUserCollections api call
          nock(NFT_API_BASE_URL)
            .get(
              `/users/${selectedAddress}/collections?chainId=1&limit=20&includeTopBid=true&offset=0`,
            )
            .reply(200, {
              collections: [
                {
                  collection: {
                    id: '0xtestCollection1',
                    slug: '',
                    name: '',
                    image: null,
                    isSpam: false,
                    tokenCount: '2',
                    primaryContract: '0xtestCollection1',

                    floorSale: {
                      '1day': null,
                      '7day': null,
                      '30day': null,
                    },
                    contractKind: 'erc721',
                  },
                  ownership: {
                    tokenCount: '1',
                    totalValue: 0,
                  },
                },
                {
                  collection: {
                    id: '0xtestCollection2',
                    slug: '',
                    name: '',
                    image: null,
                    isSpam: false,
                    tokenCount: '2',
                    primaryContract: '0xtestCollection2',

                    floorSale: {
                      '1day': null,
                      '7day': null,
                      '30day': null,
                    },
                    contractKind: 'erc721',
                  },
                  ownership: {
                    tokenCount: '1',
                    totalValue: 0,
                  },
                },
              ],
            });
          nock(NFT_API_BASE_URL)
            .get(
              `/users/${selectedAddress}/collections?chainId=1&limit=20&includeTopBid=true&offset=20`,
            )
            .reply(200, {
              collections: [],
            });

          // Nock getUserNfts
          nock(NFT_API_BASE_URL)
            .get(
              `/users/${selectedAddress}/tokens?chainIds=1&limit=50&includeTopBid=true&collection=0xtestCollection1&collection=0xtestCollection2&continuation=`,
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
                    collection: {
                      id: '0xtestCollection1',
                      openseaVerificationStatus: 'verified',
                    },
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
                    collection: {
                      id: '0xtestCollection2',
                      openseaVerificationStatus: 'verified',
                    },
                  },
                },
              ],
            });

          nock(NFT_API_BASE_URL)
            .get(
              `/collections?contract=0xtestCollection1&contract=0xtestCollection2&chainId=1`,
            )
            .reply(200, {
              collections: [
                {
                  id: '0xtestCollection1',
                  creator: '0xcreator1',
                  openseaVerificationStatus: 'verified',
                },
                {
                  id: '0xtestCollection2',
                  creator: '0xcreator2',
                  openseaVerificationStatus: 'verified',
                },
              ],
            });

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
                collection: {
                  id: '0xtestCollection1',
                  contractDeployedAt: undefined,
                  creator: '0xcreator1',
                  openseaVerificationStatus: 'verified',
                  ownerCount: undefined,
                  tokenCount: undefined,
                },
              },
              userAddress: selectedAccount.address,
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
                collection: {
                  id: '0xtestCollection2',
                  contractDeployedAt: undefined,
                  creator: '0xcreator2',
                  openseaVerificationStatus: 'verified',
                  ownerCount: undefined,
                  tokenCount: undefined,
                },
              },
              userAddress: selectedAccount.address,
              source: Source.Detected,
              networkClientId: undefined,
            },
          );
        },
      );
    });

    it('should detect and add NFTs from a single collection', async () => {
      const mockAddNft = jest.fn();
      const selectedAddress = 'Oxuser';
      nock.cleanAll();
      const selectedAccount = createMockInternalAccount({
        address: selectedAddress,
      });
      const mockGetSelectedAccount = jest.fn().mockReturnValue(selectedAccount);
      await withController(
        {
          options: { addNft: mockAddNft },
          mockPreferencesState: {},
          mockGetSelectedAccount,
        },
        async ({ controller, controllerEvents }) => {
          controllerEvents.triggerPreferencesStateChange({
            ...getDefaultPreferencesState(),
            useNftDetection: true,
          });
          // Wait for detect call triggered by preferences state change to settle
          await advanceTime({
            clock,
            duration: 1,
          });
          mockAddNft.mockReset();

          // Nock successful getUserCollections api call
          nock(NFT_API_BASE_URL)
            .get(
              `/users/${selectedAddress}/collections?chainId=1&limit=20&includeTopBid=true&offset=0`,
            )
            .reply(200, {
              collections: [
                {
                  collection: {
                    id: '0xtestCollection1',
                    slug: '',
                    name: '',
                    image: null,
                    isSpam: false,
                    tokenCount: '2',
                    primaryContract: '0xtestCollection1',

                    floorSale: {
                      '1day': null,
                      '7day': null,
                      '30day': null,
                    },
                    contractKind: 'erc721',
                  },
                  ownership: {
                    tokenCount: '1',
                    totalValue: 0,
                  },
                },
              ],
            });
          nock(NFT_API_BASE_URL)
            .get(
              `/users/${selectedAddress}/collections?chainId=1&limit=20&includeTopBid=true&offset=20`,
            )
            .reply(200, {
              collections: [],
            });

          nock(NFT_API_BASE_URL)
            .get(
              `/users/${selectedAddress}/tokens?chainIds=1&limit=50&includeTopBid=true&collection=0xtestCollection1&continuation=`,
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
                    collection: {
                      openseaVerificationStatus: 'verified',
                      id: '0xtestCollection1',
                    },
                  },
                },
                {
                  token: {
                    contract: '0xtestCollection1',
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
                    collection: {
                      openseaVerificationStatus: 'verified',
                      id: '0xtestCollection1',
                    },
                  },
                },
              ],
            });

          nock(NFT_API_BASE_URL)
            .get(`/collections?contract=0xtestCollection1&chainId=1`)
            .reply(200, {
              collections: [
                {
                  id: '0xtestCollection1',
                  creator: '0xcreator1',
                  openseaVerificationStatus: 'verified',
                  ownerCount: '555',
                },
              ],
            });

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
                collection: {
                  id: '0xtestCollection1',
                  creator: '0xcreator1',
                  openseaVerificationStatus: 'verified',
                  ownerCount: '555',
                },
              },
              userAddress: selectedAccount.address,
              source: Source.Detected,
              networkClientId: undefined,
            },
          );
          expect(mockAddNft).toHaveBeenNthCalledWith(
            2,
            '0xtestCollection1',
            '2',
            {
              nftMetadata: {
                description: 'Description 2',
                image: 'image/2.png',
                name: 'ID 2',
                standard: 'ERC721',
                imageOriginal: 'imageOriginal/2.png',
                collection: {
                  id: '0xtestCollection1',

                  creator: '0xcreator1',
                  openseaVerificationStatus: 'verified',
                  ownerCount: '555',
                },
              },
              userAddress: selectedAccount.address,
              source: Source.Detected,
              networkClientId: undefined,
            },
          );
        },
      );
    });

    it('should add collection information correctly when a single batch fails to get collection informations', async () => {
      // Mock that MAX_GET_COLLECTION_BATCH_SIZE is equal 1 instead of 20
      Object.defineProperty(constants, 'MAX_GET_COLLECTION_BATCH_SIZE', {
        value: 1,
      });
      expect(MAX_GET_COLLECTION_BATCH_SIZE).toBe(1);
      const mockAddNft = jest.fn();
      const selectedAddress = '0x123';
      const selectedAccount = createMockInternalAccount({
        address: selectedAddress,
      });
      const mockGetSelectedAccount = jest.fn().mockReturnValue(selectedAccount);
      await withController(
        {
          options: { addNft: mockAddNft },
          mockPreferencesState: {},
          mockGetSelectedAccount,
        },
        async ({ controller, controllerEvents }) => {
          controllerEvents.triggerPreferencesStateChange({
            ...getDefaultPreferencesState(),
            useNftDetection: true,
          });
          // Wait for detect call triggered by preferences state change to settle
          await advanceTime({
            clock,
            duration: 1,
          });
          mockAddNft.mockReset();

          // Nock successful getUserCollections api call
          nock(NFT_API_BASE_URL)
            .get(
              `/users/${selectedAddress}/collections?chainId=1&limit=20&includeTopBid=true&offset=0`,
            )
            .reply(200, {
              collections: [
                {
                  collection: {
                    id: '0xtest1',
                    slug: '',
                    name: '',
                    image: null,
                    isSpam: false,
                    tokenCount: '2',
                    primaryContract: '0xtest1',
                    contractKind: 'erc721',
                  },
                  ownership: {
                    tokenCount: '1',
                    totalValue: 0,
                  },
                },
                {
                  collection: {
                    id: '0xtest2',
                    slug: '',
                    name: '',
                    image: null,
                    isSpam: false,
                    tokenCount: '2',
                    primaryContract: '0xtest2',
                    contractKind: 'erc721',
                  },
                  ownership: {
                    tokenCount: '1',
                    totalValue: 0,
                  },
                },
              ],
            });
          nock(NFT_API_BASE_URL)
            .get(
              `/users/${selectedAddress}/collections?chainId=1&limit=20&includeTopBid=true&offset=20`,
            )
            .reply(200, {
              collections: [],
            });

          nock(NFT_API_BASE_URL)
            .get(`/collections?contract=0xtest1&chainId=1`)
            .reply(200, {
              collections: [
                {
                  id: '0xtest1',
                  creator: '0xcreator1',
                  openseaVerificationStatus: 'verified',
                },
              ],
            });

          nock(NFT_API_BASE_URL)
            .get(`/collections?contract=0xtest2&chainId=1`)
            .replyWithError(new Error('Failed to fetch'));

          await controller.detectNfts();

          // Expect to be called twice
          expect(mockAddNft).toHaveBeenNthCalledWith(1, '0xtest1', '2574', {
            nftMetadata: {
              description: 'Description 2574',
              image: 'image/2574.png',
              name: 'ID 2574',
              standard: 'ERC721',
              imageOriginal: 'imageOriginal/2574.png',
              collection: {
                id: '0xtest1',
                contractDeployedAt: undefined,
                creator: '0xcreator1',
                openseaVerificationStatus: 'verified',
                ownerCount: undefined,
                tokenCount: undefined,
              },
            },
            userAddress: selectedAccount.address,
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
              collection: {
                openseaVerificationStatus: 'verified',
                id: '0xtest2',
              },
            },
            userAddress: selectedAccount.address,
            source: Source.Detected,
            networkClientId: undefined,
          });

          Object.defineProperty(constants, 'MAX_GET_COLLECTION_BATCH_SIZE', {
            value: 20,
          });
          expect(MAX_GET_COLLECTION_BATCH_SIZE).toBe(20);
        },
      );
    });
  });

  it('should detect and add NFTs by networkClientId correctly', async () => {
    const mockAddNft = jest.fn();
    const mockGetSelectedAccount = jest.fn();
    await withController(
      {
        options: {
          addNft: mockAddNft,
        },
        mockGetSelectedAccount,
      },
      async ({ controller, controllerEvents }) => {
        const selectedAddress = '0x1';
        const updatedSelectedAccount = createMockInternalAccount({
          address: selectedAddress,
        });
        mockGetSelectedAccount.mockReturnValue(updatedSelectedAccount);
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
        });
        // Wait for detect call triggered by preferences state change to settle
        await advanceTime({
          clock,
          duration: 1,
        });
        mockAddNft.mockReset();

        // Nock successful getUserCollections api call
        nock(NFT_API_BASE_URL)
          .get(
            `/users/0x9/collections?chainId=1&limit=20&includeTopBid=true&offset=0`,
          )
          .reply(200, {
            collections: [
              {
                collection: {
                  id: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
                  slug: '',
                  name: '',
                  image: null,
                  isSpam: false,
                  tokenCount: '2',
                  primaryContract: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',

                  floorSale: {
                    '1day': null,
                    '7day': null,
                    '30day': null,
                  },
                  contractKind: 'erc721',
                },
                ownership: {
                  tokenCount: '1',
                  totalValue: 0,
                },
              },
            ],
          });
        nock(NFT_API_BASE_URL)
          .get(
            `/users/0x9/collections?chainId=1&limit=20&includeTopBid=true&offset=20`,
          )
          .reply(200, {
            collections: [],
          });

        nock(NFT_API_BASE_URL)
          .get(
            `/collections?contract=0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD&chainId=1`,
          )
          .replyWithError(new Error('Failed to fetch'));

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

  it('should not detect NFTs that exist in the ignoreList', async () => {
    const mockAddNft = jest.fn();
    const mockGetSelectedAccount = jest.fn();
    const mockGetNftState = jest.fn().mockImplementation(() => {
      return {
        ...getDefaultNftControllerState(),
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
    const selectedAddress = '0x9';
    const selectedAccount = createMockInternalAccount({
      address: selectedAddress,
    });
    await withController(
      {
        options: { addNft: mockAddNft, getNftState: mockGetNftState },
        mockPreferencesState: { selectedAddress },
        mockGetSelectedAccount,
      },
      async ({ controller, controllerEvents }) => {
        mockGetSelectedAccount.mockReturnValue(selectedAccount);
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
        });
        // Wait for detect call triggered by preferences state change to settle
        await advanceTime({
          clock,
          duration: 1,
        });
        mockAddNft.mockReset();

        // Nock successful getUserCollections api call
        nock(NFT_API_BASE_URL)
          .get(
            `/users/0x9/collections?chainId=1&limit=20&includeTopBid=true&offset=0`,
          )
          .reply(200, {
            collections: [
              {
                collection: {
                  id: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
                  slug: '',
                  name: '',
                  image: null,
                  isSpam: false,
                  tokenCount: '2',
                  primaryContract: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',

                  floorSale: {
                    '1day': null,
                    '7day': null,
                    '30day': null,
                  },
                  contractKind: 'erc721',
                },
                ownership: {
                  tokenCount: '1',
                  totalValue: 0,
                },
              },
            ],
          });
        nock(NFT_API_BASE_URL)
          .get(
            `/users/0x9/collections?chainId=1&limit=20&includeTopBid=true&offset=20`,
          )
          .reply(200, {
            collections: [],
          });

        nock(NFT_API_BASE_URL)
          .get(
            `/collections?contract=0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD&chainId=1`,
          )
          .replyWithError(new Error('Failed to fetch'));

        await controller.detectNfts();

        expect(mockAddNft).not.toHaveBeenCalled();
      },
    );
  });

  it('should not detect and add NFTs if there is no selectedAddress', async () => {
    const mockAddNft = jest.fn();
    // mock uninitialised selectedAccount when it is ''
    const mockGetSelectedAccount = jest.fn().mockReturnValue({ address: '' });
    await withController(
      {
        options: { addNft: mockAddNft },
        mockPreferencesState: {},
        mockGetSelectedAccount,
      },
      async ({ controller, controllerEvents }) => {
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true, // auto-detect is enabled so it proceeds to check userAddress
        });

        await controller.detectNfts();

        expect(mockAddNft).not.toHaveBeenCalled();
      },
    );
  });

  it('should return true if mainnet is detected', async () => {
    const mockAddNft = jest.fn();
    const provider = new FakeProvider();
    const mockNetworkClient: NetworkClient = {
      configuration: {
        chainId: ChainId.mainnet,
        rpcUrl: 'https://test.network',
        ticker: 'TEST',
        type: NetworkClientType.Custom,
      },
      provider,
      blockTracker: new FakeBlockTracker({ provider }),
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
      { options: { disabled: false } },
      async ({ controller, controllerEvents }) => {
        const mockNfts = sinon.stub(controller, 'detectNfts');
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
        });
        // Wait for detect call triggered by preferences state change to settle
        await advanceTime({
          clock,
          duration: 1,
        });

        expect(mockNfts.calledOnce).toBe(false);
      },
    );
  });

  it('should not detect and add NFTs if preferences controller useNftDetection is set to false', async () => {
    const mockAddNft = jest.fn();
    const mockGetSelectedAccount = jest.fn();
    const selectedAddress = '0x9';
    const selectedAccount = createMockInternalAccount({
      address: selectedAddress,
    });
    await withController(
      {
        options: { addNft: mockAddNft, disabled: false },
        mockPreferencesState: {},
        mockGetSelectedAccount,
      },
      async ({ controller, controllerEvents }) => {
        mockGetSelectedAccount.mockReturnValue(selectedAccount);
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
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

  it('should not call addNFt when the request to Nft API call throws', async () => {
    const selectedAccount = createMockInternalAccount({ address: '0x3' });
    nock(NFT_API_BASE_URL)
      // ESLint is confused; this is a string.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      .get(`/users/${selectedAccount.address}/tokens`)
      .query({
        continuation: '',
        limit: '50',
        chainIds: '1',
        includeTopBid: true,
      })
      .replyWithError(new Error('Failed to fetch'))
      .persist();
    const mockAddNft = jest.fn();
    const mockGetSelectedAccount = jest.fn().mockReturnValue(selectedAccount);
    await withController(
      {
        options: {
          addNft: mockAddNft,
        },
        mockGetSelectedAccount,
      },
      async ({ controller, controllerEvents }) => {
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
        });
        // Wait for detect call triggered by preferences state change to settle
        await advanceTime({
          clock,
          duration: 1,
        });
        mockAddNft.mockReset();

        // eslint-disable-next-line jest/require-to-throw-message
        await expect(() => controller.detectNfts()).rejects.toThrow();

        expect(mockAddNft).not.toHaveBeenCalled();
      },
    );
  });

  it('should rethrow error when Nft APi server fails with error other than fetch failure', async () => {
    const selectedAddress = '0x4';
    const selectedAccount = createMockInternalAccount({
      address: selectedAddress,
    });
    const mockGetSelectedAccount = jest.fn().mockReturnValue(selectedAccount);
    await withController(
      { mockPreferencesState: {}, mockGetSelectedAccount },
      async ({ controller, controllerEvents }) => {
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
        });
        // Wait for detect call triggered by preferences state change to settle
        await advanceTime({
          clock,
          duration: 1,
        });
        // Nock successful getUserCollections api call
        nock(NFT_API_BASE_URL)
          .get(
            `/users/${selectedAddress}/collections?chainId=1&limit=20&includeTopBid=true&offset=0`,
          )
          .reply(200, {
            collections: [
              {
                collection: {
                  id: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
                  slug: '',
                  name: '',
                  image: null,
                  isSpam: false,
                  tokenCount: '2',
                  primaryContract: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',

                  floorSale: {
                    '1day': null,
                    '7day': null,
                    '30day': null,
                  },
                  contractKind: 'erc721',
                },
                ownership: {
                  tokenCount: '1',
                  totalValue: 0,
                },
              },
            ],
          });
        nock(NFT_API_BASE_URL)
          .get(
            `/users/${selectedAddress}/collections?chainId=1&limit=20&includeTopBid=true&offset=20`,
          )
          .reply(200, {
            collections: [],
          });

        nock(NFT_API_BASE_URL)
          .get(
            `/collections?contract=0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD&chainId=1`,
          )
          .replyWithError(new Error('Failed to fetch'));

        // This mock is for the call under test
        nock(NFT_API_BASE_URL)
          .get(`/users/${selectedAddress}/tokens`)
          .query({
            continuation: '',
            limit: '50',
            chainIds: '1',
            includeTopBid: true,
            collection: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
          })
          .replyWithError(new Error('UNEXPECTED ERROR'));

        await expect(() => controller.detectNfts()).rejects.toThrow(
          'UNEXPECTED ERROR',
        );
      },
    );
  });

  it('should rethrow error when attempt to add NFT fails', async () => {
    const mockAddNft = jest.fn();
    const mockGetSelectedAccount = jest.fn();
    const selectedAddress = '0x1';
    const selectedAccount = createMockInternalAccount({
      address: selectedAddress,
    });
    await withController(
      {
        options: { addNft: mockAddNft },
        mockPreferencesState: {},
        mockGetSelectedAccount,
      },
      async ({ controller, controllerEvents }) => {
        mockGetSelectedAccount.mockReturnValue(selectedAccount);
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
        });
        // Wait for detect call triggered by preferences state change to settle
        await advanceTime({
          clock,
          duration: 1,
        });
        mockAddNft.mockReset();
        mockAddNft.mockRejectedValueOnce(new Error('UNEXPECTED ERROR'));

        nock(NFT_API_BASE_URL)
          .get(
            `/users/${selectedAddress}/collections?chainId=1&limit=20&includeTopBid=true&offset=0`,
          )
          .reply(200, {
            collections: [
              {
                collection: {
                  id: '0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc',
                  slug: '',
                  name: '',
                  image: null,
                  isSpam: false,
                  tokenCount: '2',
                  primaryContract: '0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc',

                  floorSale: {
                    '1day': null,
                    '7day': null,
                    '30day': null,
                  },
                  contractKind: 'erc721',
                },
                ownership: {
                  tokenCount: '1',
                  totalValue: 0,
                },
              },
              {
                collection: {
                  id: '0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d',
                  slug: '',
                  name: '',
                  image: null,
                  isSpam: false,
                  tokenCount: '2',
                  primaryContract: '0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d',

                  floorSale: {
                    '1day': null,
                    '7day': null,
                    '30day': null,
                  },
                  contractKind: 'erc721',
                },
                ownership: {
                  tokenCount: '1',
                  totalValue: 0,
                },
              },
              {
                collection: {
                  id: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
                  slug: '',
                  name: '',
                  image: null,
                  isSpam: false,
                  tokenCount: '2',
                  primaryContract: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',

                  floorSale: {
                    '1day': null,
                    '7day': null,
                    '30day': null,
                  },
                  contractKind: 'erc721',
                },
                ownership: {
                  tokenCount: '1',
                  totalValue: 0,
                },
              },
            ],
          });
        nock(NFT_API_BASE_URL)
          .get(
            `/users/${selectedAddress}/collections?chainId=1&limit=20&includeTopBid=true&offset=20`,
          )
          .reply(200, {
            collections: [],
          });

        nock(NFT_API_BASE_URL)
          .get(
            `/collections?contract=0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc&contract=0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d&contract=0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD&chainId=1`,
          )
          .replyWithError(new Error('Failed to fetch'));

        await expect(async () => await controller.detectNfts()).rejects.toThrow(
          'UNEXPECTED ERROR',
        );
      },
    );
  });

  it('should not call detectNfts when settings change', async () => {
    const mockGetSelectedAccount = jest
      .fn()
      .mockReturnValue(defaultSelectedAccount);
    await withController(
      {
        options: {},
        mockGetSelectedAccount,
      },
      async ({ controller, controllerEvents }) => {
        const detectNfts = sinon.stub(controller, 'detectNfts');

        // Repeated preference changes should only trigger 1 detection
        for (let i = 0; i < 5; i++) {
          controllerEvents.triggerPreferencesStateChange({
            ...getDefaultPreferencesState(),
            useNftDetection: true,
            securityAlertsEnabled: true,
          });
        }
        await advanceTime({ clock, duration: 1 });
        expect(detectNfts.callCount).toBe(0);

        // Irrelevant preference changes shouldn't trigger a detection
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
          securityAlertsEnabled: true,
        });
        await advanceTime({ clock, duration: 1 });
        expect(detectNfts.callCount).toBe(0);
      },
    );
  });

  it('should only updates once when detectNfts called twice', async () => {
    const mockAddNft = jest.fn();
    const mockGetSelectedAccount = jest.fn();
    const selectedAddress = '0x9';
    const selectedAccount = createMockInternalAccount({
      address: selectedAddress,
    });
    await withController(
      {
        options: { addNft: mockAddNft, disabled: false },
        mockPreferencesState: {},
        mockGetSelectedAccount,
      },
      async ({ controller, controllerEvents }) => {
        mockGetSelectedAccount.mockReturnValue(selectedAccount);
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
        });

        nock(NFT_API_BASE_URL)
          .get(
            `/users/${selectedAddress}/collections?chainId=1&limit=20&includeTopBid=true&offset=0`,
          )
          .reply(200, {
            collections: [
              {
                collection: {
                  id: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
                  slug: '',
                  name: '',
                  image: null,
                  isSpam: false,
                  tokenCount: '2',
                  primaryContract: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',

                  floorSale: {
                    '1day': null,
                    '7day': null,
                    '30day': null,
                  },
                  contractKind: 'erc721',
                },
                ownership: {
                  tokenCount: '1',
                  totalValue: 0,
                },
              },
            ],
          });
        nock(NFT_API_BASE_URL)
          .get(
            `/users/${selectedAddress}/collections?chainId=1&limit=20&includeTopBid=true&offset=20`,
          )
          .reply(200, {
            collections: [],
          });

        nock(NFT_API_BASE_URL)
          .get(
            `/collections?contract=0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD&chainId=1`,
          )
          .reply(200, {
            collections: [],
          });
        await Promise.all([controller.detectNfts(), controller.detectNfts()]);
        expect(mockAddNft).toHaveBeenCalledTimes(1);
      },
    );
  });
});

/**
 * A collection of mock external controller events.
 */
type ControllerEvents = {
  triggerPreferencesStateChange: (state: PreferencesState) => void;
  triggerNetworkStateChange: (state: NetworkState) => void;
};

type WithControllerCallback<ReturnValue> = ({
  controller,
}: {
  controller: NftDetectionController;
  controllerEvents: ControllerEvents;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<ConstructorParameters<typeof NftDetectionController>[0]>;
  mockNetworkClientConfigurationsByNetworkClientId?: Record<
    NetworkClientId,
    NetworkClientConfiguration
  >;
  mockNetworkState?: Partial<NetworkState>;
  mockPreferencesState?: Partial<PreferencesState>;
  mockGetSelectedAccount?: jest.Mock<AccountsController['getSelectedAccount']>;
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
      mockNetworkClientConfigurationsByNetworkClientId = {},
      mockNetworkState = {},
      mockPreferencesState = {},
      mockGetSelectedAccount = jest
        .fn()
        .mockReturnValue(defaultSelectedAccount),
    },
    testFunction,
  ] = args.length === 2 ? args : [{}, args[0]];

  const messenger = new ControllerMessenger<AllowedActions, AllowedEvents>();

  messenger.registerActionHandler(
    'NetworkController:getState',
    jest.fn<NetworkState, []>().mockReturnValue({
      ...getDefaultNetworkControllerState(),
      ...mockNetworkState,
    }),
  );

  messenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    mockGetSelectedAccount,
  );

  const getNetworkClientById = buildMockGetNetworkClientById(
    mockNetworkClientConfigurationsByNetworkClientId,
  );
  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    getNetworkClientById,
  );

  messenger.registerActionHandler(
    'PreferencesController:getState',
    jest.fn<PreferencesState, []>().mockReturnValue({
      ...getDefaultPreferencesState(),
      ...mockPreferencesState,
    }),
  );

  const controllerMessenger = messenger.getRestricted({
    name: controllerName,
    allowedActions: [
      'NetworkController:getState',
      'NetworkController:getNetworkClientById',
      'PreferencesController:getState',
      'AccountsController:getSelectedAccount',
    ],
    allowedEvents: [
      'NetworkController:stateChange',
      'PreferencesController:stateChange',
    ],
  });

  const controller = new NftDetectionController({
    messenger: controllerMessenger,
    disabled: true,
    addNft: jest.fn(),
    getNftState: getDefaultNftControllerState,
    ...options,
  });

  const controllerEvents = {
    triggerPreferencesStateChange: (state: PreferencesState) => {
      messenger.publish('PreferencesController:stateChange', state, []);
    },
    triggerNetworkStateChange: (state: NetworkState) => {
      messenger.publish('NetworkController:stateChange', state, []);
    },
  };

  return await testFunction({
    controller,
    controllerEvents,
  });
}
