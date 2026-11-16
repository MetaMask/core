import type { BalanceUpdate } from '@metamask/core-backend';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { createMockMessengers } from '../__fixtures__/MockAssetControllerMessenger.js';
import type { MockRootMessenger } from '../__fixtures__/MockAssetControllerMessenger.js';
import { waitFor } from '../__fixtures__/test-utils.js';
import type { ChainId, Caip19AssetId } from '../types.js';
import {
  AccountActivityDataSource,
  createAccountActivityDataSource,
} from './AccountActivityDataSource.js';

const CHAIN_MAINNET = 'eip155:1' as ChainId;
const CHAIN_POLYGON = 'eip155:137' as ChainId;
const CHAIN_SOLANA = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as ChainId;

const EVM_ADDRESS = '0x1234567890123456789012345678901234567890';
const SOLANA_ADDRESS = 'DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1';

const ETH_ASSET = 'eip155:1/slip44:60' as Caip19AssetId;
// The websocket delivers lower-case addresses; state keys them checksummed.
const USDC_ASSET_LOWERCASE =
  'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Caip19AssetId;
const USDC_ASSET_CHECKSUMMED =
  'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;

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
  };
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
  };
}

type SetupOptions = {
  groupAccounts?: InternalAccount[];
  selectedAccount?: InternalAccount | null;
  onAssetsUpdate?: Mock;
  onActiveChainsUpdated?: Mock;
  state?: { activeChains?: ChainId[] };
};

type SetupResult = {
  dataSource: AccountActivityDataSource;
  rootMessenger: MockRootMessenger;
  onAssetsUpdate: Mock;
  onActiveChainsUpdated: Mock;
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
};

const teardowns: (() => void)[] = [];

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
    onAssetsUpdate = vi.fn().mockResolvedValue(undefined),
    onActiveChainsUpdated = vi.fn(),
    state,
  } = options;

  const { rootMessenger, assetsControllerMessenger } = createMockMessengers({
    registerCustomRootActions: (messenger) => {
      messenger.registerActionHandler(
        'AccountTreeController:getAccountsFromSelectedAccountGroup',
        () => groupAccounts,
      );
      messenger.registerActionHandler(
        'AccountsController:getSelectedAccount',
        () => selectedAccount as InternalAccount,
      );
    },
  });

  const dataSource = new AccountActivityDataSource({
    messenger: assetsControllerMessenger,
    onActiveChainsUpdated,
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

  teardowns.push(cleanup);

  return {
    dataSource,
    rootMessenger,
    onAssetsUpdate,
    onActiveChainsUpdated,
    triggerBalanceUpdated,
    triggerStatusChanged,
  };
}

describe('AccountActivityDataSource', () => {
  afterEach(() => {
    teardowns.splice(0).forEach((teardown) => teardown());
  });

  describe('constructor', () => {
    it('uses the default (empty) active chains state', () => {
      const { dataSource } = setup();

      expect(dataSource.getActiveChainsSync()).toStrictEqual([]);
    });

    it('seeds active chains from provided state', () => {
      const { dataSource } = setup({
        state: { activeChains: [CHAIN_MAINNET] },
      });

      expect(dataSource.getActiveChainsSync()).toStrictEqual([CHAIN_MAINNET]);
    });

    it('subscribes to balanceUpdated and statusChanged events', () => {
      const { dataSource, onAssetsUpdate, triggerStatusChanged } = setup();

      triggerStatusChanged({ chainIds: [CHAIN_MAINNET], status: 'up' });

      // statusChanged handler ran and claimed the chain
      expect(dataSource.getActiveChainsSync()).toStrictEqual([CHAIN_MAINNET]);
      expect(onAssetsUpdate).not.toHaveBeenCalled();
    });
  });

  describe('getName', () => {
    it('returns the data source name', () => {
      const { dataSource } = setup();

      expect(dataSource.getName()).toBe('AccountActivityDataSource');
    });
  });

  describe('subscribe', () => {
    it('resolves without doing anything (no-op)', async () => {
      const { dataSource, onAssetsUpdate, onActiveChainsUpdated } = setup();

      expect(await dataSource.subscribe()).toBeUndefined();
      expect(onAssetsUpdate).not.toHaveBeenCalled();
      expect(onActiveChainsUpdated).not.toHaveBeenCalled();
    });
  });

  describe('balanceUpdated event', () => {
    it('reports decoded balances through onAssetsUpdate', async () => {
      const account = createMockAccount();
      const { onAssetsUpdate, triggerBalanceUpdated } = setup({
        groupAccounts: [account],
      });

      triggerBalanceUpdated({
        address: EVM_ADDRESS,
        chain: CHAIN_MAINNET,
        updates: [createBalanceUpdate()],
      });

      await waitFor(() => {
        expect(onAssetsUpdate).toHaveBeenCalledTimes(1);
      });
      const [response, request] = onAssetsUpdate.mock.calls[0];
      // `processAccountActivityBalanceUpdates` builds null-prototype objects
      // (`Object.create(null)`), so `toStrictEqual` (which checks prototypes)
      // does not match a plain object literal here.
      // eslint-disable-next-line vitest/prefer-strict-equal
      expect(response).toEqual({
        updateMode: 'merge',
        assetsBalance: {
          [account.id]: {
            [ETH_ASSET]: { amount: '1' },
          },
        },
      });
      expect(request).toStrictEqual({
        accountsWithSupportedChains: [
          { account, supportedChains: [CHAIN_MAINNET] },
        ],
        chainIds: [CHAIN_MAINNET],
        dataTypes: ['balance', 'metadata', 'price'],
      });
    });

    it('converts a hex postBalance to a human-readable amount', async () => {
      const account = createMockAccount();
      const { onAssetsUpdate, triggerBalanceUpdated } = setup({
        groupAccounts: [account],
      });

      triggerBalanceUpdated({
        address: EVM_ADDRESS,
        chain: CHAIN_MAINNET,
        updates: [
          createBalanceUpdate({ postBalance: { amount: '0x10aa6d94e80' } }),
        ],
      });

      await waitFor(() => {
        expect(onAssetsUpdate).toHaveBeenCalledTimes(1);
      });
      const [response] = onAssetsUpdate.mock.calls[0];
      expect(response.assetsBalance[account.id][ETH_ASSET]).toStrictEqual({
        amount: '0.00000114526056',
      });
    });

    it('persists Stellar trustline metadata from postBalance', async () => {
      const STELLAR_CHAIN = 'stellar:pubnet' as ChainId;
      const STELLAR_ADDRESS =
        'GCRTHNJHYCV4F4JOAIMUE2ALYPE3C7Q53XTSUVGYJ4UXYIKWZAK7FWPG';
      const STELLAR_USDC =
        'stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' as Caip19AssetId;
      const trustlineMetadata = {
        authorized: true,
        limit: '9223372036854775807',
      };
      const account = createMockAccount({
        address: STELLAR_ADDRESS,
        type: 'stellar:ss58',
        scopes: [STELLAR_CHAIN],
      });
      const { onAssetsUpdate, triggerBalanceUpdated } = setup({
        groupAccounts: [account],
      });

      triggerBalanceUpdated({
        address: STELLAR_ADDRESS,
        chain: STELLAR_CHAIN,
        updates: [
          createBalanceUpdate({
            asset: {
              type: STELLAR_USDC,
              unit: 'USDC',
              decimals: 7,
            },
            postBalance: {
              amount: '201421',
              metadata: trustlineMetadata,
            },
          }),
        ],
      });

      await waitFor(() => {
        expect(onAssetsUpdate).toHaveBeenCalledTimes(1);
      });
      const [response] = onAssetsUpdate.mock.calls[0];
      expect(response.assetsBalance[account.id][STELLAR_USDC]).toStrictEqual({
        amount: '0.0201421',
        metadata: trustlineMetadata,
      });
      expect(response.assetsInfo).toBeUndefined();
    });

    it('checksums the lower-case ERC-20 asset IDs the websocket delivers', async () => {
      const account = createMockAccount();
      const { onAssetsUpdate, triggerBalanceUpdated } = setup({
        groupAccounts: [account],
      });

      triggerBalanceUpdated({
        address: EVM_ADDRESS,
        chain: CHAIN_MAINNET,
        updates: [
          createBalanceUpdate({
            asset: { type: USDC_ASSET_LOWERCASE, unit: 'USDC', decimals: 6 },
            postBalance: { amount: '1000000' },
          }),
        ],
      });

      await waitFor(() => {
        expect(onAssetsUpdate).toHaveBeenCalledTimes(1);
      });
      const [response] = onAssetsUpdate.mock.calls[0];
      expect(response.assetsBalance[account.id]).toHaveProperty(
        USDC_ASSET_CHECKSUMMED,
      );
      expect(response.assetsBalance[account.id]).not.toHaveProperty(
        USDC_ASSET_LOWERCASE,
      );
      expect(response.assetsInfo).toBeUndefined();
    });

    it('keeps an unparseable asset ID as-is', async () => {
      const account = createMockAccount();
      const { onAssetsUpdate, triggerBalanceUpdated } = setup({
        groupAccounts: [account],
      });

      const malformedAssetId = 'eip155:1/erc20:not-an-address' as Caip19AssetId;
      triggerBalanceUpdated({
        address: EVM_ADDRESS,
        chain: CHAIN_MAINNET,
        updates: [createBalanceUpdate({ asset: { type: malformedAssetId } })],
      });

      await waitFor(() => {
        expect(onAssetsUpdate).toHaveBeenCalledTimes(1);
      });
      const [response] = onAssetsUpdate.mock.calls[0];
      expect(response.assetsBalance[account.id]).toHaveProperty(
        malformedAssetId,
      );
    });

    it.each([
      ['address is empty', { address: '' }],
      ['chain is empty', { chain: '' }],
      ['updates is empty', { updates: [] }],
    ])('ignores the event when %s', async (_label, override) => {
      const { onAssetsUpdate, triggerBalanceUpdated } = setup();

      triggerBalanceUpdated({
        address: EVM_ADDRESS,
        chain: CHAIN_MAINNET,
        updates: [createBalanceUpdate()],
        ...override,
      });

      await waitFor(() => {
        expect(onAssetsUpdate).not.toHaveBeenCalled();
      });
    });

    it('ignores the event when no wallet account matches the address', async () => {
      const { onAssetsUpdate, triggerBalanceUpdated } = setup({
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

      await waitFor(() => {
        expect(onAssetsUpdate).not.toHaveBeenCalled();
      });
    });

    it('matches EVM addresses case-insensitively', async () => {
      const account = createMockAccount({ address: EVM_ADDRESS.toLowerCase() });
      const { onAssetsUpdate, triggerBalanceUpdated } = setup({
        groupAccounts: [account],
      });

      triggerBalanceUpdated({
        address: EVM_ADDRESS.toUpperCase().replace('0X', '0x'),
        chain: CHAIN_MAINNET,
        updates: [createBalanceUpdate()],
      });

      await waitFor(() => {
        expect(onAssetsUpdate).toHaveBeenCalledTimes(1);
      });
    });

    it('matches non-EVM addresses exactly', async () => {
      const account = createMockAccount({
        address: SOLANA_ADDRESS,
        type: 'solana:data-account',
      });
      const { onAssetsUpdate, triggerBalanceUpdated } = setup({
        groupAccounts: [account],
      });

      triggerBalanceUpdated({
        address: SOLANA_ADDRESS,
        chain: CHAIN_SOLANA,
        updates: [createBalanceUpdate()],
      });

      await waitFor(() => {
        expect(onAssetsUpdate).toHaveBeenCalledTimes(1);
      });
    });

    it('does not match a non-EVM address that differs only by case', async () => {
      const account = createMockAccount({
        address: SOLANA_ADDRESS,
        type: 'solana:data-account',
      });
      const { onAssetsUpdate, triggerBalanceUpdated } = setup({
        groupAccounts: [account],
      });

      triggerBalanceUpdated({
        address: SOLANA_ADDRESS.toLowerCase(),
        chain: CHAIN_SOLANA,
        updates: [createBalanceUpdate()],
      });

      await waitFor(() => {
        expect(onAssetsUpdate).not.toHaveBeenCalled();
      });
    });

    it('falls back to the selected account when the group is empty', async () => {
      const selected = createMockAccount({ id: 'selected-id' });
      const { onAssetsUpdate, triggerBalanceUpdated } = setup({
        groupAccounts: [],
        selectedAccount: selected,
      });

      triggerBalanceUpdated({
        address: EVM_ADDRESS,
        chain: CHAIN_MAINNET,
        updates: [createBalanceUpdate()],
      });

      await waitFor(() => {
        expect(onAssetsUpdate).toHaveBeenCalledTimes(1);
      });
      const [response] = onAssetsUpdate.mock.calls[0];
      expect(response.assetsBalance).toHaveProperty('selected-id');
    });

    it('ignores the event when the group is empty and there is no selected account', async () => {
      const { onAssetsUpdate, triggerBalanceUpdated } = setup({
        groupAccounts: [],
        selectedAccount: null,
      });

      triggerBalanceUpdated({
        address: EVM_ADDRESS,
        chain: CHAIN_MAINNET,
        updates: [createBalanceUpdate()],
      });

      await waitFor(() => {
        expect(onAssetsUpdate).not.toHaveBeenCalled();
      });
    });

    it('does not call onAssetsUpdate when no balances could be decoded', async () => {
      const { onAssetsUpdate, triggerBalanceUpdated } = setup();

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

      await waitFor(() => {
        expect(onAssetsUpdate).not.toHaveBeenCalled();
      });
    });

    it('swallows rejections from onAssetsUpdate', async () => {
      const onAssetsUpdate = vi
        .fn()
        .mockRejectedValue(new Error('report failed'));
      const { triggerBalanceUpdated } = setup({ onAssetsUpdate });

      expect(() =>
        triggerBalanceUpdated({
          address: EVM_ADDRESS,
          chain: CHAIN_MAINNET,
          updates: [createBalanceUpdate()],
        }),
      ).not.toThrow();

      await waitFor(() => {
        expect(onAssetsUpdate).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('statusChanged event', () => {
    it('claims chains reported as up', () => {
      const { dataSource, onActiveChainsUpdated, triggerStatusChanged } =
        setup();

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
    });

    it('releases chains reported as down', () => {
      const { dataSource, onActiveChainsUpdated, triggerStatusChanged } = setup(
        { state: { activeChains: [CHAIN_MAINNET, CHAIN_POLYGON] } },
      );

      triggerStatusChanged({ chainIds: [CHAIN_MAINNET], status: 'down' });

      expect(dataSource.getActiveChainsSync()).toStrictEqual([CHAIN_POLYGON]);
      expect(onActiveChainsUpdated).toHaveBeenCalledWith(
        'AccountActivityDataSource',
        [CHAIN_POLYGON],
        [CHAIN_MAINNET, CHAIN_POLYGON],
      );
    });

    it('acts on non-EVM namespaces such as solana', () => {
      const { dataSource, triggerStatusChanged } = setup();

      triggerStatusChanged({ chainIds: [CHAIN_SOLANA], status: 'up' });

      expect(dataSource.getActiveChainsSync()).toStrictEqual([CHAIN_SOLANA]);
    });

    it('filters out identifiers that are not valid CAIP-2 chain IDs', () => {
      const { dataSource, onActiveChainsUpdated, triggerStatusChanged } =
        setup();

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
    });

    it('does nothing when there are no valid chains', () => {
      const { dataSource, onActiveChainsUpdated, triggerStatusChanged } =
        setup();

      triggerStatusChanged({ chainIds: ['not-a-chain'], status: 'up' });

      expect(dataSource.getActiveChainsSync()).toStrictEqual([]);
      expect(onActiveChainsUpdated).not.toHaveBeenCalled();
    });

    it('does not notify listeners when the active chains do not change', () => {
      const { onActiveChainsUpdated, triggerStatusChanged } = setup({
        state: { activeChains: [CHAIN_MAINNET] },
      });

      triggerStatusChanged({ chainIds: [CHAIN_MAINNET], status: 'up' });

      expect(onActiveChainsUpdated).not.toHaveBeenCalled();
    });

    it('swallows errors thrown while handling the event', () => {
      const onActiveChainsUpdated = vi.fn().mockImplementation(() => {
        throw new Error('listener boom');
      });
      const { triggerStatusChanged } = setup({
        onActiveChainsUpdated,
      });

      expect(() =>
        triggerStatusChanged({ chainIds: [CHAIN_MAINNET], status: 'up' }),
      ).not.toThrow();
    });
  });

  describe('destroy', () => {
    it('does not throw and clears internal subscriptions', () => {
      const { dataSource } = setup();

      expect(() => dataSource.destroy()).not.toThrow();
    });

    it('can be called multiple times safely', () => {
      const { dataSource } = setup();

      expect(() => {
        dataSource.destroy();
        dataSource.destroy();
      }).not.toThrow();
    });

    it('stops handling balanceUpdated events once destroyed', () => {
      const { dataSource, onAssetsUpdate, triggerBalanceUpdated } = setup({
        groupAccounts: [createMockAccount()],
      });

      dataSource.destroy();

      triggerBalanceUpdated({
        address: EVM_ADDRESS,
        chain: CHAIN_MAINNET,
        updates: [createBalanceUpdate()],
      });

      expect(onAssetsUpdate).not.toHaveBeenCalled();
    });

    it('stops handling statusChanged events once destroyed', () => {
      const { dataSource, onActiveChainsUpdated, triggerStatusChanged } =
        setup();

      dataSource.destroy();

      triggerStatusChanged({
        chainIds: [CHAIN_MAINNET],
        status: 'up',
      });

      expect(onActiveChainsUpdated).not.toHaveBeenCalled();
    });
  });

  describe('createAccountActivityDataSource', () => {
    it('returns an AccountActivityDataSource instance', () => {
      const { rootMessenger, assetsControllerMessenger } =
        createMockMessengers();

      const dataSource = createAccountActivityDataSource({
        messenger: assetsControllerMessenger,
        onActiveChainsUpdated: vi.fn(),
        onAssetsUpdate: vi.fn(),
      });

      teardowns.push(() => {
        dataSource.destroy();
        rootMessenger.clearSubscriptions();
      });

      expect(dataSource).toBeInstanceOf(AccountActivityDataSource);
    });
  });
});
