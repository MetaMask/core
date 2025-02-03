import { ControllerMessenger } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { KeyringClient } from '@metamask/keyring-snap-client';
import { useFakeTimers } from 'sinon';

import { MultiChainTokensRatesController } from '.';
import {
  type AllowedActions,
  type AllowedEvents,
} from './MultichainTokensRatesController';

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

// A fake conversion rates response returned by the SnapController.
const fakeAccountRates = {
  conversionRates: {
    token1: {
      'swift:0/iso4217:USD': {
        rate: '202.11',
        conversionTime: 1738539923277,
      },
    },
  },
};

const setupController = ({
  config,
}: {
  config?: Partial<
    ConstructorParameters<typeof MultiChainTokensRatesController>[0]
  >;
} = {}) => {
  const messenger = new ControllerMessenger<AllowedActions, AllowedEvents>();

  messenger.registerActionHandler('AccountsController:getState', () => ({
    accounts: {
      account1: {
        type: 'eip155:eoa',
        id: 'account1',
        options: {},
        metadata: { name: 'Test Account' },
        address: '0x123',
        methods: [],
      },
    },
    selectedAccount: 'account1',
    internalAccounts: { accounts: {}, selectedAccount: 'account1' },
  }));

  messenger.registerActionHandler(
    'AccountsController:listMultichainAccounts',
    () => [fakeNonEvmAccount, fakeEvmAccount, fakeEvmAccount2],
  );

  const multiChainTokensRatesControllerMessenger = messenger.getRestricted({
    name: 'MultiChainTokensRatesController',
    allowedActions: [
      'AccountsController:getState',
      'AccountsController:listMultichainAccounts',
      'SnapController:handleRequest',
      'CurrencyRateController:getState',
    ],
    allowedEvents: [
      'AccountsController:accountAdded',
      'AccountsController:accountRemoved',
      'KeyringController:lock',
      'KeyringController:unlock',
      'CurrencyRateController:stateChange',
    ],
  });

  return {
    controller: new MultiChainTokensRatesController({
      messenger: multiChainTokensRatesControllerMessenger,
      ...config,
    }),
    messenger,
  };
};

describe('MultiChainTokensRatesController', () => {
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

  it('should initialize with an empty conversionRates state', () => {
    const { controller } = setupController();
    expect(controller.state).toStrictEqual({ conversionRates: {} });
  });

  it('should update conversion rates for a valid non-EVM account', async () => {
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

    // Call updateTokensRates for the valid non-EVM account.
    await controller.updateTokensRates('account1');

    // Verify that listAccountAssets was called with the correct account.
    expect(KeyringClient.prototype.listAccountAssets).toHaveBeenCalledWith(
      'account1',
    );

    // Check that the Snap request was made with the expected parameters.
    expect(snapHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        handler: 'onAssetsConversion',
        origin: 'metamask',
        request: {
          jsonrpc: '2.0',
          method: 'onAssetsConversion',
          params: {
            conversions: [
              {
                from: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
                to: 'swift:0/iso4217:SOL',
              },
            ],
          },
        },
        snapId: 'test-snap',
      }),
    );

    // The controller state should now contain the conversion rates returned.
    expect(controller.state.conversionRates).toStrictEqual(
      // fakeAccountRates.conversionRates,
      {
        account1: {
          token1: {
            'swift:0/iso4217:USD': {
              rate: '202.11',
              conversionTime: 1738539923277,
            },
          },
        },
      },
    );
  });

  it('should not update conversion rates if the controller is not active', async () => {
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

    await controller.updateTokensRates('account1');
    // Since the controller is locked, no update should occur.
    expect(controller.state.conversionRates).toStrictEqual({});
    expect(snapHandler).not.toHaveBeenCalled();
  });

  it('should resume update tokens rates when the keyring is unlocked', async () => {
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
    await controller.updateTokensRates('account1');
    expect(controller.isActive).toBe(false);

    messenger.publish('KeyringController:unlock');
    await controller.updateTokensRates('account1');

    expect(controller.isActive).toBe(true);
  });

  it('should not update conversion rates for an unknown account', async () => {
    const { controller } = setupController();
    // Calling updateTokensRates for an account that does not exist should leave state unchanged.
    await controller.updateTokensRates('nonexistent');
    expect(controller.state.conversionRates).toStrictEqual({});
  });

  it('should call updateTokensRates when _executePoll is invoked', async () => {
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

    // Spy on updateTokensRates.
    const updateSpy = jest.spyOn(controller, 'updateTokensRates');
    await controller._executePoll();
    expect(updateSpy).toHaveBeenCalledWith(fakeNonEvmAccount.id);
  });

  it('should remove conversion rates when an account is removed', async () => {
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

    await controller.updateTokensRates('account1');
    expect(controller.state.conversionRates.account1).toBeDefined();

    // Simulate an account removal event.
    messenger.publish('AccountsController:accountRemoved', 'account1');
    // Wait a tick so that asynchronous event handlers finish.
    await Promise.resolve();
    expect(controller.state.conversionRates.account1).toBeUndefined();
  });

  it('should call updateTokensRates when an account is added', async () => {
    const { controller, messenger } = setupController();
    // Create a new non‑EVM account.
    const newAccount = {
      id: 'account3',
      type: 'solana:data-account',
      address: '0x789',
      metadata: { name: 'New Account', snap: { id: 'new-snap' } },
      scopes: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
      options: {},
      methods: [],
    };

    // Spy on updateTokensRates.
    const updateSpy = jest
      .spyOn(controller, 'updateTokensRates')
      .mockResolvedValue();

    // Publish a selectedAccountChange event.
    // @ts-expect-error-next-line
    messenger.publish('AccountsController:accountAdded', newAccount);
    // Wait for the asynchronous subscriber to run.
    await Promise.resolve();
    expect(updateSpy).toHaveBeenCalledWith('account3');
  });
});
