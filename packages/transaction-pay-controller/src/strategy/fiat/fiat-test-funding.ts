import { Interface } from '@ethersproject/abi';
import { ORIGIN_METAMASK, toHex } from '@metamask/controller-utils';
import type { RampsOrder } from '@metamask/ramps-controller';
import { RampsOrderStatus } from '@metamask/ramps-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type {
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { NATIVE_TOKEN_ADDRESS } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  TransactionPayControllerMessenger,
  TransactionPayFiatOptions,
  TransactionPayQuote,
} from '../../types';
import { getNetworkClientId } from '../../utils/provider';
import {
  buildCaipAssetType,
  getLiveTokenBalance,
  getNativeToken,
  getTokenInfo,
} from '../../utils/token';
import { waitForTransactionConfirmed } from '../../utils/transaction';
import { isDirectMusdMoneyAccountQuote } from './fiat-direct-musd';
import type { FiatQuote } from './types';
import { deriveFiatAssetForFiatPayment } from './utils';
import { getRawSourceAmountFromOrderCryptoAmount } from './utils';

const log = createModuleLogger(projectLogger, 'fiat-test-funding');
const TOKEN_TRANSFER_INTERFACE = new Interface([
  'function transfer(address to, uint256 amount)',
]);

/**
 * Funds the fiat recipient from a test source instead of waiting for ramps.
 *
 * @param options - Test funding options.
 * @param options.fiat - Fiat local-QA execution options.
 * @param options.messenger - Controller messenger.
 * @param options.quote - Fiat quote being submitted.
 * @param options.transaction - Original transaction metadata.
 * @returns A synthetic completed ramps order for the existing fiat submit flow.
 */
export async function fundFiatOrderFromTestSource({
  fiat,
  messenger,
  quote,
  transaction,
}: {
  fiat: TransactionPayFiatOptions;
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<FiatQuote>;
  transaction: TransactionMeta;
}): Promise<RampsOrder> {
  const fundingSource = fiat.testFundingSource;

  if (!fundingSource) {
    throw new Error('Missing fiat test funding source');
  }

  const isDirectMusd = isDirectMusdMoneyAccountQuote(quote);
  const fiatAsset = isDirectMusd
    ? {
        address: quote.request.sourceTokenAddress,
        chainId: quote.request.sourceChainId,
      }
    : deriveFiatAssetForFiatPayment(transaction, messenger);

  const recipient = getFiatFundingRecipient({ quote, transaction });
  const cryptoAmount =
    fiat.testAmountOverride ?? quote.original.rampsQuote.quote.amountOut;
  const tokenInfo = getTokenInfo(
    messenger,
    fiatAsset.address,
    fiatAsset.chainId,
  );

  if (!tokenInfo) {
    throw new Error(
      `Unable to resolve fiat test funding token info for ${fiatAsset.address} on chain ${fiatAsset.chainId}`,
    );
  }

  const amountRaw = getRawSourceAmountFromOrderCryptoAmount({
    cryptoAmount,
    decimals: tokenInfo.decimals,
  });

  log('Preparing fiat test funding transfer', {
    amountRaw,
    chainId: fiatAsset.chainId,
    fundingSource,
    recipient,
    testAmountOverride: fiat.testAmountOverride,
  });

  await assertTestFundingBalances({
    amountRaw,
    fiatAsset,
    fundingSource,
    messenger,
    symbol: tokenInfo.symbol,
  });

  const txHash = await submitTestFundingTransfer({
    amountRaw,
    fiatAsset,
    fundingSource,
    messenger,
    recipient,
  });

  log('Fiat test funding complete', {
    amountRaw,
    chainId: fiatAsset.chainId,
    fundingSource,
    recipient,
    txHash,
  });

  return {
    cryptoAmount,
    cryptoCurrency: {
      assetId: buildCaipAssetType(fiatAsset.chainId, fiatAsset.address),
      chainId: `eip155:${Number(fiatAsset.chainId)}`,
      symbol: tokenInfo.symbol,
    },
    status: RampsOrderStatus.Completed,
    txHash,
  } as RampsOrder;
}

function getFiatFundingRecipient({
  quote,
  transaction,
}: {
  quote: TransactionPayQuote<FiatQuote>;
  transaction: TransactionMeta;
}): Hex {
  if (isDirectMusdMoneyAccountQuote(quote)) {
    const moneyAccountAddress = transaction.txParams.from as Hex | undefined;

    if (!moneyAccountAddress) {
      throw new Error('Missing Money Account address for fiat test funding');
    }

    return moneyAccountAddress;
  }

  return quote.request.from;
}

async function assertTestFundingBalances({
  amountRaw,
  fiatAsset,
  fundingSource,
  messenger,
  symbol,
}: {
  amountRaw: string;
  fiatAsset: { address: Hex; chainId: Hex };
  fundingSource: Hex;
  messenger: TransactionPayControllerMessenger;
  symbol: string;
}): Promise<void> {
  const balance = await getLiveTokenBalance(
    messenger,
    fundingSource,
    fiatAsset.chainId,
    fiatAsset.address,
  );

  if (new BigNumber(balance).lt(amountRaw)) {
    throw new Error(
      `Fiat test funding source has insufficient ${symbol} on chain ${fiatAsset.chainId}. ` +
        `Required: ${amountRaw}, Available: ${balance}, Source: ${fundingSource}`,
    );
  }

  const nativeToken = getNativeToken(fiatAsset.chainId);
  const isNative = isNativeFiatAsset(fiatAsset);
  const nativeBalance = isNative
    ? balance
    : await getLiveTokenBalance(
        messenger,
        fundingSource,
        fiatAsset.chainId,
        nativeToken,
      );

  const requiredNativeBalance = isNative ? amountRaw : '0';

  if (new BigNumber(nativeBalance).lte(requiredNativeBalance)) {
    throw new Error(
      `Fiat test funding source has insufficient native gas on chain ${fiatAsset.chainId}. ` +
        `Native balance: ${nativeBalance}, Source: ${fundingSource}`,
    );
  }
}

async function submitTestFundingTransfer({
  amountRaw,
  fiatAsset,
  fundingSource,
  messenger,
  recipient,
}: {
  amountRaw: string;
  fiatAsset: { address: Hex; chainId: Hex };
  fundingSource: Hex;
  messenger: TransactionPayControllerMessenger;
  recipient: Hex;
}): Promise<Hex> {
  const networkClientId = getNetworkClientId(messenger, fiatAsset.chainId);
  const params = buildTestFundingTransferParams({
    amountRaw,
    fiatAsset,
    fundingSource,
    recipient,
  });

  const result = await messenger.call(
    'TransactionController:addTransaction',
    params,
    {
      isInternal: true,
      networkClientId,
      origin: ORIGIN_METAMASK,
      requireApproval: false,
      type: TransactionType.simpleSend,
    },
  );

  const txHash = (await result.result) as Hex;

  await waitForTransactionConfirmed(result.transactionMeta.id, messenger);

  return txHash;
}

function buildTestFundingTransferParams({
  amountRaw,
  fiatAsset,
  fundingSource,
  recipient,
}: {
  amountRaw: string;
  fiatAsset: { address: Hex; chainId: Hex };
  fundingSource: Hex;
  recipient: Hex;
}): TransactionParams {
  if (isNativeFiatAsset(fiatAsset)) {
    return {
      from: fundingSource,
      to: recipient,
      value: toHex(amountRaw),
    };
  }

  return {
    data: buildTokenTransferData(recipient, amountRaw),
    from: fundingSource,
    to: fiatAsset.address,
    value: '0x0',
  };
}

function buildTokenTransferData(recipient: Hex, amountRaw: string): Hex {
  return TOKEN_TRANSFER_INTERFACE.encodeFunctionData('transfer', [
    recipient,
    amountRaw,
  ]) as Hex;
}

function isNativeFiatAsset({
  address,
  chainId,
}: {
  address: Hex;
  chainId: Hex;
}): boolean {
  const normalizedAddress = address.toLowerCase();

  return (
    normalizedAddress === NATIVE_TOKEN_ADDRESS.toLowerCase() ||
    normalizedAddress === getNativeToken(chainId).toLowerCase()
  );
}
