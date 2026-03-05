import type { AccountsController } from '@metamask/accounts-controller';
import {
  NFT_API_BASE_URL,
  ChainId,
  InfuraNetworkType,
} from '@metamask/controller-utils';
import { MOCK_ANY_NAMESPACE, Messenger } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import {
  getDefaultNetworkControllerState,
  NetworkClientType,
} from '@metamask/network-controller';
import type {
  NetworkClient,
  NetworkClientConfiguration,
  NetworkClientId,
  NetworkController,
  NetworkState,
} from '@metamask/network-controller';
import { getDefaultPreferencesState } from '@metamask/preferences-controller';
import type { PreferencesState } from '@metamask/preferences-controller';
import nock from 'nock';

import { Source } from './constants';
import { getDefaultNftControllerState } from './NftController';
import {
  NftDetectionController,
  BlockaidResultType,
} from './NftDetectionController';
import type { NftDetectionControllerMessenger } from './NftDetectionController';
import { FakeBlockTracker } from '../../../tests/fake-block-tracker';
import { FakeProvider } from '../../../tests/fake-provider';
import { jestAdvanceTime } from '../../../tests/helpers';
import { createMockInternalAccount } from '../../accounts-controller/tests/mocks';
import {
  buildMockFindNetworkClientIdByChainId,
  buildMockGetNetworkClientById,
} from '../../network-controller/tests/helpers';

type AllActions = MessengerActions<NftDetectionControllerMessenger>;

type AllEvents = MessengerEvents<NftDetectionControllerMessenger>;

type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

const controllerName = 'NftDetectionController' as const;

const defaultSelectedAccount = createMockInternalAccount();

describe('NftDetectionController', () => {
  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });

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
              chainId: 1,
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
              chainId: 1,
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
        `/users/0x1/tokens?chainIds=1&chainIds=59144&limit=50&includeTopBid=true&continuation=`,
      )
      .reply(200, {
        tokens: [
          {
            token: {
              chainId: 59144,
              contract: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1e5',
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
              chainId: 1,
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
              chainId: 1,
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
              chainId: 1,
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
              },
            },
            blockaidResult: {
              result_type: BlockaidResultType.Benign,
            },
          },
          {
            token: {
              chainId: 1,
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
              },
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
              chainId: 1,
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
              result_type: BlockaidResultType.Benign,
            },
          },
          {
            token: {
              chainId: 1,
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
              chainId: 1,
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
              chainId: 1,
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
              chainId: 1,
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
    jest.useRealTimers();
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
        const mockNfts = jest
          .spyOn(controller, 'detectNfts')
          .mockResolvedValue();
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
        });

        // call detectNfts
        await controller.detectNfts(['0x1']);
        expect(mockNfts).toHaveBeenCalledTimes(1);

        await jestAdvanceTime({
          duration: 10,
        });

        expect(mockNfts).toHaveBeenCalledTimes(1);
      },
    );
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
        const mockApiCall = nock(NFT_API_BASE_URL)
          .get(`/users/${selectedAddress}/tokens`)
          .query({
            continuation: '',
            limit: '50',
            chainIds: '59144',
            includeTopBid: true,
          })
          .reply(200, {
            tokens: [],
          });

        // call detectNfts
        await controller.detectNfts(['0xe708']);

        expect(mockApiCall.isDone()).toBe(true);
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
        const mockNfts = jest
          .spyOn(controller, 'detectNfts')
          .mockImplementation();

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
        await controller.detectNfts(['0x507'], {
          userAddress: selectedAddress,
        });

        expect(mockNfts).toHaveBeenCalled();
        expect(mockApiCall.isDone()).toBe(false);
      },
    );
  });

  it('should detect and add NFTs correctly when blockaid result is not included in response', async () => {
    const mockAddNfts = jest.fn();
    const selectedAddress = '0x1';
    const selectedAccount = createMockInternalAccount({
      address: selectedAddress,
    });
    const mockGetSelectedAccount = jest.fn().mockReturnValue(selectedAccount);
    await withController(
      {
        options: { addNfts: mockAddNfts },
        mockPreferencesState: {},
        mockGetSelectedAccount,
      },
      async ({ controller, controllerEvents }) => {
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
        });

        // Wait for detect call triggered by preferences state change to settle
        await jestAdvanceTime({
          duration: 1,
        });
        mockAddNfts.mockReset();

        await controller.detectNfts(['0x1']);

        expect(mockAddNfts).toHaveBeenCalledWith(
          [
            {
              tokenAddress: '0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc',
              tokenId: '2577',
              nftMetadata: {
                description:
                  "Redacted Remilio Babies is a collection of 10,000 neochibi pfpNFT's expanding the Milady Maker paradigm with the introduction of young J.I.T. energy and schizophrenic reactionary aesthetics. We are #REMILIONAIREs.",
                image: 'https://imgtest',
                imageThumbnail: 'https://imgSmall',
                name: 'Remilio 632',
                standard: 'ERC721',
                imageOriginal: 'https://remilio.org/remilio/632.png',
                rarityRank: 8872,
                rarityScore: 343.443,
                chainId: 1,
              },
            },
            {
              tokenAddress: '0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d',
              tokenId: '2578',
              nftMetadata: {
                description: 'Description 2578',
                image: 'https://imgtest',
                imageThumbnail: 'https://imgSmall',
                name: 'ID 2578',
                standard: 'ERC721',
                imageOriginal: 'https://remilio.org/remilio/632.png',
                rarityRank: 8872,
                rarityScore: 343.443,
                chainId: 1,
              },
            },
            {
              tokenAddress: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
              tokenId: '2574',
              nftMetadata: {
                description: 'Description 2574',
                image: 'image/2574.png',
                name: 'ID 2574',
                standard: 'ERC721',
                imageOriginal: 'imageOriginal/2574.png',
                chainId: 1,
              },
            },
          ],
          selectedAccount.address,
          Source.Detected,
        );
      },
    );
  });

  it('should detect and add NFTs correctly with an array of chainIds', async () => {
    const mockAddNfts = jest.fn();
    const selectedAddress = '0x1';
    const selectedAccount = createMockInternalAccount({
      address: selectedAddress,
    });
    const mockGetSelectedAccount = jest.fn().mockReturnValue(selectedAccount);
    await withController(
      {
        options: { addNfts: mockAddNfts },
        mockPreferencesState: {},
        mockGetSelectedAccount,
      },
      async ({ controller, controllerEvents }) => {
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
        });

        // Wait for detect call triggered by preferences state change to settle
        await jestAdvanceTime({
          duration: 1,
        });
        mockAddNfts.mockReset();

        await controller.detectNfts(['0x1', '0xe708']);
        expect(mockAddNfts).toHaveBeenCalledWith(
          [
            {
              tokenAddress: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1e5',
              tokenId: '2',
              nftMetadata: {
                description: 'Description 2',
                image: 'image/2.png',
                name: 'ID 2',
                standard: 'ERC721',
                imageOriginal: 'imageOriginal/2.png',
                chainId: 59144,
              },
            },
            {
              tokenAddress: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
              tokenId: '2574',
              nftMetadata: {
                description: 'Description 2574',
                image: 'image/2574.png',
                name: 'ID 2574',
                standard: 'ERC721',
                imageOriginal: 'imageOriginal/2574.png',
                chainId: 1,
              },
            },
          ],
          selectedAccount.address,
          Source.Detected,
        );
      },
    );
  });

  it('should detect and add NFTs by networkClientId correctly', async () => {
    const mockAddNfts = jest.fn();
    const mockGetSelectedAccount = jest.fn();
    await withController(
      {
        options: {
          addNfts: mockAddNfts,
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
        await jestAdvanceTime({
          duration: 1,
        });
        mockAddNfts.mockReset();

        await controller.detectNfts(['0x1'], {
          userAddress: '0x9',
        });

        expect(mockAddNfts).toHaveBeenCalledWith(
          [
            {
              tokenAddress: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
              tokenId: '2574',
              nftMetadata: {
                description: 'Description 2574',
                image: 'image/2574.png',
                name: 'ID 2574',
                standard: 'ERC721',
                imageOriginal: 'imageOriginal/2574.png',
                chainId: 1,
              },
            },
          ],
          '0x9',
          Source.Detected,
        );
      },
    );
  });

  it('should not detect NFTs that exist in the ignoreList', async () => {
    const mockAddNfts = jest.fn();
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
        options: { addNfts: mockAddNfts, getNftState: mockGetNftState },
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
        await jestAdvanceTime({
          duration: 1,
        });
        mockAddNfts.mockReset();

        await controller.detectNfts(['0x1']);

        // Should be called with empty array when all NFTs are in ignore list
        expect(mockAddNfts).toHaveBeenCalledWith([], '0x9', Source.Detected);
      },
    );
  });

  it('should not detect and add NFTs if there is no selectedAddress', async () => {
    const mockAddNfts = jest.fn();
    // mock uninitialised selectedAccount when it is ''
    const mockGetSelectedAccount = jest.fn().mockReturnValue({ address: '' });
    await withController(
      {
        options: { addNfts: mockAddNfts },
        mockPreferencesState: {},
        mockGetSelectedAccount,
      },
      async ({ controller, controllerEvents }) => {
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true, // auto-detect is enabled so it proceeds to check userAddress
        });

        await controller.detectNfts(['0x1']);

        expect(mockAddNfts).not.toHaveBeenCalled();
      },
    );
  });

  it('should return true if mainnet is detected', async () => {
    const mockAddNfts = jest.fn();
    const provider = new FakeProvider();
    const mockNetworkClient: NetworkClient = {
      configuration: {
        chainId: ChainId.mainnet,
        rpcUrl: 'https://test.network',
        failoverRpcUrls: [],
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
      { options: { addNfts: mockAddNfts } },
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
        const mockNfts = jest
          .spyOn(controller, 'detectNfts')
          .mockImplementation();
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
        });
        // Wait for detect call triggered by preferences state change to settle
        await jestAdvanceTime({
          duration: 1,
        });

        expect(mockNfts).not.toHaveBeenCalled();
      },
    );
  });

  it('should not detect and add NFTs if preferences controller useNftDetection is set to false', async () => {
    const mockAddNfts = jest.fn();
    const mockGetSelectedAccount = jest.fn();
    const selectedAddress = '0x9';
    const selectedAccount = createMockInternalAccount({
      address: selectedAddress,
    });
    await withController(
      {
        options: { addNfts: mockAddNfts, disabled: false },
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
        await jestAdvanceTime({
          duration: 1,
        });
        mockAddNfts.mockReset();

        await controller.detectNfts(['0x1']);

        expect(mockAddNfts).not.toHaveBeenCalled();
      },
    );
  });

  it('should not call addNfts when the request to Nft API call throws', async () => {
    const selectedAccount = createMockInternalAccount({ address: '0x3' });
    nock(NFT_API_BASE_URL)
      .get(`/users/${selectedAccount.address}/tokens`)
      .query({
        continuation: '',
        limit: '50',
        chainIds: '1',
        includeTopBid: true,
      })
      .replyWithError(new Error('Failed to fetch'))
      .persist();
    const mockAddNfts = jest.fn();
    const mockGetSelectedAccount = jest.fn().mockReturnValue(selectedAccount);
    await withController(
      {
        options: {
          addNfts: mockAddNfts,
        },
        mockGetSelectedAccount,
      },
      async ({ controller, controllerEvents }) => {
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
        });
        // Wait for detect call triggered by preferences state change to settle
        await jestAdvanceTime({
          duration: 1,
        });
        mockAddNfts.mockReset();

        // eslint-disable-next-line jest/require-to-throw-message
        await expect(() => controller.detectNfts(['0x1'])).rejects.toThrow();

        expect(mockAddNfts).not.toHaveBeenCalled();
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
        await jestAdvanceTime({
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

        await expect(() => controller.detectNfts(['0x1'])).rejects.toThrow(
          'UNEXPECTED ERROR',
        );
      },
    );
  });

  it('should rethrow error when attempt to add NFT fails', async () => {
    const mockAddNfts = jest.fn();
    const mockGetSelectedAccount = jest.fn();
    const selectedAddress = '0x1';
    const selectedAccount = createMockInternalAccount({
      address: selectedAddress,
    });
    await withController(
      {
        options: { addNfts: mockAddNfts },
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
        await jestAdvanceTime({
          duration: 1,
        });
        mockAddNfts.mockReset();
        mockAddNfts.mockRejectedValueOnce(new Error('UNEXPECTED ERROR'));

        await expect(
          async () => await controller.detectNfts(['0x1']),
        ).rejects.toThrow('UNEXPECTED ERROR');
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
        const detectNfts = jest
          .spyOn(controller, 'detectNfts')
          .mockImplementation();

        // Repeated preference changes should only trigger 1 detection
        for (let i = 0; i < 5; i++) {
          controllerEvents.triggerPreferencesStateChange({
            ...getDefaultPreferencesState(),
            useNftDetection: true,
            securityAlertsEnabled: true,
          });
        }
        await jestAdvanceTime({ duration: 1 });
        expect(detectNfts).not.toHaveBeenCalled();

        // Irrelevant preference changes shouldn't trigger a detection
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
          securityAlertsEnabled: true,
        });
        await jestAdvanceTime({ duration: 1 });
        expect(detectNfts).not.toHaveBeenCalled();
      },
    );
  });

  it('should only updates once when detectNfts called twice', async () => {
    const mockAddNfts = jest.fn();
    const mockGetSelectedAccount = jest.fn();
    const selectedAddress = '0x9';
    const selectedAccount = createMockInternalAccount({
      address: selectedAddress,
    });
    await withController(
      {
        options: { addNfts: mockAddNfts, disabled: false },
        mockPreferencesState: {},
        mockGetSelectedAccount,
      },
      async ({ controller, controllerEvents }) => {
        mockGetSelectedAccount.mockReturnValue(selectedAccount);
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
        });

        await Promise.all([
          controller.detectNfts(['0x1']),
          controller.detectNfts(['0x1']),
        ]);

        expect(mockAddNfts).toHaveBeenCalledTimes(1);
      },
    );
  });

  it('should stop after first page when firstPageOnly is true', async () => {
    const mockAddNfts = jest.fn();
    const selectedAddress = '0xFirstPage';
    const selectedAccount = createMockInternalAccount({
      address: selectedAddress,
    });
    const mockGetSelectedAccount = jest.fn().mockReturnValue(selectedAccount);

    // Mock first page with continuation token
    nock(NFT_API_BASE_URL)
      .get(
        `/users/${selectedAddress}/tokens?chainIds=1&limit=50&includeTopBid=true&continuation=`,
      )
      .reply(200, {
        tokens: [
          {
            token: {
              chainId: 1,
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
        ],
        continuation: 'next-page-token',
      });

    // Mock second page that should NOT be called
    const secondPageSpy = nock(NFT_API_BASE_URL)
      .get(
        `/users/${selectedAddress}/tokens?chainIds=1&limit=50&includeTopBid=true&continuation=next-page-token`,
      )
      .reply(200, {
        tokens: [
          {
            token: {
              chainId: 1,
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
          },
        ],
      });

    await withController(
      {
        options: { addNfts: mockAddNfts },
        mockPreferencesState: {},
        mockGetSelectedAccount,
      },
      async ({ controller, controllerEvents }) => {
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
        });

        await jestAdvanceTime({
          duration: 1,
        });
        mockAddNfts.mockReset();

        await controller.detectNfts(['0x1'], { firstPageOnly: true });

        // Verify second page was NOT called because we used firstPageOnly
        expect(secondPageSpy.isDone()).toBe(false);

        // Verify only first page NFTs were added
        expect(mockAddNfts).toHaveBeenCalledTimes(1);
        expect(mockAddNfts).toHaveBeenCalledWith(
          [
            {
              tokenAddress: '0xtest1',
              tokenId: '2574',
              nftMetadata: {
                description: 'Description 2574',
                image: 'image/2574.png',
                name: 'ID 2574',
                standard: 'ERC721',
                imageOriginal: 'imageOriginal/2574.png',
                chainId: 1,
              },
            },
          ],
          selectedAccount.address,
          Source.Detected,
        );
      },
    );
  });

  it('should stop pagination when signal is aborted', async () => {
    const mockAddNfts = jest.fn();
    const selectedAddress = '0xAbortSignal';
    const selectedAccount = createMockInternalAccount({
      address: selectedAddress,
    });
    const mockGetSelectedAccount = jest.fn().mockReturnValue(selectedAccount);

    // Mock first page with continuation token
    nock(NFT_API_BASE_URL)
      .get(
        `/users/${selectedAddress}/tokens?chainIds=1&limit=50&includeTopBid=true&continuation=`,
      )
      .reply(200, {
        tokens: [
          {
            token: {
              chainId: 1,
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
        ],
        continuation: 'next-page-token',
      });

    // Mock second page that should NOT be called
    const secondPageSpy = nock(NFT_API_BASE_URL)
      .get(
        `/users/${selectedAddress}/tokens?chainIds=1&limit=50&includeTopBid=true&continuation=next-page-token`,
      )
      .reply(200, {
        tokens: [
          {
            token: {
              chainId: 1,
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
          },
        ],
      });

    await withController(
      {
        options: { addNfts: mockAddNfts },
        mockPreferencesState: {},
        mockGetSelectedAccount,
      },
      async ({ controller, controllerEvents }) => {
        controllerEvents.triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          useNftDetection: true,
        });

        await jestAdvanceTime({
          duration: 1,
        });
        mockAddNfts.mockReset();

        const abortController = new AbortController();
        // Abort the signal immediately
        abortController.abort();

        await controller.detectNfts(['0x1'], {
          signal: abortController.signal,
        });

        // Verify second page was NOT called because signal was aborted
        expect(secondPageSpy.isDone()).toBe(false);

        // Verify only first page NFTs were added
        expect(mockAddNfts).toHaveBeenCalledTimes(1);
        expect(mockAddNfts).toHaveBeenCalledWith(
          [
            {
              tokenAddress: '0xtest1',
              tokenId: '2574',
              nftMetadata: {
                description: 'Description 2574',
                image: 'image/2574.png',
                name: 'ID 2574',
                standard: 'ERC721',
                imageOriginal: 'imageOriginal/2574.png',
                chainId: 1,
              },
            },
          ],
          selectedAccount.address,
          Source.Detected,
        );
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
  mockFindNetworkClientIdByChainId?: jest.Mock<
    NetworkController['findNetworkClientIdByChainId']
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
      mockNetworkClientConfigurationsByNetworkClientId = {},
      mockFindNetworkClientIdByChainId = {},
      mockNetworkState = {},
      mockPreferencesState = {},
      mockGetSelectedAccount = jest
        .fn()
        .mockReturnValue(defaultSelectedAccount),
    },
    testFunction,
  ] = args.length === 2 ? args : [{}, args[0]];

  const messenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

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
  const findNetworkClientIdByChainId = buildMockFindNetworkClientIdByChainId(
    mockFindNetworkClientIdByChainId,
  );

  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    getNetworkClientById,
  );

  messenger.registerActionHandler(
    'NetworkController:findNetworkClientIdByChainId',
    findNetworkClientIdByChainId,
  );

  messenger.registerActionHandler(
    'PreferencesController:getState',
    jest.fn<PreferencesState, []>().mockReturnValue({
      ...getDefaultPreferencesState(),
      ...mockPreferencesState,
    }),
  );

  const nftDetectionControllerMessenger = new Messenger<
    typeof controllerName,
    AllActions,
    AllEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: messenger,
  });
  messenger.delegate({
    messenger: nftDetectionControllerMessenger,
    actions: [
      'NetworkController:getState',
      'NetworkController:getNetworkClientById',
      'PreferencesController:getState',
      'AccountsController:getSelectedAccount',
      'NetworkController:findNetworkClientIdByChainId',
    ],
    events: [
      'NetworkController:stateChange',
      'PreferencesController:stateChange',
    ],
  });

  const controller = new NftDetectionController({
    messenger: nftDetectionControllerMessenger,
    disabled: true,
    addNfts: jest.fn(),
    getNftState: getDefaultNftControllerState,
    ...options,
  });

  const controllerEvents = {
    triggerPreferencesStateChange: (state: PreferencesState): void => {
      messenger.publish('PreferencesController:stateChange', state, []);
    },
    triggerNetworkStateChange: (state: NetworkState): void => {
      messenger.publish('NetworkController:stateChange', state, []);
    },
  };

  return await testFunction({
    controller,
    controllerEvents,
  });
}
