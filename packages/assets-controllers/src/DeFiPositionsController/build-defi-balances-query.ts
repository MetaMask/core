import { isEvmAccountType, SolAccountType, SolScope } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { CaipAccountId, CaipChainId } from '@metamask/utils';
import { KnownCaipNamespace, toCaipAccountId } from '@metamask/utils';

/**
 * Networks the DeFi balances (v6 multiaccount) endpoint supports.
 */
export const DEFI_SUPPORTED_NETWORKS = [
  'eip155:1',
  'eip155:137',
  'eip155:56',
  'eip155:1329',
  'eip155:43114',
  'eip155:59144',
  'eip155:8453',
  'eip155:10',
  'eip155:42161',
  'eip155:143',
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'eip155:999',
  'eip155:5042',
] as const satisfies readonly CaipChainId[];

const SOLANA_MAINNET_CAIP_CHAIN_ID = SolScope.Mainnet as CaipChainId;

/**
 * Fixed request flags used against the v6 multiaccount balances endpoint so the
 * response only carries what the DeFi views need (positions + prices).
 */
export const DEFI_BALANCES_V6_REQUEST_OPTIONS = {
  includeDeFiBalances: true,
  forceFetchDeFiPositions: true,
  includePrices: true,
  vsCurrency: 'usd',
} as const;

/**
 * A single account to query, pairing the CAIP-10 ID sent to the API with the
 * internal MetaMask account ID (`InternalAccount.id`) used to key state.
 */
export type DeFiBalanceAccountQuery = {
  caipAccountId: CaipAccountId;
  internalAccountId: string;
};

export type DeFiBalancesQuery = {
  /** Per-account entries linking CAIP-10 IDs to internal account IDs. */
  accounts: DeFiBalanceAccountQuery[];
  /** CAIP-10 account IDs to query (EVM and/or Solana). */
  accountIds: CaipAccountId[];
  /** CAIP-2 networks to query, deduped across accounts. */
  networks: CaipChainId[];
};

/**
 * Builds an EVM CAIP-10 account ID that spans every EVM chain (reference `0`).
 *
 * @param address - The EVM account address.
 * @returns The CAIP-10 account ID for the address.
 */
function toEvmCaipAccountId(address: string): CaipAccountId {
  return toCaipAccountId(KnownCaipNamespace.Eip155, '0', address);
}

/**
 * Normalizes a CAIP-10 account ID for case-insensitive matching. EVM addresses
 * are case-insensitive, so `eip155:*` IDs are lowercased; other namespaces
 * (e.g. Solana, whose base58 addresses are case-sensitive) are left as-is. Used
 * to match the CAIP IDs the v6 API echoes back to the ones we sent.
 *
 * @param caipAccountId - The CAIP-10 account ID.
 * @returns The normalized account ID.
 */
export function normalizeCaipAccountId(caipAccountId: string): string {
  return caipAccountId.startsWith(`${KnownCaipNamespace.Eip155}:`)
    ? caipAccountId.toLowerCase()
    : caipAccountId;
}

/**
 * Builds the account IDs and networks to request DeFi positions for, from the
 * accounts in the selected account group.
 *
 * Picks the group's EVM account (queried across all supported EVM chains) and
 * its Solana account (queried on supported Solana chains). Enabled-network
 * filtering is intentionally omitted here: positions are stored per chain, so
 * the client can filter by enabled networks when reading state.
 *
 * @param internalAccounts - Accounts belonging to the selected account group.
 * @param supportedNetworks - Networks supported by the DeFi balances API.
 * @returns Account IDs and networks for the v6 multiaccount balances request.
 */
export function buildDeFiBalancesQuery(
  internalAccounts: InternalAccount[],
  supportedNetworks: readonly CaipChainId[] = DEFI_SUPPORTED_NETWORKS,
): DeFiBalancesQuery {
  const evmNetworks = supportedNetworks.filter((network) =>
    network.startsWith(`${KnownCaipNamespace.Eip155}:`),
  );
  const solanaNetworks = supportedNetworks.filter((network) =>
    network.startsWith(`${KnownCaipNamespace.Solana}:`),
  );

  const accounts: DeFiBalanceAccountQuery[] = [];
  const networks: CaipChainId[] = [];

  const evmAccount = internalAccounts.find((account) =>
    isEvmAccountType(account.type),
  );
  if (evmAccount && evmNetworks.length > 0) {
    accounts.push({
      caipAccountId: toEvmCaipAccountId(evmAccount.address),
      internalAccountId: evmAccount.id,
    });
    networks.push(...evmNetworks);
  }

  const solanaAccount = internalAccounts.find(
    (account) => account.type === SolAccountType.DataAccount,
  );
  if (solanaAccount && solanaNetworks.length > 0) {
    const [, solanaReference] = SOLANA_MAINNET_CAIP_CHAIN_ID.split(':');

    accounts.push({
      caipAccountId: toCaipAccountId(
        KnownCaipNamespace.Solana,
        solanaReference,
        solanaAccount.address,
      ),
      internalAccountId: solanaAccount.id,
    });
    networks.push(...solanaNetworks);
  }

  return {
    accounts,
    accountIds: accounts.map((account) => account.caipAccountId),
    networks: [...new Set(networks)] as CaipChainId[],
  };
}
