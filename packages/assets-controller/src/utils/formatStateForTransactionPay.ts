import { toChecksumAddress } from '@ethereumjs/util';
import { getNativeTokenAddress } from '@metamask/assets-controllers';
import { numberToHex } from '@metamask/utils';
import { parseCaipAssetType, parseCaipChainId } from '@metamask/utils';
import { isEqual } from 'lodash';

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

/** Parameters accepted by {@link formatStateForTransactionPay}. */
export type FormatStateForTransactionPayParams = {
  assetsBalance: Record<string, Record<string, AssetBalance>>;
  assetsInfo: Record<string, AssetMetadata>;
  assetsPrice: Record<string, AssetPrice>;
  selectedCurrency: string;
  accounts: AccountForLegacyFormat[];
  nativeAssetIdentifiers: Record<string, string>;
  networkConfigurationsByChainId?: Record<string, { nativeCurrency?: string }>;
};

let lastCall: {
  params: FormatStateForTransactionPayParams;
  result: TransactionPayLegacyFormat;
} | null = null;

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
 * Memoized on input identity for BaseController state slices (`===`) and
 * lodash `isEqual` for rebuilt arrays/maps (`accounts`, `nativeAssetIdentifiers`).
 * `AssetsController:getStateForTransactionPay` is invoked on every
 * `TransactionController:stateChange` while its inputs only change when the
 * assets pipeline updates; recomputing runs keccak256 (`toChecksumAddress`) and
 * CAIP parsing per asset.
 *
 * @param params - Conversion parameters.
 * @returns Legacy-compatible state for transaction-pay-controller.
 */
export function formatStateForTransactionPay(
  params: FormatStateForTransactionPayParams,
): TransactionPayLegacyFormat {
  if (
    lastCall?.params.assetsBalance === params.assetsBalance &&
    lastCall.params.assetsInfo === params.assetsInfo &&
    lastCall.params.assetsPrice === params.assetsPrice &&
    lastCall.params.selectedCurrency === params.selectedCurrency &&
    lastCall.params.networkConfigurationsByChainId ===
      params.networkConfigurationsByChainId &&
    isEqual(lastCall.params.accounts, params.accounts) &&
    isEqual(
      lastCall.params.nativeAssetIdentifiers,
      params.nativeAssetIdentifiers,
    )
  ) {
    return lastCall.result;
  }

  const result = computeStateForTransactionPay(params);
  lastCall = { params, result };
  return result;
}

/**
 * Clears the {@link formatStateForTransactionPay} memoize cache. Exported for tests.
 */
export function clearFormatStateForTransactionPayCacheForTesting(): void {
  lastCall = null;
}

/**
 * Performs the actual legacy-format conversion for
 * {@link formatStateForTransactionPay}.
 *
 * @param params - Conversion parameters.
 * @returns Legacy-compatible state for transaction-pay-controller.
 */
function computeStateForTransactionPay(
  params: FormatStateForTransactionPayParams,
): TransactionPayLegacyFormat {
  const {
    assetsBalance,
    assetsInfo,
    assetsPrice,
    selectedCurrency,
    accounts,
    nativeAssetIdentifiers,
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

        if (assetsInfo[assetId]?.type === 'native') {
          const nativeAddress = toChecksumAddress(
            getNativeTokenAddress(chainIdHex),
          );
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
        metadata.type === 'native'
          ? getNativeTokenAddress(chainIdHex)
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
    assetsInfo,
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
