// `getActiveChainsSync` is part of the data source's public API; asserting on
// it is intentional and not a filesystem-style sync call.
/* eslint-disable n/no-sync */
import type { BalanceUpdate } from '@metamask/core-backend';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';

import type { AssetsControllerMessenger } from '../AssetsController';
import type { ChainId, Caip19AssetId } from '../types';
import {
  AccountActivityDataSource,
  createAccountActivityDataSource,
} from './AccountActivityDataSource';

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<AssetsControllerMessenger>,
  MessengerEvents<AssetsControllerMessenger>
>;

const CHAIN_MAINNET = 'eip155:1' as ChainId;
const CHAIN_POLYGON = 'eip155:137' as ChainId;
const CHAIN_SOLANA = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as ChainId;

const EVM_ADDRESS = '0x1234567890123456789012345678901234567890';
const SOLANA_ADDRESS = 'DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1';

const ETH_ASSET = 'eip155:1/slip44:60' as Caip19AssetId;

/**
 * Build an InternalAccount for tests.
 *
 * @param overrides - Partial fields to override on the account.
 * @returns A mock InternalAccount.
 */
function createMockAccount(
  overrides?: Partial<InternalAccount>,
): InternalAccount {
  return {
    id: 'mock-account-id',
    address: EVM_ADDRESS,
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: ['eip155:0'],
    metadata: {
      name: 'Test Account',
      keyring: { type: 'HD Key Tree' },
      importTime: Date.now(),
      lastSelected: Date.now(),
    },
    ...overrides,
  } as InternalAccount;
}

/**
 * Build a BalanceUpdate for tests.
 *
 * @param overrides - Partial fields to override on the update.
 * @param overrides.asset - Partial asset fields to override.
 * @param overrides.postBalance - Partial post-balance fields to override.
 * @param overrides.transfers - Transfers to set on the update.
 * @returns A mock BalanceUpdate.
 */
function createBalanceUpdate(overrides?: {
  asset?: Partial<BalanceUpdate['asset']>;
  postBalance?: Partial<BalanceUpdate['postBalance']>;
  transfers?: BalanceUpdate['transfers'];
}): BalanceUpdate {
  return {
    asset: {
      fungible: true,
      type: ETH_ASSET,
      unit: 'ETH',
      decimals: 18,
      ...overrides?.asset,
    },
    postBalance: {
      amount: '1000000000000000000',
      ...overrides?.postBalance,
    },
    transfers: overrides?.transfers ?? [],
  } as BalanceUpdate;
}

type SetupOptions = {
  groupAccounts?: InternalAccount[];
  selectedAccount?: InternalAccount | null;
  getAssetType?: (assetId: Caip19AssetId) => 'native' | 'erc20' | 'spl';
  onAssetsUpdate?: jest.Mock;
  onActiveChainsUpdated?: jest.Mock;
  state?: { activeChains?: ChainId[] };
};

type SetupResult = {
  dataSource: AccountActivityDataSource;
  rootMessenger: RootMessenger;
  onAssetsUpdate: jest.Mock;
  onActiveChainsUpdated: jest.Mock;
  getAssetType: jest.Mock;
  triggerBalanceUpdated: (payload: {
    address: string;
    chain: string;
    updates: BalanceUpdate[];
  }) => void;
  triggerStatusChanged: (payload: {
    chainIds: string[];
    status: 'up' | 'down';
    timestamp?: number;
  }) => void;
  cleanup: () => void;
};

/**
 * Create an AccountActivityDataSource wired to a messenger for testing.
 *
 * @param options - Setup overrides.
 * @returns The data source and its test harness.
 */
function setup(options: SetupOptions = {}): SetupResult {
  const {
    groupAccounts = [createMockAccount()],
    selectedAccount = null,
    onAssetsUpdate = jest.fn().mockResolvedValue(undefined),
    onActiveChainsUpdated = jest.fn(),
    state,
  } = options;

  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const assetsControllerMessenger: AssetsControllerMessenger = new Messenger({
    namespace: 'AssetsController',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger: assetsControllerMessenger,
    actions: [
      'AccountTreeController:getAccountsFromSelectedAccountGroup',
      'AccountsController:getSelectedAccount',
    ],
    events: [
      'AccountActivityService:balanceUpdated',
      'AccountActivityService:statusChanged',
    ],
  });

  rootMessenger.registerActionHandler(
    'AccountTreeController:getAccountsFromSelectedAccountGroup',
    () => groupAccounts,
  );
  rootMessenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    () => selectedAccount as InternalAccount,
  );

  const getAssetType = jest
    .fn()
    .mockImplementation(options.getAssetType ?? ((): 'native' => 'native'));

  const dataSource = new AccountActivityDataSource({
    messenger: assetsControllerMessenger,
    onActiveChainsUpdated,
    getAssetType,
    onAssetsUpdate,
    state,
  });

  const triggerBalanceUpdated = (payload: {
    address: string;
    chain: string;
    updates: BalanceUpdate[];
  }): void => {
    rootMessenger.publish('AccountActivityService:balanceUpdated', payload);
  };

  const triggerStatusChanged = (payload: {
    chainIds: string[];
    status: 'up' | 'down';
    timestamp?: number;
  }): void => {
    rootMessenger.publish('AccountActivityService:statusChanged', payload);
  };

  const cleanup = (): void => {
    dataSource.destroy();
    rootMessenger.clearSubscriptions();
  };

  return {
    dataSource,
    rootMessenger,
    onAssetsUpdate,
    onActiveChainsUpdated,
    getAssetType,
    triggerBalanceUpdated,
    triggerStatusChanged,
    cleanup,
  };
}

describe('AccountActivityDataSource', () => {
  describe('constructor', () => {
    it('uses the default (empty) active chains state', () => {
      const { dataSource, cleanup } = setup();

      expect(dataSource.getActiveChainsSync()).toStrictEqual([]);

      cleanup();
    });

    it('seeds active chains from provided state', () => {
      const { dataSource, cleanup } = setup({
        state: { activeChains: [CHAIN_MAINNET] },
      });

      expect(dataSource.getActiveChainsSync()).toStrictEqual([CHAIN_MAINNET]);

      cleanup();
    });

    it('subscribes to balanceUpdated and statusChanged events', () => {
      const { dataSource, onAssetsUpdate, triggerStatusChanged, cleanup } =
        setup();

      triggerStatusChanged({ chainIds: [CHAIN_MAINNET], status: 'up' });

      // statusChanged handler ran and claimed the chain
      expect(dataSource.getActiveChainsSync()).toStrictEqual([CHAIN_MAINNET]);
      expect(onAssetsUpdate).not.toHaveBeenCalled();

      cleanup();
    });
  });

  describe('getName', () => {
    it('returns the data source name', () => {
      const { dataSource, cleanup } = setup();

      expect(dataSource.getName()).toBe('AccountActivityDataSource');

      cleanup();
    });
  });

  describe('subscribe', () => {
    it('resolves without doing anything (no-op)', async () => {
      const { dataSource, onAssetsUpdate, onActiveChainsUpdated, cleanup } =
        setup();

      expect(await dataSource.subscribe()).toBeUndefined();
      expect(onAssetsUpdate).not.toHaveBeenCalled();
      expect(onActiveChainsUpdated).not.toHaveBeenCalled();

      cleanup();
    });
  });

  describe('balanceUpdated event', () => {
    it('reports decoded balances through onAssetsUpdate', async () => {
      const account = createMockAccount();
      const { onAssetsUpdate, triggerBalanceUpdated, cleanup } = setup({
        groupAccounts: [account],
      });

      triggerBalanceUpdated({
        address: EVM_ADDRESS,
        chain: CHAIN_MAINNET,
        updates: [createBalanceUpdate()],
      });

      await Promise.resolve();

      expect(onAssetsUpdate).toHaveBeenCalledTimes(1);
      const [response, request] = onAssetsUpdate.mock.calls[0];
      // `processAccountActivityBalanceUpdates` builds null-prototype objects
      // (`Object.create(null)`), so `toStrictEqual` (which checks prototypes)
      // does not match a plain object literal here.
      // eslint-disable-next-line jest/prefer-strict-equal
      expect(response).toEqual({
        updateMode: 'merge',
        assetsBalance: {
          [account.id]: {
            [ETH_ASSET]: { amount: '1' },
          },
        },
        assetsInfo: {
          [ETH_ASSET]: {
            type: 'native',
            symbol: 'ETH',
            name: 'ETH',
            decimals: 18,
          },
        },
      });
      expect(request).toStrictEqual({
        accountsWithSupportedChains: [
          { account, supportedChains: [CHAIN_MAINNET] },
        ],
        chainIds: [CHAIN_MAINNET],
        dataTypes: ['balance', 'metadata'],
      });

      cleanup();
    });

    it('resolves the asset type via the injected getAssetType', async () => {
      const { getAssetType, triggerBalanceUpdated, cleanup } = setup({
        getAssetType: () => 'erc20',
      });

      triggerBalanceUpdated({
        address: EVM_ADDRESS,
        chain: CHAIN_MAINNET,
        updates: [createBalanceUpdate()],
      });

      await Promise.resolve();

      expect(getAssetType).toHaveBeenCalledWith(ETH_ASSET);

      cleanup();
    });

    it.each([
      ['address is empty', { address: '' }],
      ['chain is empty', { chain: '' }],
      ['updates is empty', { updates: [] }],
    ])('ignores the event when %s', async (_label, override) => {
      const { onAssetsUpdate, triggerBalanceUpdated, cleanup } = setup();

      triggerBalanceUpdated({
        address: EVM_ADDRESS,
        chain: CHAIN_MAINNET,
        updates: [createBalanceUpdate()],
        ...override,
      });

      await Promise.resolve();

      expect(onAssetsUpdate).not.toHaveBeenCalled();

      cleanup();
    });

    it('ignores the event when no wallet account matches the address', async () => {
      const { onAssetsUpdate, triggerBalanceUpdated, cleanup } = setup({
        groupAccounts: [
          createMockAccount({
            address: '0x9999999999999999999999999999999999999999',
          }),
        ],
      });

      triggerBalanceUpdated({
        address: EVM_ADDRESS,
        chain: CHAIN_MAINNET,
        updates: [createBalanceUpdate()],
      });

      await Promise.resolve();

      expect(onAssetsUpdate).not.toHaveBeenCalled();

      cleanup();
    });

    it('matches EVM addresses case-insensitively', async () => {
      const account = createMockAccount({ address: EVM_ADDRESS.toLowerCase() });
      const { onAssetsUpdate, triggerBalanceUpdated, cleanup } = setup({
        groupAccounts: [account],
      });

      triggerBalanceUpdated({
        address: EVM_ADDRESS.toUpperCase().replace('0X', '0x'),
        chain: CHAIN_MAINNET,
        updates: [createBalanceUpdate()],
      });

      await Promise.resolve();

      expect(onAssetsUpdate).toHaveBeenCalledTimes(1);

      cleanup();
    });

    it('matches non-EVM addresses exactly', async () => {
      const account = createMockAccount({
        address: SOLANA_ADDRESS,
        type: 'solana:data-account',
      });
      const { onAssetsUpdate, triggerBalanceUpdated, cleanup } = setup({
        groupAccounts: [account],
      });

      triggerBalanceUpdated({
        address: SOLANA_ADDRESS,
        chain: CHAIN_SOLANA,
        updates: [createBalanceUpdate()],
      });

      await Promise.resolve();

      expect(onAssetsUpdate).toHaveBeenCalledTimes(1);

      cleanup();
    });

    it('does not match a non-EVM address that differs only by case', async () => {
      const account = createMockAccount({
        address: SOLANA_ADDRESS,
        type: 'solana:data-account',
      });
      const { onAssetsUpdate, triggerBalanceUpdated, cleanup } = setup({
        groupAccounts: [account],
      });

      triggerBalanceUpdated({
        address: SOLANA_ADDRESS.toLowerCase(),
        chain: CHAIN_SOLANA,
        updates: [createBalanceUpdate()],
      });

      await Promise.resolve();

      expect(onAssetsUpdate).not.toHaveBeenCalled();

      cleanup();
    });

    it('falls back to the selected account when the group is empty', async () => {
      const selected = createMockAccount({ id: 'selected-id' });
      const { onAssetsUpdate, triggerBalanceUpdated, cleanup } = setup({
        groupAccounts: [],
        selectedAccount: selected,
      });

      triggerBalanceUpdated({
        address: EVM_ADDRESS,
        chain: CHAIN_MAINNET,
        updates: [createBalanceUpdate()],
      });

      await Promise.resolve();

      expect(onAssetsUpdate).toHaveBeenCalledTimes(1);
      const [response] = onAssetsUpdate.mock.calls[0];
      expect(response.assetsBalance).toHaveProperty('selected-id');

      cleanup();
    });

    it('ignores the event when the group is empty and there is no selected account', async () => {
      const { onAssetsUpdate, triggerBalanceUpdated, cleanup } = setup({
        groupAccounts: [],
        selectedAccount: null,
      });

      triggerBalanceUpdated({
        address: EVM_ADDRESS,
        chain: CHAIN_MAINNET,
        updates: [createBalanceUpdate()],
      });

      await Promise.resolve();

      expect(onAssetsUpdate).not.toHaveBeenCalled();

      cleanup();
    });

    it('does not call onAssetsUpdate when no balances could be decoded', async () => {
      const { onAssetsUpdate, triggerBalanceUpdated, cleanup } = setup();

      // decimals undefined => the update is skipped and assetsBalance is absent
      triggerBalanceUpdated({
        address: EVM_ADDRESS,
        chain: CHAIN_MAINNET,
        updates: [
          createBalanceUpdate({
            asset: { decimals: undefined as unknown as number },
          }),
        ],
      });

      await Promise.resolve();

      expect(onAssetsUpdate).not.toHaveBeenCalled();

      cleanup();
    });

    it('swallows rejections from onAssetsUpdate', async () => {
      const onAssetsUpdate = jest
        .fn()
        .mockRejectedValue(new Error('report failed'));
      const { triggerBalanceUpdated, cleanup } = setup({ onAssetsUpdate });

      expect(() =>
        triggerBalanceUpdated({
          address: EVM_ADDRESS,
          chain: CHAIN_MAINNET,
          updates: [createBalanceUpdate()],
        }),
      ).not.toThrow();

      await Promise.resolve();
      await Promise.resolve();

      expect(onAssetsUpdate).toHaveBeenCalledTimes(1);

      cleanup();
    });

    it('swallows synchronous errors thrown while handling the event', async () => {
      const { onAssetsUpdate, triggerBalanceUpdated, cleanup } = setup({
        getAssetType: () => {
          throw new Error('boom');
        },
      });

      expect(() =>
        triggerBalanceUpdated({
          address: EVM_ADDRESS,
          chain: CHAIN_MAINNET,
          updates: [createBalanceUpdate()],
        }),
      ).not.toThrow();

      await Promise.resolve();

      expect(onAssetsUpdate).not.toHaveBeenCalled();

      cleanup();
    });
  });

  describe('statusChanged event', () => {
    it('claims chains reported as up', () => {
      const {
        dataSource,
        onActiveChainsUpdated,
        triggerStatusChanged,
        cleanup,
      } = setup();

      triggerStatusChanged({
        chainIds: [CHAIN_MAINNET, CHAIN_POLYGON],
        status: 'up',
      });

      expect(dataSource.getActiveChainsSync()).toStrictEqual([
        CHAIN_MAINNET,
        CHAIN_POLYGON,
      ]);
      expect(onActiveChainsUpdated).toHaveBeenCalledWith(
        'AccountActivityDataSource',
        [CHAIN_MAINNET, CHAIN_POLYGON],
        [],
      );

      cleanup();
    });

    it('releases chains reported as down', () => {
      const {
        dataSource,
        onActiveChainsUpdated,
        triggerStatusChanged,
        cleanup,
      } = setup({ state: { activeChains: [CHAIN_MAINNET, CHAIN_POLYGON] } });

      triggerStatusChanged({ chainIds: [CHAIN_MAINNET], status: 'down' });

      expect(dataSource.getActiveChainsSync()).toStrictEqual([CHAIN_POLYGON]);
      expect(onActiveChainsUpdated).toHaveBeenCalledWith(
        'AccountActivityDataSource',
        [CHAIN_POLYGON],
        [CHAIN_MAINNET, CHAIN_POLYGON],
      );

      cleanup();
    });

    it('acts on non-EVM namespaces such as solana', () => {
      const { dataSource, triggerStatusChanged, cleanup } = setup();

      triggerStatusChanged({ chainIds: [CHAIN_SOLANA], status: 'up' });

      expect(dataSource.getActiveChainsSync()).toStrictEqual([CHAIN_SOLANA]);

      cleanup();
    });

    it('filters out identifiers that are not valid CAIP-2 chain IDs', () => {
      const {
        dataSource,
        onActiveChainsUpdated,
        triggerStatusChanged,
        cleanup,
      } = setup();

      triggerStatusChanged({
        chainIds: ['not-a-chain', CHAIN_MAINNET],
        status: 'up',
      });

      expect(dataSource.getActiveChainsSync()).toStrictEqual([CHAIN_MAINNET]);
      expect(onActiveChainsUpdated).toHaveBeenCalledWith(
        'AccountActivityDataSource',
        [CHAIN_MAINNET],
        [],
      );

      cleanup();
    });

    it('does nothing when there are no valid chains', () => {
      const {
        dataSource,
        onActiveChainsUpdated,
        triggerStatusChanged,
        cleanup,
      } = setup();

      triggerStatusChanged({ chainIds: ['not-a-chain'], status: 'up' });

      expect(dataSource.getActiveChainsSync()).toStrictEqual([]);
      expect(onActiveChainsUpdated).not.toHaveBeenCalled();

      cleanup();
    });

    it('does not notify listeners when the active chains do not change', () => {
      const { onActiveChainsUpdated, triggerStatusChanged, cleanup } = setup({
        state: { activeChains: [CHAIN_MAINNET] },
      });

      triggerStatusChanged({ chainIds: [CHAIN_MAINNET], status: 'up' });

      expect(onActiveChainsUpdated).not.toHaveBeenCalled();

      cleanup();
    });

    it('swallows errors thrown while handling the event', () => {
      const onActiveChainsUpdated = jest.fn().mockImplementation(() => {
        throw new Error('listener boom');
      });
      const { triggerStatusChanged, cleanup } = setup({
        onActiveChainsUpdated,
      });

      expect(() =>
        triggerStatusChanged({ chainIds: [CHAIN_MAINNET], status: 'up' }),
      ).not.toThrow();

      cleanup();
    });
  });

  describe('destroy', () => {
    it('does not throw and clears internal subscriptions', () => {
      const { dataSource, cleanup } = setup();

      expect(() => dataSource.destroy()).not.toThrow();

      cleanup();
    });

    it('can be called multiple times safely', () => {
      const { dataSource, cleanup } = setup();

      expect(() => {
        dataSource.destroy();
        dataSource.destroy();
      }).not.toThrow();

      cleanup();
    });
  });

  describe('createAccountActivityDataSource', () => {
    it('returns an AccountActivityDataSource instance', () => {
      const rootMessenger: RootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });
      const assetsControllerMessenger: AssetsControllerMessenger =
        new Messenger({
          namespace: 'AssetsController',
          parent: rootMessenger,
        });
      rootMessenger.delegate({
        messenger: assetsControllerMessenger,
        actions: [],
        events: [
          'AccountActivityService:balanceUpdated',
          'AccountActivityService:statusChanged',
        ],
      });

      const dataSource = createAccountActivityDataSource({
        messenger: assetsControllerMessenger,
        onActiveChainsUpdated: jest.fn(),
        getAssetType: () => 'native',
        onAssetsUpdate: jest.fn(),
      });

      expect(dataSource).toBeInstanceOf(AccountActivityDataSource);

      dataSource.destroy();
      rootMessenger.clearSubscriptions();
    });
  });
});
