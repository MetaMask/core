import { Messenger } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { KeyringClient } from '@metamask/keyring-snap-client';
import type { OnAssetHistoricalPriceResponse } from '@metamask/snaps-sdk';
import { useFakeTimers } from 'sinon';

import { MultichainAssetsRatesController } from '.';
import {
  type AllowedActions,
  type AllowedEvents,
} from './MultichainAssetsRatesController';

// A fake non‑EVM account (with Snap metadata) that meets the controller’s criteria.
const fakeNonEvmAccount: InternalAccount = {
  id: 'account1',
  type: 'solana:data-account',
  address: '0x123',
  metadata: {
    name: 'Test Account',
    // @ts-expect-error-next-line
    snap: { id: 'test-snap', enabled: true },
  },
  scopes: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
  options: {},
  methods: [],
};

// A fake EVM account (which should be filtered out).
const fakeEvmAccount: InternalAccount = {
  id: 'account2',
  type: 'eip155:eoa',
  address: '0x456',
  // @ts-expect-error-next-line
  metadata: { name: 'EVM Account' },
  scopes: [],
  options: {},
  methods: [],
};

const fakeEvmAccount2: InternalAccount = {
  id: 'account3',
  type: 'bip122:p2wpkh',
  address: '0x789',
  metadata: {
    name: 'EVM Account',
    // @ts-expect-error-next-line
    snap: { id: 'test-snap', enabled: true },
  },
  scopes: [],
  options: {},
  methods: [],
};

const fakeEvmAccountWithoutMetadata: InternalAccount = {
  id: 'account4',
  type: 'bip122:p2wpkh',
  address: '0x789',
  metadata: {
    name: 'EVM Account',
    importTime: 0,
    keyring: { type: 'bip122' },
  },
  scopes: [],
  options: {},
  methods: [],
};

const fakeMarketData = {
  price: 202.11,
  priceChange: 0,
  priceChangePercentage: 0,
  volume: 0,
  marketCap: 0,
};

// A fake conversion rates response returned by the SnapController.
const fakeAccountRates = {
  conversionRates: {
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
      'swift:0/iso4217:USD': {
        rate: '202.11',
        conversionTime: 1738539923277,
        marketData: fakeMarketData,
      },
    },
  },
};

const fakeHistoricalPrices: OnAssetHistoricalPriceResponse = {
  historicalPrice: {
    intervals: {
      P1D: [
        [1737542312, '1'],
        [1737542312, '2'],
      ],
      P1W: [
        [1737542312, '1'],
        [1737542312, '2'],
      ],
    },
    updateTime: 1737542312,
    expirationTime: 1737542312,
  },
};

const setupController = ({
  config,
  accountsAssets = [fakeNonEvmAccount, fakeEvmAccount, fakeEvmAccount2],
}: {
  config?: Partial<
    ConstructorParameters<typeof MultichainAssetsRatesController>[0]
  >;
  accountsAssets?: InternalAccount[];
} = {}) => {
  const messenger = new Messenger<AllowedActions, AllowedEvents>();

  messenger.registerActionHandler(
    'MultichainAssetsController:getState',
    () => ({
      accountsAssets: {
        account1: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501'],
        account2: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501'],
        account3: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501'],
      },
      assetsMetadata: {
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
          name: 'Solana',
          symbol: 'SOL',
          fungible: true,
          iconUrl: 'https://example.com/solana.png',
          units: [{ symbol: 'SOL', name: 'Solana', decimals: 9 }],
        },
      },
    }),
  );

  messenger.registerActionHandler(
    'AccountsController:listMultichainAccounts',
    () => accountsAssets,
  );

  messenger.registerActionHandler(
    'AccountsController:getSelectedMultichainAccount',
    () => accountsAssets[0],
  );

  messenger.registerActionHandler('CurrencyRateController:getState', () => ({
    currencyRates: {},
    currentCurrency: 'USD',
  }));

  const multichainAssetsRatesControllerMessenger = messenger.getRestricted({
    name: 'MultichainAssetsRatesController',
    allowedActions: [
      'AccountsController:listMultichainAccounts',
      'SnapController:handleRequest',
      'CurrencyRateController:getState',
      'MultichainAssetsController:getState',
      'AccountsController:getSelectedMultichainAccount',
    ],
    allowedEvents: [
      'AccountsController:accountAdded',
      'KeyringController:lock',
      'KeyringController:unlock',
      'CurrencyRateController:stateChange',
      'MultichainAssetsController:stateChange',
    ],
  });

  return {
    controller: new MultichainAssetsRatesController({
      messenger: multichainAssetsRatesControllerMessenger,
      ...config,
    }),
    messenger,
  };
};

describe('MultichainAssetsRatesController', () => {
  let clock: sinon.SinonFakeTimers;

  const mockedDate = 1705760550000;

  beforeEach(() => {
    clock = useFakeTimers();
    jest.spyOn(Date, 'now').mockReturnValue(mockedDate);
  });

  afterEach(() => {
    clock.restore();
    jest.restoreAllMocks();
  });

  it('initializes with an empty conversionRates state', () => {
    const { controller } = setupController();
    expect(controller.state).toStrictEqual({
      conversionRates: {},
      historicalPrices: {},
    });
  });

  it('updates conversion rates for a valid non-EVM account with marketData', async () => {
    const { controller, messenger } = setupController();

    // Stub KeyringClient.listAccountAssets so that the controller “discovers” one asset.
    jest
      .spyOn(KeyringClient.prototype, 'listAccountAssets')
      .mockResolvedValue([
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
      ]);

    // Override the SnapController:handleRequest handler to return our fake conversion rates.
    const snapHandler = jest.fn().mockResolvedValue(fakeAccountRates);
    messenger.registerActionHandler(
      'SnapController:handleRequest',
      snapHandler,
    );

    // Call updateAssetsRates for the valid non-EVM account.
    await controller.updateAssetsRates();

    // Check that the Snap request was made with the expected parameters.
    expect(snapHandler).toHaveBeenCalledWith({
      handler: 'onAssetsConversion',
      origin: 'metamask',
      request: {
        jsonrpc: '2.0',
        method: 'onAssetsConversion',
        params: {
          conversions: [
            {
              from: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
              to: 'swift:0/iso4217:USD',
            },
          ],
          includeMarketData: true,
        },
      },
      snapId: 'test-snap',
    });

    // The controller state should now contain the conversion rates returned.
    expect(controller.state.conversionRates).toStrictEqual(
      // fakeAccountRates.conversionRates,
      {
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
          rate: '202.11',
          conversionTime: 1738539923277,
          currency: 'swift:0/iso4217:USD',
          marketData: {
            price: 202.11,
            priceChange: 0,
            priceChangePercentage: 0,
            volume: 0,
            marketCap: 0,
          },
        },
      },
    );
  });

  it('does not update conversion rates if the controller is not active', async () => {
    const { controller, messenger } = setupController();

    // Simulate a keyring lock event to set the controller as inactive.
    messenger.publish('KeyringController:lock');
    // Override SnapController:handleRequest and stub listAccountAssets.
    const snapHandler = jest.fn().mockResolvedValue(fakeAccountRates);
    messenger.registerActionHandler(
      'SnapController:handleRequest',
      snapHandler,
    );
    jest
      .spyOn(KeyringClient.prototype, 'listAccountAssets')
      .mockResolvedValue([
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
      ]);

    await controller.updateAssetsRates();
    // Since the controller is locked, no update should occur.
    expect(controller.state.conversionRates).toStrictEqual({});
    expect(snapHandler).not.toHaveBeenCalled();
  });

  it('does not update conversion rates if the assets are empty', async () => {
    const { controller, messenger } = setupController();

    const snapSpy = jest.fn().mockResolvedValue({ conversionRates: {} });
    messenger.registerActionHandler('SnapController:handleRequest', snapSpy);

    // Publish a selectedAccountChange event.
    // @ts-expect-error-next-line
    messenger.publish('MultichainAssetsController:stateChange', {
      accountsAssets: {
        account3: [],
      },
    });

    expect(snapSpy).not.toHaveBeenCalled();
    expect(controller.state.conversionRates).toStrictEqual({});
  });

  it('resumes update tokens rates when the keyring is unlocked', async () => {
    const { controller, messenger } = setupController();
    messenger.publish('KeyringController:lock');
    // Override SnapController:handleRequest and stub listAccountAssets.
    const snapHandler = jest.fn().mockResolvedValue(fakeAccountRates);
    messenger.registerActionHandler(
      'SnapController:handleRequest',
      snapHandler,
    );
    jest
      .spyOn(KeyringClient.prototype, 'listAccountAssets')
      .mockResolvedValue([
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
      ]);
    await controller.updateAssetsRates();
    expect(controller.isActive).toBe(false);

    messenger.publish('KeyringController:unlock');
    await controller.updateAssetsRates();

    expect(controller.isActive).toBe(true);
  });

  it('calls updateTokensRates when _executePoll is invoked', async () => {
    const { controller, messenger } = setupController();

    jest
      .spyOn(KeyringClient.prototype, 'listAccountAssets')
      .mockResolvedValue([
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
      ]);

    messenger.registerActionHandler(
      'SnapController:handleRequest',
      async () => ({
        conversionRates: {
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
            'swift:0/iso4217:USD': {
              rate: '202.11',
              conversionTime: 1738539923277,
            },
          },
        },
      }),
    );

    // Spy on updateAssetsRates.
    const updateSpy = jest.spyOn(controller, 'updateAssetsRates');
    await controller._executePoll();
    expect(updateSpy).toHaveBeenCalled();
  });

  it('calls updateTokensRates when an multichain assets state is updated', async () => {
    const { controller, messenger } = setupController();

    // Spy on updateTokensRates.
    const updateSpy = jest
      .spyOn(controller, 'updateAssetsRates')
      .mockResolvedValue();

    // Publish a selectedAccountChange event.
    // @ts-expect-error-next-line
    messenger.publish('MultichainAssetsController:stateChange', {
      accountsAssets: {
        account3: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501'],
      },
    });
    // Wait for the asynchronous subscriber to run.
    await Promise.resolve();
    expect(updateSpy).toHaveBeenCalled();
  });

  it('handles partial or empty Snap responses gracefully', async () => {
    const { controller, messenger } = setupController();

    messenger.registerActionHandler('SnapController:handleRequest', () => {
      return Promise.resolve({
        conversionRates: {
          // Only returning a rate for one asset
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
            'swift:0/iso4217:USD': {
              rate: '250.50',
              conversionTime: 1738539923277,
            },
          },
        },
      });
    });

    await controller.updateAssetsRates();

    expect(controller.state.conversionRates).toMatchObject({
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
        rate: '250.50',
        conversionTime: 1738539923277,
      },
    });
  });

  it('skips all accounts that lack Snap metadata or are EVM', async () => {
    const { controller, messenger } = setupController({
      accountsAssets: [fakeEvmAccountWithoutMetadata],
    });

    const snapSpy = jest.fn().mockResolvedValue({ conversionRates: {} });
    messenger.registerActionHandler('SnapController:handleRequest', snapSpy);

    await controller.updateAssetsRates();

    expect(snapSpy).not.toHaveBeenCalled();
    expect(controller.state.conversionRates).toStrictEqual({});
  });

  it('updates state when currency is updated', async () => {
    const { controller, messenger } = setupController();

    const snapHandler = jest.fn().mockResolvedValue(fakeAccountRates);
    messenger.registerActionHandler(
      'SnapController:handleRequest',
      snapHandler,
    );

    const updateSpy = jest.spyOn(controller, 'updateAssetsRates');

    messenger.publish(
      'CurrencyRateController:stateChange',
      {
        currentCurrency: 'EUR',
        currencyRates: {},
      },
      [],
    );

    expect(updateSpy).toHaveBeenCalled();
  });

  it('should return an empty array if no assets are found', async () => {
    const { controller, messenger } = setupController();

    const snapSpy = jest.fn().mockResolvedValue({ conversionRates: {} });
    messenger.registerActionHandler('SnapController:handleRequest', snapSpy);

    messenger.publish(
      'MultichainAssetsController:stateChange',
      {
        accountsAssets: {
          account1: [],
        },
        assetsMetadata: {},
      },
      [],
    );

    await controller.updateAssetsRates();

    expect(controller.state.conversionRates).toStrictEqual({});
  });

  describe('fetchHistoricalPricesForAsset', () => {
    it('throws an error if call to snap fails', async () => {
      const testAsset = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501';
      const { controller, messenger } = setupController();

      const snapHandler = jest.fn().mockRejectedValue(new Error('test error'));
      messenger.registerActionHandler(
        'SnapController:handleRequest',
        snapHandler,
      );

      await expect(
        controller.fetchHistoricalPricesForAsset(testAsset),
      ).rejects.toThrow(
        `Failed to fetch historical prices for asset: ${testAsset}`,
      );
    });

    it('returns early if the historical price has not expired', async () => {
      const testCurrency = 'USD';
      const { controller, messenger } = setupController({
        config: {
          state: {
            historicalPrices: {
              'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
                [testCurrency]: {
                  intervals: {},
                  updateTime: Date.now(),
                  expirationTime: Date.now() + 1000,
                },
              },
            },
          },
        },
      });

      const snapHandler = jest.fn().mockResolvedValue(fakeHistoricalPrices);
      messenger.registerActionHandler(
        'SnapController:handleRequest',
        snapHandler,
      );

      await controller.fetchHistoricalPricesForAsset(
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
      );

      expect(snapHandler).not.toHaveBeenCalled();
    });

    it('does not update state if historical prices return null', async () => {
      const { controller, messenger } = setupController();

      const snapHandler = jest.fn().mockResolvedValue(null);
      messenger.registerActionHandler(
        'SnapController:handleRequest',
        snapHandler,
      );

      await controller.fetchHistoricalPricesForAsset(
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
      );

      expect(snapHandler).toHaveBeenCalledTimes(1);
      expect(controller.state.historicalPrices).toMatchObject({});
    });

    it('calls the snap if historical price does not have an expiration time', async () => {
      const testCurrency = 'USD';
      const { controller, messenger } = setupController({
        config: {
          state: {
            historicalPrices: {
              'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
                [testCurrency]: {
                  intervals: {},
                  updateTime: Date.now(),
                },
              },
            },
          },
        },
      });

      const snapHandler = jest.fn().mockResolvedValue(fakeHistoricalPrices);
      messenger.registerActionHandler(
        'SnapController:handleRequest',
        snapHandler,
      );

      await controller.fetchHistoricalPricesForAsset(
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
      );

      expect(snapHandler).toHaveBeenCalledTimes(1);
    });

    it('calls the snap if historical price does not exist in state for the current currency', async () => {
      const testCurrency = 'EUR';
      const { controller, messenger } = setupController({
        config: {
          state: {
            historicalPrices: {
              'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
                [testCurrency]: {
                  intervals: {},
                  updateTime: Date.now(),
                },
              },
            },
          },
        },
      });

      const snapHandler = jest.fn().mockResolvedValue(fakeHistoricalPrices);
      messenger.registerActionHandler(
        'SnapController:handleRequest',
        snapHandler,
      );

      await controller.fetchHistoricalPricesForAsset(
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
      );

      expect(snapHandler).toHaveBeenCalledTimes(1);
    });

    it('calls fetchHistoricalPricesForAsset once and returns early on subsequent calls', async () => {
      const { controller, messenger } = setupController();

      const testHistoricalPriceReturn = {
        ...fakeHistoricalPrices.historicalPrice,
        expirationTime: Date.now() + 1000,
      };
      const testAsset = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501';

      const snapHandler = jest.fn().mockResolvedValue({
        historicalPrice: testHistoricalPriceReturn,
      });
      messenger.registerActionHandler(
        'SnapController:handleRequest',
        snapHandler,
      );

      await controller.fetchHistoricalPricesForAsset(testAsset);

      expect(snapHandler).toHaveBeenCalledWith({
        handler: 'onAssetHistoricalPrice',
        origin: 'metamask',
        request: {
          jsonrpc: '2.0',
          method: 'onAssetHistoricalPrice',
          params: {
            from: testAsset,
            to: 'swift:0/iso4217:USD',
          },
        },
        snapId: 'test-snap',
      });

      expect(controller.state.historicalPrices).toMatchObject({
        [testAsset]: {
          USD: testHistoricalPriceReturn,
        },
      });

      await controller.fetchHistoricalPricesForAsset(testAsset);

      expect(snapHandler).toHaveBeenCalledTimes(1);
    });
  });
});
