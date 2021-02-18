import { createSandbox, stub } from 'sinon';
import * as nock from 'nock';
import { AssetsDetectionController } from '../src/assets/AssetsDetectionController';
import { NetworkController, NetworksChainId } from '../src/network/NetworkController';
import { PreferencesController } from '../src/user/PreferencesController';
import { ComposableController } from '../src/ComposableController';
import { AssetsController } from '../src/assets/AssetsController';
import { AssetsContractController } from '../src/assets/AssetsContractController';

const { BN } = require('ethereumjs-util');

const DEFAULT_INTERVAL = 180000;
const MAINNET = 'mainnet';
const ROPSTEN = 'ropsten';
const TOKENS = [{ address: '0xfoO', symbol: 'bar', decimals: 2 }];
const OPEN_SEA_HOST = 'https://api.opensea.io';
const OPEN_SEA_PATH = '/api/v1';

describe('AssetsDetectionController', () => {
  let assetsDetection: AssetsDetectionController;
  let preferences: PreferencesController;
  let network: NetworkController;
  let assets: AssetsController;
  let assetsContract: AssetsContractController;
  const sandbox = createSandbox();

  beforeEach(() => {
    assetsDetection = new AssetsDetectionController();
    preferences = new PreferencesController();
    network = new NetworkController();
    assets = new AssetsController();
    assetsContract = new AssetsContractController();

    new ComposableController([assets, assetsContract, assetsDetection, network, preferences]);

    nock(OPEN_SEA_HOST)
      .get(`${OPEN_SEA_PATH}/assets?owner=0x2&limit=300`)
      .reply(200, {
        assets: [
          {
            asset_contract: {
              address: '0x1d963688fe2209a98db35c67a041524822cf04ff',
            },
            description: 'Description 2577',
            image_original_url: 'image/2577.png',
            name: 'ID 2577',
            token_id: '2577',
          },
        ],
      })
      .persist();

    nock(OPEN_SEA_HOST)
      .get(`${OPEN_SEA_PATH}/asset_contract/0x1d963688FE2209A98dB35C67A041524822Cf04ff`)
      .reply(200, {
        description: 'Description',
        image_url: 'url',
        name: 'Name',
        symbol: 'FOO',
        total_supply: 0,
      })
      .get(`${OPEN_SEA_PATH}/asset_contract/0x1D963688FE2209A98db35c67A041524822cf04Hh`)
      .reply(200, {
        description: 'Description HH',
        image_url: 'url HH',
        name: 'Name HH',
        symbol: 'HH',
        total_supply: 10,
      })
      .get(`${OPEN_SEA_PATH}/asset_contract/0x1d963688FE2209A98db35c67A041524822CF04gg`)
      .replyWithError(new TypeError('Failed to fetch'))
      .get(`${OPEN_SEA_PATH}/asset_contract/0x1D963688fe2209a98dB35c67a041524822Cf04ii`)
      .replyWithError(new TypeError('Failed to fetch'))
      .get(`${OPEN_SEA_PATH}/assets?owner=0x1&limit=300`)
      .reply(200, {
        assets: [
          {
            asset_contract: {
              address: '0x1d963688FE2209A98db35c67A041524822CF04gg',
            },
            description: 'Description 2577',
            image_original_url: 'image/2577.png',
            name: 'ID 2577',
            token_id: '2577',
          },
          {
            asset_contract: {
              address: '0x1d963688FE2209A98db35c67A041524822CF04ii',
            },
            description: 'Description 2578',
            image_original_url: 'image/2578.png',
            name: 'ID 2578',
            token_id: '2578',
          },
          {
            asset_contract: {
              address: '0x1d963688FE2209A98db35c67A041524822CF04hh',
            },
            description: 'Description 2574',
            image_original_url: 'image/2574.png',
            name: 'ID 2574',
            token_id: '2574',
          },
        ],
      });
  });

  afterEach(() => {
    nock.cleanAll();
    sandbox.reset();
  });

  it('should set default config', () => {
    expect(assetsDetection.config).toEqual({
      interval: DEFAULT_INTERVAL,
      networkType: 'mainnet',
      selectedAddress: '',
      tokens: [],
    });
  });

  it('should poll and detect assets on interval while on mainnet', () => {
    return new Promise((resolve) => {
      const mockTokens = stub(AssetsDetectionController.prototype, 'detectTokens');
      const mockCollectibles = stub(AssetsDetectionController.prototype, 'detectCollectibles');
      new AssetsDetectionController({ interval: 10 });
      expect(mockTokens.calledOnce).toBe(true);
      expect(mockCollectibles.calledOnce).toBe(true);
      setTimeout(() => {
        expect(mockTokens.calledTwice).toBe(true);
        expect(mockCollectibles.calledTwice).toBe(true);
        mockTokens.restore();
        mockCollectibles.restore();
        resolve('');
      }, 15);
    });
  });

  it('should detect mainnet correctly', () => {
    assetsDetection.configure({ networkType: MAINNET });
    expect(assetsDetection.isMainnet()).toEqual(true);
    assetsDetection.configure({ networkType: ROPSTEN });
    expect(assetsDetection.isMainnet()).toEqual(false);
  });

  it('should not autodetect while not on mainnet', () => {
    return new Promise((resolve) => {
      const mockTokens = stub(AssetsDetectionController.prototype, 'detectTokens');
      const mockCollectibles = stub(AssetsDetectionController.prototype, 'detectCollectibles');
      new AssetsDetectionController({ interval: 10, networkType: ROPSTEN });
      expect(mockTokens.called).toBe(false);
      expect(mockCollectibles.called).toBe(false);
      mockTokens.restore();
      mockCollectibles.restore();
      resolve('');
    });
  });

  it('should detect and add collectibles correctly', async () => {
    assetsDetection.configure({ networkType: MAINNET, selectedAddress: '0x1' });
    await assetsDetection.detectCollectibles();
    expect(assets.state.collectibles).toEqual([
      {
        address: '0x1D963688FE2209A98db35c67A041524822cf04Hh',
        description: 'Description 2574',
        image: 'image/2574.png',
        name: 'ID 2574',
        tokenId: 2574,
      },
    ]);
  });

  it('should detect, add collectibles and remove not detected collectibles correctly', async () => {
    assetsDetection.configure({ networkType: MAINNET, selectedAddress: '0x1' });
    await assets.addCollectible('0x1D963688FE2209A98db35c67A041524822cf04Hh', 2573, {
      description: 'desc',
      image: 'image',
      name: 'name',
    });
    await assets.addCollectible('0x1D963688FE2209A98db35c67A041524822cf04Hh', 2572, {
      description: 'desc',
      image: 'image',
      name: 'name',
    });
    await assetsDetection.detectCollectibles();
    expect(assets.state.collectibles).toEqual([
      {
        address: '0x1D963688FE2209A98db35c67A041524822cf04Hh',
        description: 'Description 2574',
        image: 'image/2574.png',
        name: 'ID 2574',
        tokenId: 2574,
      },
    ]);
  });

  it('should not autodetect collectibles that exist in the ignoreList', async () => {
    assetsDetection.configure({ networkType: MAINNET, selectedAddress: '0x2' });
    await assetsDetection.detectCollectibles();
    expect(assets.state.collectibles).toHaveLength(1);
    expect(assets.state.ignoredCollectibles).toHaveLength(0);
    assets.removeAndIgnoreCollectible('0x1d963688fe2209a98db35c67a041524822cf04ff', 2577);
    await assetsDetection.detectCollectibles();
    expect(assets.state.collectibles).toHaveLength(0);
    expect(assets.state.ignoredCollectibles).toHaveLength(1);
  });

  it('should not detect and add collectibles if there is no selectedAddress', async () => {
    assetsDetection.configure({ networkType: MAINNET });
    await assetsDetection.detectCollectibles();
    expect(assets.state.collectibles).toEqual([]);
  });

  it('should not add collectible if collectible or collectible contract has no information to display', async () => {
    const collectibleHH2574 = {
      address: '0x1D963688FE2209A98db35c67A041524822cf04Hh',
      description: 'Description 2574',
      image: 'image/2574.png',
      name: 'ID 2574',
      tokenId: 2574,
    };
    const collectibleGG2574 = {
      address: '0x1d963688FE2209A98db35c67A041524822CF04gg',
      description: 'Description 2574',
      image: 'image/2574.png',
      name: 'ID 2574',
      tokenId: 2574,
    };
    const collectibleII2577 = {
      address: '0x1D963688fe2209a98dB35c67a041524822Cf04ii',
      description: 'Description 2577',
      image: 'image/2577.png',
      name: 'ID 2577',
      tokenId: 2577,
    };
    const collectibleContractHH = {
      address: '0x1D963688FE2209A98db35c67A041524822cf04Hh',
      description: 'Description HH',
      logo: 'url HH',
      name: 'Name HH',
      symbol: 'HH',
      totalSupply: 10,
    };
    const collectibleContractGG = {
      address: '0x1d963688FE2209A98db35c67A041524822CF04gg',
      description: 'Description GG',
      logo: 'url GG',
      name: 'Name GG',
      symbol: 'GG',
      totalSupply: 10,
    };
    const collectibleContractII = {
      address: '0x1D963688fe2209a98dB35c67a041524822Cf04ii',
      description: 'Description II',
      logo: 'url II',
      name: 'Name II',
      symbol: 'II',
      totalSupply: 10,
    };
    assetsDetection.configure({ selectedAddress: '0x1', networkType: MAINNET });
    await assetsDetection.detectCollectibles();
    // First fetch to API, only gets information from contract ending in HH
    expect(assets.state.collectibles).toEqual([collectibleHH2574]);
    expect(assets.state.collectibleContracts).toEqual([collectibleContractHH]);
    // During next call of assets detection, API succeds returning contract ending in gg information

    nock(OPEN_SEA_HOST)
      .get(`${OPEN_SEA_PATH}/asset_contract/0x1d963688FE2209A98db35c67A041524822CF04gg`)
      .reply(200, {
        description: 'Description GG',
        image_url: 'url GG',
        name: 'Name GG',
        symbol: 'GG',
        total_supply: 10,
      })
      .get(`${OPEN_SEA_PATH}/asset_contract/0x1D963688fe2209a98dB35c67a041524822Cf04ii`)
      .reply(200, {
        description: 'Description II',
        image_url: 'url II',
        name: 'Name II',
        symbol: 'II',
        total_supply: 10,
      })
      .get(`${OPEN_SEA_PATH}/assets?owner=0x1&limit=300`)
      .reply(200, {
        assets: [
          {
            asset_contract: {
              address: '0x1d963688FE2209A98db35c67A041524822CF04ii',
            },
            description: 'Description 2577',
            image_original_url: 'image/2577.png',
            name: 'ID 2577',
            token_id: '2577',
          },
          {
            asset_contract: {
              address: '0x1D963688fe2209a98dB35c67a041524822Cf04gg',
            },
            description: 'Description 2574',
            image_original_url: 'image/2574.png',
            name: 'ID 2574',
            token_id: '2574',
          },
          {
            asset_contract: {
              address: '0x1d963688FE2209A98db35c67A041524822CF04hh',
            },
            description: 'Description 2574',
            image_original_url: 'image/2574.png',
            name: 'ID 2574',
            token_id: '2574',
          },
        ],
      });

    // Now user should have respective collectibles
    await assetsDetection.detectCollectibles();
    expect(assets.state.collectibleContracts).toEqual([
      collectibleContractHH,
      collectibleContractII,
      collectibleContractGG,
    ]);
    expect(assets.state.collectibles).toEqual([collectibleHH2574, collectibleII2577, collectibleGG2574]);
  });

  it('should detect tokens correctly', async () => {
    assetsDetection.configure({ networkType: MAINNET, selectedAddress: '0x1' });
    sandbox
      .stub(assetsContract, 'getBalancesInSingleCall')
      .resolves({ '0x6810e776880C02933D47DB1b9fc05908e5386b96': new BN(1) });
    await assetsDetection.detectTokens();
    expect(assets.state.tokens).toEqual([
      {
        address: '0x6810e776880C02933D47DB1b9fc05908e5386b96',
        decimals: 18,
        symbol: 'GNO',
      },
    ]);
  });

  it('should not autodetect tokens that exist in the ignoreList', async () => {
    assetsDetection.configure({ networkType: MAINNET, selectedAddress: '0x1' });
    sandbox
      .stub(assetsContract, 'getBalancesInSingleCall')
      .resolves({ '0x6810e776880C02933D47DB1b9fc05908e5386b96': new BN(1) });
    await assetsDetection.detectTokens();

    assets.removeAndIgnoreToken('0x6810e776880C02933D47DB1b9fc05908e5386b96');
    await assetsDetection.detectTokens();
    expect(assets.state.tokens).toEqual([]);
  });

  it('should not detect tokens if there is no selectedAddress set', async () => {
    assetsDetection.configure({ networkType: MAINNET });
    sandbox
      .stub(assetsContract, 'getBalancesInSingleCall')
      .resolves({ '0x6810e776880C02933D47DB1b9fc05908e5386b96': new BN(1) });
    await assetsDetection.detectTokens();
    expect(assets.state.tokens).toEqual([]);
  });

  it('should subscribe to new sibling detecting assets when account changes', async () => {
    const firstNetworkType = 'rinkeby';
    const secondNetworkType = 'mainnet';
    const firstAddress = '0x123';
    const secondAddress = '0x321';
    const detectAssets = sandbox.stub(assetsDetection, 'detectAssets');
    preferences.update({ selectedAddress: secondAddress });
    preferences.update({ selectedAddress: secondAddress });
    expect(assetsDetection.context.PreferencesController.state.selectedAddress).toEqual(secondAddress);
    expect(detectAssets.calledTwice).toBe(false);
    preferences.update({ selectedAddress: firstAddress });
    expect(assetsDetection.context.PreferencesController.state.selectedAddress).toEqual(firstAddress);
    network.update({ provider: { type: secondNetworkType, chainId: NetworksChainId[secondNetworkType] } });
    expect(assetsDetection.context.NetworkController.state.provider.type).toEqual(secondNetworkType);
    network.update({ provider: { type: firstNetworkType, chainId: NetworksChainId[firstNetworkType] } });
    expect(assetsDetection.context.NetworkController.state.provider.type).toEqual(firstNetworkType);
    assets.update({ tokens: TOKENS });
    expect(assetsDetection.config.tokens).toEqual(TOKENS);
  });
});
