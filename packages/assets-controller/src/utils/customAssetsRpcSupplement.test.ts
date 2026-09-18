import type { Caip19AssetId, ChainId } from '../types.js';
import { pickRpcCustomAssetsSupplement } from './customAssetsRpcSupplement.js';

const MAINNET = 'eip155:1' as ChainId;
const POLYGON = 'eip155:137' as ChainId;
const OPTIMISM = 'eip155:10' as ChainId;
const SOLANA = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as ChainId;

const WETH_MAINNET =
  'eip155:1/erc20:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' as Caip19AssetId;
const USDC_MAINNET =
  'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Caip19AssetId;
const USDC_POLYGON =
  'eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359' as Caip19AssetId;
const TOKEN_OPTIMISM =
  'eip155:10/erc20:0x4200000000000000000000000000000000000042' as Caip19AssetId;
const SOLANA_TOKEN =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' as Caip19AssetId;

const ACCOUNT_A = 'account-a';
const ACCOUNT_B = 'account-b';

describe('pickRpcCustomAssetsSupplement', () => {
  describe('the core invariant — customAssets must always be fetched by RPC', () => {
    it('picks a chain claimed by AccountsApi/Websocket as long as the user has a customAsset there', () => {
      // Mainnet has been claimed by another data source (AccountsApi or
      // Websocket), so it is NOT in `rpcAssignedChains`. The user has a
      // customAsset on mainnet — RPC must run a supplemental sub.
      const result = pickRpcCustomAssetsSupplement({
        accountIds: [ACCOUNT_A],
        customAssetsByAccount: {
          [ACCOUNT_A]: [WETH_MAINNET],
        },
        rpcAssignedChains: new Set<ChainId>(),
        rpcAvailableChains: new Set([MAINNET, POLYGON]),
        enabledChains: new Set([MAINNET, POLYGON]),
      });

      expect(result.chains).toStrictEqual([MAINNET]);
      expect([...result.accountIds]).toStrictEqual([ACCOUNT_A]);
    });

    it('picks every chain that has a customAsset across all selected accounts', () => {
      const result = pickRpcCustomAssetsSupplement({
        accountIds: [ACCOUNT_A, ACCOUNT_B],
        customAssetsByAccount: {
          [ACCOUNT_A]: [WETH_MAINNET, USDC_POLYGON],
          [ACCOUNT_B]: [TOKEN_OPTIMISM],
        },
        rpcAssignedChains: new Set<ChainId>(),
        rpcAvailableChains: new Set([MAINNET, POLYGON, OPTIMISM]),
        enabledChains: new Set([MAINNET, POLYGON, OPTIMISM]),
      });

      expect(new Set(result.chains)).toStrictEqual(
        new Set([MAINNET, POLYGON, OPTIMISM]),
      );
      expect(result.accountIds).toStrictEqual(new Set([ACCOUNT_A, ACCOUNT_B]));
    });

    it('deduplicates a chain when multiple accounts have customAssets there', () => {
      const result = pickRpcCustomAssetsSupplement({
        accountIds: [ACCOUNT_A, ACCOUNT_B],
        customAssetsByAccount: {
          [ACCOUNT_A]: [WETH_MAINNET],
          [ACCOUNT_B]: [USDC_MAINNET],
        },
        rpcAssignedChains: new Set<ChainId>(),
        rpcAvailableChains: new Set([MAINNET]),
        enabledChains: new Set([MAINNET]),
      });

      expect(result.chains).toStrictEqual([MAINNET]);
      expect(result.accountIds).toStrictEqual(new Set([ACCOUNT_A, ACCOUNT_B]));
    });
  });

  describe('skip rules', () => {
    it('skips a chain that the regular RPC subscription already covers', () => {
      // The regular RPC sub already fetches customAssets for `MAINNET`
      // (see BalanceFetcher#getAssetsToFetch), so a supplemental sub would
      // double-poll. Skip.
      const result = pickRpcCustomAssetsSupplement({
        accountIds: [ACCOUNT_A],
        customAssetsByAccount: {
          [ACCOUNT_A]: [WETH_MAINNET],
        },
        rpcAssignedChains: new Set([MAINNET]),
        rpcAvailableChains: new Set([MAINNET]),
        enabledChains: new Set([MAINNET]),
      });

      expect(result.chains).toStrictEqual([]);
    });

    it('skips a chain RPC cannot serve (no NetworkController config for it)', () => {
      const result = pickRpcCustomAssetsSupplement({
        accountIds: [ACCOUNT_A],
        customAssetsByAccount: {
          [ACCOUNT_A]: [WETH_MAINNET],
        },
        rpcAssignedChains: new Set<ChainId>(),
        rpcAvailableChains: new Set<ChainId>(),
        enabledChains: new Set([MAINNET]),
      });

      expect(result.chains).toStrictEqual([]);
    });

    it('skips a chain that is currently disabled', () => {
      // The chain is RPC-supported and not RPC-assigned, but the user has
      // disabled it — there is no UI surface that shows its balances, so
      // polling would waste resources.
      const result = pickRpcCustomAssetsSupplement({
        accountIds: [ACCOUNT_A],
        customAssetsByAccount: {
          [ACCOUNT_A]: [WETH_MAINNET],
        },
        rpcAssignedChains: new Set<ChainId>(),
        rpcAvailableChains: new Set([MAINNET]),
        enabledChains: new Set<ChainId>(),
      });

      expect(result.chains).toStrictEqual([]);
    });

    it('skips an account with no customAssets', () => {
      const result = pickRpcCustomAssetsSupplement({
        accountIds: [ACCOUNT_A, ACCOUNT_B],
        customAssetsByAccount: {
          [ACCOUNT_A]: [],
          [ACCOUNT_B]: [WETH_MAINNET],
        },
        rpcAssignedChains: new Set<ChainId>(),
        rpcAvailableChains: new Set([MAINNET]),
        enabledChains: new Set([MAINNET]),
      });

      expect(result.chains).toStrictEqual([MAINNET]);
      expect(result.accountIds).toStrictEqual(new Set([ACCOUNT_B]));
    });

    it('skips an account that is not in the selected accountIds list', () => {
      // Even though state.customAssets has entries for ACCOUNT_B, the caller
      // only selected ACCOUNT_A. ACCOUNT_B's customAssets are ignored.
      const result = pickRpcCustomAssetsSupplement({
        accountIds: [ACCOUNT_A],
        customAssetsByAccount: {
          [ACCOUNT_A]: [],
          [ACCOUNT_B]: [WETH_MAINNET],
        },
        rpcAssignedChains: new Set<ChainId>(),
        rpcAvailableChains: new Set([MAINNET]),
        enabledChains: new Set([MAINNET]),
      });

      expect(result.chains).toStrictEqual([]);
      expect(result.accountIds).toStrictEqual(new Set());
    });

    it('skips a malformed CAIP-19 asset ID without throwing', () => {
      const result = pickRpcCustomAssetsSupplement({
        accountIds: [ACCOUNT_A],
        customAssetsByAccount: {
          [ACCOUNT_A]: ['not-a-caip-19-id' as Caip19AssetId, WETH_MAINNET],
        },
        rpcAssignedChains: new Set<ChainId>(),
        rpcAvailableChains: new Set([MAINNET]),
        enabledChains: new Set([MAINNET]),
      });

      expect(result.chains).toStrictEqual([MAINNET]);
    });
  });

  describe('chain-namespace coverage', () => {
    it('picks non-EVM chains too — the helper is namespace-agnostic', () => {
      // The graduation middleware only graduates EVM customAssets, but the
      // supplemental RPC fetch is conceptually independent: any chain RPC
      // can serve and the user has imported a token on, gets supplemented.
      // Solana is a hypothetical future case; today RPC reports it inactive
      // so this test exists to document the invariant rather than gate
      // production behavior.
      const result = pickRpcCustomAssetsSupplement({
        accountIds: [ACCOUNT_A],
        customAssetsByAccount: {
          [ACCOUNT_A]: [SOLANA_TOKEN],
        },
        rpcAssignedChains: new Set<ChainId>(),
        rpcAvailableChains: new Set([SOLANA]),
        enabledChains: new Set([SOLANA]),
      });

      expect(result.chains).toStrictEqual([SOLANA]);
    });
  });

  describe('mixed scenarios that exercise multiple rules at once', () => {
    it('picks one chain and skips another for the same account', () => {
      // ACCOUNT_A holds:
      //   - WETH_MAINNET   → RPC supplement picks it (claimed by API/WS).
      //   - USDC_POLYGON   → regular RPC sub already covers it. Skip.
      //   - TOKEN_OPTIMISM → RPC doesn't support optimism here. Skip.
      const result = pickRpcCustomAssetsSupplement({
        accountIds: [ACCOUNT_A],
        customAssetsByAccount: {
          [ACCOUNT_A]: [WETH_MAINNET, USDC_POLYGON, TOKEN_OPTIMISM],
        },
        rpcAssignedChains: new Set([POLYGON]),
        rpcAvailableChains: new Set([MAINNET, POLYGON]),
        enabledChains: new Set([MAINNET, POLYGON, OPTIMISM]),
      });

      expect(result.chains).toStrictEqual([MAINNET]);
      expect(result.accountIds).toStrictEqual(new Set([ACCOUNT_A]));
    });

    it('returns empty when every customAsset is filtered out', () => {
      const result = pickRpcCustomAssetsSupplement({
        accountIds: [ACCOUNT_A],
        customAssetsByAccount: {
          [ACCOUNT_A]: [WETH_MAINNET, USDC_POLYGON],
        },
        rpcAssignedChains: new Set([MAINNET, POLYGON]),
        rpcAvailableChains: new Set([MAINNET, POLYGON]),
        enabledChains: new Set([MAINNET, POLYGON]),
      });

      expect(result.chains).toStrictEqual([]);
      // The account is still listed (the controller's empty-chains
      // early-return prevents any subscription anyway).
      expect(result.accountIds).toStrictEqual(new Set([ACCOUNT_A]));
    });

    it('returns empty when no accounts are passed in', () => {
      const result = pickRpcCustomAssetsSupplement({
        accountIds: [],
        customAssetsByAccount: {
          [ACCOUNT_A]: [WETH_MAINNET],
        },
        rpcAssignedChains: new Set<ChainId>(),
        rpcAvailableChains: new Set([MAINNET]),
        enabledChains: new Set([MAINNET]),
      });

      expect(result.chains).toStrictEqual([]);
      expect(result.accountIds).toStrictEqual(new Set());
    });
  });
});
