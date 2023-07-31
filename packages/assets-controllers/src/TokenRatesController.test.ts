import { NetworksTicker, toHex } from '@metamask/controller-utils';
import nock from 'nock';
import * as sinon from 'sinon';

import { TokenRatesController } from './TokenRatesController';

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const COINGECKO_ETH_PATH = '/simple/token_price/ethereum';
const COINGECKO_MATIC_PATH = '/simple/token_price/polygon-pos-network';
const COINGECKO_ASSETS_PATH = '/asset_platforms';
const COINGECKO_SUPPORTED_CURRENCIES = '/simple/supported_vs_currencies';
const ADDRESS = '0x01';

const defaultSelectedAddress = '0x0000000000000000000000000000000000000001';

describe('TokenRatesController', () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    nock(COINGECKO_API)
      .get(COINGECKO_SUPPORTED_CURRENCIES)
      .reply(200, ['eth', 'usd', 'dai'])
      .get(COINGECKO_ASSETS_PATH)
      .reply(200, [
        {
          id: 'binance-smart-chain',
          chain_identifier: 56,
          name: 'Binance Smart Chain',
          shortname: 'BSC',
        },
        {
          id: 'ethereum',
          chain_identifier: 1,
          name: 'Ethereum',
          shortname: '',
        },
        {
          id: 'polygon-pos-network',
          chain_identifier: 137,
          name: 'Polygon',
          shortname: 'MATIC',
        },
      ]);
  });

  afterEach(() => {
    sinon.restore();
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    it('should set default state', () => {
      const controller = new TokenRatesController({
        chainId: toHex(1),
        ticker: NetworksTicker.mainnet,
        selectedAddress: defaultSelectedAddress,
        onPreferencesStateChange: sinon.stub(),
        onTokensStateChange: sinon.stub(),
        onNetworkStateChange: sinon.stub(),
      });
      expect(controller.state).toStrictEqual({
        contractExchangeRates: {},
      });
    });

    it('should initialize with the default config', () => {
      const controller = new TokenRatesController({
        chainId: toHex(1),
        ticker: NetworksTicker.mainnet,
        selectedAddress: defaultSelectedAddress,
        onPreferencesStateChange: sinon.stub(),
        onTokensStateChange: sinon.stub(),
        onNetworkStateChange: sinon.stub(),
      });
      expect(controller.config).toStrictEqual({
        allDetectedTokens: {},
        allTokens: {},
        disabled: false,
        interval: 180000,
        nativeCurrency: NetworksTicker.mainnet,
        chainId: toHex(1),
        selectedAddress: defaultSelectedAddress,
        threshold: 21600000,
      });
    });

    it('should not poll by default', async () => {
      const clock = sinon.useFakeTimers({ now: Date.now() });
      const fetchSpy = jest.spyOn(globalThis, 'fetch');
      new TokenRatesController(
        {
          chainId: toHex(1),
          ticker: NetworksTicker.mainnet,
          selectedAddress: defaultSelectedAddress,
          onPreferencesStateChange: jest.fn(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange: jest.fn(),
        },
        {
          interval: 100,
          allTokens: {
            [toHex(1)]: {
              [defaultSelectedAddress]: [
                { address: 'bar', decimals: 0, symbol: '', aggregators: [] },
              ],
            },
          },
        },
      );

      await clock.tickAsync(500);

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('TokensController::stateChange', () => {
    describe('when polling is active', () => {
      it('should update exchange rates when tokens change', async () => {
        sinon.useFakeTimers({ now: Date.now() });
        let tokenStateChangeListener: (state: any) => Promise<void>;
        const onTokensStateChange = sinon.stub().callsFake((listener) => {
          tokenStateChangeListener = listener;
        });
        const onNetworkStateChange = sinon.stub();
        const controller = new TokenRatesController(
          {
            chainId: toHex(1),
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: sinon.stub(),
            onTokensStateChange,
            onNetworkStateChange,
          },
          {
            interval: 10,
            allTokens: {
              [toHex(1)]: {
                [defaultSelectedAddress]: [
                  { address: 'bar', decimals: 0, symbol: '', aggregators: [] },
                ],
              },
            },
          },
        );
        await controller.start();
        const updateExchangeRatesStub = sinon.stub(
          controller,
          'updateExchangeRates',
        );

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await tokenStateChangeListener!({
          allDetectedTokens: {},
          allTokens: {
            [toHex(1)]: {
              [defaultSelectedAddress]: [
                { address: 'foo', decimals: 0, symbol: '', aggregators: [] },
              ],
            },
          },
        });

        expect(updateExchangeRatesStub.callCount).toBe(1);
      });

      it('should update exchange rates when detected tokens are added', async () => {
        nock(COINGECKO_API)
          .get(`${COINGECKO_ETH_PATH}`)
          .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
          .reply(200, {
            '0x02': {
              eth: 0.001,
            },
            '0x03': {
              eth: 0.002,
            },
          });
        let tokenStateChangeListener: (state: any) => Promise<void>;
        const onTokensStateChange = sinon.stub().callsFake((listener) => {
          tokenStateChangeListener = listener;
        });
        const controller = new TokenRatesController(
          {
            chainId: toHex(1),
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: sinon.stub(),
            onTokensStateChange,
            onNetworkStateChange: sinon.stub(),
          },
          { interval: 10 },
        );
        expect(controller.state.contractExchangeRates).toStrictEqual({});

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await tokenStateChangeListener!({
          allDetectedTokens: {
            [toHex(1)]: {
              [defaultSelectedAddress]: [
                {
                  address: '0x02',
                  decimals: 18,
                  image: undefined,
                  symbol: 'bar',
                  isERC721: false,
                },
                {
                  address: '0x03',
                  decimals: 18,
                  image: undefined,
                  symbol: 'bazz',
                  isERC721: false,
                },
              ],
            },
          },
          allTokens: {},
        });
        await controller.updateExchangeRates();

        expect(controller.state.contractExchangeRates).toStrictEqual({
          '0x02': 0.001,
          '0x03': 0.002,
        });
      });

      it('should not update exchange rates when token state changes without "all tokens" or "all detected tokens" changing', async () => {
        sinon.useFakeTimers({ now: Date.now() });
        let tokenStateChangeListener: (state: any) => Promise<void>;
        const onTokensStateChange = sinon.stub().callsFake((listener) => {
          tokenStateChangeListener = listener;
        });
        const onNetworkStateChange = sinon.stub();
        const allTokens = {
          [toHex(1)]: {
            [defaultSelectedAddress]: [
              { address: 'foo', decimals: 0, symbol: '', aggregators: [] },
            ],
          },
        };
        const allDetectedTokens = {};
        const controller = new TokenRatesController(
          {
            chainId: toHex(1),
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: sinon.stub(),
            onTokensStateChange,
            onNetworkStateChange,
          },
          {
            interval: 10,
            allDetectedTokens,
            allTokens,
          },
        );
        await controller.start();
        const updateExchangeRatesStub = sinon.stub(
          controller,
          'updateExchangeRates',
        );

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await tokenStateChangeListener!({
          allDetectedTokens,
          allTokens,
          tokens: [
            { address: 'bar', decimals: 0, symbol: '', aggregators: [] },
          ],
        });

        expect(updateExchangeRatesStub.callCount).toBe(0);
      });
    });

    describe('when polling is inactive', () => {
      it('should not update exchange rates when tokens change', async () => {
        let tokenStateChangeListener: (state: any) => Promise<void>;
        const onTokensStateChange = sinon.stub().callsFake((listener) => {
          tokenStateChangeListener = listener;
        });
        const onNetworkStateChange = sinon.stub();
        const controller = new TokenRatesController(
          {
            chainId: toHex(1),
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: sinon.stub(),
            onTokensStateChange,
            onNetworkStateChange,
          },
          { interval: 10 },
        );
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await tokenStateChangeListener!({
          allDetectedTokens: {},
          allTokens: {
            [toHex(1)]: {
              [defaultSelectedAddress]: [
                { address: 'bar', decimals: 0, symbol: '', aggregators: [] },
              ],
            },
          },
        });
        const updateExchangeRatesStub = sinon.stub(
          controller,
          'updateExchangeRates',
        );

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await tokenStateChangeListener!({
          allDetectedTokens: {},
          allTokens: {
            [toHex(1)]: {
              [defaultSelectedAddress]: [
                { address: 'foo', decimals: 0, symbol: '', aggregators: [] },
              ],
            },
          },
        });

        expect(updateExchangeRatesStub.callCount).toBe(0);
      });

      it('should not update exchange rates when detectedtokens change', async () => {
        let tokenStateChangeListener: (state: any) => Promise<void>;
        const onTokensStateChange = sinon.stub().callsFake((listener) => {
          tokenStateChangeListener = listener;
        });
        const onNetworkStateChange = sinon.stub();
        const controller = new TokenRatesController(
          {
            chainId: toHex(1),
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: sinon.stub(),
            onTokensStateChange,
            onNetworkStateChange,
          },
          { interval: 10 },
        );
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await tokenStateChangeListener!({
          allDetectedTokens: {
            [toHex(1)]: {
              [defaultSelectedAddress]: [
                { address: 'bar', decimals: 0, symbol: '', aggregators: [] },
              ],
            },
          },
          allTokens: {},
        });
        const updateExchangeRatesStub = sinon.stub(
          controller,
          'updateExchangeRates',
        );

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await tokenStateChangeListener!({
          allDetectedTokens: {
            [toHex(1)]: {
              [defaultSelectedAddress]: [
                { address: 'foo', decimals: 0, symbol: '', aggregators: [] },
              ],
            },
          },
          allTokens: {},
        });

        expect(updateExchangeRatesStub.callCount).toBe(0);
      });
    });
  });

  describe('NetworkController::stateChange', () => {
    describe('when polling is active', () => {
      it('should update exchange rates when ticker changes', async () => {
        sinon.useFakeTimers({ now: Date.now() });
        let networkStateChangeListener: (state: any) => Promise<void>;
        const onTokensStateChange = sinon.stub();
        const onNetworkStateChange = sinon.stub().callsFake((listener) => {
          networkStateChangeListener = listener;
        });
        const controller = new TokenRatesController(
          {
            chainId: toHex(1337),
            ticker: 'TEST',
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: sinon.stub(),
            onTokensStateChange,
            onNetworkStateChange,
          },
          { interval: 10 },
        );
        await controller.start();
        const updateExchangeRatesStub = sinon.stub(
          controller,
          'updateExchangeRates',
        );

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await networkStateChangeListener!({
          providerConfig: { chainId: toHex(1337), ticker: 'NEW' },
        });

        expect(updateExchangeRatesStub.callCount).toBe(1);
      });

      it('should update exchange rates when chain ID changes', async () => {
        sinon.useFakeTimers({ now: Date.now() });
        let networkStateChangeListener: (state: any) => Promise<void>;
        const onTokensStateChange = sinon.stub();
        const onNetworkStateChange = sinon.stub().callsFake((listener) => {
          networkStateChangeListener = listener;
        });
        const controller = new TokenRatesController(
          {
            chainId: toHex(1337),
            ticker: 'TEST',
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: sinon.stub(),
            onTokensStateChange,
            onNetworkStateChange,
          },
          { interval: 10 },
        );
        await controller.start();
        const updateExchangeRatesStub = sinon.stub(
          controller,
          'updateExchangeRates',
        );

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await networkStateChangeListener!({
          providerConfig: { chainId: toHex(1338), ticker: 'TEST' },
        });

        expect(updateExchangeRatesStub.callCount).toBe(1);
      });

      it('should clear contractExchangeRates state when ticker changes', async () => {
        nock(COINGECKO_API)
          .get(`${COINGECKO_ETH_PATH}`)
          .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
          .reply(200, {
            '0x02': {
              eth: 0.001, // token value in terms of ETH
            },
            '0x03': {
              eth: 0.002,
            },
          })
          .get(`${COINGECKO_ETH_PATH}`)
          .query({ contract_addresses: '0x02,0x03', vs_currencies: 'dai' })
          .replyWithError('Custom error');

        let networkChangeListener: (state: any) => Promise<void>;
        const onNetworkStateChange = sinon.stub().callsFake((listener) => {
          networkChangeListener = listener;
        });

        const controller = new TokenRatesController(
          {
            chainId: toHex(1),
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: sinon.stub(),
            onTokensStateChange: sinon.stub(),
            onNetworkStateChange,
          },
          {
            interval: 10,
            nativeCurrency: 'ETH',
            allTokens: {
              [toHex(1)]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x02',
                    decimals: 18,
                    image: undefined,
                    symbol: 'bar',
                    isERC721: false,
                  },
                  {
                    address: '0x03',
                    decimals: 18,
                    image: undefined,
                    symbol: 'bazz',
                    isERC721: false,
                  },
                ],
              },
            },
          },
        );

        await controller.start();

        expect(controller.state.contractExchangeRates).toStrictEqual({
          '0x02': 0.001,
          '0x03': 0.002,
        });

        // Ensure next update throws an error so that the "blank" state that
        // we're testing for isn't overwritten
        await expect(() =>
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          networkChangeListener!({
            providerConfig: { chainId: toHex(1), ticker: 'DAI' },
          }),
        ).rejects.toThrow('Custom error');

        expect(controller.state.contractExchangeRates).toStrictEqual({});
      });

      it('should clear contractExchangeRates state when chain ID changes', async () => {
        nock(COINGECKO_API)
          .get(`${COINGECKO_ETH_PATH}`)
          .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
          .reply(200, {
            '0x02': {
              eth: 0.001, // token value in terms of ETH
            },
            '0x03': {
              eth: 0.002,
            },
          });

        let networkChangeListener: (state: any) => Promise<void>;
        const onNetworkStateChange = sinon.stub().callsFake((listener) => {
          networkChangeListener = listener;
        });

        const controller = new TokenRatesController(
          {
            chainId: toHex(1),
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: sinon.stub(),
            onTokensStateChange: sinon.stub(),
            onNetworkStateChange,
          },
          {
            interval: 10,
            nativeCurrency: 'ETH',
            allTokens: {
              [toHex(1)]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x02',
                    decimals: 18,
                    image: undefined,
                    symbol: 'bar',
                    isERC721: false,
                  },
                  {
                    address: '0x03',
                    decimals: 18,
                    image: undefined,
                    symbol: 'bazz',
                    isERC721: false,
                  },
                ],
              },
            },
          },
        );

        await controller.start();

        expect(controller.state.contractExchangeRates).toStrictEqual({
          '0x02': 0.001,
          '0x03': 0.002,
        });

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await networkChangeListener!({
          providerConfig: { chainId: toHex(2) },
        });

        expect(controller.state.contractExchangeRates).toStrictEqual({});
      });

      it('should not update exchange rates when network state changes without a ticker/chain id change', async () => {
        sinon.useFakeTimers({ now: Date.now() });
        let networkStateChangeListener: (state: any) => Promise<void>;
        const onTokensStateChange = sinon.stub();
        const onNetworkStateChange = sinon.stub().callsFake((listener) => {
          networkStateChangeListener = listener;
        });
        const controller = new TokenRatesController(
          {
            chainId: toHex(1),
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: sinon.stub(),
            onTokensStateChange,
            onNetworkStateChange,
          },
          { interval: 10 },
        );
        await controller.start();
        const updateExchangeRatesStub = sinon.stub(
          controller,
          'updateExchangeRates',
        );

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await networkStateChangeListener!({
          providerConfig: { chainId: toHex(1), ticker: NetworksTicker.mainnet },
        });

        expect(updateExchangeRatesStub.callCount).toBe(0);
      });
    });

    describe('when polling is inactive', () => {
      it('should not update exchange rates when ticker changes', async () => {
        let networkStateChangeListener: (state: any) => Promise<void>;
        const onTokensStateChange = sinon.stub();
        const onNetworkStateChange = sinon.stub().callsFake((listener) => {
          networkStateChangeListener = listener;
        });
        const controller = new TokenRatesController(
          {
            chainId: toHex(1337),
            ticker: 'TEST',
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: sinon.stub(),
            onTokensStateChange,
            onNetworkStateChange,
          },
          { interval: 10 },
        );
        const updateExchangeRatesStub = sinon.stub(
          controller,
          'updateExchangeRates',
        );

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await networkStateChangeListener!({
          providerConfig: { chainId: toHex(1337), ticker: 'NEW' },
        });

        expect(updateExchangeRatesStub.callCount).toBe(0);
      });

      it('should not update exchange rates when chain ID changes', async () => {
        let networkStateChangeListener: (state: any) => Promise<void>;
        const onTokensStateChange = sinon.stub();
        const onNetworkStateChange = sinon.stub().callsFake((listener) => {
          networkStateChangeListener = listener;
        });
        const controller = new TokenRatesController(
          {
            chainId: toHex(1337),
            ticker: 'TEST',
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: sinon.stub(),
            onTokensStateChange,
            onNetworkStateChange,
          },
          { interval: 10 },
        );
        const updateExchangeRatesStub = sinon.stub(
          controller,
          'updateExchangeRates',
        );

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await networkStateChangeListener!({
          providerConfig: { chainId: toHex(1338), ticker: 'TEST' },
        });

        expect(updateExchangeRatesStub.callCount).toBe(0);
      });

      it('should clear contractExchangeRates state when ticker changes', async () => {
        nock(COINGECKO_API)
          .get(`${COINGECKO_ETH_PATH}`)
          .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
          .reply(200, {
            '0x02': {
              eth: 0.001, // token value in terms of ETH
            },
            '0x03': {
              eth: 0.002,
            },
          });

        let networkChangeListener: (state: any) => Promise<void>;
        const onNetworkStateChange = sinon.stub().callsFake((listener) => {
          networkChangeListener = listener;
        });

        const controller = new TokenRatesController(
          {
            chainId: toHex(1),
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: sinon.stub(),
            onTokensStateChange: sinon.stub(),
            onNetworkStateChange,
          },
          {
            interval: 10,
            nativeCurrency: 'ETH',
            allTokens: {
              [toHex(1)]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x02',
                    decimals: 18,
                    image: undefined,
                    symbol: 'bar',
                    isERC721: false,
                  },
                  {
                    address: '0x03',
                    decimals: 18,
                    image: undefined,
                    symbol: 'bazz',
                    isERC721: false,
                  },
                ],
              },
            },
          },
        );

        await controller.updateExchangeRates();

        expect(controller.state.contractExchangeRates).toStrictEqual({
          '0x02': 0.001,
          '0x03': 0.002,
        });

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await networkChangeListener!({
          providerConfig: { chainId: toHex(1), ticker: 'NEW' },
        });

        expect(controller.state.contractExchangeRates).toStrictEqual({});
      });

      it('should clear contractExchangeRates state when chain ID changes', async () => {
        nock(COINGECKO_API)
          .get(`${COINGECKO_ETH_PATH}`)
          .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
          .reply(200, {
            '0x02': {
              eth: 0.001, // token value in terms of ETH
            },
            '0x03': {
              eth: 0.002,
            },
          });

        let networkChangeListener: (state: any) => Promise<void>;
        const onNetworkStateChange = sinon.stub().callsFake((listener) => {
          networkChangeListener = listener;
        });

        const controller = new TokenRatesController(
          {
            chainId: toHex(1),
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: sinon.stub(),
            onTokensStateChange: sinon.stub(),
            onNetworkStateChange,
          },
          {
            interval: 10,
            nativeCurrency: 'ETH',
            allTokens: {
              [toHex(1)]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x02',
                    decimals: 18,
                    image: undefined,
                    symbol: 'bar',
                    isERC721: false,
                  },
                  {
                    address: '0x03',
                    decimals: 18,
                    image: undefined,
                    symbol: 'bazz',
                    isERC721: false,
                  },
                ],
              },
            },
          },
        );

        await controller.updateExchangeRates();

        expect(controller.state.contractExchangeRates).toStrictEqual({
          '0x02': 0.001,
          '0x03': 0.002,
        });

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await networkChangeListener!({
          providerConfig: { chainId: toHex(2) },
        });

        expect(controller.state.contractExchangeRates).toStrictEqual({});
      });
    });
  });

  describe('PreferencesController::stateChange', () => {
    describe('when polling is active', () => {
      it('should update exchange rates when selected address changes', async () => {
        sinon.useFakeTimers({ now: Date.now() });
        nock(COINGECKO_API)
          .get(`${COINGECKO_ETH_PATH}`)
          .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
          .reply(200, {
            '0x02': {
              eth: 0.001, // token value in terms of ETH
            },
            '0x03': {
              eth: 0.002,
            },
          });
        let preferencesStateChangeListener: (state: any) => Promise<void>;
        const onPreferencesStateChange = sinon.stub().callsFake((listener) => {
          preferencesStateChangeListener = listener;
        });
        const alternateSelectedAddress =
          '0x0000000000000000000000000000000000000002';
        const controller = new TokenRatesController(
          {
            chainId: toHex(1),
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange,
            onTokensStateChange: sinon.stub(),
            onNetworkStateChange: sinon.stub(),
          },
          {
            interval: 10,
            allTokens: {
              [toHex(1)]: {
                [alternateSelectedAddress]: [
                  { address: '0x02', decimals: 0, symbol: '', aggregators: [] },
                  { address: '0x03', decimals: 0, symbol: '', aggregators: [] },
                ],
              },
            },
          },
        );
        await controller.start();
        expect(controller.state.contractExchangeRates).toStrictEqual({});

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await preferencesStateChangeListener!({
          selectedAddress: alternateSelectedAddress,
        });

        expect(controller.state.contractExchangeRates).toStrictEqual({
          '0x02': 0.001,
          '0x03': 0.002,
        });
      });

      it('should not update exchange rates when preferences state changes without selected address changing', async () => {
        sinon.useFakeTimers({ now: Date.now() });
        nock(COINGECKO_API)
          .get(`${COINGECKO_ETH_PATH}`)
          .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
          .reply(200, {
            '0x02': {
              eth: 0.001, // token value in terms of ETH
            },
            '0x03': {
              eth: 0.002,
            },
          });
        const secondCall = nock(COINGECKO_API)
          .get(`${COINGECKO_ETH_PATH}`)
          .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
          .reply(200, {
            '0x02': {
              eth: 0.002, // token value in terms of ETH
            },
            '0x03': {
              eth: 0.003,
            },
          });
        let preferencesStateChangeListener: (state: any) => Promise<void>;
        const onPreferencesStateChange = sinon.stub().callsFake((listener) => {
          preferencesStateChangeListener = listener;
        });
        const controller = new TokenRatesController(
          {
            chainId: toHex(1),
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange,
            onTokensStateChange: sinon.stub(),
            onNetworkStateChange: sinon.stub(),
          },
          {
            interval: 10,
            allTokens: {
              [toHex(1)]: {
                [defaultSelectedAddress]: [
                  { address: '0x02', decimals: 0, symbol: '', aggregators: [] },
                  { address: '0x03', decimals: 0, symbol: '', aggregators: [] },
                ],
              },
            },
          },
        );
        await controller.start();
        expect(controller.state.contractExchangeRates).toStrictEqual({
          '0x02': 0.001,
          '0x03': 0.002,
        });

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await preferencesStateChangeListener!({
          selectedAddress: defaultSelectedAddress,
          exampleConfig: 'exampleValue',
        });

        expect(controller.state.contractExchangeRates).toStrictEqual({
          '0x02': 0.001,
          '0x03': 0.002,
        });
        expect(secondCall.isDone()).toBe(false);
      });
    });

    describe('when polling is inactive', () => {
      it('should not update exchange rates when selected address changes', async () => {
        sinon.useFakeTimers({ now: Date.now() });
        let preferencesStateChangeListener: (state: any) => Promise<void>;
        const onPreferencesStateChange = sinon.stub().callsFake((listener) => {
          preferencesStateChangeListener = listener;
        });
        const alternateSelectedAddress =
          '0x0000000000000000000000000000000000000002';
        const controller = new TokenRatesController(
          {
            chainId: toHex(1),
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange,
            onTokensStateChange: sinon.stub(),
            onNetworkStateChange: sinon.stub(),
          },
          {
            interval: 10,
            allTokens: {
              [toHex(1)]: {
                [alternateSelectedAddress]: [
                  { address: '0x02', decimals: 0, symbol: '', aggregators: [] },
                  { address: '0x03', decimals: 0, symbol: '', aggregators: [] },
                ],
              },
            },
          },
        );
        expect(controller.state.contractExchangeRates).toStrictEqual({});

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await preferencesStateChangeListener!({
          selectedAddress: alternateSelectedAddress,
        });

        expect(controller.state.contractExchangeRates).toStrictEqual({});
      });
    });
  });

  describe('start', () => {
    it('should poll and update rate in the right interval', async () => {
      const clock = sinon.useFakeTimers({ now: Date.now() });
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() => {
          throw new Error('Network error');
        });
      const interval = 100;
      const controller = new TokenRatesController(
        {
          chainId: toHex(1),
          ticker: NetworksTicker.mainnet,
          selectedAddress: defaultSelectedAddress,
          onPreferencesStateChange: sinon.stub(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange: jest.fn(),
        },
        {
          interval,
          allTokens: {
            [toHex(1)]: {
              [defaultSelectedAddress]: [
                { address: 'bar', decimals: 0, symbol: '', aggregators: [] },
              ],
            },
          },
        },
      );

      await controller.start();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      await clock.tickAsync(interval);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      await clock.tickAsync(interval);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('stop', () => {
    it('should stop polling', async () => {
      const clock = sinon.useFakeTimers({ now: Date.now() });
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() => {
          throw new Error('Network error');
        });
      const interval = 100;
      const controller = new TokenRatesController(
        {
          chainId: toHex(1),
          ticker: NetworksTicker.mainnet,
          selectedAddress: defaultSelectedAddress,
          onPreferencesStateChange: sinon.stub(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange: jest.fn(),
        },
        {
          interval,
          allTokens: {
            [toHex(1)]: {
              [defaultSelectedAddress]: [
                { address: 'bar', decimals: 0, symbol: '', aggregators: [] },
              ],
            },
          },
        },
      );

      await controller.start();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      controller.stop();

      await clock.tickAsync(interval);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateExchangeRates', () => {
    it('should not update rates if disabled', async () => {
      const controller = new TokenRatesController(
        {
          chainId: toHex(1),
          ticker: NetworksTicker.mainnet,
          selectedAddress: defaultSelectedAddress,
          onPreferencesStateChange: sinon.stub(),
          onTokensStateChange: sinon.stub(),
          onNetworkStateChange: sinon.stub(),
        },
        {
          interval: 10,
        },
      );
      controller.fetchExchangeRate = sinon.stub();
      controller.disabled = true;
      await controller.updateExchangeRates();
      expect((controller.fetchExchangeRate as any).called).toBe(false);
    });

    it('should update all rates', async () => {
      nock(COINGECKO_API)
        .get(
          `${COINGECKO_ETH_PATH}?contract_addresses=0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359,${ADDRESS}&vs_currencies=eth`,
        )
        .reply(200, {
          '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359': { eth: 0.00561045 },
        });
      const tokenAddress = '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359';
      const controller = new TokenRatesController(
        {
          chainId: toHex(1),
          ticker: NetworksTicker.mainnet,
          selectedAddress: defaultSelectedAddress,
          onPreferencesStateChange: sinon.stub(),
          onTokensStateChange: sinon.stub(),
          onNetworkStateChange: sinon.stub(),
        },
        {
          interval: 10,
          allTokens: {
            [toHex(1)]: {
              [defaultSelectedAddress]: [
                {
                  address: tokenAddress,
                  decimals: 18,
                  symbol: 'DAI',
                  aggregators: [],
                },
                { address: ADDRESS, decimals: 0, symbol: '', aggregators: [] },
              ],
            },
          },
        },
      );

      expect(controller.state.contractExchangeRates).toStrictEqual({});
      await controller.updateExchangeRates();
      expect(Object.keys(controller.state.contractExchangeRates)).toContain(
        tokenAddress,
      );
      expect(
        controller.state.contractExchangeRates[tokenAddress],
      ).toBeGreaterThan(0);
      expect(Object.keys(controller.state.contractExchangeRates)).toContain(
        ADDRESS,
      );
      expect(controller.state.contractExchangeRates[ADDRESS]).toBe(0);
    });

    it('should handle balance not found in API', async () => {
      const controller = new TokenRatesController(
        {
          chainId: toHex(1),
          ticker: NetworksTicker.mainnet,
          selectedAddress: defaultSelectedAddress,
          onPreferencesStateChange: sinon.stub(),
          onTokensStateChange: sinon.stub(),
          onNetworkStateChange: sinon.stub(),
        },
        {
          interval: 10,
          allTokens: {
            [toHex(1)]: {
              [defaultSelectedAddress]: [
                { address: 'bar', decimals: 0, symbol: '', aggregators: [] },
              ],
            },
          },
        },
      );
      expect(controller.state.contractExchangeRates).toStrictEqual({});
      sinon.stub(controller, 'fetchExchangeRate').throws({
        error: 'Not Found',
        message: 'Not Found',
      });
      const mock = sinon.stub(controller, 'updateExchangeRates');

      await controller.updateExchangeRates();

      expect(mock).not.toThrow();
    });

    it('should update exchange rates when native currency is not supported by coingecko', async () => {
      nock(COINGECKO_API)
        .get(`${COINGECKO_MATIC_PATH}`)
        .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
        .reply(200, {
          '0x02': {
            eth: 0.001, // token value in terms of ETH
          },
          '0x03': {
            eth: 0.002,
          },
        });

      nock('https://min-api.cryptocompare.com')
        .get('/data/price?fsym=ETH&tsyms=MATIC')
        .reply(200, { MATIC: 0.5 }); // .5 eth to 1 matic

      const expectedExchangeRates = {
        '0x02': 0.0005, // token value in terms of matic = (token value in eth) * (eth value in matic) = .001 * .5
        '0x03': 0.001,
      };

      const onNetworkStateChange = sinon.stub();
      const controller = new TokenRatesController(
        {
          chainId: toHex(137),
          ticker: 'MATIC',
          selectedAddress: defaultSelectedAddress,
          onPreferencesStateChange: sinon.stub(),
          onTokensStateChange: sinon.stub(),
          onNetworkStateChange,
        },
        {
          interval: 10,
          allTokens: {
            [toHex(137)]: {
              [defaultSelectedAddress]: [
                {
                  address: '0x02',
                  decimals: 18,
                  image: undefined,
                  symbol: 'bar',
                  isERC721: false,
                },
                {
                  address: '0x03',
                  decimals: 18,
                  image: undefined,
                  symbol: 'bazz',
                  isERC721: false,
                },
              ],
            },
          },
        },
      );

      await controller.updateExchangeRates();

      expect(controller.state.contractExchangeRates).toStrictEqual(
        expectedExchangeRates,
      );
    });
  });
});
