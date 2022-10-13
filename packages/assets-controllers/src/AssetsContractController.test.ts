import HttpProvider from 'ethjs-provider-http';
import { IPFS_DEFAULT_GATEWAY_URL } from '@metamask/controller-utils';
import { ControllerMessenger } from '@metamask/base-controller';
import { PreferencesController } from '@metamask/preferences-controller';
import {
  NetworkController,
  NetworkControllerMessenger,
} from '@metamask/network-controller';
import {
  AssetsContractController,
  MISSING_PROVIDER_ERROR,
} from './AssetsContractController';
import { SupportedTokenDetectionNetworks } from './assetsUtil';

const MAINNET_PROVIDER = new HttpProvider(
  'https://mainnet.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);

const ERC20_UNI_ADDRESS = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';
const ERC20_DAI_ADDRESS = '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359';
const ERC721_GODS_ADDRESS = '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab';
const ERC1155_ADDRESS = '0x495f947276749ce646f68ac8c248420045cb7b5e';
const ERC1155_ID =
  '40815311521795738946686668571398122012172359753720345430028676522525371400193';

const TEST_ACCOUNT_PUBLIC_ADDRESS =
  '0x5a3CA5cD63807Ce5e4d7841AB32Ce6B6d9BbBa2D';

const setupControllers = () => {
  const messenger: NetworkControllerMessenger =
    new ControllerMessenger().getRestricted({
      name: 'NetworkController',
      allowedEvents: ['NetworkController:stateChange'],
      allowedActions: [],
    });
  const network = new NetworkController({
    messenger,
  });
  const preferences = new PreferencesController();
  const assetsContract = new AssetsContractController({
    onPreferencesStateChange: (listener) => preferences.subscribe(listener),
    onNetworkStateChange: (listener) =>
      messenger.subscribe('NetworkController:stateChange', listener),
  });

  return { messenger, network, preferences, assetsContract };
};

describe('AssetsContractController', () => {
  it('should set default config', () => {
    const { assetsContract, messenger } = setupControllers();
    expect(assetsContract.config).toStrictEqual({
      chainId: SupportedTokenDetectionNetworks.mainnet,
      ipfsGateway: IPFS_DEFAULT_GATEWAY_URL,
      provider: undefined,
    });
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should update the ipfsGateWay config value when this value is changed in the preferences controller', () => {
    const { assetsContract, messenger, preferences } = setupControllers();
    expect(assetsContract.config).toStrictEqual({
      chainId: SupportedTokenDetectionNetworks.mainnet,
      ipfsGateway: IPFS_DEFAULT_GATEWAY_URL,
      provider: undefined,
    });

    preferences.setIpfsGateway('newIPFSGateWay');
    expect(assetsContract.config).toStrictEqual({
      ipfsGateway: 'newIPFSGateWay',
      chainId: SupportedTokenDetectionNetworks.mainnet,
      provider: undefined,
    });

    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should throw when provider property is accessed', () => {
    const { assetsContract, messenger } = setupControllers();
    expect(() => console.log(assetsContract.provider)).toThrow(
      'Property only used for setting',
    );
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should throw missing provider error when getting ERC-20 token balance when missing provider', async () => {
    const { assetsContract, messenger } = setupControllers();
    assetsContract.configure({ provider: undefined });
    await expect(
      assetsContract.getERC20BalanceOf(
        ERC20_UNI_ADDRESS,
        TEST_ACCOUNT_PUBLIC_ADDRESS,
      ),
    ).rejects.toThrow(MISSING_PROVIDER_ERROR);
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should throw missing provider error when getting ERC-20 token decimal when missing provider', async () => {
    const { assetsContract, messenger } = setupControllers();
    assetsContract.configure({ provider: undefined });
    await expect(
      assetsContract.getERC20TokenDecimals(ERC20_UNI_ADDRESS),
    ).rejects.toThrow(MISSING_PROVIDER_ERROR);
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should get balance of ERC-20 token contract correctly', async () => {
    const { assetsContract, messenger } = setupControllers();
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const UNIBalance = await assetsContract.getERC20BalanceOf(
      ERC20_UNI_ADDRESS,
      TEST_ACCOUNT_PUBLIC_ADDRESS,
    );
    const UNINoBalance = await assetsContract.getERC20BalanceOf(
      ERC20_UNI_ADDRESS,
      '0x202637dAAEfbd7f131f90338a4A6c69F6Cd5CE91',
    );
    expect(UNIBalance.toNumber()).not.toStrictEqual(0);
    expect(UNINoBalance.toNumber()).toStrictEqual(0);
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should get ERC-721 NFT tokenId correctly', async () => {
    const { assetsContract, messenger } = setupControllers();
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const tokenId = await assetsContract.getERC721NftTokenId(
      ERC721_GODS_ADDRESS,
      '0x9a90bd8d1149a88b42a99cf62215ad955d6f498a',
      0,
    );
    expect(tokenId).not.toStrictEqual(0);
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should throw missing provider error when getting ERC-721 token standard and details when missing provider', async () => {
    const { assetsContract, messenger } = setupControllers();
    assetsContract.configure({ provider: undefined });
    await expect(
      assetsContract.getTokenStandardAndDetails(
        ERC20_UNI_ADDRESS,
        TEST_ACCOUNT_PUBLIC_ADDRESS,
      ),
    ).rejects.toThrow(MISSING_PROVIDER_ERROR);
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should throw contract standard error when getting ERC-20 token standard and details when provided with invalid ERC-20 address', async () => {
    const { assetsContract, messenger } = setupControllers();
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const error = 'Unable to determine contract standard';
    await expect(
      assetsContract.getTokenStandardAndDetails(
        'BaDeRc20AdDrEsS',
        TEST_ACCOUNT_PUBLIC_ADDRESS,
      ),
    ).rejects.toThrow(error);
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should get ERC-721 token standard and details', async () => {
    const { assetsContract, messenger } = setupControllers();
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const standardAndDetails = await assetsContract.getTokenStandardAndDetails(
      ERC721_GODS_ADDRESS,
      TEST_ACCOUNT_PUBLIC_ADDRESS,
    );
    expect(standardAndDetails.standard).toStrictEqual('ERC721');
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should get ERC-1155 token standard and details', async () => {
    const { assetsContract, messenger } = setupControllers();
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const standardAndDetails = await assetsContract.getTokenStandardAndDetails(
      ERC1155_ADDRESS,
      TEST_ACCOUNT_PUBLIC_ADDRESS,
    );
    expect(standardAndDetails.standard).toStrictEqual('ERC1155');
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should get ERC-20 token standard and details', async () => {
    const { assetsContract, messenger } = setupControllers();
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const standardAndDetails = await assetsContract.getTokenStandardAndDetails(
      ERC20_UNI_ADDRESS,
      TEST_ACCOUNT_PUBLIC_ADDRESS,
    );
    expect(standardAndDetails.standard).toStrictEqual('ERC20');
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should get ERC-721 NFT tokenURI correctly', async () => {
    const { assetsContract, messenger } = setupControllers();
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const tokenId = await assetsContract.getERC721TokenURI(
      ERC721_GODS_ADDRESS,
      '0',
    );
    expect(tokenId).toStrictEqual('https://api.godsunchained.com/card/0');
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should throw an error when address given is not an ERC-721 NFT', async () => {
    const { assetsContract, messenger } = setupControllers();
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const result = async () => {
      await assetsContract.getERC721TokenURI(
        '0x0000000000000000000000000000000000000000',
        '0',
      );
    };

    const error = 'Contract does not support ERC721 metadata interface.';
    await expect(result).rejects.toThrow(error);
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should get ERC-721 NFT name', async () => {
    const { assetsContract, messenger } = setupControllers();
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const name = await assetsContract.getERC721AssetName(ERC721_GODS_ADDRESS);
    expect(name).toStrictEqual('Gods Unchained');
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should get ERC-721 NFT symbol', async () => {
    const { assetsContract, messenger } = setupControllers();
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const symbol = await assetsContract.getERC721AssetSymbol(
      ERC721_GODS_ADDRESS,
    );
    expect(symbol).toStrictEqual('GODS');
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should throw missing provider error when getting ERC-721 NFT symbol when missing provider', async () => {
    const { assetsContract, messenger } = setupControllers();
    await expect(
      assetsContract.getERC721AssetSymbol(ERC721_GODS_ADDRESS),
    ).rejects.toThrow(MISSING_PROVIDER_ERROR);
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should get ERC-20 token decimals', async () => {
    const { assetsContract, messenger } = setupControllers();
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const decimals = await assetsContract.getERC20TokenDecimals(
      ERC20_DAI_ADDRESS,
    );
    expect(Number(decimals)).toStrictEqual(18);
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should get ERC-721 NFT ownership', async () => {
    const { assetsContract, messenger } = setupControllers();
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const tokenId = await assetsContract.getERC721OwnerOf(
      ERC721_GODS_ADDRESS,
      '148332',
    );
    expect(tokenId).not.toStrictEqual('');
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should throw missing provider error when getting ERC-721 NFT ownership', async () => {
    const { assetsContract, messenger } = setupControllers();
    await expect(
      assetsContract.getERC721OwnerOf(ERC721_GODS_ADDRESS, '148332'),
    ).rejects.toThrow(MISSING_PROVIDER_ERROR);
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should get balance of ERC-20 token in a single call on network with token detection support', async () => {
    const { assetsContract, messenger } = setupControllers();
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const balances = await assetsContract.getBalancesInSingleCall(
      ERC20_DAI_ADDRESS,
      [ERC20_DAI_ADDRESS],
    );
    expect(balances[ERC20_DAI_ADDRESS]).not.toBeUndefined();
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should not have balance in a single call after switching to network without token detection support', async () => {
    const { assetsContract, messenger, network } = setupControllers();
    assetsContract.configure({
      provider: MAINNET_PROVIDER,
    });

    const balances = await assetsContract.getBalancesInSingleCall(
      ERC20_DAI_ADDRESS,
      [ERC20_DAI_ADDRESS],
    );
    expect(balances[ERC20_DAI_ADDRESS]).not.toBeUndefined();

    network.setProviderType('localhost');

    const noBalances = await assetsContract.getBalancesInSingleCall(
      ERC20_DAI_ADDRESS,
      [ERC20_DAI_ADDRESS],
    );
    expect(noBalances).toStrictEqual({});
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should throw missing provider error when transfering single ERC-1155 when missing provider', async () => {
    const { assetsContract, messenger } = setupControllers();
    assetsContract.configure({ provider: undefined });
    await expect(
      assetsContract.transferSingleERC1155(
        ERC1155_ADDRESS,
        TEST_ACCOUNT_PUBLIC_ADDRESS,
        TEST_ACCOUNT_PUBLIC_ADDRESS,
        ERC1155_ID,
        '1',
      ),
    ).rejects.toThrow(MISSING_PROVIDER_ERROR);
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should get the balance of a ERC-1155 NFT for a given address', async () => {
    const { assetsContract, messenger } = setupControllers();
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const balance = await assetsContract.getERC1155BalanceOf(
      TEST_ACCOUNT_PUBLIC_ADDRESS,
      ERC1155_ADDRESS,
      ERC1155_ID,
    );
    expect(Number(balance)).toBeGreaterThan(0);
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should throw missing provider error when getting the balance of a ERC-1155 NFT when missing provider', async () => {
    const { assetsContract, messenger } = setupControllers();
    await expect(
      assetsContract.getERC1155BalanceOf(
        TEST_ACCOUNT_PUBLIC_ADDRESS,
        ERC1155_ADDRESS,
        ERC1155_ID,
      ),
    ).rejects.toThrow(MISSING_PROVIDER_ERROR);
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should get the URI of a ERC-1155 NFT', async () => {
    const { assetsContract, messenger } = setupControllers();
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const expectedUri = `https://api.opensea.io/api/v1/metadata/${ERC1155_ADDRESS}/0x{id}`;
    const uri = await assetsContract.getERC1155TokenURI(
      ERC1155_ADDRESS,
      ERC1155_ID,
    );
    expect(uri.toLowerCase()).toStrictEqual(expectedUri);
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });
});
