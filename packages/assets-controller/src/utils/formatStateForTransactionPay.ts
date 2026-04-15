import { toChecksumAddress } from '@ethereumjs/util';
import { numberToHex } from '@metamask/utils';
import { parseCaipAssetType, parseCaipChainId } from '@metamask/utils';

import type {
  AssetBalance,
  AssetMetadata,
  AssetPrice,
  Caip19AssetId,
} from '../types';
import { formatExchangeRatesForBridge } from './formatExchangeRatesForBridge';
import type { BridgeExchangeRatesFormat } from './formatExchangeRatesForBridge';

/** Account with id and address for mapping state to legacy format. */
export type AccountForLegacyFormat = { id: string; address: string };

/**
 * Legacy Token shape expected by TokensController / transaction-pay-controller.
 */
export type LegacyToken = {
  address: string;
  decimals: number;
  symbol: string;
  name?: string;
  [key: string]: unknown;
};

/**
 * Legacy state shape that transaction-pay-controller reads from
 * TokenBalancesController, AccountTrackerController, TokensController,
 * TokenRatesController, and CurrencyRateController.
 */
export type TransactionPayLegacyFormat = {
  /** TokenBalancesController:getState().tokenBalances */
  tokenBalances: Record<string, Record<string, Record<string, `0x${string}`>>>;
  /** AccountTrackerController:getState().accountsByChainId */
  accountsByChainId: Record<
    string,
    Record<string, { balance: string; stakedBalance?: string }>
  >;
  /** TokensController:getState().allTokens (chainId -> key -> Token[]) */
  allTokens: Record<string, Record<string, LegacyToken[]>>;
  /** TokenRatesController:getState().marketData */
  marketData: BridgeExchangeRatesFormat['marketData'];
  /** CurrencyRateController:getState().currencyRates */
  currencyRates: BridgeExchangeRatesFormat['currencyRates'];
  /** CurrencyRateController:getState().currentCurrency */
  currentCurrency: string;
};

function amountToHex(amount: string): `0x${string}` {
  const hexString = BigInt(amount).toString(16);
  return `0x${hexString}`;
}

function getAmountFromBalance(balance: AssetBalance): string {
  return typeof balance === 'object' && balance !== null && 'amount' in balance
    ? String((balance as { amount: string }).amount)
    : '0';
}

/**
 * Converts AssetsController state into the legacy format consumed by
 * transaction-pay-controller (TokenBalancesController, AccountTrackerController,
 * TokensController, TokenRatesController, CurrencyRateController shapes).
 *
 * @param params - Conversion parameters.
 * @param params.assetsBalance - Per-account balances by asset ID.
 * @param params.assetsInfo - Metadata by asset ID.
 * @param params.assetsPrice - Prices by asset ID.
 * @param params.selectedCurrency - Current currency code.
 * @param params.accounts - List of accounts (id + address) to map state for.
 * @param params.nativeAssetIdentifiers - Optional CAIP-2 chain ID to native asset ID.
 * @param params.networkConfigurationsByChainId - Optional chain ID to network config (for native symbol).
 * @returns Legacy-compatible state for transaction-pay-controller.
 */
export function formatStateForTransactionPay(params: {
  assetsBalance: Record<string, Record<string, AssetBalance>>;
  assetsInfo: Record<string, AssetMetadata>;
  assetsPrice: Record<string, AssetPrice>;
  selectedCurrency: string;
  accounts: AccountForLegacyFormat[];
  nativeAssetIdentifiers?: Record<string, string>;
  networkConfigurationsByChainId?: Record<string, { nativeCurrency?: string }>;
}): TransactionPayLegacyFormat {
  const {
    assetsBalance,
    assetsInfo,
    assetsPrice,
    selectedCurrency,
    accounts,
    nativeAssetIdentifiers = {},
    networkConfigurationsByChainId = {},
  } = params;

  const tokenBalances: TransactionPayLegacyFormat['tokenBalances'] = {};
  const accountsByChainId: TransactionPayLegacyFormat['accountsByChainId'] = {};
  const allTokensByChain: Record<string, LegacyToken[]> = {};

  for (const account of accounts) {
    const accountAddressLower = account.address.toLowerCase();
    const accountBalances = assetsBalance[account.id];
    if (!accountBalances) {
      continue;
    }

    for (const [assetId, balance] of Object.entries(accountBalances)) {
      try {
        const parsed = parseCaipAssetType(assetId as Caip19AssetId);
        const chainIdParsed = parseCaipChainId(parsed.chainId);
        if (chainIdParsed.namespace !== 'eip155') {
          continue;
        }
        const chainIdHex = numberToHex(parseInt(chainIdParsed.reference, 10));
        const amount = getAmountFromBalance(balance);
        const balanceHex = amountToHex(amount);

        if (parsed.assetNamespace === 'slip44') {
          const nativeAddress =
            '0x0000000000000000000000000000000000000000' as const;
          const checksumAddress = toChecksumAddress(account.address);
          tokenBalances[accountAddressLower] ??= {};
          tokenBalances[accountAddressLower][chainIdHex] ??= {};
          tokenBalances[accountAddressLower][chainIdHex][nativeAddress] =
            balanceHex;
          accountsByChainId[chainIdHex] ??= {};
          accountsByChainId[chainIdHex][checksumAddress] = {
            balance: balanceHex,
          };
        } else if (parsed.assetNamespace === 'erc20') {
          const tokenAddress = toChecksumAddress(String(parsed.assetReference));
          tokenBalances[accountAddressLower] ??= {};
          tokenBalances[accountAddressLower][chainIdHex] ??= {};
          tokenBalances[accountAddressLower][chainIdHex][tokenAddress] =
            balanceHex;
        }
      } catch {
        // Skip malformed asset IDs
      }
    }
  }

  for (const [assetId, metadata] of Object.entries(assetsInfo)) {
    try {
      const parsed = parseCaipAssetType(assetId as Caip19AssetId);
      const chainIdParsed = parseCaipChainId(parsed.chainId);
      if (chainIdParsed.namespace !== 'eip155') {
        continue;
      }
      const chainIdHex = numberToHex(parseInt(chainIdParsed.reference, 10));
      const address =
        parsed.assetNamespace === 'slip44'
          ? '0x0000000000000000000000000000000000000000'
          : toChecksumAddress(String(parsed.assetReference));
      const token: LegacyToken = {
        address,
        decimals: metadata.decimals,
        symbol: metadata.symbol,
        name: metadata.name,
      };
      allTokensByChain[chainIdHex] ??= [];
      if (
        !allTokensByChain[chainIdHex].some(
          (existing) =>
            existing.address.toLowerCase() === address.toLowerCase(),
        )
      ) {
        allTokensByChain[chainIdHex].push(token);
      }
    } catch {
      // Skip malformed asset IDs
    }
  }

  const allTokens: TransactionPayLegacyFormat['allTokens'] = {};
  for (const [chainId, tokens] of Object.entries(allTokensByChain)) {
    allTokens[chainId] = { '': tokens };
  }

  const exchangeRates = formatExchangeRatesForBridge({
    assetsPrice,
    selectedCurrency,
    nativeAssetIdentifiers,
    networkConfigurationsByChainId,
  });

  return {
    tokenBalances,
    accountsByChainId,
    allTokens,
    marketData: exchangeRates.marketData,
    currencyRates: exchangeRates.currencyRates,
    currentCurrency: exchangeRates.currentCurrency,
  };
}
