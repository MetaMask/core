import { deriveStateFromMetadata } from '@metamask/base-controller';
import type { CaipAssetType } from '@metamask/keyring-api';
import { SolScope } from '@metamask/keyring-api';
import { SolMethod } from '@metamask/keyring-api';
import { SolAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { KeyringClient } from '@metamask/keyring-snap-client';
import { MOCK_ANY_NAMESPACE, Messenger } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import type { OnAssetHistoricalPriceResponse } from '@metamask/snaps-sdk';
import { v4 as uuidv4 } from 'uuid';

import { MultichainAssetsRatesController } from '.';
import type { MultichainAssetsRatesControllerMessenger } from './MultichainAssetsRatesController';
import { jestAdvanceTime } from '../../../../tests/helpers';

type AllMultichainAssetsRateControllerActions =
  MessengerActions<MultichainAssetsRatesControllerMessenger>;

type AllMultichainAssetsRateControllerEvents =
  MessengerEvents<MultichainAssetsRatesControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllMultichainAssetsRateControllerActions,
  AllMultichainAssetsRateControllerEvents
>;

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

const fakeNonEvmAccount2: InternalAccount = {
  id: 'account5',
  type: 'solana:data-account',
  address: '0x123',
  metadata: {
    name: 'Test Account',
    // @ts-expect-error-next-line
    snap: { id: 'test-snap-2', enabled: true },
  },
  scopes: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
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
    // expirationTime is in 1Hour based on current Date.now()
    expirationTime: Date.now() + 1000 * 60 * 60,
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
} = {}): {
  controller: MultichainAssetsRatesController;
  messenger: RootMessenger;
  updateSpy: jest.SpyInstance;
} => {
  const messenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  messenger.registerActionHandler(
    'MultichainAssetsController:getState',
    () => ({
      accountsAssets: {
        account1: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501'],
        account2: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501'],
        account3: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501'],
        account5: [
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        ],
      },
      assetsMetadata: {
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
          name: 'Solana',
          symbol: 'SOL',
          fungible: true,
          iconUrl: 'https://example.com/solana.png',
          units: [{ symbol: 'SOL', name: 'Solana', decimals: 9 }],
        },
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v':
          {
            name: 'USDC',
            symbol: 'USDC',
            fungible: true,
            iconUrl: 'https://example.com/usdc.png',
            units: [{ symbol: 'USDC', name: 'USDC', decimals: 2 }],
          },
      },
      allIgnoredAssets: {},
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

  const multichainAssetsRatesControllerMessenger: Messenger<
    'MultichainAssetsRatesController',
    AllMultichainAssetsRateControllerActions,
    AllMultichainAssetsRateControllerEvents,
    RootMessenger
  > = new Messenger({
    namespace: 'MultichainAssetsRatesController',
    parent: messenger,
  });
  messenger.delegate({
    messenger: multichainAssetsRatesControllerMessenger,
    actions: [
      'AccountsController:listMultichainAccounts',
      'SnapController:handleRequest',
      'CurrencyRateController:getState',
      'MultichainAssetsController:getState',
      'AccountsController:getSelectedMultichainAccount',
    ],
    events: [
      'AccountsController:accountAdded',
      'KeyringController:lock',
      'KeyringController:unlock',
      'CurrencyRateController:stateChange',
      'MultichainAssetsController:accountAssetListUpdated',
    ],
  });

  const controller = new MultichainAssetsRatesController({
    messenger: multichainAssetsRatesControllerMessenger,
    ...config,
  });

  const updateSpy = jest.spyOn(controller, 'update' as never);

  return {
    controller,
    messenger,
    updateSpy,
  };
};

describe('MultichainAssetsRatesController', () => {
  const mockedDate = 1705760550000;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Date, 'now').mockReturnValue(mockedDate);
  });

  afterEach(() => {
    jest.useRealTimers();
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

  it('calls updateTokensRatesForNewAssets when newAccountAssets event is published', async () => {
    const testAccounts = [
      {
        address: 'EBBYfhQzVzurZiweJ2keeBWpgGLs1cbWYcz28gjGgi5x',
        id: uuidv4(),
        metadata: {
          name: 'Solana Account 1',
          importTime: Date.now(),
          keyring: {
            type: KeyringTypes.snap,
          },
          snap: {
            id: 'mock-sol-snap-1',
            name: 'mock-sol-snap-1',
            enabled: true,
          },
          lastSelected: 0,
        },
        scopes: [SolScope.Devnet],
        options: {},
        methods: [SolMethod.SendAndConfirmTransaction],
        type: SolAccountType.DataAccount,
      },
      {
        address: 'GMTYfhQzVzurZiweJ2keeBWpgGLs1cbWYcz28gjGgi5x',
        id: uuidv4(),
        metadata: {
          name: 'Solana Account 2',
          importTime: Date.now(),
          keyring: {
            type: KeyringTypes.snap,
          },
          snap: {
            id: 'mock-sol-snap-2',
            name: 'mock-sol-snap-2',
            enabled: true,
          },
          lastSelected: 0,
        },
        scopes: [SolScope.Devnet],
        options: {},
        methods: [SolMethod.SendAndConfirmTransaction],
        type: SolAccountType.DataAccount,
      },
    ];
    const { controller, messenger, updateSpy } = setupController({
      accountsAssets: testAccounts,
    });

    const mockResponses = {
      onAssetsConversion: [
        {
          conversionRates: {
            'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
              'swift:0/iso4217:USD': {
                rate: '100',
                conversionTime: 1738539923277,
              },
            },
          },
        },
        {
          conversionRates: {
            'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token1:501': {
              'swift:0/iso4217:USD': {
                rate: '200',
                conversionTime: 1738539923277,
              },
            },
          },
        },
      ],
      onAssetsMarketData: [
        {
          marketData: {
            'swift:0/iso4217:USD': fakeMarketData,
          },
        },
        {
          marketData: {
            'swift:0/iso4217:USD': fakeMarketData,
          },
        },
      ],
    };

    const snapSpy = jest.fn().mockImplementation((args) => {
      const { handler } = args;
      return Promise.resolve(
        mockResponses[handler as keyof typeof mockResponses].shift(),
      );
    });
    messenger.registerActionHandler('SnapController:handleRequest', snapSpy);

    messenger.publish('MultichainAssetsController:accountAssetListUpdated', {
      assets: {
        [testAccounts[0].id]: {
          added: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501'],
          removed: [],
        },
        [testAccounts[1].id]: {
          added: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token1:501'],
          removed: [],
        },
      },
    });

    // Wait for the asynchronous subscriber to run.
    await Promise.resolve();
    await jestAdvanceTime({ duration: 10 });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(controller.state.conversionRates).toMatchObject({
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
        rate: '100',
        conversionTime: 1738539923277,
        currency: 'swift:0/iso4217:USD',
      },
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token1:501': {
        rate: '200',
        conversionTime: 1738539923277,
        currency: 'swift:0/iso4217:USD',
      },
    });
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

  it('does not make snap requests when updateAssetsRatesForNewAssets is called with no new assets', async () => {
    const { controller, messenger } = setupController();

    const snapSpy = jest.fn().mockResolvedValue(fakeAccountRates);
    messenger.registerActionHandler('SnapController:handleRequest', snapSpy);

    // Publish accountAssetListUpdated event with accounts that have no new assets (empty added arrays)
    messenger.publish('MultichainAssetsController:accountAssetListUpdated', {
      assets: {
        account1: {
          added: [], // No new assets added
          removed: [],
        },
      },
    });

    // Wait for the asynchronous subscriber to process the event
    await Promise.resolve();

    // Verify no snap requests were made since there are no new assets to process
    expect(snapSpy).not.toHaveBeenCalled();
    // Verify state remains empty
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

  describe('error handling in snap requests', () => {
    it('handles JSON-RPC parameter validation errors gracefully', async () => {
      const { controller, messenger } = setupController();

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const paramValidationError = new Error(
        'Invalid request params: At path: conversions.0.from -- Expected a value of type `CaipAssetType`, but received: `"swift:0/test-asset"`.',
      );

      const snapHandler = jest.fn().mockRejectedValue(paramValidationError);
      messenger.registerActionHandler(
        'SnapController:handleRequest',
        snapHandler,
      );

      await controller.updateAssetsRates();

      // Should have logged the error with detailed context
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Snap request failed for onAssetsConversion:',
        expect.objectContaining({
          snapId: 'test-snap',
          handler: 'onAssetsConversion',
          message: expect.stringContaining('Invalid request params'),
          params: expect.objectContaining({
            conversions: expect.arrayContaining([
              expect.objectContaining({
                from: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
                to: 'swift:0/iso4217:USD',
              }),
            ]),
          }),
        }),
      );

      // Should not update state when snap request fails
      expect(controller.state.conversionRates).toStrictEqual({});

      consoleErrorSpy.mockRestore();
    });

    it('handles generic snap request errors gracefully', async () => {
      const { controller, messenger } = setupController();

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const genericError = new Error('Network timeout');

      const snapHandler = jest.fn().mockRejectedValue(genericError);
      messenger.registerActionHandler(
        'SnapController:handleRequest',
        snapHandler,
      );

      await controller.updateAssetsRates();

      // Should have logged the error with detailed context
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Snap request failed for onAssetsConversion:',
        expect.objectContaining({
          snapId: 'test-snap',
          handler: 'onAssetsConversion',
          message: 'Network timeout',
          params: expect.any(Object),
        }),
      );

      // Should not update state when snap request fails
      expect(controller.state.conversionRates).toStrictEqual({});

      consoleErrorSpy.mockRestore();
    });

    it('handles mixed success and failure scenarios', async () => {
      const { controller, messenger } = setupController({
        accountsAssets: [fakeNonEvmAccount, fakeNonEvmAccount2],
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Mock different responses for different calls
      const snapHandler = jest
        .fn()
        .mockResolvedValueOnce(fakeAccountRates) // First call succeeds (onAssetsConversion)
        .mockResolvedValueOnce({
          marketData: {
            'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
              'swift:0/iso4217:USD': fakeMarketData,
            },
          },
        }) // Second call succeeds (onAssetsMarketData)
        .mockRejectedValueOnce(new Error('Snap request failed')) // Third call fails (onAssetsConversion)
        .mockResolvedValueOnce(null); // Fourth call returns null (onAssetsMarketData)

      messenger.registerActionHandler(
        'SnapController:handleRequest',
        snapHandler,
      );

      await controller.updateAssetsRates();

      // Should have logged the error for the failed request
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Snap request failed for onAssetsConversion:',
        expect.objectContaining({
          message: 'Snap request failed',
        }),
      );

      // Should still update state for the successful request
      expect(controller.state.conversionRates).toMatchObject({
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
          rate: '202.11',
          conversionTime: 1738539923277,
          currency: 'swift:0/iso4217:USD',
          marketData: fakeMarketData,
        },
      });

      consoleErrorSpy.mockRestore();
    });

    it('handles market data request errors independently', async () => {
      const { controller, messenger } = setupController();

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Mock onAssetsConversion to succeed but onAssetsMarketData to fail
      const snapHandler = jest
        .fn()
        .mockResolvedValueOnce(fakeAccountRates) // onAssetsConversion succeeds
        .mockRejectedValueOnce(new Error('Market data unavailable')); // onAssetsMarketData fails

      messenger.registerActionHandler(
        'SnapController:handleRequest',
        snapHandler,
      );

      await controller.updateAssetsRates();

      // Should have logged the market data error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Snap request failed for onAssetsMarketData:',
        expect.objectContaining({
          message: 'Market data unavailable',
        }),
      );

      // Should still update state with conversion rates (without market data)
      expect(controller.state.conversionRates).toMatchObject({
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
          rate: '202.11',
          conversionTime: 1738539923277,
          currency: 'swift:0/iso4217:USD',
        },
      });

      consoleErrorSpy.mockRestore();
    });
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

    it('does not clean up any of the prices if none of them have expired', async () => {
      const testCurrency = 'EUR';
      const testNativeAssetPrices = {
        intervals: {},
        updateTime: Date.now(),
        expirationTime: Date.now() + 1000, // not expired
      };
      const testTokenAssetPrices = {
        intervals: {},
        updateTime: Date.now(),
        expirationTime: Date.now() + 1000, // not expired
      };
      const { controller, messenger } = setupController({
        config: {
          state: {
            historicalPrices: {
              'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
                [testCurrency]: testNativeAssetPrices,
              },
              'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:testToken1': {
                [testCurrency]: testTokenAssetPrices,
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
      expect(controller.state.historicalPrices).toStrictEqual({
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
          USD: fakeHistoricalPrices.historicalPrice,
          EUR: testNativeAssetPrices,
        },
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:testToken1': {
          EUR: testTokenAssetPrices,
        },
      });
    });

    it('cleans up all historical prices that have expired', async () => {
      const testCurrency = 'EUR';
      const { controller, messenger } = setupController({
        config: {
          state: {
            historicalPrices: {
              'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
                [testCurrency]: {
                  intervals: {},
                  updateTime: Date.now(),
                  expirationTime: Date.now() - 1000, // expired
                },
              },
              'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:testToken1': {
                [testCurrency]: {
                  intervals: {},
                  updateTime: Date.now(),
                  expirationTime: Date.now() - 1000, // expired
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
      expect(controller.state.historicalPrices).toStrictEqual({
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
          USD: fakeHistoricalPrices.historicalPrice,
        },
      });
    });
  });

  describe('line 331 coverage - skip accounts with no assets', () => {
    it('should skip accounts that have no assets (empty array) and continue processing', async () => {
      const accountWithNoAssets: InternalAccount = {
        id: 'account1', // This account will have no assets
        type: 'solana:data-account',
        address: '0xNoAssets',
        metadata: {
          name: 'Account With No Assets',
          // @ts-expect-error-next-line
          snap: { id: 'test-snap', enabled: true },
        },
        scopes: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
        options: {},
        methods: [],
      };

      const accountWithAssets: InternalAccount = {
        id: 'account2', // This account will have assets
        type: 'solana:data-account',
        address: '0xWithAssets',
        metadata: {
          name: 'Account With Assets',
          // @ts-expect-error-next-line
          snap: { id: 'test-snap', enabled: true },
        },
        scopes: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
        options: {},
        methods: [],
      };

      // Set up controller with custom accounts and assets configuration
      const messenger: RootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });

      // Mock MultichainAssetsController state with one account having no assets
      messenger.registerActionHandler(
        'MultichainAssetsController:getState',
        () => ({
          accountsAssets: {
            account1: [], // Empty array - should trigger line 331 continue
            account2: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501'], // Has assets
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
          allIgnoredAssets: {},
        }),
      );

      messenger.registerActionHandler(
        'AccountsController:listMultichainAccounts',
        () => [accountWithNoAssets, accountWithAssets], // Both accounts in the list
      );

      messenger.registerActionHandler(
        'AccountsController:getSelectedMultichainAccount',
        () => accountWithAssets,
      );

      messenger.registerActionHandler(
        'CurrencyRateController:getState',
        () => ({
          currentCurrency: 'USD',
          currencyRates: {},
        }),
      );

      // Track Snap calls to verify only the account with assets gets processed
      const snapHandler = jest.fn().mockResolvedValue({
        conversionRates: {
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
            'swift:0/iso4217:USD': {
              rate: '100.50',
              conversionTime: Date.now(),
            },
          },
        },
      });

      messenger.registerActionHandler(
        'SnapController:handleRequest',
        snapHandler,
      );

      const multichainAssetsRatesControllerMessenger = new Messenger<
        'MultichainAssetsRatesController',
        AllMultichainAssetsRateControllerActions,
        AllMultichainAssetsRateControllerEvents,
        RootMessenger
      >({
        namespace: 'MultichainAssetsRatesController',
        parent: messenger,
      });
      messenger.delegate({
        messenger: multichainAssetsRatesControllerMessenger,
        actions: [
          'MultichainAssetsController:getState',
          'AccountsController:listMultichainAccounts',
          'AccountsController:getSelectedMultichainAccount',
          'CurrencyRateController:getState',
          'SnapController:handleRequest',
        ],
        events: [
          'KeyringController:lock',
          'KeyringController:unlock',
          'AccountsController:accountAdded',
          'CurrencyRateController:stateChange',
          'MultichainAssetsController:accountAssetListUpdated',
        ],
      });

      const controller = new MultichainAssetsRatesController({
        messenger: multichainAssetsRatesControllerMessenger,
      });

      await controller.updateAssetsRates();

      // The snap handler gets called for both conversion rates and market data
      // But we only care about the conversion rates call for this test
      const conversionCalls = snapHandler.mock.calls.filter(
        (call) => call[0].handler === 'onAssetsConversion',
      );

      // Verify that the conversion snap was called only once (for the account with assets)
      // This confirms that the account with no assets was skipped via line 331 continue
      expect(conversionCalls).toHaveLength(1);

      // Verify that the conversion call was made with the correct structure
      expect(snapHandler).toHaveBeenCalledWith({
        handler: 'onAssetsConversion',
        origin: 'metamask',
        snapId: 'test-snap',
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
          },
        },
      });

      // Verify that conversion rates were updated only for the account with assets
      expect(controller.state.conversionRates).toMatchObject({
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
          rate: '100.50',
          conversionTime: expect.any(Number),
          currency: 'swift:0/iso4217:USD',
        },
      });
    });
  });

  describe('dynamic asset fetching', () => {
    it('should fetch rates for assets added after controller initialization', async () => {
      const messenger: RootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });

      // Initially, MultichainAssetsController has no assets
      let multichainAssets: Record<string, CaipAssetType[]> = {};

      messenger.registerActionHandler(
        'MultichainAssetsController:getState',
        () => ({
          accountsAssets: multichainAssets,
          assetsMetadata: {
            'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
              name: 'Solana',
              symbol: 'SOL',
              fungible: true,
              iconUrl: 'https://example.com/solana.png',
              units: [{ symbol: 'SOL', name: 'Solana', decimals: 9 }],
            },
          },
          allIgnoredAssets: {},
        }),
      );

      messenger.registerActionHandler(
        'AccountsController:listMultichainAccounts',
        () => [
          {
            id: 'account1',
            address: 'sol-address-1',
            options: {},
            methods: [SolMethod.SignMessage, SolMethod.SignTransaction],
            type: SolAccountType.DataAccount,
            metadata: {
              name: 'Test Solana Account',
              importTime: Date.now(),
              keyring: {
                type: KeyringTypes.snap,
              },
              snap: {
                name: 'Test Snap',
                id: 'test-snap',
                enabled: true,
              },
            },
            scopes: [SolScope.Mainnet],
          },
        ],
      );

      messenger.registerActionHandler(
        'AccountsController:getSelectedMultichainAccount',
        () => ({
          id: 'account1',
          address: 'sol-address-1',
          options: {},
          methods: [SolMethod.SignMessage, SolMethod.SignTransaction],
          type: SolAccountType.DataAccount,
          metadata: {
            name: 'Test Solana Account',
            importTime: Date.now(),
            keyring: {
              type: KeyringTypes.snap,
            },
            snap: {
              name: 'Test Snap',
              id: 'test-snap',
              enabled: true,
            },
          },
          scopes: [SolScope.Mainnet],
        }),
      );

      messenger.registerActionHandler(
        'CurrencyRateController:getState',
        () => ({
          currentCurrency: 'USD',
          currencyRates: {},
        }),
      );

      const snapHandler = jest.fn().mockResolvedValue({
        conversionRates: {
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
            'swift:0/iso4217:USD': {
              rate: '150.00',
              conversionTime: Date.now(),
            },
          },
        },
      });

      messenger.registerActionHandler(
        'SnapController:handleRequest',
        snapHandler,
      );

      const multichainAssetsRatesControllerMessenger = new Messenger<
        'MultichainAssetsRatesController',
        AllMultichainAssetsRateControllerActions,
        AllMultichainAssetsRateControllerEvents,
        RootMessenger
      >({
        namespace: 'MultichainAssetsRatesController',
        parent: messenger,
      });

      messenger.delegate({
        messenger: multichainAssetsRatesControllerMessenger,
        actions: [
          'MultichainAssetsController:getState',
          'AccountsController:listMultichainAccounts',
          'AccountsController:getSelectedMultichainAccount',
          'CurrencyRateController:getState',
          'SnapController:handleRequest',
        ],
        events: [
          'KeyringController:lock',
          'KeyringController:unlock',
          'AccountsController:accountAdded',
          'CurrencyRateController:stateChange',
          'MultichainAssetsController:accountAssetListUpdated',
        ],
      });

      jest
        .spyOn(KeyringClient.prototype, 'listAccountAssets')
        .mockResolvedValue([]);

      const controller = new MultichainAssetsRatesController({
        messenger: multichainAssetsRatesControllerMessenger,
      });

      // Initial fetch should return empty because no assets exist yet
      await controller.updateAssetsRates();
      expect(controller.state.conversionRates).toStrictEqual({});
      expect(snapHandler).not.toHaveBeenCalled();

      // Simulate new wallet import: MultichainAssetsController now has assets
      multichainAssets = {
        account1: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501'],
      };

      jest
        .spyOn(KeyringClient.prototype, 'listAccountAssets')
        .mockResolvedValue([
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
        ]);

      // Fetch again - should now pick up the new assets
      await controller.updateAssetsRates();

      // Verify that rates were fetched for the newly added asset
      expect(snapHandler).toHaveBeenCalled();
      expect(controller.state.conversionRates).toMatchObject({
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
          rate: '150.00',
          currency: 'swift:0/iso4217:USD',
        },
      });
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`
        {
          "conversionRates": {},
          "historicalPrices": {},
        }
      `);
    });

    it('includes expected state in state logs', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });

    it('persists expected state', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`
        {
          "conversionRates": {},
        }
      `);
    });

    it('exposes expected state to UI', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
        {
          "conversionRates": {},
          "historicalPrices": {},
        }
      `);
    });
  });
});
