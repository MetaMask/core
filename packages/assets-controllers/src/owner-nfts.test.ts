import nock from 'nock';
import { OPENSEA_PROXY_URL } from '@metamask/controller-utils';
import { getOwnerNfts } from './owner-nfts';

describe('OwnerNfts', () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  beforeEach(() => {
    nock(OPENSEA_PROXY_URL)
      .get(`/assets?owner=0x1&offset=0&limit=50`)
      .reply(200, {
        assets: [
          {
            token_id: '2774',
            num_sales: 1,
            background_color: null,
            image_url:
              'https://i.seadn.io/gae/T6nnZI78nObUuFmOiD4DxxlHp0yMZG7ZRsfreZ4EZCuzDJ1YF0-7eIQd6QtXnH0mx4M5csdycCIMw1tUKdjFoPDTp4LfRH6sdGHL?w=500&auto=format',
            image_preview_url:
              'https://i.seadn.io/gae/T6nnZI78nObUuFmOiD4DxxlHp0yMZG7ZRsfreZ4EZCuzDJ1YF0-7eIQd6QtXnH0mx4M5csdycCIMw1tUKdjFoPDTp4LfRH6sdGHL?w=500&auto=format',
            image_thumbnail_url:
              'https://i.seadn.io/gae/T6nnZI78nObUuFmOiD4DxxlHp0yMZG7ZRsfreZ4EZCuzDJ1YF0-7eIQd6QtXnH0mx4M5csdycCIMw1tUKdjFoPDTp4LfRH6sdGHL?w=500&auto=format',
            image_original_url: null,
            animation_url: null,
            animation_original_url: null,
            name: 'CryptoCrazed #9',
            description: null,
            external_link: null,
            asset_contract: {
              address: '0xf4910c763ed4e47a585e2d34baa9a4b611ae448c',
              asset_contract_type: 'semi-fungible',
              created_date: '2022-09-09T19:54:17.825024',
              schema_name: 'ERC1155',
              symbol: 'OPENSTORE',
              total_supply: null,
              description: null,
              external_link: null,
              collection: {
                image_url:
                  'https://i.seadn.io/gcs/files/c6509a79c63fff47a94a58fd18928b5c.jpg?w=500&auto=format',
                name: 'NFTCryptoCrazed',
              },
            },
            creator: {
              user: {
                username: 'Ccrazy_deployer',
              },
              profile_img_url:
                'https://storage.googleapis.com/opensea-static/opensea-profile/3.png',
              address: '0x10794422a45d276214495152e6c9055fd0d2ede7',
            },
            last_sale: {
              event_timestamp: '2022-10-27T09:09:12',
              total_price: '5000000000000000',
              transaction: null,
            },
          },
          {
            token_id: '2773',
            num_sales: 1,
            background_color: null,
            image_url: null,
            image_preview_url: null,
            image_thumbnail_url: null,
            image_original_url: null,
            animation_url: null,
            animation_original_url: null,
            name: 'CryptoCrazed #8',
            description: null,
            external_link: null,
            asset_contract: {
              address: '0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc',
              asset_contract_type: 'semi-fungible',
              created_date: '2022-09-08T19:54:17.825024',
              schema_name: 'ERC1155',
              symbol: 'OPENSTORE',
              total_supply: null,
              description: null,
              external_link: null,
              collection: {
                image_url: null,
                name: 'NFTCryptoCrazed',
              },
            },
            creator: {
              user: {
                username: 'Crazy_deployer',
              },
              profile_img_url:
                'https://storage.googleapis.com/opensea-static/opensea-profile/3.png',
              address: '0x10794422a45d276214495152e6c9055fd0d2ede8',
            },
            last_sale: {
              event_timestamp: '2022-10-28T09:09:12',
              total_price: '5000000000000000',
              transaction: null,
            },
          },
        ],
      })
      .get(`/assets?owner=0x1&offset=50&limit=50`)
      .reply(200, {
        assets: [],
      });
  });

  it('should return NFTs from assets array', async () => {
    const selectedAddress = '0x1';
    const openSeaApiKey = 'new-api-key';

    const result = await getOwnerNfts(selectedAddress, openSeaApiKey);

    expect(result).toStrictEqual([
      {
        token_id: '2774',
        num_sales: 1,
        background_color: null,
        image_url:
          'https://i.seadn.io/gae/T6nnZI78nObUuFmOiD4DxxlHp0yMZG7ZRsfreZ4EZCuzDJ1YF0-7eIQd6QtXnH0mx4M5csdycCIMw1tUKdjFoPDTp4LfRH6sdGHL?w=500&auto=format',
        image_preview_url:
          'https://i.seadn.io/gae/T6nnZI78nObUuFmOiD4DxxlHp0yMZG7ZRsfreZ4EZCuzDJ1YF0-7eIQd6QtXnH0mx4M5csdycCIMw1tUKdjFoPDTp4LfRH6sdGHL?w=500&auto=format',
        image_thumbnail_url:
          'https://i.seadn.io/gae/T6nnZI78nObUuFmOiD4DxxlHp0yMZG7ZRsfreZ4EZCuzDJ1YF0-7eIQd6QtXnH0mx4M5csdycCIMw1tUKdjFoPDTp4LfRH6sdGHL?w=500&auto=format',
        image_original_url: null,
        animation_url: null,
        animation_original_url: null,
        name: 'CryptoCrazed #9',
        description: null,
        external_link: null,
        asset_contract: {
          address: '0xf4910c763ed4e47a585e2d34baa9a4b611ae448c',
          asset_contract_type: 'semi-fungible',
          created_date: '2022-09-09T19:54:17.825024',
          schema_name: 'ERC1155',
          symbol: 'OPENSTORE',
          total_supply: null,
          description: null,
          external_link: null,
          collection: {
            image_url:
              'https://i.seadn.io/gcs/files/c6509a79c63fff47a94a58fd18928b5c.jpg?w=500&auto=format',
            name: 'NFTCryptoCrazed',
          },
        },
        creator: {
          user: {
            username: 'Ccrazy_deployer',
          },
          profile_img_url:
            'https://storage.googleapis.com/opensea-static/opensea-profile/3.png',
          address: '0x10794422a45d276214495152e6c9055fd0d2ede7',
        },
        last_sale: {
          event_timestamp: '2022-10-27T09:09:12',
          total_price: '5000000000000000',
          transaction: null,
        },
      },
      {
        token_id: '2773',
        num_sales: 1,
        background_color: null,
        image_url: null,
        image_preview_url: null,
        image_thumbnail_url: null,
        image_original_url: null,
        animation_url: null,
        animation_original_url: null,
        name: 'CryptoCrazed #8',
        description: null,
        external_link: null,
        asset_contract: {
          address: '0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc',
          asset_contract_type: 'semi-fungible',
          created_date: '2022-09-08T19:54:17.825024',
          schema_name: 'ERC1155',
          symbol: 'OPENSTORE',
          total_supply: null,
          description: null,
          external_link: null,
          collection: {
            image_url: null,
            name: 'NFTCryptoCrazed',
          },
        },
        creator: {
          user: {
            username: 'Crazy_deployer',
          },
          profile_img_url:
            'https://storage.googleapis.com/opensea-static/opensea-profile/3.png',
          address: '0x10794422a45d276214495152e6c9055fd0d2ede8',
        },
        last_sale: {
          event_timestamp: '2022-10-28T09:09:12',
          total_price: '5000000000000000',
          transaction: null,
        },
      },
    ]);
  });

  it('should return one NFT in assets array', async () => {
    const selectedAddress = '0x1';
    const openSeaApiKey = 'new-api-key';

    const result = await getOwnerNfts(selectedAddress, openSeaApiKey);

    expect(result[0]).toStrictEqual({
      token_id: '2774',
      num_sales: 1,
      background_color: null,
      image_url:
        'https://i.seadn.io/gae/T6nnZI78nObUuFmOiD4DxxlHp0yMZG7ZRsfreZ4EZCuzDJ1YF0-7eIQd6QtXnH0mx4M5csdycCIMw1tUKdjFoPDTp4LfRH6sdGHL?w=500&auto=format',
      image_preview_url:
        'https://i.seadn.io/gae/T6nnZI78nObUuFmOiD4DxxlHp0yMZG7ZRsfreZ4EZCuzDJ1YF0-7eIQd6QtXnH0mx4M5csdycCIMw1tUKdjFoPDTp4LfRH6sdGHL?w=500&auto=format',
      image_thumbnail_url:
        'https://i.seadn.io/gae/T6nnZI78nObUuFmOiD4DxxlHp0yMZG7ZRsfreZ4EZCuzDJ1YF0-7eIQd6QtXnH0mx4M5csdycCIMw1tUKdjFoPDTp4LfRH6sdGHL?w=500&auto=format',
      image_original_url: null,
      animation_url: null,
      animation_original_url: null,
      name: 'CryptoCrazed #9',
      description: null,
      external_link: null,
      asset_contract: {
        address: '0xf4910c763ed4e47a585e2d34baa9a4b611ae448c',
        asset_contract_type: 'semi-fungible',
        created_date: '2022-09-09T19:54:17.825024',
        schema_name: 'ERC1155',
        symbol: 'OPENSTORE',
        total_supply: null,
        description: null,
        external_link: null,
        collection: {
          image_url:
            'https://i.seadn.io/gcs/files/c6509a79c63fff47a94a58fd18928b5c.jpg?w=500&auto=format',
          name: 'NFTCryptoCrazed',
        },
      },
      creator: {
        user: {
          username: 'Ccrazy_deployer',
        },
        profile_img_url:
          'https://storage.googleapis.com/opensea-static/opensea-profile/3.png',
        address: '0x10794422a45d276214495152e6c9055fd0d2ede7',
      },
      last_sale: {
        event_timestamp: '2022-10-27T09:09:12',
        total_price: '5000000000000000',
        transaction: null,
      },
    });
  });

  it('should return NFT collection name', async () => {
    const selectedAddress = '0x1';
    const openSeaApiKey = 'new-api-key';

    const result = await getOwnerNfts(selectedAddress, openSeaApiKey);

    expect(result[0].asset_contract.collection.name).toStrictEqual(
      'NFTCryptoCrazed',
    );
  });

  it('should return NFT collection image', async () => {
    const selectedAddress = '0x1';
    const openSeaApiKey = 'new-api-key';

    const result = await getOwnerNfts(selectedAddress, openSeaApiKey);

    expect(result[0].asset_contract.collection.image_url).toStrictEqual(
      'https://i.seadn.io/gcs/files/c6509a79c63fff47a94a58fd18928b5c.jpg?w=500&auto=format',
    );
  });

  it('should return null for NFT collection image when collection image doesnt exist', async () => {
    const selectedAddress = '0x1';
    const openSeaApiKey = 'new-api-key';

    const result = await getOwnerNfts(selectedAddress, openSeaApiKey);

    expect(result[1].asset_contract.collection.image_url).toBeNull();
  });

  it('should return NFT token image', async () => {
    const selectedAddress = '0x1';
    const openSeaApiKey = 'new-api-key';

    const result = await getOwnerNfts(selectedAddress, openSeaApiKey);

    expect(result[0].image_url).toStrictEqual(
      'https://i.seadn.io/gae/T6nnZI78nObUuFmOiD4DxxlHp0yMZG7ZRsfreZ4EZCuzDJ1YF0-7eIQd6QtXnH0mx4M5csdycCIMw1tUKdjFoPDTp4LfRH6sdGHL?w=500&auto=format',
    );
  });

  it('should return null for NFT token image when token image doesnt exist', async () => {
    const selectedAddress = '0x1';
    const openSeaApiKey = 'new-api-key';

    const result = await getOwnerNfts(selectedAddress, openSeaApiKey);

    expect(result[1].image_url).toBeNull();
  });

  it('should return empty array of NFTs when address is diferent', async () => {
    const selectedAddress = '0x2';
    const openSeaApiKey = 'new-api-key';
    nock('https://proxy.metaswap.codefi.network:443', {
      encodedQueryParams: true,
    })
      .get('/opensea/v1/api/v1/assets')
      .query({ owner: selectedAddress, offset: '0', limit: '50' })
      .reply(200, {
        assets: [],
      })
      .get('/opensea/v1/api/v1/assets')
      .query({ owner: selectedAddress, offset: '50', limit: '50' })
      .reply(200, {
        assets: [],
      });

    const result = await getOwnerNfts(selectedAddress, openSeaApiKey);

    expect(result).toStrictEqual([]);
  });

  it('should rethrow error when OpenSea proxy server fails with error other than fetch failure', async () => {
    const selectedAddress = '0x4';
    const openSeaApiKey = 'new-api-key';
    nock('https://proxy.metaswap.codefi.network:443', {
      encodedQueryParams: true,
    })
      .get('/opensea/v1/api/v1/assets')
      .query({ owner: selectedAddress, offset: '0', limit: '50' })
      .replyWithError(new Error('UNEXPECTED ERROR'));

    const result = getOwnerNfts(selectedAddress, openSeaApiKey);

    await expect(result).rejects.toThrow('UNEXPECTED ERROR');
  });

  it('should throw error if fetch returns unsuccessful 400 response', async () => {
    const selectedAddress = '0x5';
    const openSeaApiKey = 'new-api-key';
    const openSeaProxyServer = 'https://proxy.metaswap.codefi.network';
    nock(openSeaProxyServer)
      .get('/opensea/v1/api/v1/assets')
      .query({ owner: selectedAddress, offset: '0', limit: '50' })
      .reply(400);

    const result = getOwnerNfts(selectedAddress, openSeaApiKey);
    await expect(result).rejects.toThrow(
      `Fetch failed with status '400' for request '${openSeaProxyServer}/opensea/v1/api/v1/assets?owner=0x5&offset=0&limit=50'`,
    );
  });

  it('should throw error if fetch returns unsuccessful 404 response', async () => {
    const selectedAddress = '0x3';
    const openSeaApiKey = 'new-api-key';
    const openSeaProxyServer = 'https://proxy.metaswap.codefi.network';
    nock(openSeaProxyServer)
      .get('/opensea/v1/api/v1/assets')
      .query({ owner: selectedAddress, offset: '0', limit: '50' })
      .reply(404);

    const result = getOwnerNfts(selectedAddress, openSeaApiKey);
    await expect(result).rejects.toThrow(
      `Fetch failed with status '404' for request '${openSeaProxyServer}/opensea/v1/api/v1/assets?owner=0x3&offset=0&limit=50'`,
    );
  });

  it('should throw error if fetch returns unsuccessful 500 response', async () => {
    const selectedAddress = '0x4';
    const openSeaApiKey = 'new-api-key';
    const openSeaProxyServer = 'https://proxy.metaswap.codefi.network';
    nock(openSeaProxyServer)
      .get('/opensea/v1/api/v1/assets')
      .query({ owner: selectedAddress, offset: '0', limit: '50' })
      .reply(500);

    const result = getOwnerNfts(selectedAddress, openSeaApiKey);
    await expect(result).rejects.toThrow(
      `Fetch failed with status '500' for request '${openSeaProxyServer}/opensea/v1/api/v1/assets?owner=0x4&offset=0&limit=50'`,
    );
  });
});
