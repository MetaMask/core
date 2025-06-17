import type { Network } from '@ethersproject/providers';
import type {
  AccountsControllerGetAccountAction,
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerSelectedAccountChangeEvent,
} from '@metamask/accounts-controller';
import type { ApprovalControllerMessenger } from '@metamask/approval-controller';
import { ApprovalController } from '@metamask/approval-controller';
import { Messenger } from '@metamask/base-controller';
import {
  IPFS_DEFAULT_GATEWAY_URL,
  ERC1155,
  ERC721,
  ChainId,
  NetworkType,
  toHex,
  ApprovalType,
  ERC20,
  NetworksTicker,
  NFT_API_BASE_URL,
  // //InfuraNetworkType,
  convertHexToDecimal,
} from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type {
  NetworkClientConfiguration,
  NetworkClientId,
} from '@metamask/network-controller';
import type { BulkPhishingDetectionScanResponse } from '@metamask/phishing-controller';
import { RecommendedAction } from '@metamask/phishing-controller';
import {
  getDefaultPreferencesState,
  type PreferencesState,
} from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';
import BN from 'bn.js';
import nock from 'nock';
import * as sinon from 'sinon';
import { v4 } from 'uuid';

import type {
  AssetsContractControllerGetERC1155BalanceOfAction,
  AssetsContractControllerGetERC1155TokenURIAction,
  AssetsContractControllerGetERC721AssetNameAction,
  AssetsContractControllerGetERC721AssetSymbolAction,
  AssetsContractControllerGetERC721OwnerOfAction,
  AssetsContractControllerGetERC721TokenURIAction,
} from './AssetsContractController';
import { getFormattedIpfsUrl } from './assetsUtil';
import { Source } from './constants';
import type {
  Nft,
  NftControllerState,
  NftControllerMessenger,
  AllowedActions as NftControllerAllowedActions,
  AllowedEvents as NftControllerAllowedEvents,
  NFTStandardType,
  PhishingControllerBulkScanUrlsAction,
  NftMetadata,
} from './NftController';
import { NftController } from './NftController';
import type { Collection } from './NftDetectionController';
import { createMockInternalAccount } from '../../accounts-controller/src/tests/mocks';
import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../base-controller/tests/helpers';
import {
  buildCustomNetworkClientConfiguration,
  buildMockFindNetworkClientIdByChainId,
  buildMockGetNetworkClientById,
} from '../../network-controller/tests/helpers';

const CRYPTOPUNK_ADDRESS = '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB';
const ERC721_KUDOSADDRESS = '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163';
const ERC721_KUDOS_TOKEN_ID = '1203';
const ERC721_NFT_ADDRESS = '0x60F80121C31A0d46B5279700f9DF786054aa5eE5';
const ERC721_NFT_ID = '1144858';
const ERC1155_NFT_ADDRESS = '0x495f947276749Ce646f68AC8c248420045cb7b5e';
const ERC1155_NFT_ID =
  '40815311521795738946686668571398122012172359753720345430028676522525371400193';
const ERC721_DEPRESSIONIST_ADDRESS =
  '0x18E8E76aeB9E2d9FA2A2b88DD9CF3C8ED45c3660';
const ERC721_DEPRESSIONIST_ID = '36';
const OWNER_ADDRESS = '0x5a3CA5cD63807Ce5e4d7841AB32Ce6B6d9BbBa2D';
const OWNER_ID = '54d1e7bc-1dce-4220-a15f-2f454bae7869';
const OWNER_ACCOUNT = createMockInternalAccount({
  id: OWNER_ID,
  address: OWNER_ADDRESS,
});
const SECOND_OWNER_ADDRESS = '0x500017171kasdfbou081';

const DEPRESSIONIST_CID_V1 =
  'bafybeidf7aw7bmnmewwj4ayq3she2jfk5jrdpp24aaucf6fddzb3cfhrvm';

const SEPOLIA = {
  chainId: toHex(11155111),
  type: NetworkType.sepolia,
  ticker: NetworksTicker.sepolia,
};
const GOERLI = {
  chainId: toHex(5),
  type: NetworkType.goerli,
  ticker: NetworksTicker.goerli,
};

const controllerName = 'NftController' as const;

// Mock out detectNetwork function for cleaner tests, Ethers calls this a bunch of times because the Web3Provider is paranoid.
jest.mock('@ethersproject/providers', () => {
  const providers = jest.requireActual('@ethersproject/providers');
  const MockWeb3Provider = class extends providers.Web3Provider {
    detectNetwork(): Promise<Network> {
      return Promise.resolve({
        name: 'mainnet',
        chainId: 1,
      });
    }
  };
  return {
    ...providers,
    Web3Provider: MockWeb3Provider,
  };
});

jest.mock('uuid', () => {
  const actual = jest.requireActual('uuid');

  return {
    ...actual,
    v4: jest.fn(),
  };
});

/**
 * Setup a test controller instance.
 *
 * @param args - Arguments to this function.
 * @param args.options - Controller options.
 * @param args.getERC721AssetName - Used to construct mock versions of the
 * `AssetsContractController:getERC721AssetName` action.
 * @param args.getERC721AssetSymbol - Used to construct mock versions of the
 * `AssetsContractController:getERC721AssetSymbol` action.
 * @param args.getERC721TokenURI - Used to construct mock versions of the
 * `AssetsContractController:getERC721TokenURI` action.
 * @param args.getERC721OwnerOf - Used to construct mock versions of the
 * `AssetsContractController:getERC721OwnerOf` action.
 * @param args.getERC1155BalanceOf - Used to construct mock versions of the
 * `AssetsContractController:getERC1155BalanceOf` action.
 * @param args.getERC1155TokenURI - Used to construct mock versions of the
 * `AssetsContractController:getERC1155TokenURI` action.
 * @param args.mockNetworkClientConfigurationsByNetworkClientId - Used to construct
 * mock versions of network clients and ultimately mock the
 * `NetworkController:getNetworkClientById` action.
 * @param args.mockGetNetworkClientIdByChainId - Used to construct mock versions of the
 * @param args.getAccount - Used to construct mock versions of the
 * `AccountsController:getAccount` action.
 * @param args.getSelectedAccount - Used to construct mock versions of the
 * `AccountsController:getSelectedAccount` action.
 * @param args.bulkScanUrlsMock - Used to construct mock versions of the
 * `PhishingController:bulkScanUrls` action.
 * @param args.defaultSelectedAccount - The default selected account to use in
 * @returns A collection of test controllers and mocks.
 */
function setupController({
  options = {},
  getERC721AssetName,
  getERC721AssetSymbol,
  getERC721TokenURI,
  getERC721OwnerOf,
  getERC1155BalanceOf,
  getERC1155TokenURI,
  getAccount,
  getSelectedAccount,
  bulkScanUrlsMock,
  mockNetworkClientConfigurationsByNetworkClientId = {},
  defaultSelectedAccount = OWNER_ACCOUNT,
  mockGetNetworkClientIdByChainId = {},
}: {
  options?: Partial<ConstructorParameters<typeof NftController>[0]>;
  getERC721AssetName?: jest.Mock<
    ReturnType<AssetsContractControllerGetERC721AssetNameAction['handler']>,
    Parameters<AssetsContractControllerGetERC721AssetNameAction['handler']>
  >;
  getERC721AssetSymbol?: jest.Mock<
    ReturnType<AssetsContractControllerGetERC721AssetSymbolAction['handler']>,
    Parameters<AssetsContractControllerGetERC721AssetSymbolAction['handler']>
  >;
  getERC721TokenURI?: jest.Mock<
    ReturnType<AssetsContractControllerGetERC721TokenURIAction['handler']>,
    Parameters<AssetsContractControllerGetERC721TokenURIAction['handler']>
  >;
  getERC721OwnerOf?: jest.Mock<
    ReturnType<AssetsContractControllerGetERC721OwnerOfAction['handler']>,
    Parameters<AssetsContractControllerGetERC721OwnerOfAction['handler']>
  >;
  getERC1155BalanceOf?: jest.Mock<
    ReturnType<AssetsContractControllerGetERC1155BalanceOfAction['handler']>,
    Parameters<AssetsContractControllerGetERC1155BalanceOfAction['handler']>
  >;
  getERC1155TokenURI?: jest.Mock<
    ReturnType<AssetsContractControllerGetERC1155TokenURIAction['handler']>,
    Parameters<AssetsContractControllerGetERC1155TokenURIAction['handler']>
  >;
  getAccount?: jest.Mock<
    ReturnType<AccountsControllerGetAccountAction['handler']>,
    Parameters<AccountsControllerGetAccountAction['handler']> | [null]
  >;
  getSelectedAccount?: jest.Mock<
    ReturnType<AccountsControllerGetSelectedAccountAction['handler']>,
    Parameters<AccountsControllerGetSelectedAccountAction['handler']>
  >;
  bulkScanUrlsMock?: jest.Mock<
    Promise<BulkPhishingDetectionScanResponse>,
    [string[]]
  >;
  mockNetworkClientConfigurationsByNetworkClientId?: Record<
    NetworkClientId,
    NetworkClientConfiguration
  >;
  defaultSelectedAccount?: InternalAccount;
  mockGetNetworkClientIdByChainId?: Record<Hex, NetworkClientConfiguration>;
} = {}) {
  const messenger = new Messenger<
    | ExtractAvailableAction<NftControllerMessenger>
    | NftControllerAllowedActions
    | ExtractAvailableAction<ApprovalControllerMessenger>,
    | ExtractAvailableEvent<NftControllerMessenger>
    | NftControllerAllowedEvents
    | ExtractAvailableEvent<ApprovalControllerMessenger>
    | AccountsControllerSelectedAccountChangeEvent
  >();

  const getNetworkClientById = buildMockGetNetworkClientById(
    mockNetworkClientConfigurationsByNetworkClientId,
  );
  const findNetworkClientIdByChainId = buildMockFindNetworkClientIdByChainId(
    mockGetNetworkClientIdByChainId,
  );
  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    getNetworkClientById,
  );
  messenger.registerActionHandler(
    'NetworkController:findNetworkClientIdByChainId',
    findNetworkClientIdByChainId,
  );

  const mockGetAccount =
    getAccount ?? jest.fn().mockReturnValue(defaultSelectedAccount);
  messenger.registerActionHandler(
    'AccountsController:getAccount',
    mockGetAccount,
  );

  const mockGetSelectedAccount =
    getSelectedAccount ?? jest.fn().mockReturnValue(defaultSelectedAccount);
  messenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    mockGetSelectedAccount,
  );

  const mockGetERC721AssetName =
    getERC721AssetName ??
    jest.fn<
      ReturnType<AssetsContractControllerGetERC721AssetNameAction['handler']>,
      Parameters<AssetsContractControllerGetERC721AssetNameAction['handler']>
    >();
  messenger.registerActionHandler(
    'AssetsContractController:getERC721AssetName',
    mockGetERC721AssetName,
  );

  const mockGetERC721AssetSymbol =
    getERC721AssetSymbol ??
    jest.fn<
      ReturnType<AssetsContractControllerGetERC721AssetSymbolAction['handler']>,
      Parameters<AssetsContractControllerGetERC721AssetSymbolAction['handler']>
    >();
  messenger.registerActionHandler(
    'AssetsContractController:getERC721AssetSymbol',
    mockGetERC721AssetSymbol,
  );

  const mockGetERC721TokenURI =
    getERC721TokenURI ??
    jest.fn<
      ReturnType<AssetsContractControllerGetERC721TokenURIAction['handler']>,
      Parameters<AssetsContractControllerGetERC721TokenURIAction['handler']>
    >();
  messenger.registerActionHandler(
    'AssetsContractController:getERC721TokenURI',
    mockGetERC721TokenURI,
  );

  const mockGetERC721OwnerOf =
    getERC721OwnerOf ??
    jest.fn<
      ReturnType<AssetsContractControllerGetERC721OwnerOfAction['handler']>,
      Parameters<AssetsContractControllerGetERC721OwnerOfAction['handler']>
    >();
  messenger.registerActionHandler(
    'AssetsContractController:getERC721OwnerOf',
    mockGetERC721OwnerOf,
  );

  const mockGetERC1155BalanceOf =
    getERC1155BalanceOf ??
    jest.fn<
      ReturnType<AssetsContractControllerGetERC1155BalanceOfAction['handler']>,
      Parameters<AssetsContractControllerGetERC1155BalanceOfAction['handler']>
    >();
  messenger.registerActionHandler(
    'AssetsContractController:getERC1155BalanceOf',
    mockGetERC1155BalanceOf,
  );

  const mockGetERC1155TokenURI =
    getERC1155TokenURI ??
    jest.fn<
      ReturnType<AssetsContractControllerGetERC1155TokenURIAction['handler']>,
      Parameters<AssetsContractControllerGetERC1155TokenURIAction['handler']>
    >();
  messenger.registerActionHandler(
    'AssetsContractController:getERC1155TokenURI',
    mockGetERC1155TokenURI,
  );

  const approvalControllerMessenger = messenger.getRestricted({
    name: 'ApprovalController',
    allowedActions: [],
    allowedEvents: [],
  });

  const approvalController = new ApprovalController({
    messenger: approvalControllerMessenger,
    showApprovalRequest: jest.fn(),
  });

  // Register the phishing controller mock if provided
  if (bulkScanUrlsMock) {
    messenger.registerActionHandler(
      'PhishingController:bulkScanUrls',
      bulkScanUrlsMock,
    );
  }

  const nftControllerMessenger = messenger.getRestricted<
    typeof controllerName,
    | PhishingControllerBulkScanUrlsAction['type']
    | NftControllerAllowedActions['type'],
    NftControllerAllowedEvents['type']
  >({
    name: controllerName,
    allowedActions: [
      'ApprovalController:addRequest',
      'AccountsController:getSelectedAccount',
      'AccountsController:getAccount',
      'NetworkController:getNetworkClientById',
      'AssetsContractController:getERC721AssetName',
      'AssetsContractController:getERC721AssetSymbol',
      'AssetsContractController:getERC721TokenURI',
      'AssetsContractController:getERC721OwnerOf',
      'AssetsContractController:getERC1155BalanceOf',
      'AssetsContractController:getERC1155TokenURI',
      'NetworkController:findNetworkClientIdByChainId',
      'PhishingController:bulkScanUrls',
    ],
    allowedEvents: [
      'AccountsController:selectedEvmAccountChange',
      'PreferencesController:stateChange',
    ],
  });

  const nftController = new NftController({
    onNftAdded: jest.fn(),
    messenger: nftControllerMessenger as NftControllerMessenger,
    ...options,
  });

  const triggerPreferencesStateChange = (state: PreferencesState) => {
    messenger.publish('PreferencesController:stateChange', state, []);
  };

  triggerPreferencesStateChange({
    ...getDefaultPreferencesState(),
    openSeaEnabled: true,
  });

  const triggerSelectedAccountChange = (
    internalAccount: InternalAccount,
  ): void => {
    messenger.publish(
      'AccountsController:selectedEvmAccountChange',
      internalAccount,
    );
  };

  triggerSelectedAccountChange(OWNER_ACCOUNT);

  return {
    nftController,
    messenger,
    approvalController,
    triggerPreferencesStateChange,
    triggerSelectedAccountChange,
    mockGetAccount,
    mockGetSelectedAccount,
    mockGetERC1155BalanceOf,
    mockGetERC1155TokenURI,
    mockGetERC721AssetName,
    mockGetERC721AssetSymbol,
    mockGetERC721OwnerOf,
    mockGetERC721TokenURI,
  };
}

describe('NftController', () => {
  beforeEach(async () => {
    nock(NFT_API_BASE_URL)
      .get(
        `/tokens?chainIds=1&tokens=0x01%3A1&includeTopBid=true&includeAttributes=true&includeLastSale=true`,
      )
      .reply(200, {
        tokens: [
          {
            token: {
              contract: '0x1',
              kind: 'erc1155',
              name: 'Name',
              description: 'Description',
              image: 'url',
              collection: {
                id: '0x1',
                creator: 'Oxaddress',
                tokenCount: 0,
              },
            },
          },
        ],
      });
    const DEPRESSIONIST_CLOUDFLARE_IPFS_SUBDOMAIN_PATH =
      await getFormattedIpfsUrl(
        IPFS_DEFAULT_GATEWAY_URL,
        `ipfs://${DEPRESSIONIST_CID_V1}`,
        true,
      );
    nock(DEPRESSIONIST_CLOUDFLARE_IPFS_SUBDOMAIN_PATH).get('/').reply(200, {
      name: 'name',
      image: 'image',
      description: 'description',
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should set default state', () => {
    const { nftController } = setupController();

    expect(nftController.state).toStrictEqual({
      allNftContracts: {},
      allNfts: {},
      ignoredNfts: [],
    });
  });

  it('should set api key', async () => {
    const { nftController } = setupController();

    nftController.setApiKey('testkey');
    expect(nftController.openSeaApiKey).toBe('testkey');
  });

  describe('watchNft', function () {
    const ERC721_NFT = {
      address: ERC721_NFT_ADDRESS,
      tokenId: ERC721_NFT_ID,
    };

    const ERC1155_NFT = {
      address: ERC1155_NFT_ADDRESS,
      tokenId: ERC1155_NFT_ID,
    };

    it('should error if passed no networkClientId', async function () {
      const { nftController } = setupController();
      const networkClientId = undefined;

      const erc721Result = nftController.watchNft(
        ERC721_NFT,
        ERC721,
        'https://testdapp.com',
        networkClientId as unknown as string,
      );
      await expect(erc721Result).rejects.toThrow(
        'Network client id is required',
      );
    });

    it('should error if passed no type', async function () {
      const { nftController } = setupController();
      const type = undefined;

      const erc721Result = nftController.watchNft(
        ERC721_NFT,
        type as unknown as NFTStandardType,
        'https://test-dapp.com',
        'mainnet',
      );
      await expect(erc721Result).rejects.toThrow('Asset type is required');

      const erc1155Result = nftController.watchNft(
        ERC1155_NFT,
        type as unknown as NFTStandardType,
        'https://test-dapp.com',
        'mainnet',
      );
      await expect(erc1155Result).rejects.toThrow('Asset type is required');
    });

    it('should error if asset type is not supported', async function () {
      const { nftController } = setupController();

      const erc721Result = nftController.watchNft(
        ERC721_NFT,
        ERC20 as unknown as NFTStandardType,
        'https://test-dapp.com',
        'mainnet',
      );
      await expect(erc721Result).rejects.toThrow(
        `Non NFT asset type ${ERC20} not supported by watchNft`,
      );

      const erc1155Result = nftController.watchNft(
        ERC1155_NFT,
        ERC20 as unknown as NFTStandardType,
        'https://test-dapp.com',
        'mainnet',
      );
      await expect(erc1155Result).rejects.toThrow(
        `Non NFT asset type ${ERC20} not supported by watchNft`,
      );
    });

    it('should error if passed NFT does not match type passed', async function () {
      nock('https://testtokenuri.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'testERC721Image',
            name: 'testERC721Name',
            description: 'testERC721Description',
          }),
        );
      const { nftController } = setupController({
        getERC721TokenURI: jest
          .fn()
          .mockImplementation(() => 'https://testtokenuri.com'),
        getERC721OwnerOf: jest.fn().mockImplementation(() => OWNER_ADDRESS),
      });

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore-next-line
      const erc721Result = nftController.watchNft(
        ERC721_NFT,
        ERC1155,
        'https://test-dapp.com',
        'mainnet',
      );
      await expect(erc721Result).rejects.toThrow(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Suggested NFT of type ${ERC721} does not match received type ${ERC1155}`,
      );
    });

    it('should error if address is not defined', async function () {
      const { nftController } = setupController();
      const assetWithNoAddress = {
        address: undefined as unknown as string,
        tokenId: ERC721_NFT_ID,
      };

      const result = nftController.watchNft(
        assetWithNoAddress,
        ERC721,
        'https://testdapp.com',
        'mainnet',
      );
      await expect(result).rejects.toThrow(
        'Both address and tokenId are required',
      );
    });

    it('should error if tokenId is not defined', async function () {
      const { nftController } = setupController();
      const assetWithNoAddress = {
        address: ERC721_NFT_ADDRESS,
        tokenId: undefined as unknown as string,
      };

      const result = nftController.watchNft(
        assetWithNoAddress,
        ERC721,
        'https://test-dapp.com',
        'mainnet',
      );
      await expect(result).rejects.toThrow(
        'Both address and tokenId are required',
      );
    });

    it('should error if tokenId is not a valid stringified decimal number', async function () {
      const { nftController } = setupController();
      const assetWithNumericTokenId = {
        address: ERC721_NFT_ADDRESS,
        tokenId: '123abc',
      };

      const result = nftController.watchNft(
        assetWithNumericTokenId,
        ERC721,
        'https://test-dapp.com',
        'mainnet',
      );
      await expect(result).rejects.toThrow('Invalid tokenId');
    });

    it('should error if address is invalid', async function () {
      const { nftController } = setupController();
      const assetWithInvalidAddress = {
        address: '0x123',
        tokenId: ERC721_NFT_ID,
      };
      const result = nftController.watchNft(
        assetWithInvalidAddress,
        ERC721,
        'https://test-dapp.com',
        'mainnet',
      );
      await expect(result).rejects.toThrow('Invalid address');
    });

    it('should error if the user does not own the suggested ERC721 NFT', async function () {
      const { nftController, messenger } = setupController({
        getERC721OwnerOf: jest.fn().mockImplementation(() => '0x12345abcefg'),
      });

      const callActionSpy = jest.spyOn(messenger, 'call');

      await expect(() =>
        nftController.watchNft(
          ERC721_NFT,
          ERC721,
          'https://test-dapp.com',
          'mainnet',
        ),
      ).rejects.toThrow('Suggested NFT is not owned by the selected account');
      // First call is getInternalAccount. Second call is the approval request.
      expect(callActionSpy).not.toHaveBeenNthCalledWith(
        2,
        'ApprovalController:addRequest',
        expect.any(Object),
      );
    });

    it('should error if the call to isNftOwner fail', async function () {
      const { nftController } = setupController();
      jest.spyOn(nftController, 'isNftOwner').mockRejectedValue('Random error');
      try {
        await nftController.watchNft(
          ERC721_NFT,
          ERC721,
          'https://test-dapp.com',
          'mainnet',
        );
      } catch (err) {
        // eslint-disable-next-line jest/no-conditional-expect
        expect(err).toBe('Random error');
      }
    });

    it('should error if the user does not own the suggested ERC1155 NFT', async function () {
      const { nftController, messenger } = setupController({
        getERC1155BalanceOf: jest.fn().mockImplementation(() => new BN(0)),
      });

      const callActionSpy = jest.spyOn(messenger, 'call');

      await expect(() =>
        nftController.watchNft(
          ERC1155_NFT,
          ERC1155,
          'https://test-dapp.com',
          'mainnet',
        ),
      ).rejects.toThrow('Suggested NFT is not owned by the selected account');
      // First call is to get InternalAccount
      expect(callActionSpy).toHaveBeenNthCalledWith(
        1,
        'AccountsController:getAccount',
        expect.any(String),
      );
    });

    it('should handle ERC721 type and add pending request to ApprovalController with the OpenSea API disabled and IPFS gateway enabled', async function () {
      nock('https://testtokenuri.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'testERC721Image',
            name: 'testERC721Name',
            description: 'testERC721Description',
          }),
        );
      const {
        nftController,
        messenger,
        triggerPreferencesStateChange,
        triggerSelectedAccountChange,
      } = setupController({
        getAccount: jest.fn().mockReturnValue(OWNER_ACCOUNT),
        getERC721OwnerOf: jest.fn().mockResolvedValue(OWNER_ADDRESS),
        getERC721TokenURI: jest
          .fn()
          .mockResolvedValue('https://testtokenuri.com'),
        getERC721AssetName: jest.fn().mockResolvedValue('testERC721Name'),
        getERC721AssetSymbol: jest.fn().mockResolvedValue('testERC721Symbol'),
      });

      triggerSelectedAccountChange(OWNER_ACCOUNT);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        isIpfsGatewayEnabled: true,
        openSeaEnabled: false,
      });

      const requestId = 'approval-request-id-1';

      const clock = sinon.useFakeTimers(1);

      (v4 as jest.Mock).mockImplementationOnce(() => requestId);

      const callActionSpy = jest
        .spyOn(messenger, 'call')
        // 1. `AccountsController:getAccount`
        .mockReturnValueOnce(OWNER_ACCOUNT)
        // 2. `AssetsContractController:getERC721OwnerOf`
        .mockResolvedValueOnce(OWNER_ADDRESS)
        // 3. `NetworkClientController:getNetworkClientById`
        .mockReturnValueOnce({
          configuration: {
            type: 'infura',
            network: 'mainnet',
            failoverRpcUrls: [],
            infuraProjectId: 'test-infura-project-id',
            chainId: '0x1',
            ticker: 'ETH',
            rpcUrl: 'https://mainnet.infura.io/v3/test-infura-project-id',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        // 3. `AssetsContractController:getERC721TokenURI`
        .mockResolvedValueOnce('https://testtokenuri.com')
        // 4. `ApprovalController:addRequest`
        .mockResolvedValueOnce({})
        // 5. `AccountsController:getAccount`
        .mockReturnValueOnce(OWNER_ACCOUNT)
        // 3. `NetworkClientController:getNetworkClientById`
        .mockReturnValueOnce({
          configuration: {
            type: 'infura',
            network: 'mainnet',
            failoverRpcUrls: [],
            infuraProjectId: 'test-infura-project-id',
            chainId: '0x1',
            ticker: 'ETH',
            rpcUrl: 'https://mainnet.infura.io/v3/test-infura-project-id',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        // 6. `AssetsContractController:getERC721AssetName`
        .mockResolvedValueOnce('testERC721Name')
        // 7. `AssetsContractController:getERC721AssetSymbol`
        .mockResolvedValueOnce('testERC721Symbol')
        // 3. `NetworkClientController:getNetworkClientById`
        .mockReturnValueOnce({
          configuration: {
            type: 'infura',
            network: 'mainnet',
            failoverRpcUrls: [],
            infuraProjectId: 'test-infura-project-id',
            chainId: '0x1',
            ticker: 'ETH',
            rpcUrl: 'https://mainnet.infura.io/v3/test-infura-project-id',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

      await nftController.watchNft(
        ERC721_NFT,
        ERC721,
        'https://test-dapp.com',
        'mainnet',
      );
      expect(callActionSpy).toHaveBeenCalledTimes(10);
      expect(callActionSpy).toHaveBeenNthCalledWith(
        5,
        'ApprovalController:addRequest',
        {
          id: requestId,
          origin: 'https://test-dapp.com',
          type: ApprovalType.WatchAsset,
          requestData: {
            id: requestId,
            interactingAddress: OWNER_ADDRESS,
            asset: {
              ...ERC721_NFT,
              description: null,
              image: null,
              name: null,
              standard: ERC721,
            },
          },
        },
        true,
      );

      clock.restore();
    });

    it('should handle ERC721 type and add pending request to ApprovalController with the OpenSea API enabled and IPFS gateway enabled', async function () {
      nock('https://testtokenuri.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'testERC721Image',
            name: 'testERC721Name',
            description: 'testERC721Description',
          }),
        );
      const {
        nftController,
        messenger,
        triggerPreferencesStateChange,
        triggerSelectedAccountChange,
      } = setupController({
        getAccount: jest.fn().mockReturnValue(OWNER_ACCOUNT),
        getERC721OwnerOf: jest.fn().mockResolvedValue(OWNER_ADDRESS),
        getERC721TokenURI: jest
          .fn()
          .mockResolvedValue('https://testtokenuri.com'),
        getERC721AssetName: jest.fn().mockResolvedValue('testERC721Name'),
        getERC721AssetSymbol: jest.fn().mockResolvedValue('testERC721Symbol'),
      });
      triggerSelectedAccountChange(OWNER_ACCOUNT);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        isIpfsGatewayEnabled: true,
        openSeaEnabled: true,
      });

      const requestId = 'approval-request-id-1';

      const clock = sinon.useFakeTimers(1);

      (v4 as jest.Mock).mockImplementationOnce(() => requestId);

      const callActionSpy = jest
        .spyOn(messenger, 'call')
        // 1. `AccountsController:getAccount`
        .mockReturnValueOnce(OWNER_ACCOUNT)
        // 2. `AssetsContractController:getERC721OwnerOf`
        .mockResolvedValueOnce(OWNER_ADDRESS)
        // 3. `NetworkClientController:getNetworkClientById`
        .mockReturnValueOnce({
          configuration: {
            type: 'infura',
            network: 'mainnet',
            failoverRpcUrls: [],
            infuraProjectId: 'test-infura-project-id',
            chainId: '0x1',
            ticker: 'ETH',
            rpcUrl: 'https://mainnet.infura.io/v3/test-infura-project-id',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        // 4. `AssetsContractController:getERC721TokenURI`
        .mockResolvedValueOnce('https://testtokenuri.com')
        // 5. `ApprovalController:addRequest`
        .mockResolvedValueOnce({})
        // 6. `AccountsController:getAccount`
        .mockReturnValueOnce(OWNER_ACCOUNT)
        // 7. `NetworkClientController:getNetworkClientById`
        .mockReturnValueOnce({
          configuration: {
            type: 'infura',
            network: 'mainnet',
            failoverRpcUrls: [],
            infuraProjectId: 'test-infura-project-id',
            chainId: '0x1',
            ticker: 'ETH',
            rpcUrl: 'https://mainnet.infura.io/v3/test-infura-project-id',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        // 8. `AssetsContractController:getERC721AssetName`
        .mockResolvedValueOnce('testERC721Name')
        // 9. `AssetsContractController:getERC721AssetSymbol`
        .mockResolvedValueOnce('testERC721Symbol')
        // 10. `NetworkClientController:getNetworkClientById`
        .mockReturnValueOnce({
          configuration: {
            type: 'infura',
            network: 'mainnet',
            failoverRpcUrls: [],
            infuraProjectId: 'test-infura-project-id',
            chainId: '0x1',
            ticker: 'ETH',
            rpcUrl: 'https://mainnet.infura.io/v3/test-infura-project-id',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

      await nftController.watchNft(
        ERC721_NFT,
        ERC721,
        'https://test-dapp.com',
        'mainnet',
      );
      expect(callActionSpy).toHaveBeenCalledTimes(10);
      expect(callActionSpy).toHaveBeenNthCalledWith(
        5,
        'ApprovalController:addRequest',
        {
          id: requestId,
          origin: 'https://test-dapp.com',
          type: ApprovalType.WatchAsset,
          requestData: {
            id: requestId,
            interactingAddress: OWNER_ADDRESS,
            asset: {
              ...ERC721_NFT,
              description: 'testERC721Description',
              image: 'testERC721Image',
              name: 'testERC721Name',
              standard: ERC721,
            },
          },
        },
        true,
      );

      clock.restore();
    });

    it('should handle ERC721 type and add pending request to ApprovalController with the OpenSea API disabled and IPFS gateway disabled', async function () {
      nock('https://testtokenuri.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'testERC721Image',
            name: 'testERC721Name',
            description: 'testERC721Description',
          }),
        );
      const {
        nftController,
        messenger,
        triggerPreferencesStateChange,
        triggerSelectedAccountChange,
      } = setupController({
        getAccount: jest.fn().mockReturnValue(OWNER_ACCOUNT),
        getERC721OwnerOf: jest.fn().mockResolvedValue(OWNER_ADDRESS),
        getERC721TokenURI: jest
          .fn()
          .mockResolvedValue('https://testtokenuri.com'),
        getERC721AssetName: jest.fn().mockResolvedValue('testERC721Name'),
        getERC721AssetSymbol: jest.fn().mockResolvedValue('testERC721Symbol'),
      });
      triggerSelectedAccountChange(OWNER_ACCOUNT);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        isIpfsGatewayEnabled: false,
        openSeaEnabled: false,
      });

      const requestId = 'approval-request-id-1';

      const clock = sinon.useFakeTimers(1);

      (v4 as jest.Mock).mockImplementationOnce(() => requestId);

      const callActionSpy = jest
        .spyOn(messenger, 'call')
        // 1. `AccountsController:getAccount`
        .mockReturnValueOnce(OWNER_ACCOUNT)
        // 2. `AssetsContractController:getERC721OwnerOf`
        .mockResolvedValueOnce(OWNER_ADDRESS)
        // 3. `NetworkClientController:getNetworkClientById`
        .mockReturnValueOnce({
          configuration: {
            type: 'infura',
            network: 'mainnet',
            failoverRpcUrls: [],
            infuraProjectId: 'test-infura-project-id',
            chainId: '0x1',
            ticker: 'ETH',
            rpcUrl: 'https://mainnet.infura.io/v3/test-infura-project-id',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        // 4. `AssetsContractController:getERC721TokenURI`
        .mockResolvedValueOnce('https://testtokenuri.com')
        // 5. `ApprovalController:addRequest`
        .mockResolvedValueOnce({})
        // 6. `AccountsController:getAccount`
        .mockReturnValueOnce(OWNER_ACCOUNT)
        // 7. `NetworkClientController:getNetworkClientById`
        .mockReturnValueOnce({
          configuration: {
            type: 'infura',
            network: 'mainnet',
            failoverRpcUrls: [],
            infuraProjectId: 'test-infura-project-id',
            chainId: '0x1',
            ticker: 'ETH',
            rpcUrl: 'https://mainnet.infura.io/v3/test-infura-project-id',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        // 8. `AssetsContractController:getERC721AssetName`
        .mockResolvedValueOnce('testERC721Name')
        // 9. `AssetsContractController:getERC721AssetSymbol`
        .mockResolvedValueOnce('testERC721Symbol')
        // 10. `NetworkClientController:getNetworkClientById`
        .mockReturnValueOnce({
          configuration: {
            type: 'infura',
            network: 'mainnet',
            failoverRpcUrls: [],
            infuraProjectId: 'test-infura-project-id',
            chainId: '0x1',
            ticker: 'ETH',
            rpcUrl: 'https://mainnet.infura.io/v3/test-infura-project-id',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

      await nftController.watchNft(
        ERC721_NFT,
        ERC721,
        'https://test-dapp.com',
        'mainnet',
      );
      expect(callActionSpy).toHaveBeenCalledTimes(10);
      expect(callActionSpy).toHaveBeenNthCalledWith(
        5,
        'ApprovalController:addRequest',
        {
          id: requestId,
          origin: 'https://test-dapp.com',
          type: ApprovalType.WatchAsset,
          requestData: {
            id: requestId,
            interactingAddress: OWNER_ADDRESS,
            asset: {
              ...ERC721_NFT,
              description: null,
              image: null,
              name: null,
              standard: ERC721,
            },
          },
        },
        true,
      );

      clock.restore();
    });

    it('should handle ERC721 type and add pending request to ApprovalController with the OpenSea API enabled and IPFS gateway disabled', async function () {
      nock('https://testtokenuri.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'testERC721Image',
            name: 'testERC721Name',
            description: 'testERC721Description',
          }),
        );
      const {
        nftController,
        messenger,
        triggerPreferencesStateChange,
        triggerSelectedAccountChange,
      } = setupController({
        getAccount: jest.fn().mockReturnValue(OWNER_ACCOUNT),
        getERC721OwnerOf: jest.fn().mockResolvedValue(OWNER_ADDRESS),
        getERC721TokenURI: jest
          .fn()
          .mockResolvedValue('https://testtokenuri.com'),
        getERC721AssetName: jest.fn().mockResolvedValue('testERC721Name'),
        getERC721AssetSymbol: jest.fn().mockResolvedValue('testERC721Symbol'),
      });

      triggerSelectedAccountChange(OWNER_ACCOUNT);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        isIpfsGatewayEnabled: false,
        openSeaEnabled: true,
      });

      const requestId = 'approval-request-id-1';

      const clock = sinon.useFakeTimers(1);

      (v4 as jest.Mock).mockImplementationOnce(() => requestId);

      const callActionSpy = jest
        .spyOn(messenger, 'call')
        // 1. `AccountsController:getAccount`
        .mockReturnValueOnce(OWNER_ACCOUNT)
        // 2. `AssetsContractController:getERC721OwnerOf`
        .mockResolvedValueOnce(OWNER_ADDRESS)
        // 3. `NetworkClientController:getNetworkClientById`
        .mockReturnValueOnce({
          configuration: {
            type: 'infura',
            network: 'mainnet',
            failoverRpcUrls: [],
            infuraProjectId: 'test-infura-project-id',
            chainId: '0x1',
            ticker: 'ETH',
            rpcUrl: 'https://mainnet.infura.io/v3/test-infura-project-id',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        // 4. `AssetsContractController:getERC721TokenURI`
        .mockResolvedValueOnce('https://testtokenuri.com')
        // 5. `ApprovalController:addRequest`
        .mockResolvedValueOnce({})
        // 6. `AccountsController:getAccount`
        .mockReturnValueOnce(OWNER_ACCOUNT)
        // 7. `NetworkClientController:getNetworkClientById`
        .mockReturnValueOnce({
          configuration: {
            type: 'infura',
            network: 'mainnet',
            failoverRpcUrls: [],
            infuraProjectId: 'test-infura-project-id',
            chainId: '0x1',
            ticker: 'ETH',
            rpcUrl: 'https://mainnet.infura.io/v3/test-infura-project-id',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        // 8. `AssetsContractController:getERC721AssetName`
        .mockResolvedValueOnce('testERC721Name')
        // 9. `AssetsContractController:getERC721AssetSymbol`
        .mockResolvedValueOnce('testERC721Symbol')
        // 10. `NetworkClientController:getNetworkClientById`
        .mockReturnValueOnce({
          configuration: {
            type: 'infura',
            network: 'mainnet',
            failoverRpcUrls: [],
            infuraProjectId: 'test-infura-project-id',
            chainId: '0x1',
            ticker: 'ETH',
            rpcUrl: 'https://mainnet.infura.io/v3/test-infura-project-id',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

      await nftController.watchNft(
        ERC721_NFT,
        ERC721,
        'https://test-dapp.com',
        'mainnet',
      );
      expect(callActionSpy).toHaveBeenCalledTimes(10);
      expect(callActionSpy).toHaveBeenNthCalledWith(
        5,
        'ApprovalController:addRequest',
        {
          id: requestId,
          origin: 'https://test-dapp.com',
          type: ApprovalType.WatchAsset,
          requestData: {
            id: requestId,
            interactingAddress: OWNER_ADDRESS,
            asset: {
              ...ERC721_NFT,
              description: 'testERC721Description',
              image: 'testERC721Image',
              name: 'testERC721Name',
              standard: ERC721,
            },
          },
        },
        true,
      );

      clock.restore();
    });

    it('should handle ERC1155 type and add to suggestedNfts with the OpenSea API disabled', async function () {
      nock('https://testtokenuri.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'testERC1155Image',
            name: 'testERC1155Name',
            description: 'testERC1155Description',
          }),
        );

      const {
        nftController,
        messenger,
        triggerPreferencesStateChange,
        triggerSelectedAccountChange,
      } = setupController({
        getAccount: jest.fn().mockReturnValue(OWNER_ACCOUNT),
        getERC721OwnerOf: jest
          .fn()
          .mockRejectedValue(new Error('Not an ERC721 contract')),
        getERC1155BalanceOf: jest.fn().mockResolvedValue(new BN(1)),
        getERC721TokenURI: jest
          .fn()
          .mockRejectedValue(new Error('Not an ERC721 contract')),
        getERC1155TokenURI: jest
          .fn()
          .mockResolvedValue('https://testtokenuri.com'),
      });

      triggerSelectedAccountChange(OWNER_ACCOUNT);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        isIpfsGatewayEnabled: true,
        openSeaEnabled: false,
      });
      const requestId = 'approval-request-id-1';

      const clock = sinon.useFakeTimers(1);

      (v4 as jest.Mock).mockImplementationOnce(() => requestId);

      const callActionSpy = jest
        .spyOn(messenger, 'call')
        // 1. `AccountsController:getAccount`
        .mockReturnValueOnce(OWNER_ACCOUNT)
        // 2. `AssetsContractController:getERC721OwnerOf`
        .mockRejectedValueOnce(new Error('Not an ERC721 contract'))
        // 3. `AssetsContractController:getERC1155BalanceOf`
        .mockResolvedValueOnce(new BN(1))
        // 4. `NetworkClientController:getNetworkClientById`
        .mockReturnValueOnce({
          configuration: {
            type: 'infura',
            network: 'mainnet',
            failoverRpcUrls: [],
            infuraProjectId: 'test-infura-project-id',
            chainId: '0x1',
            ticker: 'ETH',
            rpcUrl: 'https://mainnet.infura.io/v3/test-infura-project-id',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        // 5. `AssetsContractController:getERC721TokenURI`
        .mockRejectedValueOnce(new Error('Not an ERC721 contract'))
        // 6. `AssetsContractController:getERC1155TokenURI`
        .mockResolvedValueOnce('https://testtokenuri.com')
        // 7. `ApprovalController:addRequest`
        .mockResolvedValueOnce({})
        // 8. `AccountsController:getAccount`
        .mockReturnValueOnce(OWNER_ACCOUNT)
        // 9. `NetworkClientController:getNetworkClientById`
        .mockReturnValueOnce({
          configuration: {
            type: 'infura',
            network: 'mainnet',
            failoverRpcUrls: [],
            infuraProjectId: 'test-infura-project-id',
            chainId: '0x1',
            ticker: 'ETH',
            rpcUrl: 'https://mainnet.infura.io/v3/test-infura-project-id',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        // 10. `AssetsContractController:getERC721AssetName`
        .mockRejectedValueOnce(new Error('Not an ERC721 contract'))
        // 11. `AssetsContractController:getERC721AssetSymbol`
        .mockRejectedValueOnce(new Error('Not an ERC721 contract'))
        // 12. `NetworkClientController:getNetworkClientById`
        .mockReturnValueOnce({
          configuration: {
            type: 'infura',
            network: 'mainnet',
            failoverRpcUrls: [],
            infuraProjectId: 'test-infura-project-id',
            chainId: '0x1',
            ticker: 'ETH',
            rpcUrl: 'https://mainnet.infura.io/v3/test-infura-project-id',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

      await nftController.watchNft(
        ERC1155_NFT,
        ERC1155,
        'https://etherscan.io',
        'mainnet',
      );
      expect(callActionSpy).toHaveBeenCalledTimes(12);
      expect(callActionSpy).toHaveBeenNthCalledWith(
        7,
        'ApprovalController:addRequest',
        {
          id: requestId,
          origin: 'https://etherscan.io',
          type: ApprovalType.WatchAsset,
          requestData: {
            id: requestId,
            interactingAddress: OWNER_ADDRESS,
            asset: {
              ...ERC1155_NFT,
              description: null,
              image: null,
              name: null,
              standard: ERC1155,
            },
          },
        },
        true,
      );

      clock.restore();
    });

    it('should handle ERC1155 type and add to suggestedNfts with the OpenSea API enabled', async function () {
      nock('https://testtokenuri.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'testERC1155Image',
            name: 'testERC1155Name',
            description: 'testERC1155Description',
          }),
        );

      const { nftController, messenger, triggerPreferencesStateChange } =
        setupController({
          getAccount: jest.fn().mockReturnValue(OWNER_ACCOUNT),
          getERC721OwnerOf: jest
            .fn()
            .mockRejectedValue(new Error('Not an ERC721 contract')),
          getERC1155BalanceOf: jest.fn().mockResolvedValue(new BN(1)),
          getERC721TokenURI: jest
            .fn()
            .mockRejectedValue(new Error('Not an ERC721 contract')),
          getERC1155TokenURI: jest
            .fn()
            .mockResolvedValue('https://testtokenuri.com'),
        });
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        isIpfsGatewayEnabled: true,
        openSeaEnabled: true,
      });
      const requestId = 'approval-request-id-1';

      const clock = sinon.useFakeTimers(1);

      (v4 as jest.Mock).mockImplementationOnce(() => requestId);

      const callActionSpy = jest
        .spyOn(messenger, 'call')
        // 1. `AccountsController:getAccount`
        .mockReturnValueOnce(OWNER_ACCOUNT)
        // 2. `AssetsContractController:getERC721OwnerOf`
        .mockRejectedValueOnce(new Error('Not an ERC721 contract'))
        // 3. `AssetsContractController:getERC1155BalanceOf`
        .mockResolvedValueOnce(new BN(1))
        // 4. `NetworkClientController:getNetworkClientById`
        .mockReturnValueOnce({
          configuration: {
            type: 'infura',
            network: 'mainnet',
            failoverRpcUrls: [],
            infuraProjectId: 'test-infura-project-id',
            chainId: '0x1',
            ticker: 'ETH',
            rpcUrl: 'https://mainnet.infura.io/v3/test-infura-project-id',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        // 4. `AssetsContractController:getERC721TokenURI`
        .mockRejectedValueOnce(new Error('Not an ERC721 contract'))
        // 5. `AssetsContractController:getERC1155TokenURI`
        .mockResolvedValueOnce('https://testtokenuri.com')
        // 6. `ApprovalController:addRequest`
        .mockResolvedValueOnce({})
        // 7. `AccountsController:getAccount`
        .mockReturnValueOnce(OWNER_ACCOUNT)
        // 9. `NetworkClientController:getNetworkClientById`
        .mockReturnValueOnce({
          configuration: {
            type: 'infura',
            network: 'mainnet',
            failoverRpcUrls: [],
            infuraProjectId: 'test-infura-project-id',
            chainId: '0x1',
            ticker: 'ETH',
            rpcUrl: 'https://mainnet.infura.io/v3/test-infura-project-id',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        // 8. `AssetsContractController:getERC721AssetName`
        .mockRejectedValueOnce(new Error('Not an ERC721 contract'))
        // 9. `AssetsContractController:getERC721AssetSymbol`
        .mockRejectedValueOnce(new Error('Not an ERC721 contract'))
        // 9. `NetworkClientController:getNetworkClientById`
        .mockReturnValueOnce({
          configuration: {
            type: 'infura',
            network: 'mainnet',
            failoverRpcUrls: [],
            infuraProjectId: 'test-infura-project-id',
            chainId: '0x1',
            ticker: 'ETH',
            rpcUrl: 'https://mainnet.infura.io/v3/test-infura-project-id',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

      await nftController.watchNft(
        ERC1155_NFT,
        ERC1155,
        'https://etherscan.io',
        'mainnet',
      );

      expect(callActionSpy).toHaveBeenCalledTimes(12);
      expect(callActionSpy).toHaveBeenNthCalledWith(
        7,
        'ApprovalController:addRequest',
        {
          id: requestId,
          origin: 'https://etherscan.io',
          type: ApprovalType.WatchAsset,
          requestData: {
            id: requestId,
            interactingAddress: OWNER_ADDRESS,
            asset: {
              ...ERC1155_NFT,
              description: 'testERC1155Description',
              image: 'testERC1155Image',
              name: 'testERC1155Name',
              standard: ERC1155,
            },
          },
        },
        true,
      );

      clock.restore();
    });

    it('should add the NFT to the correct chainId/selectedAddress in state when passed a userAddress in the options argument', async function () {
      nock('https://testtokenuri.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'testERC721Image',
            name: 'testERC721Name',
            description: 'testERC721Description',
          }),
        );

      const {
        nftController,
        messenger,
        approvalController,
        triggerPreferencesStateChange,
        triggerSelectedAccountChange,
      } = setupController({
        getERC721OwnerOf: jest.fn().mockResolvedValue(SECOND_OWNER_ADDRESS),
        getERC721TokenURI: jest
          .fn()
          .mockResolvedValue('https://testtokenuri.com'),
        getERC721AssetName: jest.fn().mockResolvedValue('testERC721Name'),
        getERC721AssetSymbol: jest.fn().mockResolvedValue('testERC721Symbol'),
      });

      const requestId = 'approval-request-id-1';

      sinon.useFakeTimers(1);

      (v4 as jest.Mock).mockImplementationOnce(() => requestId);

      const pendingRequest = new Promise<void>((resolve) => {
        messenger.subscribe('ApprovalController:stateChange', () => {
          resolve();
        });
      });

      const acceptedRequest = new Promise<void>((resolve) => {
        messenger.subscribe(
          'NftController:stateChange',
          (state: NftControllerState) => {
            if (state.allNfts?.[SECOND_OWNER_ADDRESS]?.[GOERLI.chainId]) {
              resolve();
            }
          },
        );
      });

      // check that the NFT is not in state to begin with
      expect(nftController.state.allNfts).toStrictEqual({});

      // this is our account and network status when the watchNFT request is made
      triggerSelectedAccountChange(OWNER_ACCOUNT);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
      });

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      nftController.watchNft(
        ERC721_NFT,
        ERC721,
        'https://etherscan.io',
        'goerli',
        {
          userAddress: SECOND_OWNER_ADDRESS,
        },
      );

      await pendingRequest;

      // now accept the request
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.accept(requestId);
      await acceptedRequest;

      // check that the NFT was added to the correct chainId/selectedAddress in state
      const {
        state: { allNfts },
      } = nftController;

      expect(allNfts).toStrictEqual({
        [SECOND_OWNER_ADDRESS]: {
          [GOERLI.chainId]: [
            {
              ...ERC721_NFT,
              favorite: false,
              isCurrentlyOwned: true,
              description: 'testERC721Description',
              image: 'testERC721Image',
              name: 'testERC721Name',
              standard: ERC721,
              chainId: convertHexToDecimal(ChainId.goerli),
            },
          ],
        },
      });
    });

    it('should add the NFT to the correct chainId/selectedAddress (when passed a networkClientId) in state even if the user changes network and account before accepting the request', async function () {
      nock('https://testtokenuri.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'testERC721Image',
            name: 'testERC721Name',
            description: 'testERC721Description',
          }),
        );

      const {
        nftController,
        messenger,
        approvalController,
        triggerPreferencesStateChange,
        triggerSelectedAccountChange,
      } = setupController({
        getERC721OwnerOf: jest.fn().mockImplementation(() => OWNER_ADDRESS),
        getERC721TokenURI: jest
          .fn()
          .mockResolvedValue('https://testtokenuri.com'),
        getERC721AssetName: jest.fn().mockResolvedValue('testERC721Name'),
        getERC721AssetSymbol: jest.fn().mockResolvedValue('testERC721Symbol'),
      });

      const requestId = 'approval-request-id-1';

      const clock = sinon.useFakeTimers(1);

      (v4 as jest.Mock).mockImplementationOnce(() => requestId);

      const pendingRequest = new Promise<void>((resolve) => {
        messenger.subscribe('ApprovalController:stateChange', () => {
          resolve();
        });
      });

      const acceptedRequest = new Promise<void>((resolve) => {
        messenger.subscribe(
          'NftController:stateChange',
          (state: NftControllerState) => {
            if (state.allNfts?.[OWNER_ADDRESS]?.[GOERLI.chainId].length) {
              resolve();
            }
          },
        );
      });

      // check that the NFT is not in state to begin with
      expect(nftController.state.allNfts).toStrictEqual({});

      // this is our account and network status when the watchNFT request is made
      triggerSelectedAccountChange(OWNER_ACCOUNT);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: OWNER_ADDRESS,
      });

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      nftController.watchNft(
        ERC721_NFT,
        ERC721,
        'https://etherscan.io',
        'goerli',
      );

      await pendingRequest;

      // change the network and selectedAddress before accepting the request
      const differentAccount = createMockInternalAccount({
        address: '0xfa2d29eb2dbd1fc5ed7e781aa0549a7b3e032f1d',
      });
      triggerSelectedAccountChange(differentAccount);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
      });
      // now accept the request
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.accept(requestId);
      await acceptedRequest;

      // check that the NFT was added to the correct chainId/selectedAddress in state
      const {
        state: { allNfts },
      } = nftController;
      expect(allNfts).toStrictEqual({
        // this is the selectedAddress when the request was made
        [OWNER_ADDRESS]: {
          // this is the chainId when the request was made
          [GOERLI.chainId]: [
            {
              ...ERC721_NFT,
              favorite: false,
              isCurrentlyOwned: true,
              description: 'testERC721Description',
              image: 'testERC721Image',
              name: 'testERC721Name',
              standard: ERC721,
              chainId: convertHexToDecimal(ChainId.goerli),
            },
          ],
        },
      });

      clock.restore();
    });

    it('should throw an error when calls to `ownerOf` and `balanceOf` revert', async function () {
      const { nftController } = setupController();
      // getERC721OwnerOf not mocked
      // getERC1155BalanceOf not mocked

      const requestId = 'approval-request-id-1';
      (v4 as jest.Mock).mockImplementationOnce(() => requestId);

      // Awaiting `expect` as recommended by eslint results in this test stalling and timing out.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises, jest/valid-expect
      expect(
        async () =>
          await nftController.watchNft(
            ERC721_NFT,
            ERC721,
            'https://test-dapp.com',
            'sepolia',
          ),
      ).rejects.toThrow(
        "Unable to verify ownership. Possibly because the standard is not supported or the user's currently selected network does not match the chain of the asset in question.",
      );
    });
  });

  describe('addNft', () => {
    it('should add the nft contract to the correct chain in state when source is detected', async () => {
      const { nftController } = setupController({
        options: {},
        getERC721AssetName: jest.fn().mockResolvedValue('Name'),
      });

      await nftController.addNft('0x01', '1', 'mainnet', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
          collection: {
            tokenCount: '0',
            image: 'url',
          },
        },
        //  chainId: ChainId.mainnet,
        source: Source.Detected,
      });

      expect(
        nftController.state.allNftContracts[OWNER_ACCOUNT.address][
          ChainId.mainnet
        ][0],
      ).toStrictEqual({
        address: '0x01',
        logo: 'url',
        name: 'Name',
        schemaName: 'standard',
        totalSupply: '0',
      });
    });

    it('should add the nft contract to the correct chain in state when source is custom', async () => {
      const { nftController } = setupController({
        options: {},
        getERC721AssetName: jest.fn().mockResolvedValue('Name'),
      });

      await nftController.addNft('0x01', '1', 'sepolia', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
          collection: {
            tokenCount: '0',
            image: 'url',
          },
        },
        source: Source.Custom,
      });
      expect(
        nftController.state.allNftContracts[OWNER_ACCOUNT.address][
          ChainId.sepolia
        ][0],
      ).toStrictEqual({
        address: '0x01',
        logo: 'url',
        name: 'Name',
        schemaName: 'standard',
        totalSupply: '0',
      });
    });
    it('should add NFT and NFT contract', async () => {
      const { nftController } = setupController({
        options: {
          // chainId: ChainId.mainnet,
        },
        getERC721AssetName: jest.fn().mockResolvedValue('Name'),
      });

      await nftController.addNft('0x01', '1', 'mainnet', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
          collection: {
            tokenCount: '0',
            image: 'url',
          },
        },
      });

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual({
        address: '0x01',
        chainId: convertHexToDecimal(ChainId.mainnet),
        description: 'description',
        image: 'image',
        name: 'name',
        tokenId: '1',
        standard: 'standard',
        favorite: false,
        isCurrentlyOwned: true,
        collection: {
          tokenCount: '0',
          image: 'url',
        },
      });

      expect(
        nftController.state.allNftContracts[OWNER_ACCOUNT.address][
          ChainId.mainnet
        ][0],
      ).toStrictEqual({
        address: '0x01',
        logo: 'url',
        name: 'Name',
        totalSupply: '0',
        schemaName: 'standard',
      });
    });

    it('should call onNftAdded callback correctly when NFT is manually added', async () => {
      const mockOnNftAdded = jest.fn();
      const { nftController } = setupController({
        options: {
          onNftAdded: mockOnNftAdded,
        },
      });

      await nftController.addNft('0x01', '1', 'mainnet', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'ERC1155',
          favorite: false,
        },
      });

      expect(mockOnNftAdded).toHaveBeenCalledWith({
        source: Source.Custom,
        tokenId: '1',
        address: '0x01',
        standard: 'ERC1155',
      });
    });

    it('should call onNftAdded callback correctly when NFT is added via detection', async () => {
      const mockOnNftAdded = jest.fn();
      const { nftController } = setupController({
        options: {
          onNftAdded: mockOnNftAdded,
        },
      });

      const detectedUserAddress = '0x123';
      await nftController.addNft('0x01', '2', 'mainnet', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: ERC721,
          favorite: false,
        },
        userAddress: detectedUserAddress,
        source: Source.Detected,
      });

      expect(mockOnNftAdded).toHaveBeenCalledWith({
        source: 'detected',
        tokenId: '2',
        address: '0x01',
        standard: ERC721,
      });
    });

    it('should add NFT by selected address', async () => {
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const mockGetERC1155TokenURI = jest.fn().mockRejectedValue('');

      const {
        nftController,
        triggerPreferencesStateChange,
        triggerSelectedAccountChange,
        mockGetAccount,
      } = setupController({
        getERC721TokenURI: mockGetERC721TokenURI,
        getERC1155TokenURI: mockGetERC1155TokenURI,
      });
      const firstAddress = '0x123';
      const firstAccount = createMockInternalAccount({ address: firstAddress });
      const secondAddress = '0x321';
      const secondAccount = createMockInternalAccount({
        address: secondAddress,
      });

      mockGetAccount.mockReturnValue(firstAccount);
      triggerSelectedAccountChange(firstAccount);
      nock('https://url').get('/').reply(200, {
        name: 'name',
        image: 'url',
        description: 'description',
      });
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
      });
      await nftController.addNft('0x01', '1234', 'mainnet');
      mockGetAccount.mockReturnValue(secondAccount);
      triggerSelectedAccountChange(secondAccount);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
      });
      await nftController.addNft('0x02', '4321', 'mainnet');
      mockGetAccount.mockReturnValue(firstAccount);
      triggerSelectedAccountChange(firstAccount);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
      });
      expect(
        nftController.state.allNfts[firstAddress][ChainId.mainnet][0],
      ).toStrictEqual({
        address: '0x01',
        chainId: convertHexToDecimal(ChainId.mainnet),
        description: 'description',
        image: 'url',
        name: 'name',
        standard: ERC721,
        tokenURI,
        tokenId: '1234',
        favorite: false,
        isCurrentlyOwned: true,
      });
    });

    it('should update NFT if image is different', async () => {
      const { nftController } = setupController({
        defaultSelectedAccount: OWNER_ACCOUNT,
      });

      await nftController.addNft('0x01', '1', 'mainnet', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        },
      });

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual({
        address: '0x01',
        chainId: convertHexToDecimal(ChainId.mainnet),
        description: 'description',
        image: 'image',
        name: 'name',
        standard: 'standard',
        tokenId: '1',
        favorite: false,
        isCurrentlyOwned: true,
      });

      await nftController.addNft('0x01', '1', 'mainnet', {
        nftMetadata: {
          name: 'name',
          image: 'image-updated',
          description: 'description',
          standard: 'standard',
          favorite: false,
        },
      });

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual({
        address: '0x01',
        chainId: convertHexToDecimal(ChainId.mainnet),
        description: 'description',
        image: 'image-updated',
        name: 'name',
        tokenId: '1',
        standard: 'standard',
        favorite: false,
        isCurrentlyOwned: true,
      });
    });
    it('should update NFT collection field if new nft metadata has new keys', async () => {
      const { nftController } = setupController({
        options: {},
        defaultSelectedAccount: OWNER_ACCOUNT,
      });

      await nftController.addNft('0x01', '1', 'mainnet', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        },
      });

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual({
        address: '0x01',
        chainId: convertHexToDecimal(ChainId.mainnet),
        description: 'description',
        image: 'image',
        name: 'name',
        standard: 'standard',
        tokenId: '1',
        favorite: false,
        isCurrentlyOwned: true,
      });

      await nftController.addNft('0x01', '1', 'mainnet', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
          collection: {
            id: 'address',
            openseaVerificationStatus: 'verified',
            contractDeployedAt: 'timestamp',
          },
        },
      });

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual({
        address: '0x01',
        chainId: convertHexToDecimal(ChainId.mainnet),
        description: 'description',
        image: 'image',
        name: 'name',
        tokenId: '1',
        standard: 'standard',
        favorite: false,
        isCurrentlyOwned: true,
        collection: {
          id: 'address',
          openseaVerificationStatus: 'verified',
          contractDeployedAt: 'timestamp',
        },
      });
    });

    it('should not update NFT collection field if new nft metadata does not have new keys', async () => {
      const mockOnNftAdded = jest.fn();
      const { nftController } = setupController({
        options: {
          onNftAdded: mockOnNftAdded,
        },
        defaultSelectedAccount: OWNER_ACCOUNT,
      });

      await nftController.addNft('0x01', '1', 'mainnet', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
          collection: {
            id: 'address',
            openseaVerificationStatus: 'verified',
            contractDeployedAt: 'timestamp',
          },
        },
      });
      expect(mockOnNftAdded).toHaveBeenCalled();

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual({
        address: '0x01',
        chainId: convertHexToDecimal(ChainId.mainnet),
        description: 'description',
        image: 'image',
        name: 'name',
        standard: 'standard',
        tokenId: '1',
        favorite: false,
        isCurrentlyOwned: true,
        collection: {
          id: 'address',
          openseaVerificationStatus: 'verified',
          contractDeployedAt: 'timestamp',
        },
      });

      mockOnNftAdded.mockReset();

      await nftController.addNft('0x01', '1', 'mainnet', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
          collection: {
            id: 'address',
            openseaVerificationStatus: 'verified',
            contractDeployedAt: 'timestamp',
          },
        },
      });

      expect(mockOnNftAdded).not.toHaveBeenCalled();

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual({
        address: '0x01',
        chainId: convertHexToDecimal(ChainId.mainnet),
        description: 'description',
        image: 'image',
        name: 'name',
        tokenId: '1',
        standard: 'standard',
        favorite: false,
        isCurrentlyOwned: true,
        collection: {
          id: 'address',
          openseaVerificationStatus: 'verified',
          contractDeployedAt: 'timestamp',
        },
      });
    });

    it('should not duplicate NFT nor NFT contract if already added', async () => {
      const { nftController } = setupController({
        defaultSelectedAccount: OWNER_ACCOUNT,
      });

      await nftController.addNft('0x01', '1', 'mainnet', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        },
      });

      await nftController.addNft('0x01', '1', 'mainnet', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        },
      });

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet],
      ).toHaveLength(1);

      expect(
        nftController.state.allNftContracts[OWNER_ACCOUNT.address][
          ChainId.mainnet
        ],
      ).toHaveLength(1);
    });

    it('should add NFT and get information from NFT-API', async () => {
      const { nftController } = setupController({
        getERC721TokenURI: jest
          .fn()
          .mockRejectedValue(new Error('Not an ERC721 contract')),
        getERC1155TokenURI: jest
          .fn()
          .mockRejectedValue(new Error('Not an ERC1155 contract')),
        defaultSelectedAccount: OWNER_ACCOUNT,
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
        .get(`/collections?chainId=1&id=0x1`)
        .reply(200, {
          collections: [
            {
              contractDeployedAt: 'timestampTest',
              ownerCount: '989',
              openseaVerificationStatus: 'verified',
              topBid: testTopBid,
            },
          ],
        });

      await nftController.addNft('0x01', '1', 'mainnet');
      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual({
        address: '0x01',
        chainId: convertHexToDecimal(ChainId.mainnet),
        description: 'Description',
        image: 'url',
        name: 'Name',
        standard: 'ERC1155',
        tokenId: '1',
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI: '',
        creator: 'Oxaddress',
        collection: {
          id: '0x1',
          creator: 'Oxaddress',
          tokenCount: 0,
          contractDeployedAt: 'timestampTest',
          ownerCount: '989',
          openseaVerificationStatus: 'verified',
          topBid: testTopBid,
        },
      });
    });

    it('should add NFT erc721 and aggregate NFT data from both contract and NFT-API even if call to Get Collections fails', async () => {
      const { nftController } = setupController({
        getERC721AssetName: jest.fn().mockResolvedValue('KudosToken'),
        getERC721AssetSymbol: jest.fn().mockResolvedValue('KDO'),
        getERC721TokenURI: jest
          .fn()
          .mockResolvedValue(
            'https://ipfs.gitcoin.co:443/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov',
          ),
        defaultSelectedAccount: OWNER_ACCOUNT,
      });
      nock(NFT_API_BASE_URL)
        .get(
          `/tokens?chainIds=1&tokens=${ERC721_KUDOSADDRESS}%3A${ERC721_KUDOS_TOKEN_ID}&includeTopBid=true&includeAttributes=true&includeLastSale=true`,
        )
        .reply(200, {
          tokens: [
            {
              token: {
                contract: `${ERC721_KUDOSADDRESS}`,
                kind: 'erc721',
                name: 'Kudos Name',
                description: 'Kudos Description',
                image: 'url',
                collection: {
                  id: `${ERC721_KUDOSADDRESS}`,
                },
              },
            },
          ],
        });

      nock(NFT_API_BASE_URL)
        .get(`/collections?chainId=1&id=${ERC721_KUDOSADDRESS}`)
        .replyWithError(new Error('Failed to fetch'));

      nock('https://ipfs.gitcoin.co:443')
        .get('/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov')
        .reply(200, {
          image: 'Kudos Image (directly from tokenURI)',
          name: 'Kudos Name (directly from tokenURI)',
          description: 'Kudos Description (directly from tokenURI)',
        });

      await nftController.addNft(
        ERC721_KUDOSADDRESS,
        ERC721_KUDOS_TOKEN_ID,
        'mainnet',
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        chainId: convertHexToDecimal(ChainId.mainnet),
        image: 'url',
        name: 'Kudos Name (directly from tokenURI)',
        description: 'Kudos Description (directly from tokenURI)',
        tokenId: ERC721_KUDOS_TOKEN_ID,
        standard: ERC721,
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI:
          'https://ipfs.gitcoin.co:443/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov',
        collection: {
          contractDeployedAt: undefined,
          creator: undefined,
          id: ERC721_KUDOSADDRESS,
          openseaVerificationStatus: undefined,
          ownerCount: undefined,
          topBid: undefined,
        },
      });

      expect(
        nftController.state.allNftContracts[OWNER_ACCOUNT.address][
          ChainId.mainnet
        ][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        name: 'KudosToken',
        symbol: 'KDO',
        schemaName: ERC721,
      });
    });
    it('should add NFT erc721 and aggregate NFT data from both contract and NFT-API when  call to Get Collections succeeds', async () => {
      const { nftController } = setupController({
        getERC721AssetName: jest.fn().mockResolvedValue('KudosToken'),
        getERC721AssetSymbol: jest.fn().mockResolvedValue('KDO'),
        getERC721TokenURI: jest
          .fn()
          .mockResolvedValue(
            'https://ipfs.gitcoin.co:443/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov',
          ),
        defaultSelectedAccount: OWNER_ACCOUNT,
      });
      nock(NFT_API_BASE_URL)
        .get(
          `/tokens?chainIds=1&tokens=${ERC721_KUDOSADDRESS}%3A${ERC721_KUDOS_TOKEN_ID}&includeTopBid=true&includeAttributes=true&includeLastSale=true`,
        )
        .reply(200, {
          tokens: [
            {
              token: {
                contract: ERC721_KUDOSADDRESS,
                kind: 'erc721',
                name: 'Kudos Name',
                description: 'Kudos Description',
                image: 'url',
                collection: {
                  id: ERC721_KUDOSADDRESS,
                },
              },
            },
          ],
        });

      nock(NFT_API_BASE_URL)
        .get(`/collections?chainId=1&id=${ERC721_KUDOSADDRESS}`)
        .reply(200, {
          collections: [
            {
              contractDeployedAt: 'timestampTest',
              ownerCount: '989',
              openseaVerificationStatus: 'verified',
              creator: '0xcreator',
            },
          ],
        });

      nock('https://ipfs.gitcoin.co:443')
        .get('/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov')
        .reply(200, {
          image: 'Kudos Image (directly from tokenURI)',
          name: 'Kudos Name (directly from tokenURI)',
          description: 'Kudos Description (directly from tokenURI)',
        });

      await nftController.addNft(
        ERC721_KUDOSADDRESS,
        ERC721_KUDOS_TOKEN_ID,
        'mainnet',
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        chainId: convertHexToDecimal(ChainId.mainnet),
        image: 'url',
        name: 'Kudos Name (directly from tokenURI)',
        description: 'Kudos Description (directly from tokenURI)',
        tokenId: ERC721_KUDOS_TOKEN_ID,
        standard: ERC721,
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI:
          'https://ipfs.gitcoin.co:443/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov',
        collection: {
          id: ERC721_KUDOSADDRESS,
          creator: '0xcreator',
          contractDeployedAt: 'timestampTest',
          ownerCount: '989',
          openseaVerificationStatus: 'verified',
          topBid: undefined,
        },
      });

      expect(
        nftController.state.allNftContracts[OWNER_ACCOUNT.address][
          ChainId.mainnet
        ][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        name: 'KudosToken',
        symbol: 'KDO',
        schemaName: ERC721,
      });
    });

    it('should add NFT erc1155 and get NFT information from contract when NFT API call fail', async () => {
      const { nftController } = setupController({
        getERC721TokenURI: jest
          .fn()
          .mockRejectedValue(new Error('Not a 721 contract')),
        getERC1155TokenURI: jest
          .fn()
          .mockResolvedValue(
            'https://api.opensea.io/api/v1/metadata/0x495f947276749Ce646f68AC8c248420045cb7b5e/0x{id}',
          ),
        defaultSelectedAccount: OWNER_ACCOUNT,
      });
      nock('https://api.opensea.io')
        .get(
          `/api/v1/metadata/${ERC1155_NFT_ADDRESS}/0x5a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001`,
        )
        .reply(200, {
          name: 'name (directly from tokenURI)',
          description: 'description (directly from tokenURI)',
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          external_link: null,
          image: 'image (directly from tokenURI)',
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          animation_url: null,
        });

      await nftController.addNft(
        ERC1155_NFT_ADDRESS,
        ERC1155_NFT_ID,
        'mainnet',
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual({
        address: ERC1155_NFT_ADDRESS,
        chainId: convertHexToDecimal(ChainId.mainnet),
        image: 'image (directly from tokenURI)',
        name: 'name (directly from tokenURI)',
        description: 'description (directly from tokenURI)',
        tokenId: ERC1155_NFT_ID,
        standard: ERC1155,
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI:
          'https://api.opensea.io/api/v1/metadata/0x495f947276749Ce646f68AC8c248420045cb7b5e/0x5a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001',
      });
    });

    it('should add NFT erc721 and get NFT information only from contract', async () => {
      const { nftController } = setupController({
        getERC721AssetName: jest.fn().mockResolvedValue('KudosToken'),
        getERC721AssetSymbol: jest.fn().mockResolvedValue('KDO'),
        getERC721TokenURI: jest.fn().mockImplementation((tokenAddress) => {
          switch (tokenAddress) {
            case ERC721_KUDOSADDRESS:
              return 'https://ipfs.gitcoin.co:443/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov';
            default:
              throw new Error('Not an ERC721 token');
          }
        }),
        defaultSelectedAccount: OWNER_ACCOUNT,
      });
      nock('https://ipfs.gitcoin.co:443')
        .get('/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov')
        .reply(200, {
          image: 'Kudos Image (directly from tokenURI)',
          name: 'Kudos Name (directly from tokenURI)',
          description: 'Kudos Description (directly from tokenURI)',
        });

      nock('https://nft.api.cx.metamask.io')
        .get(
          '/tokens?chainIds=1&tokens=0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163%3A1203&includeTopBid=true&includeAttributes=true&includeLastSale=true',
        )
        .reply(404, { error: 'Not found' });

      await nftController.addNft(
        ERC721_KUDOSADDRESS,
        ERC721_KUDOS_TOKEN_ID,
        'mainnet',
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        chainId: convertHexToDecimal(ChainId.mainnet),
        image: 'Kudos Image (directly from tokenURI)',
        name: 'Kudos Name (directly from tokenURI)',
        description: 'Kudos Description (directly from tokenURI)',
        tokenId: ERC721_KUDOS_TOKEN_ID,
        standard: ERC721,
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI:
          'https://ipfs.gitcoin.co:443/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov',
      });

      expect(
        nftController.state.allNftContracts[OWNER_ACCOUNT.address][
          ChainId.mainnet
        ][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        name: 'KudosToken',
        symbol: 'KDO',
        schemaName: ERC721,
      });
    });

    it('should return image when tokenURI fetched is an encoded data URL', async () => {
      const testTokenUriEncoded =
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHByZXNlcnZlQXNwZWN0UmF0aW89InhNaW5ZTWluIG1l';
      const { nftController } = setupController({
        getERC721AssetName: jest.fn().mockResolvedValue('KudosToken'),
        getERC721AssetSymbol: jest.fn().mockResolvedValue('KDO'),
        getERC721TokenURI: jest.fn().mockResolvedValue(testTokenUriEncoded),
        defaultSelectedAccount: OWNER_ACCOUNT,
      });
      await nftController.addNft(
        ERC721_KUDOSADDRESS,
        ERC721_KUDOS_TOKEN_ID,
        'mainnet',
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        chainId: convertHexToDecimal(ChainId.mainnet),
        image: testTokenUriEncoded,
        name: null,
        description: null,
        tokenId: ERC721_KUDOS_TOKEN_ID,
        standard: ERC721,
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI: testTokenUriEncoded,
      });
    });

    it('should add NFT by provider type', async () => {
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController } = setupController({
        getERC721TokenURI: mockGetERC721TokenURI,
        defaultSelectedAccount: OWNER_ACCOUNT,
      });
      nock('https://url').get('/').reply(200, {
        name: 'name',
        image: 'url',
        description: 'description',
      });

      await nftController.addNft('0x01', '1234', 'sepolia');

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][
          ChainId[SEPOLIA.type]
        ][0],
      ).toStrictEqual({
        address: '0x01',
        chainId: convertHexToDecimal(ChainId.sepolia),
        description: 'description',
        image: 'url',
        name: 'name',
        standard: ERC721,
        tokenId: '1234',
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI,
      });
    });

    it('should add an nft and nftContract to state when all contract information is falsy and the source is left empty (defaults to "custom")', async () => {
      const tokenURI = 'https://url/';
      const mockOnNftAdded = jest.fn();
      const mockGetERC721AssetSymbol = jest.fn().mockResolvedValue('');
      const mockGetERC721AssetName = jest.fn().mockResolvedValue('');
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController } = setupController({
        options: {
          onNftAdded: mockOnNftAdded,
        },
        getERC721AssetSymbol: mockGetERC721AssetSymbol,
        getERC721AssetName: mockGetERC721AssetName,
        getERC721TokenURI: mockGetERC721TokenURI,
        defaultSelectedAccount: OWNER_ACCOUNT,
      });

      nock('https://url').get('/').reply(200, {
        name: 'name',
        image: 'url',
        description: 'description',
      });

      await nftController.addNft('0x01234abcdefg', '1234', 'mainnet');

      expect(nftController.state.allNftContracts).toStrictEqual({
        [OWNER_ACCOUNT.address]: {
          [ChainId.mainnet]: [
            {
              address: '0x01234abcdefg',
              schemaName: ERC721,
            },
          ],
        },
      });

      expect(nftController.state.allNfts).toStrictEqual({
        [OWNER_ACCOUNT.address]: {
          [ChainId.mainnet]: [
            {
              address: '0x01234abcdefg',
              chainId: convertHexToDecimal(ChainId.mainnet),
              description: 'description',
              image: 'url',
              name: 'name',
              tokenId: '1234',
              standard: ERC721,
              tokenURI,
              favorite: false,
              isCurrentlyOwned: true,
            },
          ],
        },
      });

      expect(mockOnNftAdded).toHaveBeenCalledWith({
        address: '0x01234abcdefg',
        tokenId: '1234',
        standard: ERC721,
        symbol: undefined,
        source: Source.Custom,
      });
    });

    it('should add an nft and nftContract to state when all contract information is falsy and the source is "dapp"', async () => {
      const tokenURI = 'https://url/';
      const mockOnNftAdded = jest.fn();
      const mockGetERC721AssetSymbol = jest.fn().mockResolvedValue('');
      const mockGetERC721AssetName = jest.fn().mockResolvedValue('');
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController } = setupController({
        options: {
          onNftAdded: mockOnNftAdded,
        },
        getERC721AssetSymbol: mockGetERC721AssetSymbol,
        getERC721AssetName: mockGetERC721AssetName,
        getERC721TokenURI: mockGetERC721TokenURI,
      });
      nock('https://url').get('/').reply(200, {
        name: 'name',
        image: 'url',
        description: 'description',
      });

      await nftController.addNft('0x01234abcdefg', '1234', 'goerli', {
        userAddress: '0x123',
        source: Source.Dapp,
      });

      expect(nftController.state.allNftContracts).toStrictEqual({
        '0x123': {
          [GOERLI.chainId]: [
            {
              address: '0x01234abcdefg',
              schemaName: ERC721,
            },
          ],
        },
      });

      expect(nftController.state.allNfts).toStrictEqual({
        '0x123': {
          [GOERLI.chainId]: [
            {
              address: '0x01234abcdefg',
              chainId: convertHexToDecimal(ChainId.goerli),
              description: 'description',
              image: 'url',
              name: 'name',
              tokenId: '1234',
              favorite: false,
              standard: ERC721,
              isCurrentlyOwned: true,
              tokenURI,
            },
          ],
        },
      });

      expect(mockOnNftAdded).toHaveBeenCalledWith({
        address: '0x01234abcdefg',
        tokenId: '1234',
        standard: ERC721,
        symbol: undefined,
        source: Source.Dapp,
      });
    });

    it('should add an nft and nftContract when there is valid contract information and source is "detected" when call to getCollections fails', async () => {
      const mockOnNftAdded = jest.fn();
      const { nftController } = setupController({
        options: {
          onNftAdded: mockOnNftAdded,
        },
        getERC721AssetName: jest
          .fn()
          .mockRejectedValue(new Error('Failed to fetch')),
        getERC721AssetSymbol: jest
          .fn()
          .mockRejectedValue(new Error('Failed to fetch')),
        defaultSelectedAccount: OWNER_ACCOUNT,
      });
      nock(NFT_API_BASE_URL)
        .get(
          `/tokens?chainIds=1&tokens=${ERC721_KUDOSADDRESS}%3A${ERC721_KUDOS_TOKEN_ID}&includeTopBid=true&includeAttributes=true&includeLastSale=true`,
        )
        .reply(200, {
          tokens: [
            {
              token: {
                contract: ERC721_KUDOSADDRESS,
                kind: 'erc721',
                name: 'Kudos Name',
                description: 'Kudos Description',
                image: 'Kudos image (from proxy API)',
                collection: {
                  id: ERC721_KUDOSADDRESS,
                  name: 'Kudos',
                  tokenCount: '10',
                  image: 'Kudos logo (from proxy API)',
                },
              },
            },
          ],
        });

      nock(NFT_API_BASE_URL)
        .get(`/collections?chainId=1&id=${ERC721_KUDOSADDRESS}`)
        .replyWithError(new Error('Failed to fetch'));

      await nftController.addNft(
        '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
        '123',
        'mainnet',
        {
          userAddress: OWNER_ACCOUNT.address,
          source: Source.Detected,
        },
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address]?.[ChainId.mainnet],
      ).toBeUndefined();

      expect(
        nftController.state.allNftContracts[OWNER_ACCOUNT.address]?.[
          ChainId.mainnet
        ],
      ).toBeUndefined();

      await nftController.addNft(
        ERC721_KUDOSADDRESS,
        ERC721_KUDOS_TOKEN_ID,
        'mainnet',
        {
          userAddress: OWNER_ACCOUNT.address,
          source: Source.Detected,
        },
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet],
      ).toStrictEqual([
        {
          address: ERC721_KUDOSADDRESS,
          chainId: convertHexToDecimal(ChainId.mainnet),
          description: 'Kudos Description',
          image: 'Kudos image (from proxy API)',
          name: 'Kudos Name',
          standard: ERC721,
          tokenId: ERC721_KUDOS_TOKEN_ID,
          favorite: false,
          isCurrentlyOwned: true,
          tokenURI: null,
          collection: {
            id: ERC721_KUDOSADDRESS,
            tokenCount: '10',
            image: 'Kudos logo (from proxy API)',
            name: 'Kudos',
            creator: undefined,
            openseaVerificationStatus: undefined,
            ownerCount: undefined,
            contractDeployedAt: undefined,
            topBid: undefined,
          },
        },
      ]);

      expect(
        nftController.state.allNftContracts[OWNER_ACCOUNT.address][
          ChainId.mainnet
        ],
      ).toStrictEqual([
        {
          address: ERC721_KUDOSADDRESS,
          logo: 'Kudos logo (from proxy API)',
          name: 'Kudos',
          totalSupply: '10',
          schemaName: ERC721,
        },
      ]);

      expect(mockOnNftAdded).toHaveBeenCalledWith({
        address: ERC721_KUDOSADDRESS,
        tokenId: ERC721_KUDOS_TOKEN_ID,
        standard: ERC721,
        source: Source.Detected,
      });
    });

    it('should add an nft and nftContract when there is valid contract information and source is "detected" when call to get collections succeeds', async () => {
      const mockOnNftAdded = jest.fn();
      const { nftController } = setupController({
        options: {
          onNftAdded: mockOnNftAdded,
        },
        getERC721AssetName: jest
          .fn()
          .mockRejectedValue(new Error('Failed to fetch')),
        getERC721AssetSymbol: jest
          .fn()
          .mockRejectedValue(new Error('Failed to fetch')),
        defaultSelectedAccount: OWNER_ACCOUNT,
      });
      nock(NFT_API_BASE_URL)
        .get(
          `/tokens?chainIds=1&tokens=${ERC721_KUDOSADDRESS}%3A${ERC721_KUDOS_TOKEN_ID}&includeTopBid=true&includeAttributes=true&includeLastSale=true`,
        )
        .reply(200, {
          tokens: [
            {
              token: {
                contract: ERC721_KUDOSADDRESS,
                kind: 'erc721',
                name: 'Kudos Name',
                description: 'Kudos Description',
                image: 'Kudos image (from proxy API)',
                collection: {
                  id: ERC721_KUDOSADDRESS,
                  name: 'Kudos',
                  tokenCount: '10',
                  image: 'Kudos logo (from proxy API)',
                },
              },
            },
          ],
        });

      nock(NFT_API_BASE_URL)
        .get(`/collections?chainId=1&id=${ERC721_KUDOSADDRESS}`)
        .reply(200, {
          collections: [
            {
              creator: '0xcreator',
              openseaVerificationStatus: 'verified',
            },
          ],
        });

      await nftController.addNft(
        '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
        '123',
        'mainnet',
        {
          userAddress: OWNER_ACCOUNT.address,
          source: Source.Detected,
        },
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address]?.[ChainId.mainnet],
      ).toBeUndefined();

      expect(
        nftController.state.allNftContracts[OWNER_ACCOUNT.address]?.[
          ChainId.mainnet
        ],
      ).toBeUndefined();

      await nftController.addNft(
        ERC721_KUDOSADDRESS,
        ERC721_KUDOS_TOKEN_ID,
        'mainnet',
        {
          userAddress: OWNER_ACCOUNT.address,
          source: Source.Detected,
        },
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet],
      ).toStrictEqual([
        {
          address: ERC721_KUDOSADDRESS,
          chainId: convertHexToDecimal(ChainId.mainnet),
          description: 'Kudos Description',
          image: 'Kudos image (from proxy API)',
          name: 'Kudos Name',
          standard: ERC721,
          tokenId: ERC721_KUDOS_TOKEN_ID,
          favorite: false,
          isCurrentlyOwned: true,
          tokenURI: null,
          collection: {
            id: ERC721_KUDOSADDRESS,
            tokenCount: '10',
            image: 'Kudos logo (from proxy API)',
            name: 'Kudos',
            creator: '0xcreator',
            openseaVerificationStatus: 'verified',
            ownerCount: undefined,
            contractDeployedAt: undefined,
            topBid: undefined,
          },
        },
      ]);

      expect(
        nftController.state.allNftContracts[OWNER_ACCOUNT.address][
          ChainId.mainnet
        ],
      ).toStrictEqual([
        {
          address: ERC721_KUDOSADDRESS,
          logo: 'Kudos logo (from proxy API)',
          name: 'Kudos',
          totalSupply: '10',
          schemaName: ERC721,
        },
      ]);

      expect(mockOnNftAdded).toHaveBeenCalledWith({
        address: ERC721_KUDOSADDRESS,
        tokenId: ERC721_KUDOS_TOKEN_ID,
        standard: ERC721,
        source: Source.Detected,
      });
    });

    it('should not add an nft and nftContract when there is not valid contract information (or an issue fetching it) and source is "detected"', async () => {
      const mockOnNftAdded = jest.fn();
      const { nftController } = setupController({
        options: {
          onNftAdded: mockOnNftAdded,
        },
        getERC721AssetName: jest
          .fn()
          .mockRejectedValue(new Error('Failed to fetch')),
        getERC721AssetSymbol: jest
          .fn()
          .mockRejectedValue(new Error('Failed to fetch')),
        defaultSelectedAccount: OWNER_ACCOUNT,
      });
      nock(NFT_API_BASE_URL)
        .get(
          `/tokens?chainIds=1&tokens=${ERC721_KUDOSADDRESS}%3A${ERC721_KUDOS_TOKEN_ID}&includeTopBid=true&includeAttributes=true&includeLastSale=true`,
        )
        .replyWithError(new Error('Failed to fetch'));
      await nftController.addNft(
        '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
        '123',
        'mainnet',
        {
          userAddress: OWNER_ACCOUNT.address,
          source: Source.Detected,
        },
      );
      await nftController.addNft(
        ERC721_KUDOSADDRESS,
        ERC721_KUDOS_TOKEN_ID,
        'mainnet',
        {
          userAddress: OWNER_ACCOUNT.address,
          source: Source.Detected,
        },
      );

      expect(nftController.state.allNfts).toStrictEqual({});
      expect(nftController.state.allNftContracts).toStrictEqual({});
      expect(mockOnNftAdded).not.toHaveBeenCalled();
    });

    it('should not add duplicate NFTs to the ignoredNfts list', async () => {
      const { nftController } = setupController({
        defaultSelectedAccount: OWNER_ACCOUNT,
      });

      await nftController.addNft('0x01', '1', 'mainnet', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
        },
      });

      await nftController.addNft('0x01', '2', 'mainnet', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
        },
      });

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet],
      ).toHaveLength(2);
      expect(nftController.state.ignoredNfts).toHaveLength(0);

      nftController.removeAndIgnoreNft('0x01', '1', 'mainnet');
      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet],
      ).toHaveLength(1);
      expect(nftController.state.ignoredNfts).toHaveLength(1);

      await nftController.addNft('0x01', '1', 'mainnet', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
        },
      });

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet],
      ).toHaveLength(2);
      expect(nftController.state.ignoredNfts).toHaveLength(1);

      nftController.removeAndIgnoreNft('0x01', '1', 'mainnet');
      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet],
      ).toHaveLength(1);
      expect(nftController.state.ignoredNfts).toHaveLength(1);
    });

    it('should add NFT with metadata hosted in IPFS', async () => {
      const { nftController, triggerPreferencesStateChange, mockGetAccount } =
        setupController({
          getERC721AssetName: jest
            .fn()
            .mockResolvedValue("Maltjik.jpg's Depressionists"),
          getERC721AssetSymbol: jest.fn().mockResolvedValue('DPNS'),
          getERC721TokenURI: jest.fn().mockImplementation((tokenAddress) => {
            switch (tokenAddress) {
              case ERC721_DEPRESSIONIST_ADDRESS:
                return `ipfs://${DEPRESSIONIST_CID_V1}`;
              default:
                throw new Error('Not an ERC721 token');
            }
          }),
          getERC1155TokenURI: jest
            .fn()
            .mockRejectedValue(new Error('Not an ERC1155 token')),
        });
      mockGetAccount.mockReturnValue(OWNER_ACCOUNT);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        ipfsGateway: IPFS_DEFAULT_GATEWAY_URL,
      });

      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        'mainnet',
      );

      expect(
        nftController.state.allNftContracts[OWNER_ACCOUNT.address][
          ChainId.mainnet
        ][0],
      ).toStrictEqual({
        address: ERC721_DEPRESSIONIST_ADDRESS,
        name: "Maltjik.jpg's Depressionists",
        symbol: 'DPNS',
        schemaName: ERC721,
      });
      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual({
        address: ERC721_DEPRESSIONIST_ADDRESS,
        chainId: convertHexToDecimal(ChainId.mainnet),
        tokenId: '36',
        image: 'image',
        name: 'name',
        description: 'description',
        standard: ERC721,
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI:
          'https://bafybeidf7aw7bmnmewwj4ayq3she2jfk5jrdpp24aaucf6fddzb3cfhrvm.ipfs.cloudflare-ipfs.com',
      });
    });

    it('should add NFT erc721 when call to NFT API fail', async () => {
      const { nftController } = setupController();
      nock(NFT_API_BASE_URL)
        .get(
          `/tokens?chainIds=1&tokens=${ERC721_NFT_ADDRESS}%3A${ERC721_NFT_ID}&includeTopBid=true&includeAttributes=true&includeLastSale=true`,
        )
        .replyWithError(new Error('Failed to fetch'));

      await nftController.addNft(ERC721_NFT_ADDRESS, ERC721_NFT_ID, 'mainnet');

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual({
        address: ERC721_NFT_ADDRESS,
        chainId: convertHexToDecimal(ChainId.mainnet),
        image: null,
        name: null,
        description: null,
        tokenId: ERC721_NFT_ID,
        standard: null,
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI: null,
      });
    });

    it('should add an NFT with the correct chainId and metadata when passed a networkClientId', async () => {
      nock('https://testtokenuri-1.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'test-image-1',
            name: 'test-name-1',
            description: 'test-description-1',
          }),
        );

      nock('https://testtokenuri-2.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'test-image-2',
            name: 'test-name-2',
            description: 'test-description-2',
          }),
        );

      nock('https://testtokenuri-3.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'test-image-3',
            name: 'test-name-3',
            description: 'test-description-3',
          }),
        );

      const { nftController } = setupController({
        getERC721TokenURI: jest.fn().mockImplementation((tokenAddress) => {
          switch (tokenAddress) {
            case '0x01':
              return 'https://testtokenuri-1.com';
            case '0x02':
              return 'https://testtokenuri-2.com';
            default:
              throw new Error('Not an ERC721 token');
          }
        }),
        getERC1155TokenURI: jest.fn().mockImplementation((tokenAddress) => {
          switch (tokenAddress) {
            case '0x03':
              return 'https://testtokenuri-3.com';
            default:
              throw new Error('Not an ERC1155 token');
          }
        }),
        mockNetworkClientConfigurationsByNetworkClientId: {
          'customNetworkClientId-1': buildCustomNetworkClientConfiguration({
            chainId: '0xa',
          }),
        },
      });

      await nftController.addNft('0x01', '1234', 'sepolia');
      await nftController.addNft('0x02', '4321', 'goerli');
      await nftController.addNft('0x03', '5678', 'customNetworkClientId-1');

      expect(
        nftController.state.allNfts[OWNER_ADDRESS][SEPOLIA.chainId],
      ).toStrictEqual([
        {
          address: '0x01',
          chainId: convertHexToDecimal(ChainId.sepolia),
          description: 'test-description-1',
          image: 'test-image-1',
          name: 'test-name-1',
          tokenId: '1234',
          favorite: false,
          standard: ERC721,
          tokenURI: 'https://testtokenuri-1.com',
          isCurrentlyOwned: true,
        },
      ]);

      expect(
        nftController.state.allNfts[OWNER_ADDRESS][GOERLI.chainId],
      ).toStrictEqual([
        {
          address: '0x02',
          chainId: convertHexToDecimal(ChainId.goerli),
          description: 'test-description-2',
          image: 'test-image-2',
          name: 'test-name-2',
          tokenId: '4321',
          favorite: false,
          standard: ERC721,
          tokenURI: 'https://testtokenuri-2.com',
          isCurrentlyOwned: true,
        },
      ]);

      expect(nftController.state.allNfts[OWNER_ADDRESS]['0xa']).toStrictEqual([
        {
          address: '0x03',
          chainId: convertHexToDecimal('0xa'),
          description: 'test-description-3',
          image: 'test-image-3',
          name: 'test-name-3',
          tokenId: '5678',
          favorite: false,
          standard: ERC1155,
          tokenURI: 'https://testtokenuri-3.com',
          isCurrentlyOwned: true,
        },
      ]);
    });

    it('should add an NFT with the correct chainId/userAddress and metadata when passed a userAddress', async () => {
      const userAddress = '0x123ABC';
      nock('https://testtokenuri-1.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'test-image-1',
            name: 'test-name-1',
            description: 'test-description-1',
          }),
        );

      nock('https://testtokenuri-2.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'test-image-2',
            name: 'test-name-2',
            description: 'test-description-2',
          }),
        );

      nock('https://testtokenuri-3.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'test-image-3',
            name: 'test-name-3',
            description: 'test-description-3',
          }),
        );

      const { nftController } = setupController({
        getERC721TokenURI: jest.fn().mockImplementation((tokenAddress) => {
          // eslint-disable-next-line jest/no-conditional-in-test
          switch (tokenAddress) {
            case '0x01':
              return 'https://testtokenuri-1.com';
            case '0x02':
              return 'https://testtokenuri-2.com';
            default:
              throw new Error('Not an ERC721 token');
          }
        }),
        getERC1155TokenURI: jest.fn().mockImplementation((tokenAddress) => {
          // eslint-disable-next-line jest/no-conditional-in-test
          switch (tokenAddress) {
            case '0x03':
              return 'https://testtokenuri-3.com';
            default:
              throw new Error('Not an ERC1155 token');
          }
        }),
      });

      await nftController.addNft('0x01', '1234', 'mainnet', {
        userAddress,
      });

      await nftController.addNft('0x02', '4321', 'goerli', {
        userAddress,
      });

      await nftController.addNft('0x03', '5678', 'sepolia', {
        userAddress,
      });

      expect(nftController.state.allNfts[userAddress]['0x1']).toStrictEqual([
        {
          address: '0x01',
          chainId: convertHexToDecimal(ChainId.mainnet),
          description: 'test-description-1',
          image: 'test-image-1',
          name: 'test-name-1',
          tokenId: '1234',
          favorite: false,
          standard: ERC721,
          tokenURI: 'https://testtokenuri-1.com',
          isCurrentlyOwned: true,
        },
      ]);
      expect(
        nftController.state.allNfts[userAddress][GOERLI.chainId],
      ).toStrictEqual([
        {
          address: '0x02',
          chainId: convertHexToDecimal(ChainId.goerli),
          description: 'test-description-2',
          image: 'test-image-2',
          name: 'test-name-2',
          tokenId: '4321',
          favorite: false,
          standard: ERC721,
          tokenURI: 'https://testtokenuri-2.com',
          isCurrentlyOwned: true,
        },
      ]);
      expect(
        nftController.state.allNfts[userAddress][SEPOLIA.chainId],
      ).toStrictEqual([
        {
          address: '0x03',
          chainId: convertHexToDecimal(ChainId.sepolia),
          description: 'test-description-3',
          image: 'test-image-3',
          name: 'test-name-3',
          tokenId: '5678',
          favorite: false,
          standard: ERC1155,
          tokenURI: 'https://testtokenuri-3.com',
          isCurrentlyOwned: true,
        },
      ]);
    });

    it('should handle unset selectedAccount', async () => {
      const { nftController, mockGetAccount } = setupController({
        options: {
          //  chainId: ChainId.mainnet,
        },
        getERC721AssetName: jest.fn().mockResolvedValue('Name'),
      });

      mockGetAccount.mockReturnValue(null);

      await nftController.addNft('0x01', '1', 'mainnet', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
          collection: {
            tokenCount: '0',
            image: 'url',
          },
        },
      });

      expect(nftController.state.allNftContracts['']).toBeUndefined();
    });
  });

  describe('addNftVerifyOwnership', () => {
    it('should verify ownership by selected address and add NFT', async () => {
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);

      const {
        nftController,
        mockGetAccount,
        triggerPreferencesStateChange,
        triggerSelectedAccountChange,
      } = setupController({
        getERC721TokenURI: mockGetERC721TokenURI,
      });
      const firstAddress = '0x123';
      const firstAccount = createMockInternalAccount({
        address: firstAddress,
        id: '22c022b5-309c-45e4-a82d-64bb11fc0e74',
      });
      const secondAddress = '0x321';
      const secondAccount = createMockInternalAccount({
        address: secondAddress,
        id: 'f9a42417-6071-4b51-8ecd-f7b14abd8851',
      });
      mockGetAccount.mockReturnValue(firstAccount);
      triggerSelectedAccountChange(firstAccount);

      jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(true);
      nock('https://url').get('/').reply(200, {
        name: 'name',
        image: 'url',
        description: 'description',
      });
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
      });
      await nftController.addNftVerifyOwnership('0x01', '1234', 'mainnet');
      mockGetAccount.mockReturnValue(secondAccount);
      triggerSelectedAccountChange(secondAccount);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
      });
      await nftController.addNftVerifyOwnership('0x02', '4321', 'mainnet');
      mockGetAccount.mockReturnValue(firstAccount);
      triggerSelectedAccountChange(firstAccount);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
      });
      expect(
        nftController.state.allNfts[firstAccount.address][ChainId.mainnet][0],
      ).toStrictEqual({
        address: '0x01',
        chainId: convertHexToDecimal(ChainId.mainnet),
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '1234',
        standard: ERC721,
        tokenURI,
        favorite: false,
        isCurrentlyOwned: true,
      });
    });

    it('should throw an error if selected address is not owner of input NFT', async () => {
      const {
        nftController,
        mockGetAccount,
        triggerPreferencesStateChange,
        triggerSelectedAccountChange,
      } = setupController();
      jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(false);
      const firstAddress = '0x123';
      const firstAccount = createMockInternalAccount({
        address: firstAddress,
        id: '22c022b5-309c-45e4-a82d-64bb11fc0e74',
      });
      mockGetAccount.mockReturnValue(firstAccount);
      triggerSelectedAccountChange(firstAccount);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
      });
      const result = async () =>
        await nftController.addNftVerifyOwnership('0x01', '1234', 'mainnet');
      const error = 'This NFT is not owned by the user';
      await expect(result).rejects.toThrow(error);
    });

    it('should verify ownership by selected address and add NFT by the correct chainId when passed networkClientId', async () => {
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const {
        nftController,
        triggerPreferencesStateChange,
        mockGetAccount,
        triggerSelectedAccountChange,
      } = setupController({
        getERC721TokenURI: mockGetERC721TokenURI,
      });

      const firstAddress = '0x123';
      const firstAccount = createMockInternalAccount({
        address: firstAddress,
        id: '22c022b5-309c-45e4-a82d-64bb11fc0e74',
      });
      const secondAddress = '0x321';
      const secondAccount = createMockInternalAccount({
        address: secondAddress,
        id: 'f9a42417-6071-4b51-8ecd-f7b14abd8851',
      });

      jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(true);

      nock('https://url')
        .get('/')
        .reply(200, {
          name: 'name',
          image: 'url',
          description: 'description',
        })
        .persist();
      mockGetAccount.mockReturnValue(firstAccount);
      triggerSelectedAccountChange(firstAccount);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
      });
      await nftController.addNftVerifyOwnership('0x01', '1234', 'sepolia');
      mockGetAccount.mockReturnValue(secondAccount);
      triggerSelectedAccountChange(secondAccount);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
      });
      await nftController.addNftVerifyOwnership('0x02', '4321', 'goerli');

      expect(
        nftController.state.allNfts[firstAccount.address][SEPOLIA.chainId][0],
      ).toStrictEqual({
        address: '0x01',
        chainId: convertHexToDecimal(ChainId.sepolia),
        description: 'description',
        image: 'url',
        name: 'name',
        standard: ERC721,
        tokenId: '1234',
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI,
      });
      expect(
        nftController.state.allNfts[secondAccount.address][GOERLI.chainId][0],
      ).toStrictEqual({
        address: '0x02',
        chainId: convertHexToDecimal(ChainId.goerli),
        description: 'description',
        image: 'url',
        name: 'name',
        standard: ERC721,
        tokenId: '4321',
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI,
      });
    });

    it('should verify ownership by selected address and add NFT by the correct userAddress when passed userAddress', async () => {
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const {
        nftController,
        triggerPreferencesStateChange,
        triggerSelectedAccountChange,
      } = setupController({
        getERC721TokenURI: mockGetERC721TokenURI,
      });
      // Ensure that the currently selected address is not the same as either of the userAddresses
      triggerSelectedAccountChange(OWNER_ACCOUNT);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
      });

      const firstAddress = '0x123';
      const secondAddress = '0x321';

      jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(true);

      nock('https://url')
        .get('/')
        .reply(200, {
          name: 'name',
          image: 'url',
          description: 'description',
        })
        .persist();
      await nftController.addNftVerifyOwnership('0x01', '1234', 'sepolia', {
        userAddress: firstAddress,
      });
      await nftController.addNftVerifyOwnership('0x02', '4321', 'goerli', {
        userAddress: secondAddress,
      });

      expect(
        nftController.state.allNfts[firstAddress][SEPOLIA.chainId][0],
      ).toStrictEqual({
        address: '0x01',
        chainId: convertHexToDecimal(ChainId.sepolia),
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '1234',
        favorite: false,
        standard: ERC721,
        isCurrentlyOwned: true,
        tokenURI,
      });
      expect(
        nftController.state.allNfts[secondAddress][GOERLI.chainId][0],
      ).toStrictEqual({
        address: '0x02',
        chainId: convertHexToDecimal(ChainId.goerli),
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '4321',
        standard: ERC721,
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI,
      });
    });
  });

  describe('removeNft', () => {
    it('should remove NFT and NFT contract', async () => {
      const { nftController } = setupController({
        defaultSelectedAccount: OWNER_ACCOUNT,
      });

      await nftController.addNft('0x01', '1', 'mainnet', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
        },
      });
      nftController.removeNft('0x01', '1', 'mainnet');
      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet],
      ).toHaveLength(0);

      expect(
        nftController.state.allNftContracts[OWNER_ACCOUNT.address][
          ChainId.mainnet
        ],
      ).toHaveLength(0);
    });

    it('should not remove NFT contract if NFT still exists', async () => {
      const { nftController } = setupController();

      await nftController.addNft('0x01', '1', 'mainnet', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
        },
      });

      await nftController.addNft('0x01', '2', 'mainnet', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
        },
      });
      nftController.removeNft('0x01', '1', 'mainnet');
      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet],
      ).toHaveLength(1);

      expect(
        nftController.state.allNftContracts[OWNER_ACCOUNT.address][
          ChainId.mainnet
        ],
      ).toHaveLength(1);
    });

    it('should remove NFT by selected address', async () => {
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const {
        nftController,
        triggerPreferencesStateChange,
        mockGetAccount,
        triggerSelectedAccountChange,
      } = setupController({
        getERC721TokenURI: mockGetERC721TokenURI,
      });
      nock('https://url').get('/').reply(200, {
        name: 'name',
        image: 'url',
        description: 'description',
      });
      const firstAddress = '0x123';
      const firstAccount = createMockInternalAccount({
        address: firstAddress,
        id: '22c022b5-309c-45e4-a82d-64bb11fc0e74',
      });
      const secondAddress = '0x321';
      const secondAccount = createMockInternalAccount({
        address: secondAddress,
        id: 'f9a42417-6071-4b51-8ecd-f7b14abd8851',
      });
      mockGetAccount.mockReturnValue(firstAccount);
      triggerSelectedAccountChange(firstAccount);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
      });
      await nftController.addNft('0x02', '4321', 'mainnet');
      mockGetAccount.mockReturnValue(secondAccount);
      triggerSelectedAccountChange(secondAccount);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
      });
      await nftController.addNft('0x01', '1234', 'mainnet');
      nftController.removeNft('0x01', '1234', 'mainnet');
      expect(
        nftController.state.allNfts[secondAccount.address][ChainId.mainnet],
      ).toHaveLength(0);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
      });
      expect(
        nftController.state.allNfts[firstAccount.address][ChainId.mainnet][0],
      ).toStrictEqual({
        address: '0x02',
        chainId: convertHexToDecimal(ChainId.mainnet),
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '4321',
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI,
        standard: ERC721,
      });
    });

    it('should remove NFT by provider type', async () => {
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController } = setupController({
        getERC721TokenURI: mockGetERC721TokenURI,
        defaultSelectedAccount: OWNER_ACCOUNT,
      });

      nock('https://url').get('/').reply(200, {
        name: 'name',
        image: 'url',
        description: 'description',
      });
      await nftController.addNft('0x02', '4321', 'sepolia');
      await nftController.addNft('0x01', '1234', 'goerli');
      nftController.removeNft('0x01', '1234', 'goerli');
      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][GOERLI.chainId],
      ).toHaveLength(0);

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][SEPOLIA.chainId][0],
      ).toStrictEqual({
        address: '0x02',
        chainId: convertHexToDecimal(ChainId.sepolia),
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '4321',
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI,
        standard: ERC721,
      });
    });

    it('should remove correct NFT and NFT contract when passed networkClientId and userAddress in options', async () => {
      const {
        nftController,
        triggerPreferencesStateChange,
        triggerSelectedAccountChange,
        mockGetAccount,
      } = setupController();

      const userAddress1 = '0x123';
      const userAccount1 = createMockInternalAccount({
        address: userAddress1,
        id: '5fd59cae-95d3-4a1d-ba97-657c8f83c300',
      });
      const userAddress2 = '0x321';
      const userAccount2 = createMockInternalAccount({
        address: userAddress2,
        id: '9ea40063-a95c-4f79-a4b6-0c065549245e',
      });

      mockGetAccount.mockReturnValue(userAccount1);
      triggerSelectedAccountChange(userAccount1);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
      });

      await nftController.addNft('0x01', '1', 'sepolia', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
        },
      });

      expect(
        nftController.state.allNfts[userAddress1][SEPOLIA.chainId][0],
      ).toStrictEqual({
        address: '0x01',
        chainId: convertHexToDecimal(ChainId.sepolia),
        description: 'description',
        image: 'image',
        name: 'name',
        standard: 'standard',
        tokenId: '1',
        favorite: false,
        isCurrentlyOwned: true,
      });

      mockGetAccount.mockReturnValue(userAccount2);
      triggerSelectedAccountChange(userAccount2);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
      });

      // now remove the nft after changing to a different network and account from the one where it was added
      nftController.removeNft('0x01', '1', 'sepolia', {
        userAddress: userAddress1,
      });

      expect(
        nftController.state.allNfts[userAddress1][SEPOLIA.chainId],
      ).toHaveLength(0);

      expect(
        nftController.state.allNftContracts[userAddress1][SEPOLIA.chainId],
      ).toHaveLength(0);
    });
  });

  it('should be able to clear the ignoredNfts list', async () => {
    const { nftController } = setupController({
      defaultSelectedAccount: OWNER_ACCOUNT,
    });

    await nftController.addNft('0x02', '1', 'mainnet', {
      nftMetadata: {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
        favorite: false,
      },
    });

    expect(
      nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet],
    ).toHaveLength(1);
    expect(nftController.state.ignoredNfts).toHaveLength(0);

    nftController.removeAndIgnoreNft('0x02', '1', 'mainnet');
    expect(
      nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet],
    ).toHaveLength(0);
    expect(nftController.state.ignoredNfts).toHaveLength(1);

    nftController.clearIgnoredNfts();
    expect(nftController.state.ignoredNfts).toHaveLength(0);
  });

  describe('isNftOwner', () => {
    it('should verify the ownership of an NFT when passed a networkClientId', async () => {
      const mockGetERC721OwnerOf = jest.fn().mockResolvedValue(OWNER_ADDRESS);
      const mockGetERC1155BalanceOf = jest
        .fn()
        .mockRejectedValue(new Error('ERC1155 error'));
      const { nftController } = setupController({
        getERC721OwnerOf: mockGetERC721OwnerOf,
        getERC1155BalanceOf: mockGetERC1155BalanceOf,
      });

      const isOwner = await nftController.isNftOwner(
        OWNER_ADDRESS,
        '0x2b26675403a063d92ccad0293d387485471a7d3a',
        String(1),
        'sepolia',
      );
      expect(isOwner).toBe(true);
    });

    it('should verify the ownership of an ERC-721 NFT with the correct owner address', async () => {
      const mockGetERC721OwnerOf = jest.fn().mockResolvedValue(OWNER_ADDRESS);
      const mockGetERC1155BalanceOf = jest
        .fn()
        .mockRejectedValue(new Error('ERC1155 error'));
      const { nftController } = setupController({
        getERC721OwnerOf: mockGetERC721OwnerOf,
        getERC1155BalanceOf: mockGetERC1155BalanceOf,
      });

      const isOwner = await nftController.isNftOwner(
        OWNER_ADDRESS,
        ERC721_NFT_ADDRESS,
        String(ERC721_NFT_ID),
        'mainnet',
      );
      expect(isOwner).toBe(true);
    });

    it('should not verify the ownership of an ERC-721 NFT with the wrong owner address', async () => {
      const mockGetERC721OwnerOf = jest.fn().mockResolvedValue(OWNER_ADDRESS);
      const mockGetERC1155BalanceOf = jest
        .fn()
        .mockRejectedValue(new Error('ERC1155 error'));
      const { nftController } = setupController({
        getERC721OwnerOf: mockGetERC721OwnerOf,
        getERC1155BalanceOf: mockGetERC1155BalanceOf,
      });

      const isOwner = await nftController.isNftOwner(
        '0x0000000000000000000000000000000000000000',
        ERC721_NFT_ADDRESS,
        String(ERC721_NFT_ID),
        'mainnet',
      );
      expect(isOwner).toBe(false);
    });

    it('should verify the ownership of an ERC-1155 NFT with the correct owner address', async () => {
      const mockGetERC721OwnerOf = jest
        .fn()
        .mockRejectedValue(new Error('ERC721 error'));
      const mockGetERC1155BalanceOf = jest.fn().mockResolvedValue(new BN(1));
      const { nftController } = setupController({
        getERC721OwnerOf: mockGetERC721OwnerOf,
        getERC1155BalanceOf: mockGetERC1155BalanceOf,
      });

      const isOwner = await nftController.isNftOwner(
        OWNER_ADDRESS,
        ERC1155_NFT_ADDRESS,
        ERC1155_NFT_ID,
        'mainnet',
      );
      expect(isOwner).toBe(true);
    });

    it('should not verify the ownership of an ERC-1155 NFT with the wrong owner address', async () => {
      const mockGetERC721OwnerOf = jest
        .fn()
        .mockRejectedValue(new Error('ERC721 error'));
      const mockGetERC1155BalanceOf = jest.fn().mockResolvedValue(new BN(0));
      const { nftController } = setupController({
        getERC721OwnerOf: mockGetERC721OwnerOf,
        getERC1155BalanceOf: mockGetERC1155BalanceOf,
      });

      const isOwner = await nftController.isNftOwner(
        '0x0000000000000000000000000000000000000000',
        ERC1155_NFT_ADDRESS,
        ERC1155_NFT_ID,
        'mainnet',
      );

      expect(isOwner).toBe(false);
    });

    it('should throw an error for an unsupported standard', async () => {
      const mockGetERC721OwnerOf = jest
        .fn()
        .mockRejectedValue(new Error('ERC721 error'));
      const mockGetERC1155BalanceOf = jest
        .fn()
        .mockRejectedValue(new Error('ERC1155 error'));
      const { nftController } = setupController({
        getERC721OwnerOf: mockGetERC721OwnerOf,
        getERC1155BalanceOf: mockGetERC1155BalanceOf,
      });
      const error =
        "Unable to verify ownership. Possibly because the standard is not supported or the user's currently selected network does not match the chain of the asset in question.";
      const result = async () => {
        await nftController.isNftOwner(
          '0x0000000000000000000000000000000000000000',
          CRYPTOPUNK_ADDRESS,
          '0',
          'mainnet',
        );
      };
      await expect(result).rejects.toThrow(error);
    });

    it('should add NFT with null metadata if the ipfs gateway is disabled and opensea is disabled', async () => {
      const {
        nftController,
        triggerPreferencesStateChange,
        triggerSelectedAccountChange,
      } = setupController({
        getERC721TokenURI: jest.fn().mockRejectedValue(''),
        getERC1155TokenURI: jest.fn().mockResolvedValue('ipfs://*'),
        defaultSelectedAccount: OWNER_ACCOUNT,
      });
      triggerSelectedAccountChange(OWNER_ACCOUNT);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        isIpfsGatewayEnabled: false,
        openSeaEnabled: false,
      });

      await nftController.addNft(
        ERC1155_NFT_ADDRESS,
        ERC1155_NFT_ID,
        'mainnet',
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual({
        address: ERC1155_NFT_ADDRESS,
        chainId: convertHexToDecimal(ChainId.mainnet),
        name: null,
        description: null,
        image: null,
        tokenId: ERC1155_NFT_ID,
        standard: ERC1155,
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI: 'ipfs://*',
      });
    });
  });

  describe('updateNftFavoriteStatus', () => {
    it('should not set NFT as favorite if nft not found', async () => {
      const { nftController } = setupController({
        defaultSelectedAccount: OWNER_ACCOUNT,
      });

      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        'mainnet',
        { nftMetadata: { name: '', description: '', image: '', standard: '' } },
      );

      nftController.updateNftFavoriteStatus(
        ERC721_DEPRESSIONIST_ADDRESS,
        '666',
        true,
        'mainnet',
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: false,
        }),
      );
    });
    it('should set NFT as favorite', async () => {
      const { nftController } = setupController({
        defaultSelectedAccount: OWNER_ACCOUNT,
      });

      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        'mainnet',
        { nftMetadata: { name: '', description: '', image: '', standard: '' } },
      );

      nftController.updateNftFavoriteStatus(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        true,
        'mainnet',
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: true,
        }),
      );
    });

    it('should set NFT as favorite and then unset it', async () => {
      const { nftController } = setupController({
        defaultSelectedAccount: OWNER_ACCOUNT,
      });

      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        'mainnet',
        { nftMetadata: { name: '', description: '', image: '', standard: '' } },
      );

      nftController.updateNftFavoriteStatus(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        true,
        'mainnet',
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: true,
        }),
      );

      nftController.updateNftFavoriteStatus(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        false,
        'mainnet',
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: false,
        }),
      );
    });

    it('should keep the favorite status as true after updating metadata', async () => {
      const { nftController } = setupController({
        defaultSelectedAccount: OWNER_ACCOUNT,
      });

      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        'mainnet',
        { nftMetadata: { name: '', description: '', image: '', standard: '' } },
      );

      nftController.updateNftFavoriteStatus(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        true,
        'mainnet',
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: true,
        }),
      );

      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        'mainnet',
        {
          nftMetadata: {
            image: 'new_image',
            name: 'new_name',
            description: 'new_description',
            standard: ERC721,
          },
        },
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual(
        expect.objectContaining({
          image: 'new_image',
          name: 'new_name',
          description: 'new_description',
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: true,
          isCurrentlyOwned: true,
        }),
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet],
      ).toHaveLength(1);
    });

    it('should keep the favorite status as false after updating metadata', async () => {
      const { nftController } = setupController({
        defaultSelectedAccount: OWNER_ACCOUNT,
      });

      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        'mainnet',
        { nftMetadata: { name: '', description: '', image: '', standard: '' } },
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: false,
        }),
      );

      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        'mainnet',
        {
          nftMetadata: {
            image: 'new_image',
            name: 'new_name',
            description: 'new_description',
            standard: ERC721,
          },
        },
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual(
        expect.objectContaining({
          image: 'new_image',
          name: 'new_name',
          description: 'new_description',
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: false,
          isCurrentlyOwned: true,
        }),
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet],
      ).toHaveLength(1);
    });

    it('should set NFT as favorite when passed networkClientId and userAddress in options', async () => {
      const {
        nftController,
        triggerPreferencesStateChange,
        triggerSelectedAccountChange,
        mockGetAccount,
      } = setupController();

      const userAddress1 = '0x123';
      const userAccount1 = createMockInternalAccount({
        address: userAddress1,
        id: '0a2a9a41-2b35-4863-8f36-baceec4e9686',
      });
      const userAddress2 = '0x321';
      const userAccount2 = createMockInternalAccount({
        address: userAddress2,
        id: '09b239a4-c229-4a2b-9739-1cb4b9dea7b9',
      });

      mockGetAccount.mockReturnValue(userAccount1);
      triggerSelectedAccountChange(userAccount1);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
      });

      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        'sepolia',
        { nftMetadata: { name: '', description: '', image: '', standard: '' } },
      );

      expect(
        nftController.state.allNfts[userAccount1.address][SEPOLIA.chainId][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: false,
        }),
      );

      mockGetAccount.mockReturnValue(userAccount2);
      triggerSelectedAccountChange(userAccount2);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
      });

      // now favorite the nft after changing to a different account from the one where it was added
      nftController.updateNftFavoriteStatus(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        true,
        'sepolia',
        { userAddress: userAccount1.address },
      );

      expect(
        nftController.state.allNfts[userAccount1.address][SEPOLIA.chainId][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: true,
        }),
      );
    });
  });

  describe('checkAndUpdateNftsOwnershipStatus', () => {
    describe('checkAndUpdateAllNftsOwnershipStatus', () => {
      it('should check whether NFTs for the current selectedAccount/chainId combination are still owned by the selectedAccount and update the isCurrentlyOwned value to false when NFT is not still owned', async () => {
        const { nftController } = setupController({
          defaultSelectedAccount: OWNER_ACCOUNT,
        });
        jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(false);

        await nftController.addNft('0x02', '1', 'mainnet', {
          nftMetadata: {
            name: 'name',
            image: 'image',
            description: 'description',
            standard: 'standard',
            favorite: false,
          },
        });
        expect(
          nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(true);

        await nftController.checkAndUpdateAllNftsOwnershipStatus('mainnet');

        expect(
          nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(false);
      });

      it('should check whether NFTs for the current selectedAccount/chainId combination are still owned by the selectedAccount and leave/set the isCurrentlyOwned value to true when NFT is still owned', async () => {
        const { nftController } = setupController({
          defaultSelectedAccount: OWNER_ACCOUNT,
        });
        jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(true);

        await nftController.addNft('0x02', '1', 'mainnet', {
          nftMetadata: {
            name: 'name',
            image: 'image',
            description: 'description',
            standard: 'standard',
            favorite: false,
          },
        });

        expect(
          nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(true);

        await nftController.checkAndUpdateAllNftsOwnershipStatus('mainnet');
        expect(
          nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(true);
      });

      it('should check whether NFTs for the current selectedAccount/chainId combination are still owned by the selectedAccount and leave the isCurrentlyOwned value as is when NFT ownership check fails', async () => {
        const { nftController } = setupController({
          defaultSelectedAccount: OWNER_ACCOUNT,
        });
        jest
          .spyOn(nftController, 'isNftOwner')
          .mockRejectedValue('Unable to verify ownership');

        await nftController.addNft('0x02', '1', 'mainnet', {
          nftMetadata: {
            name: 'name',
            image: 'image',
            description: 'description',
            standard: 'standard',
            favorite: false,
          },
        });

        expect(
          nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(true);

        await nftController.checkAndUpdateAllNftsOwnershipStatus('mainnet');
        expect(
          nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(true);
      });

      it('should check whether NFTs for the current selectedAccount/chainId combination are still owned by the selectedAccount and update the isCurrentlyOwned value to false when NFT is not still owned, when the currently configured selectedAccount/chainId are different from those passed', async () => {
        const { nftController, triggerPreferencesStateChange, mockGetAccount } =
          setupController();

        mockGetAccount.mockReturnValue(OWNER_ACCOUNT);
        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          openSeaEnabled: true,
        });

        await nftController.addNft('0x02', '1', 'sepolia', {
          nftMetadata: {
            name: 'name',
            image: 'image',
            description: 'description',
            standard: 'standard',
            favorite: false,
          },
        });

        expect(
          nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.sepolia][0]
            .isCurrentlyOwned,
        ).toBe(true);

        jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(false);

        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          openSeaEnabled: true,
        });

        await nftController.checkAndUpdateAllNftsOwnershipStatus('sepolia', {
          userAddress: OWNER_ADDRESS,
        });

        expect(
          nftController.state.allNfts[OWNER_ADDRESS][SEPOLIA.chainId][0]
            .isCurrentlyOwned,
        ).toBe(false);
      });

      it('should handle default case where selectedAccount is not set', async () => {
        const { nftController, mockGetAccount } = setupController({});
        mockGetAccount.mockReturnValue(null);
        jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(false);

        await nftController.addNft('0x02', '1', 'mainnet', {
          nftMetadata: {
            name: 'name',
            image: 'image',
            description: 'description',
            standard: 'standard',
            favorite: false,
          },
        });
        expect(nftController.state.allNfts['']).toBeUndefined();

        await nftController.checkAndUpdateAllNftsOwnershipStatus('mainnet');

        expect(nftController.state.allNfts['']).toBeUndefined();
      });
    });

    describe('checkAndUpdateSingleNftOwnershipStatus', () => {
      it('should check whether the passed NFT is still owned by the the current selectedAccount/chainId combination and update its isCurrentlyOwned property in state if batch is false and isNftOwner returns false', async () => {
        const { nftController } = setupController({
          defaultSelectedAccount: OWNER_ACCOUNT,
        });

        const nft = {
          address: '0x02',
          tokenId: '1',
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        };

        await nftController.addNft(nft.address, nft.tokenId, 'mainnet', {
          nftMetadata: nft,
        });

        expect(
          nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(true);

        jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(false);

        await nftController.checkAndUpdateSingleNftOwnershipStatus(
          nft,
          false,
          'mainnet',
        );

        expect(
          nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(false);
      });

      it('should check whether the passed NFT is still owned by the the current selectedAddress/chainId combination and return the updated NFT object without updating state if batch is true', async () => {
        const { nftController } = setupController({
          defaultSelectedAccount: OWNER_ACCOUNT,
        });

        const nft = {
          address: '0x02',
          tokenId: '1',
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        };

        await nftController.addNft(nft.address, nft.tokenId, 'mainnet', {
          nftMetadata: nft,
        });

        expect(
          nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(true);

        jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(false);

        const updatedNft =
          await nftController.checkAndUpdateSingleNftOwnershipStatus(
            nft,
            true,
            'mainnet',
          );

        expect(
          nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(true);

        expect(updatedNft?.isCurrentlyOwned).toBe(false);
      });

      it('should check whether the passed NFT is still owned by the the selectedAddress/chainId combination passed in the accountParams argument and update its isCurrentlyOwned property in state, when the currently configured selectedAddress/chainId are different from those passed', async () => {
        const firstSelectedAddress = OWNER_ACCOUNT.address;
        const {
          nftController,
          triggerPreferencesStateChange,
          triggerSelectedAccountChange,
        } = setupController();

        triggerSelectedAccountChange(OWNER_ACCOUNT);
        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          openSeaEnabled: true,
        });

        const nft = {
          address: '0x02',
          tokenId: '1',
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        };

        await nftController.addNft(nft.address, nft.tokenId, 'sepolia', {
          nftMetadata: nft,
        });

        expect(
          nftController.state.allNfts[firstSelectedAddress][ChainId.sepolia][0]
            .isCurrentlyOwned,
        ).toBe(true);

        jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(false);
        const secondAccount = createMockInternalAccount({
          address: SECOND_OWNER_ADDRESS,
        });
        triggerSelectedAccountChange(secondAccount);
        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          openSeaEnabled: true,
        });

        await nftController.checkAndUpdateSingleNftOwnershipStatus(
          nft,
          false,
          'sepolia',
          {
            userAddress: OWNER_ADDRESS,
          },
        );

        expect(
          nftController.state.allNfts[OWNER_ADDRESS][SEPOLIA.chainId][0]
            .isCurrentlyOwned,
        ).toBe(false);
      });

      it('should check whether the passed NFT is still owned by the the selectedAddress/chainId combination passed in the accountParams argument and return the updated NFT object without updating state, when the currently configured selectedAddress/chainId are different from those passed and batch is true', async () => {
        const firstSelectedAddress = OWNER_ACCOUNT.address;
        const {
          nftController,
          triggerPreferencesStateChange,
          triggerSelectedAccountChange,
        } = setupController();

        triggerSelectedAccountChange(OWNER_ACCOUNT);
        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          openSeaEnabled: true,
        });

        const nft = {
          address: '0x02',
          tokenId: '1',
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        };

        await nftController.addNft(nft.address, nft.tokenId, 'sepolia', {
          nftMetadata: nft,
        });

        expect(
          nftController.state.allNfts[firstSelectedAddress][ChainId.sepolia][0]
            .isCurrentlyOwned,
        ).toBe(true);

        jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(false);
        const secondAccount = createMockInternalAccount({
          address: SECOND_OWNER_ADDRESS,
        });
        triggerSelectedAccountChange(secondAccount);
        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          openSeaEnabled: true,
        });

        const updatedNft =
          await nftController.checkAndUpdateSingleNftOwnershipStatus(
            nft,
            false,
            'sepolia',
            {
              userAddress: OWNER_ADDRESS,
            },
          );

        expect(updatedNft).toStrictEqual({
          ...nft,
          isCurrentlyOwned: false,
        });

        expect(
          nftController.state.allNfts[OWNER_ADDRESS][SEPOLIA.chainId][0]
            .isCurrentlyOwned,
        ).toBe(false);
      });
    });
  });

  describe('findNftByAddressAndTokenId', () => {
    const mockNft = {
      address: '0x02',
      tokenId: '1',
      name: 'name',
      image: 'image',
      description: 'description',
      standard: 'standard',
      favorite: false,
    };

    it('should return null if the NFT does not exist in the state', async () => {
      const { nftController } = setupController({
        defaultSelectedAccount: OWNER_ACCOUNT,
      });

      expect(
        nftController.findNftByAddressAndTokenId(
          mockNft.address,
          mockNft.tokenId,
          OWNER_ACCOUNT.address,
          ChainId.mainnet,
        ),
      ).toBeNull();
    });

    it('should return the NFT by the address and tokenId', () => {
      const { nftController } = setupController({
        options: {
          state: {
            allNfts: {
              [OWNER_ACCOUNT.address]: { [ChainId.mainnet]: [mockNft] },
            },
          },
        },
        defaultSelectedAccount: OWNER_ACCOUNT,
      });

      expect(
        nftController.findNftByAddressAndTokenId(
          mockNft.address,
          mockNft.tokenId,
          OWNER_ACCOUNT.address,
          ChainId.mainnet,
        ),
      ).toStrictEqual({ nft: mockNft, index: 0 });
    });
  });

  describe('updateNftByAddressAndTokenId', () => {
    const mockTransactionId = '60d36710-b150-11ec-8a49-c377fbd05e27';
    const mockNft = {
      address: '0x02',
      tokenId: '1',
      name: 'name',
      image: 'image',
      description: 'description',
      standard: 'standard',
      favorite: false,
    };

    const expectedMockNft = {
      address: '0x02',
      description: 'description',
      favorite: false,
      image: 'image',
      name: 'name',
      standard: 'standard',
      tokenId: '1',
      transactionId: mockTransactionId,
    };

    it('should update the NFT if the NFT exist', async () => {
      const { nftController } = setupController({
        options: {
          state: {
            allNfts: {
              [OWNER_ACCOUNT.address]: { [ChainId.mainnet]: [mockNft] },
            },
          },
        },
        defaultSelectedAccount: OWNER_ACCOUNT,
      });

      nftController.updateNft(
        mockNft,
        {
          transactionId: mockTransactionId,
        },
        OWNER_ACCOUNT.address,
        ChainId.mainnet,
      );

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0],
      ).toStrictEqual(expectedMockNft);
    });

    it('should return undefined if the NFT does not exist', () => {
      const { nftController } = setupController({
        defaultSelectedAccount: OWNER_ACCOUNT,
      });

      expect(
        nftController.updateNft(
          mockNft,
          {
            transactionId: mockTransactionId,
          },
          OWNER_ACCOUNT.address,
          ChainId.mainnet,
        ),
      ).toBeUndefined();
    });
  });

  describe('resetNftTransactionStatusByTransactionId', () => {
    const mockTransactionId = '60d36710-b150-11ec-8a49-c377fbd05e27';
    const nonExistTransactionId = '0123';

    const mockNft = {
      address: '0x02',
      tokenId: '1',
      name: 'name',
      image: 'image',
      description: 'description',
      standard: 'standard',
      favorite: false,
      transactionId: mockTransactionId,
    };

    it('should not update any NFT state and should return false when passed a transaction id that does not match that of any NFT', async () => {
      const { nftController } = setupController({
        defaultSelectedAccount: OWNER_ACCOUNT,
      });

      expect(
        nftController.resetNftTransactionStatusByTransactionId(
          nonExistTransactionId,
          OWNER_ACCOUNT.address,
          ChainId.mainnet,
        ),
      ).toBe(false);
    });

    it('should set the transaction id of an NFT in state to undefined, and return true when it has successfully updated this state', async () => {
      const { nftController } = setupController({
        options: {
          state: {
            allNfts: {
              [OWNER_ADDRESS]: { [ChainId.mainnet]: [mockNft] },
            },
          },
        },
      });

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0]
          .transactionId,
      ).toBe(mockTransactionId);

      expect(
        nftController.resetNftTransactionStatusByTransactionId(
          mockTransactionId,
          OWNER_ACCOUNT.address,
          ChainId.mainnet,
        ),
      ).toBe(true);

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][ChainId.mainnet][0]
          .transactionId,
      ).toBeUndefined();
    });
  });

  describe('updateNftMetadata', () => {
    it('should not update Nft metadata when preferences change and current and incoming state are the same', async () => {
      const {
        nftController,
        triggerPreferencesStateChange,
        triggerSelectedAccountChange,
      } = setupController();
      const spy = jest.spyOn(nftController, 'updateNftMetadata');
      triggerSelectedAccountChange(OWNER_ACCOUNT);
      // trigger preference change
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
      });

      expect(spy).toHaveBeenCalledTimes(0);
    });

    it('should call update Nft metadata when preferences change is triggered and at least ipfsGateway, openSeaEnabled or isIpfsGatewayEnabled change', async () => {
      const {
        nftController,
        mockGetAccount,
        triggerPreferencesStateChange,
        triggerSelectedAccountChange,
      } = setupController({
        defaultSelectedAccount: OWNER_ACCOUNT,
      });
      const spy = jest.spyOn(nftController, 'updateNftMetadata');
      const testNetworkClientId = 'mainnet';
      mockGetAccount.mockReturnValue(OWNER_ACCOUNT);
      await nftController.addNft('0xtest', '3', testNetworkClientId, {
        nftMetadata: { name: '', description: '', image: '', standard: '' },
      });

      triggerSelectedAccountChange(OWNER_ACCOUNT);
      // trigger preference change
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        ipfsGateway: 'https://toto/ipfs/',
      });

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should update Nft metadata successfully', async () => {
      const tokenURI = 'https://api.pudgypenguins.io/lil/4';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController, mockGetAccount } = setupController({
        getERC721TokenURI: mockGetERC721TokenURI,
        defaultSelectedAccount: OWNER_ACCOUNT,
      });
      const spy = jest.spyOn(nftController, 'updateNft');
      const testNetworkClientId = 'sepolia';
      mockGetAccount.mockReturnValue(OWNER_ACCOUNT);
      await nftController.addNft('0xtest', '3', testNetworkClientId, {
        nftMetadata: { name: '', description: '', image: '', standard: '' },
      });

      nock('https://api.pudgypenguins.io').get('/lil/4').reply(200, {
        name: 'name pudgy',
        image: 'url pudgy',
        description: 'description pudgy',
      });
      const testInputNfts: Nft[] = [
        {
          address: '0xtest',
          description: null,
          favorite: false,
          image: null,
          isCurrentlyOwned: true,
          name: null,
          standard: ERC721,
          tokenId: '3',
          tokenURI,
          chainId: 11155111,
        },
      ];

      await nftController.updateNftMetadata({
        nfts: testInputNfts,
        // networkClientId: testNetworkClientId,
      });
      expect(spy).toHaveBeenCalledTimes(1);

      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][SEPOLIA.chainId][0],
      ).toStrictEqual({
        address: '0xtest',
        chainId: 11155111,
        description: 'description pudgy',
        image: 'url pudgy',
        name: 'name pudgy',
        tokenId: '3',
        standard: ERC721,
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI: 'https://api.pudgypenguins.io/lil/4',
      });
    });

    it('should not update metadata when state nft and fetched nft are the same', async () => {
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController, mockGetAccount } = setupController({
        getERC721TokenURI: mockGetERC721TokenURI,
        defaultSelectedAccount: OWNER_ACCOUNT,
      });
      const updateNftSpy = jest.spyOn(nftController, 'updateNft');
      const testNetworkClientId = 'sepolia';
      mockGetAccount.mockReturnValue(OWNER_ACCOUNT);
      await nftController.addNft('0xtest', '3', testNetworkClientId, {
        nftMetadata: {
          name: 'toto',
          description: 'description',
          image: 'image.png',
          standard: ERC721,
          tokenURI,
        },
      });

      nock('https://url')
        .get('/')
        .reply(200, {
          name: 'toto',
          image: 'image.png',
          description: 'description',
        })
        .persist();
      const testInputNfts: Nft[] = [
        {
          address: '0xtest',
          description: 'description',
          favorite: false,
          image: 'image.png',
          isCurrentlyOwned: true,
          name: 'toto',
          standard: ERC721,
          tokenId: '3',
          chainId: convertHexToDecimal(ChainId.sepolia),
        },
      ];

      mockGetAccount.mockReturnValue(OWNER_ACCOUNT);
      await nftController.updateNftMetadata({
        nfts: testInputNfts,
        // networkClientId: testNetworkClientId,
      });

      expect(updateNftSpy).toHaveBeenCalledTimes(0);
      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][SEPOLIA.chainId][0],
      ).toStrictEqual({
        address: '0xtest',
        chainId: convertHexToDecimal(ChainId.sepolia),
        description: 'description',
        favorite: false,
        image: 'image.png',
        isCurrentlyOwned: true,
        name: 'toto',
        standard: ERC721,
        tokenId: '3',
        tokenURI,
      });
    });

    it('should trigger update metadata when state nft and fetched nft are not the same', async () => {
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController, mockGetAccount } = setupController({
        getERC721TokenURI: mockGetERC721TokenURI,
        defaultSelectedAccount: OWNER_ACCOUNT,
      });
      const spy = jest.spyOn(nftController, 'updateNft');
      const testNetworkClientId = 'sepolia';
      mockGetAccount.mockReturnValue(OWNER_ACCOUNT);
      await nftController.addNft('0xtest', '3', testNetworkClientId, {
        nftMetadata: {
          name: 'toto',
          description: 'description',
          image: 'image.png',
          standard: ERC721,
        },
        // networkClientId: testNetworkClientId,
      });

      nock('https://url').get('/').reply(200, {
        name: 'toto',
        image: 'image-updated.png',
        description: 'description',
      });
      const testInputNfts: Nft[] = [
        {
          address: '0xtest',
          description: 'description',
          favorite: false,
          image: 'image.png',
          isCurrentlyOwned: true,
          name: 'toto',
          standard: ERC721,
          tokenId: '3',
          chainId: convertHexToDecimal(ChainId.sepolia),
        },
      ];

      await nftController.updateNftMetadata({
        nfts: testInputNfts,
        // networkClientId: testNetworkClientId,
      });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(
        nftController.state.allNfts[OWNER_ACCOUNT.address][SEPOLIA.chainId][0],
      ).toStrictEqual({
        address: '0xtest',
        description: 'description',
        favorite: false,
        image: 'image-updated.png',
        isCurrentlyOwned: true,
        name: 'toto',
        standard: ERC721,
        tokenId: '3',
        tokenURI,
        chainId: convertHexToDecimal(ChainId.sepolia),
      });
    });

    it('should not update metadata when nfts has image/name/description already', async () => {
      const {
        nftController,
        triggerPreferencesStateChange,
        triggerSelectedAccountChange,
      } = setupController();
      const spy = jest.spyOn(nftController, 'updateNftMetadata');
      const testNetworkClientId = 'sepolia';

      // Add nfts
      await nftController.addNft('0xtest', '3', testNetworkClientId, {
        nftMetadata: {
          name: 'test name',
          description: 'test description',
          image: 'test image',
          standard: ERC721,
        },
        userAddress: OWNER_ADDRESS,
        // networkClientId: testNetworkClientId,
      });

      triggerSelectedAccountChange(OWNER_ACCOUNT);
      // trigger preference change
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        isIpfsGatewayEnabled: false,
        openSeaEnabled: true,
      });

      expect(spy).toHaveBeenCalledTimes(0);
    });

    it('should trigger calling updateNftMetadata when preferences change - openseaEnabled', async () => {
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const {
        nftController,
        triggerPreferencesStateChange,
        triggerSelectedAccountChange,
      } = setupController({
        getERC721TokenURI: mockGetERC721TokenURI,
      });
      const spy = jest.spyOn(nftController, 'updateNftMetadata');

      const testNetworkClientId = 'sepolia';
      // Add nfts
      await nftController.addNft('0xtest', '1', testNetworkClientId, {
        nftMetadata: {
          name: '',
          description: '',
          image: '',
          standard: ERC721,
        },
        userAddress: OWNER_ADDRESS,
        // networkClientId: testNetworkClientId,
      });

      expect(
        nftController.state.allNfts[OWNER_ADDRESS][SEPOLIA.chainId][0]
          .isCurrentlyOwned,
      ).toBe(true);

      nock('https://url').get('/').reply(200, {
        name: 'name pudgy',
        image: 'url pudgy',
        description: 'description pudgy',
      });

      // trigger preference change
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        isIpfsGatewayEnabled: false,
        openSeaEnabled: true,
      });
      triggerSelectedAccountChange(OWNER_ACCOUNT);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should trigger calling updateNftMetadata when preferences change - ipfs enabled', async () => {
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const {
        nftController,
        triggerPreferencesStateChange,
        triggerSelectedAccountChange,
      } = setupController({
        getERC721TokenURI: mockGetERC721TokenURI,
      });
      const spy = jest.spyOn(nftController, 'updateNftMetadata');

      const testNetworkClientId = 'sepolia';
      // Add nfts
      await nftController.addNft('0xtest', '1', testNetworkClientId, {
        nftMetadata: {
          name: '',
          description: '',
          image: '',
          standard: ERC721,
        },
        userAddress: OWNER_ADDRESS,
        // networkClientId: testNetworkClientId,
      });

      expect(
        nftController.state.allNfts[OWNER_ADDRESS][SEPOLIA.chainId][0]
          .isCurrentlyOwned,
      ).toBe(true);

      nock('https://url').get('/').reply(200, {
        name: 'name pudgy',
        image: 'url pudgy',
        description: 'description pudgy',
      });

      // trigger preference change
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        isIpfsGatewayEnabled: true,
        openSeaEnabled: false,
      });
      triggerSelectedAccountChange(OWNER_ACCOUNT);

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should call getNftInformation only one time per interval', async () => {
      const tokenURI = 'https://api.pudgypenguins.io/lil/4';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController, triggerPreferencesStateChange } = setupController({
        getERC721TokenURI: mockGetERC721TokenURI,
      });
      const selectedAddress = OWNER_ADDRESS;
      const spy = jest.spyOn(nftController, 'updateNft');
      const testNetworkClientId = 'sepolia';
      await nftController.addNft('0xtest', '3', testNetworkClientId, {
        nftMetadata: { name: '', description: '', image: '', standard: '' },
        // networkClientId: testNetworkClientId,
      });

      nock('https://api.pudgypenguins.io/lil').get('/4').reply(200, {
        name: 'name pudgy',
        image: 'url pudgy',
        description: 'description pudgy',
      });
      const testInputNfts: Nft[] = [
        {
          address: '0xtest',
          description: null,
          favorite: false,
          image: null,
          isCurrentlyOwned: true,
          name: null,
          standard: 'ERC721',
          tokenId: '3',
          tokenURI: 'https://api.pudgypenguins.io/lil/4',
          chainId: convertHexToDecimal(ChainId.sepolia),
        },
      ];

      // Make first call to updateNftMetadata should trigger state update
      await nftController.updateNftMetadata({
        nfts: testInputNfts,
        // networkClientId: testNetworkClientId,
      });
      expect(spy).toHaveBeenCalledTimes(1);

      expect(
        nftController.state.allNfts[selectedAddress][SEPOLIA.chainId][0],
      ).toStrictEqual({
        address: '0xtest',
        description: 'description pudgy',
        image: 'url pudgy',
        name: 'name pudgy',
        tokenId: '3',
        standard: 'ERC721',
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI: 'https://api.pudgypenguins.io/lil/4',
        chainId: convertHexToDecimal(ChainId.sepolia),
      });

      spy.mockClear();

      // trigger calling updateNFTMetadata again on the same account should not trigger state update
      const spy2 = jest.spyOn(nftController, 'updateNft');
      await nftController.updateNftMetadata({
        nfts: testInputNfts,
        // networkClientId: testNetworkClientId,
      });
      // No updates to state should be made
      expect(spy2).toHaveBeenCalledTimes(0);

      // trigger preference change and change selectedAccount
      const testNewAccountAddress = 'OxDifferentAddress';
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        selectedAddress: testNewAccountAddress,
      });

      spy.mockClear();
      await nftController.addNft('0xtest', '4', testNetworkClientId, {
        nftMetadata: { name: '', description: '', image: '', standard: '' },
        // networkClientId: testNetworkClientId,
      });

      const testInputNfts2: Nft[] = [
        {
          address: '0xtest',
          description: null,
          favorite: false,
          image: null,
          isCurrentlyOwned: true,
          name: null,
          standard: 'ERC721',
          tokenId: '4',
          tokenURI: 'https://api.pudgypenguins.io/lil/4',
          chainId: convertHexToDecimal(ChainId.sepolia),
        },
      ];

      const spy3 = jest.spyOn(nftController, 'updateNft');
      await nftController.updateNftMetadata({
        nfts: testInputNfts2,
        // networkClientId: testNetworkClientId,
      });
      // When the account changed, and updateNftMetadata is called state update should be triggered
      expect(spy3).toHaveBeenCalledTimes(1);
    });
  });

  // Testing to make sure selectedAccountChange isn't used. This can return non-EVM accounts.
  it('triggering selectedAccountChange would not trigger anything', async () => {
    const tokenURI = 'https://url/';
    const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
    const { nftController, messenger } = setupController({
      options: {
        openSeaEnabled: true,
      },
      getERC721TokenURI: mockGetERC721TokenURI,
    });
    const updateNftMetadataSpy = jest.spyOn(nftController, 'updateNftMetadata');
    messenger.publish(
      'AccountsController:selectedAccountChange',
      createMockInternalAccount({
        id: 'new-id',
        address: '0x5284deb594c4b593268d7c98e5ecd29dcafa5b49',
      }),
    );

    expect(updateNftMetadataSpy).not.toHaveBeenCalled();
  });

  describe('getNFTContractInfo', () => {
    it('fetches NFT collections metadata successfully', async () => {
      const contractAddresses = [
        '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB',
        '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB',
      ];
      const collections = [
        {
          id: contractAddresses[0],
          name: 'CryptoPunks',
          slug: 'cryptopunks',
          symbol: 'PUNK',
          imageUrl: 'url',
        },
        {
          id: contractAddresses[1],
          name: 'Kudos',
          slug: 'kudos',
          symbol: 'KUDOS',
          imageUrl: 'url',
        },
      ];
      nock(NFT_API_BASE_URL)
        .get(
          `/collections?chainId=0x1&contract=${contractAddresses[0]}&contract=${contractAddresses[1]}`,
        )
        .reply(200, {
          collections,
        });

      const { nftController } = setupController();

      const response = await nftController.getNFTContractInfo(
        contractAddresses,
        ChainId.mainnet,
      );

      expect(response).toStrictEqual({
        collections,
      });
    });
  });

  describe('resetState', () => {
    it('resets the state to default state', () => {
      const initialState: NftControllerState = {
        allNftContracts: {
          [OWNER_ACCOUNT.address]: { [ChainId.mainnet]: [] },
        },
        allNfts: {
          [OWNER_ACCOUNT.address]: { [ChainId.mainnet]: [] },
        },
        ignoredNfts: [
          {
            address: ERC1155_NFT_ADDRESS,
            name: null,
            description: null,
            image: null,
            tokenId: ERC1155_NFT_ID,
            standard: ERC1155,
            favorite: false,
            isCurrentlyOwned: true,
            tokenURI: 'ipfs://*',
          },
        ],
      };
      const { nftController } = setupController({
        options: {
          state: initialState,
        },
      });

      expect(nftController.state).toStrictEqual(initialState);

      nftController.resetState();

      expect(nftController.state).toStrictEqual({
        allNftContracts: {},
        allNfts: {},
        ignoredNfts: [],
      });
    });
  });

  describe('phishing protection for NFT metadata', () => {
    /**
     * Tests for the NFT URL sanitization feature.
     */
    it('should sanitize malicious URLs when adding NFTs', async () => {
      const mockBulkScanUrls = jest.fn().mockResolvedValue({
        results: {
          'http://malicious-site.com/image.png': {
            recommendedAction: RecommendedAction.Block,
          },
          'http://malicious-domain.com': {
            recommendedAction: RecommendedAction.Block,
          },
          'http://safe-site.com/image.png': {
            recommendedAction: RecommendedAction.None,
          },
          'http://legitimate-domain.com': {
            recommendedAction: RecommendedAction.None,
          },
        },
      });

      const { nftController } = setupController({
        bulkScanUrlsMock: mockBulkScanUrls,
      });

      const nftWithMaliciousURLs: NftMetadata = {
        name: 'Malicious NFT',
        description: 'NFT with malicious links',
        image: 'http://malicious-site.com/image.png',
        externalLink: 'http://malicious-domain.com',
        standard: ERC721,
      };

      const nftWithSafeURLs: NftMetadata = {
        name: 'Safe NFT',
        description: 'NFT with safe links',
        image: 'http://safe-site.com/image.png',
        externalLink: 'http://legitimate-domain.com',
        standard: ERC721,
      };

      await nftController.addNft('0xmalicious', '1', 'mainnet', {
        nftMetadata: nftWithMaliciousURLs,
        userAddress: OWNER_ADDRESS,
      });

      await nftController.addNft('0xsafe', '2', 'mainnet', {
        nftMetadata: nftWithSafeURLs,
        userAddress: OWNER_ADDRESS,
      });

      expect(mockBulkScanUrls).toHaveBeenCalled();

      const storedNfts =
        nftController.state.allNfts[OWNER_ADDRESS][ChainId.mainnet];

      const maliciousNft = storedNfts.find(
        (nft) => nft.address === '0xmalicious',
      );
      const safeNft = storedNfts.find((nft) => nft.address === '0xsafe');

      expect(maliciousNft?.image).toBeUndefined();
      expect(maliciousNft?.externalLink).toBeUndefined();

      expect(maliciousNft?.name).toBe('Malicious NFT');
      expect(maliciousNft?.description).toBe('NFT with malicious links');

      expect(safeNft?.image).toBe('http://safe-site.com/image.png');
      expect(safeNft?.externalLink).toBe('http://legitimate-domain.com');
    });

    it('should handle errors during phishing detection when adding NFTs', async () => {
      const mockBulkScanUrls = jest
        .fn()
        .mockRejectedValue(new Error('Phishing detection failed'));

      const { nftController } = setupController({
        bulkScanUrlsMock: mockBulkScanUrls,
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const nftMetadata: NftMetadata = {
        name: 'Test NFT',
        description: 'Test description',
        image: 'http://example.com/image.png',
        externalLink: 'http://example.com',
        standard: ERC721,
      };

      await nftController.addNft('0xtest', '1', 'mainnet', {
        nftMetadata,
        userAddress: OWNER_ADDRESS,
      });

      expect(mockBulkScanUrls).toHaveBeenCalled();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error during bulk URL scanning:',
        expect.any(Error),
      );

      const storedNft =
        nftController.state.allNfts[OWNER_ADDRESS][ChainId.mainnet][0];
      expect(storedNft.image).toBe('http://example.com/image.png');
      expect(storedNft.externalLink).toBe('http://example.com');

      consoleErrorSpy.mockRestore();
    });

    it('should sanitize all URL fields when they contain malicious URLs', async () => {
      const mockBulkScanUrls = jest.fn().mockResolvedValue({
        results: {
          'http://malicious-image.com/image.png': {
            recommendedAction: RecommendedAction.Block,
          },
          'http://malicious-preview.com/preview.png': {
            recommendedAction: RecommendedAction.Block,
          },
          'http://malicious-thumb.com/thumb.png': {
            recommendedAction: RecommendedAction.Block,
          },
          'http://malicious-original.com/original.png': {
            recommendedAction: RecommendedAction.Block,
          },
          'http://malicious-animation.com/animation.mp4': {
            recommendedAction: RecommendedAction.Block,
          },
          'http://malicious-animation-orig.com/animation-orig.mp4': {
            recommendedAction: RecommendedAction.Block,
          },
          'http://malicious-external.com': {
            recommendedAction: RecommendedAction.Block,
          },
          'http://malicious-collection.com': {
            recommendedAction: RecommendedAction.Block,
          },
        },
      });

      const { nftController } = setupController({
        bulkScanUrlsMock: mockBulkScanUrls,
      });

      // Create NFT with malicious URLs in all possible fields
      const nftWithAllMaliciousURLs: NftMetadata = {
        name: 'NFT with all URL fields',
        description: 'Testing all URL fields',
        image: 'http://malicious-image.com/image.png',
        imagePreview: 'http://malicious-preview.com/preview.png',
        imageThumbnail: 'http://malicious-thumb.com/thumb.png',
        imageOriginal: 'http://malicious-original.com/original.png',
        animation: 'http://malicious-animation.com/animation.mp4',
        animationOriginal:
          'http://malicious-animation-orig.com/animation-orig.mp4',
        externalLink: 'http://malicious-external.com',
        standard: ERC721,
        collection: {
          id: 'collection-1',
          name: 'Test Collection',
          externalLink: 'http://malicious-collection.com',
        } as Collection & { externalLink?: string },
      };

      await nftController.addNft('0xallmalicious', '1', 'mainnet', {
        nftMetadata: nftWithAllMaliciousURLs,
        userAddress: OWNER_ADDRESS,
      });

      const storedNft =
        nftController.state.allNfts[OWNER_ADDRESS][ChainId.mainnet][0];

      // Verify all URL fields were sanitized
      expect(storedNft.image).toBeUndefined();
      expect(storedNft.imagePreview).toBeUndefined();
      expect(storedNft.imageThumbnail).toBeUndefined();
      expect(storedNft.imageOriginal).toBeUndefined();
      expect(storedNft.animation).toBeUndefined();
      expect(storedNft.animationOriginal).toBeUndefined();
      expect(storedNft.externalLink).toBeUndefined();
      expect(
        (storedNft.collection as Collection & { externalLink?: string })
          ?.externalLink,
      ).toBeUndefined();

      // Verify non-URL fields were preserved
      expect(storedNft.name).toBe('NFT with all URL fields');
      expect(storedNft.description).toBe('Testing all URL fields');
      expect(storedNft.collection?.id).toBe('collection-1');
      expect(storedNft.collection?.name).toBe('Test Collection');
    });

    it('should handle mixed safe and malicious URLs correctly', async () => {
      const mockBulkScanUrls = jest.fn().mockResolvedValue({
        results: {
          'http://safe-image.com/image.png': {
            recommendedAction: RecommendedAction.None,
          },
          'http://malicious-preview.com/preview.png': {
            recommendedAction: RecommendedAction.Block,
          },
          'http://safe-external.com': {
            recommendedAction: RecommendedAction.None,
          },
        },
      });

      const { nftController } = setupController({
        bulkScanUrlsMock: mockBulkScanUrls,
      });

      const nftWithMixedURLs: NftMetadata = {
        name: 'Mixed URLs NFT',
        description: 'Some safe, some malicious',
        image: 'http://safe-image.com/image.png',
        imagePreview: 'http://malicious-preview.com/preview.png',
        externalLink: 'http://safe-external.com',
        standard: ERC721,
      };

      await nftController.addNft('0xmixed', '1', 'mainnet', {
        nftMetadata: nftWithMixedURLs,
        userAddress: OWNER_ADDRESS,
      });

      const storedNft =
        nftController.state.allNfts[OWNER_ADDRESS][ChainId.mainnet][0];

      // Verify only malicious URLs were removed
      expect(storedNft.image).toBe('http://safe-image.com/image.png');
      expect(storedNft.imagePreview).toBeUndefined();
      expect(storedNft.externalLink).toBe('http://safe-external.com');
    });

    it('should handle non-http URLs and edge cases', async () => {
      const mockBulkScanUrls = jest.fn().mockResolvedValue({ results: {} });

      const { nftController } = setupController({
        bulkScanUrlsMock: mockBulkScanUrls,
      });

      const nftWithEdgeCases: NftMetadata = {
        name: 'Edge case NFT',
        description: 'Testing edge cases',
        image: 'ipfs://QmTest123', // IPFS URL - should not be scanned
        imagePreview: '', // Empty string
        externalLink: 'https://secure-site.com', // HTTPS URL
        standard: ERC721,
      };

      await nftController.addNft('0xedge', '1', 'mainnet', {
        nftMetadata: nftWithEdgeCases,
        userAddress: OWNER_ADDRESS,
      });

      // Verify only HTTP(S) URLs were sent for scanning
      expect(mockBulkScanUrls).toHaveBeenCalledWith([
        'https://secure-site.com',
      ]);

      const storedNft =
        nftController.state.allNfts[OWNER_ADDRESS][ChainId.mainnet][0];

      // Verify all fields are preserved as-is
      expect(storedNft.image).toBe('ipfs://QmTest123');
      expect(storedNft.imagePreview).toBe('');
      expect(storedNft.externalLink).toBe('https://secure-site.com');
    });

    it('should handle bulk sanitization with multiple NFTs efficiently', async () => {
      let scanCallCount = 0;
      const mockBulkScanUrls = jest.fn().mockImplementation(() => {
        scanCallCount += 1;
        return Promise.resolve({
          results: {
            'http://image-0.com/image.png': {
              recommendedAction: RecommendedAction.None,
            },
            'http://external-0.com': {
              recommendedAction: RecommendedAction.None,
            },
            'http://image-1.com/image.png': {
              recommendedAction: RecommendedAction.None,
            },
            'http://external-1.com': {
              recommendedAction: RecommendedAction.None,
            },
            'http://image-2.com/image.png': {
              recommendedAction: RecommendedAction.None,
            },
            'http://external-2.com': {
              recommendedAction: RecommendedAction.None,
            },
            'http://image-3.com/image.png': {
              recommendedAction: RecommendedAction.None,
            },
            'http://external-3.com': {
              recommendedAction: RecommendedAction.None,
            },
            'http://image-4.com/image.png': {
              recommendedAction: RecommendedAction.None,
            },
            'http://external-4.com': {
              recommendedAction: RecommendedAction.None,
            },
          },
        });
      });

      const { nftController } = setupController({
        bulkScanUrlsMock: mockBulkScanUrls,
      });

      // Add multiple NFTs in sequence
      const nftCount = 5;
      for (let i = 0; i < nftCount; i++) {
        await nftController.addNft(`0x0${i}`, `${i}`, 'mainnet', {
          nftMetadata: {
            name: `NFT ${i}`,
            description: `Description ${i}`,
            image: `http://image-${i}.com/image.png`,
            externalLink: `http://external-${i}.com`,
            standard: ERC721,
          },
          userAddress: OWNER_ADDRESS,
        });
      }

      // Verify bulk scan was called once per NFT (not batched in this flow)
      expect(scanCallCount).toBe(nftCount);

      // Verify all NFTs were added successfully
      const storedNfts =
        nftController.state.allNfts[OWNER_ADDRESS][ChainId.mainnet];
      expect(storedNfts).toHaveLength(nftCount);
    });

    it('should not call phishing detection when no HTTP URLs are present', async () => {
      const mockBulkScanUrls = jest.fn();

      const { nftController } = setupController({
        bulkScanUrlsMock: mockBulkScanUrls,
      });

      const nftWithoutHttpUrls: NftMetadata = {
        name: 'No HTTP URLs',
        description: 'This NFT has no HTTP URLs',
        image: 'ipfs://QmTest123',
        standard: ERC721,
      };

      await nftController.addNft('0xnohttp', '1', 'mainnet', {
        nftMetadata: nftWithoutHttpUrls,
        userAddress: OWNER_ADDRESS,
      });

      // Verify phishing detection was not called
      expect(mockBulkScanUrls).not.toHaveBeenCalled();

      const storedNft =
        nftController.state.allNfts[OWNER_ADDRESS][ChainId.mainnet][0];
      expect(storedNft.image).toBe('ipfs://QmTest123');
    });

    it('should handle collection without externalLink field', async () => {
      const mockBulkScanUrls = jest.fn().mockResolvedValue({ results: {} });

      const { nftController } = setupController({
        bulkScanUrlsMock: mockBulkScanUrls,
      });

      const nftWithCollectionNoLink: NftMetadata = {
        name: 'NFT with collection',
        description: 'Collection without external link',
        image: 'http://image.com/image.png',
        standard: ERC721,
        collection: {
          id: 'collection-1',
          name: 'Test Collection',
          // No externalLink field
        },
      };

      await nftController.addNft('0xcollection', '1', 'mainnet', {
        nftMetadata: nftWithCollectionNoLink,
        userAddress: OWNER_ADDRESS,
      });

      // Should not throw error
      expect(mockBulkScanUrls).toHaveBeenCalledWith([
        'http://image.com/image.png',
      ]);
    });
  });
});
