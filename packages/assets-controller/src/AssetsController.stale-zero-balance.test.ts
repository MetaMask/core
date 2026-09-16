/**
 * Repro for the polling half of ASSETS-3856: a token whose on-chain balance
 * drops to zero must not keep its stale balance in AssetsController state.
 *
 * The Accounts API reports a zero balance by omission — a token the account
 * no longer holds is absent from balance responses rather than returned with
 * balance "0". Subscription poll responses are applied with
 * `updateMode: 'merge'` and no `replaceCoveredChainBalances`, so the merge
 * (an object spread that can only add or overwrite keys) never touches the
 * omitted token and its stale balance survives every poll cycle until an app
 * restart.
 *
 * The first test asserts the DESIRED behavior and therefore FAILS on current
 * code — it becomes the regression test once a fix lands. The second test
 * (explicit zero through the same pipeline) passes today, proving the
 * pipeline works and isolating the defect to omission handling.
 *
 * The scenario mirrors the ticket: an account on Linea max-swaps its USDC to
 * USDT, after which the live Accounts API returns only ETH and USDT — USDC is
 * omitted entirely. These tests drive the real subscription pipeline (unlock,
 * startup fetch, and the AccountsApiDataSource poll) against a mocked
 * Accounts API client, and assert on resulting controller state.
 */
import type { ApiPlatformClient, V5BalanceItem } from '@metamask/core-backend';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import { AssetsController } from './AssetsController.js';
import type { AssetsControllerMessenger } from './AssetsController.js';
import type { Caip19AssetId } from './types.js';

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<AssetsControllerMessenger>,
  MessengerEvents<AssetsControllerMessenger>
>;

const ACCOUNT_ID = 'mock-account-id-1';
const ACCOUNT_ADDRESS = '0x1234567890123456789012345678901234567890';

const LINEA = 'eip155:59144';

// Linea USDC / USDT. The API sends lower-case addresses; state keys assets by
// their checksummed ID (normalizeAssetId).
const USDC =
  `${LINEA}/erc20:0x176211869cA2b568f2A7D4EE941E073a821EE1ff` as Caip19AssetId;
const USDC_LOWERCASE =
  `${LINEA}/erc20:0x176211869ca2b568f2a7d4ee941e073a821ee1ff` as Caip19AssetId;
const USDT =
  `${LINEA}/erc20:0xA219439258ca9da29E9Cc4cE5596924745e12B93` as Caip19AssetId;
const USDT_LOWERCASE =
  `${LINEA}/erc20:0xa219439258ca9da29e9cc4ce5596924745e12b93` as Caip19AssetId;
const ETH = `${LINEA}/slip44:60` as Caip19AssetId;

const ETH_ITEM: V5BalanceItem = {
  object: 'token',
  symbol: 'ETH',
  name: 'Ether',
  type: 'native',
  decimals: 18,
  assetId: ETH,
  balance: '1',
  accountId: `${LINEA}:${ACCOUNT_ADDRESS}`,
};

const USDC_ITEM: V5BalanceItem = {
  object: 'token',
  symbol: 'USDC',
  name: 'USD Coin',
  type: 'erc20',
  decimals: 6,
  assetId: USDC_LOWERCASE,
  balance: '100',
  accountId: `${LINEA}:${ACCOUNT_ADDRESS}`,
};

const USDT_ITEM: V5BalanceItem = {
  object: 'token',
  symbol: 'USDT',
  name: 'Tether USD',
  type: 'erc20',
  decimals: 6,
  assetId: USDT_LOWERCASE,
  balance: '5',
  accountId: `${LINEA}:${ACCOUNT_ADDRESS}`,
};

/**
 * Let pending microtasks and fire-and-forget pipelines settle.
 *
 * @returns A promise that resolves after pending callbacks.
 */
async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/**
 * Wait until the condition holds, or give up after ~1.5s so the test's own
 * assertions report expected vs. actual.
 *
 * @param condition - Condition to wait for.
 */
async function waitUntil(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await flushPromises();
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/**
 * Root messenger with stubs for the wallet controllers AssetsController
 * delegates to. One enabled chain (Linea), one account.
 *
 * @returns The root messenger.
 */
function createMessenger(): RootMessenger {
  const account = {
    id: ACCOUNT_ID,
    address: ACCOUNT_ADDRESS,
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: [LINEA],
    metadata: {
      name: 'Test Account',
      keyring: { type: 'HD Key Tree' },
      importTime: Date.now(),
      lastSelected: Date.now(),
    },
  } as InternalAccount;

  const messenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  const register = (
    messenger as unknown as {
      registerActionHandler: (action: string, handler: () => unknown) => void;
    }
  ).registerActionHandler.bind(messenger);

  register('AccountsController:getSelectedAccount', () => account);
  register('AccountTreeController:getAccountsFromSelectedAccountGroup', () => [
    account,
  ]);
  register('NetworkEnablementController:getState', () => ({
    enabledNetworkMap: { eip155: { '59144': true } },
    nativeAssetIdentifiers: { [LINEA]: ETH },
  }));
  register('NetworkController:getState', () => ({
    networkConfigurationsByChainId: {},
    networksMetadata: {},
  }));
  register('NetworkController:getNetworkClientById', () => ({ provider: {} }));
  register('ClientController:getState', () => ({ isUiOpen: true }));
  register('RemoteFeatureFlagController:getState', () => ({
    remoteFeatureFlags: {},
    cacheTimestamp: 0,
  }));

  return messenger;
}

/**
 * Start asset tracking the way the wallet does: UI open, keyring unlocked,
 * account tree initialized.
 *
 * @param messenger - The root messenger.
 */
async function startTracking(messenger: RootMessenger): Promise<void> {
  (
    messenger as unknown as {
      publish: (topic: string, payload?: unknown) => void;
    }
  ).publish('ClientController:stateChange', { isUiOpen: true });
  messenger.publish('KeyringController:unlock');
  (messenger.publish as CallableFunction)(
    'AccountTreeController:initialized',
    {},
  );
  await flushPromises();
}

describe('AssetsController stale zero-balance regression (ASSETS-3856)', () => {
  let controller: AssetsController;

  // What the mocked balances endpoint currently returns. Tests reassign this
  // to simulate the account's holdings changing after the swap.
  let apiBalances: V5BalanceItem[];
  let fetchBalances: jest.Mock;

  const usdcInState = (): string | undefined =>
    controller.state.assetsBalance[ACCOUNT_ID]?.[USDC]?.amount;

  beforeEach(async () => {
    apiBalances = [ETH_ITEM, USDC_ITEM, USDT_ITEM];
    fetchBalances = jest.fn(async () => ({
      count: apiBalances.length,
      unprocessedNetworks: [],
      balances: apiBalances,
    }));

    // Mock ApiPlatformClient, following the pattern used by the main
    // AssetsController suite. Only the Accounts API endpoints the balance
    // pipeline needs are implemented; everything else is absent and the
    // controller's error handling tolerates it.
    const queryApiClient = {
      getCachedData: jest.fn(),
      setCachedData: jest.fn(),
      queryClient: { fetchQuery: jest.fn().mockResolvedValue({}) },
      accounts: {
        fetchV2SupportedNetworks: jest.fn().mockResolvedValue({
          fullSupport: [59144],
          partialSupport: { balances: [] },
        }),
        fetchV5MultiAccountBalances: fetchBalances,
      },
    } as unknown as ApiPlatformClient;

    const messenger = createMessenger();
    controller = new AssetsController({
      messenger: messenger as unknown as AssetsControllerMessenger,
      state: {
        // Pre-swap state: the account holds 1 ETH, 100 USDC, and 5 USDT.
        assetsBalance: {
          [ACCOUNT_ID]: {
            [ETH]: { amount: '1' },
            [USDC]: { amount: '100' },
            [USDT]: { amount: '5' },
          },
        },
        assetsInfo: {
          [ETH]: { type: 'native', symbol: 'ETH', name: 'Ether', decimals: 18 },
          [USDC]: {
            type: 'erc20',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
          },
          [USDT]: {
            type: 'erc20',
            symbol: 'USDT',
            name: 'Tether USD',
            decimals: 6,
          },
        },
      },
      queryApiClient,
      isBasicFunctionality: (): boolean => true,
      subscribeToBasicFunctionalityChange: (): void => undefined,
      // Paces the AccountsApiDataSource subscription poll, so "30s" poll
      // cycles happen every 100ms in this test.
      defaultUpdateInterval: 100,
    });

    // Unlock -> startup fetch confirms the pre-swap holdings.
    await startTracking(messenger);
    await waitUntil(
      () => fetchBalances.mock.calls.length >= 1 && usdcInState() === '100',
    );
    if (usdcInState() !== '100') {
      throw new Error('Setup failed: pre-swap USDC balance was not confirmed');
    }
  });

  afterEach(async () => {
    await flushPromises();
    controller.destroy();
  });

  it('clears a token balance when the token disappears from poll responses', async () => {
    // The user max-swaps all USDC -> USDT. The Accounts API now omits USDC
    // entirely — verified against the live API for the ticket's account:
    // zero-balance tokens are absent from the response, not returned as "0".
    apiBalances = [ETH_ITEM, { ...USDT_ITEM, balance: '105' }];
    const callsBeforeSwap = fetchBalances.mock.calls.length;

    // Poll cycles run against the post-swap API...
    await waitUntil(
      () =>
        fetchBalances.mock.calls.length > callsBeforeSwap &&
        usdcInState() === undefined,
    );
    // ...and at least one demonstrably fetched the USDC-less response:
    expect(fetchBalances.mock.calls.length).toBeGreaterThan(callsBeforeSwap);

    // DESIRED: state converges to the on-chain truth — the omitted token is
    // cleared and the swap proceeds are applied.
    // ACTUAL (bug): the poll's merge spread can only add or overwrite keys,
    // so the omitted token is never touched and the stale "100" survives
    // every poll cycle until app restart.
    expect(usdcInState() ?? '0').toBe('0');
    expect(controller.state.assetsBalance[ACCOUNT_ID]?.[USDT]?.amount).toBe(
      '105',
    );
  });

  it('applies an explicit zero balance arriving through the same poll pipeline', async () => {
    // Same flow with the API reporting USDC as an explicit "0" — guards the
    // ordinary zero-handling path alongside the omission path above.
    apiBalances = [
      ETH_ITEM,
      { ...USDC_ITEM, balance: '0' },
      { ...USDT_ITEM, balance: '105' },
    ];
    const callsBeforeSwap = fetchBalances.mock.calls.length;

    await waitUntil(
      () =>
        fetchBalances.mock.calls.length > callsBeforeSwap &&
        usdcInState() === '0',
    );
    expect(usdcInState()).toBe('0');
  });
});
