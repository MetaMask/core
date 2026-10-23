import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_HYPERCORE,
  HYPERCORE_USDC_DECIMALS,
  USDC_DECIMALS,
} from '../../constants.js';
import type { QuoteRequest } from '../../types.js';
import { extractErc20TransferRecipient } from '../../utils/polymarket/calldata.js';

/**
 * Shared 20-byte sentinel address emitted by the server strategy to flag a
 * Hyperliquid perps deposit. Backend providers translate this to their own
 * on-chain destination (e.g. Relay's 16-byte HyperCore USDC sentinel, Across's
 * native USDC-PERPS token at the same address).
 */
export const SERVER_HYPERCORE_USDC_PERPS_ADDRESS =
  '0x2100000000000000000000000000000000000000' as Hex;

const HYPERLIQUID_BRIDGE_ADDRESS_LOWER =
  '0x2df1c51e09aecf9cacb7bc98cb1742757f163df7';

/**
 * Detect whether a quote request represents a Hyperliquid perps deposit by
 * inspecting the parent transaction (and any nested transactions) for a call
 * to the Hyperliquid bridge or an ERC-20 transfer to it. Transaction type is
 * intentionally NOT consulted so that any caller funnelling a bridge deposit
 * through Pay is supported.
 *
 * @param request - Quote request from the transaction-pay controller.
 * @param transaction - Parent transaction whose calldata is inspected.
 * @returns Whether the request matches a Hyperliquid bridge deposit.
 */
export function isServerPerpsDepositRequest(
  request: Pick<
    QuoteRequest,
    'isPostQuote' | 'targetChainId' | 'targetTokenAddress'
  >,
  transaction: Pick<TransactionMeta, 'txParams' | 'nestedTransactions'>,
): boolean {
  if (
    request.isPostQuote === true ||
    request.targetChainId !== CHAIN_ID_ARBITRUM ||
    request.targetTokenAddress.toLowerCase() !==
      ARBITRUM_USDC_ADDRESS.toLowerCase()
  ) {
    return false;
  }

  return transactionDataReferencesBridge(transaction);
}

/**
 * Translate a Hyperliquid perps-deposit quote request into the HyperCore
 * direct-deposit shape with a provider-agnostic sentinel destination. Backend
 * providers detect the sentinel and rewrite it to their respective on-chain
 * destinations.
 *
 * Transaction pay starts from the parent on-chain asset (Arbitrum USDC,
 * 6 decimals); HyperCore expects an 8-decimal amount, so the target amount is
 * shifted accordingly.
 *
 * Also handles the perps-withdraw direction: when `request.isHyperliquidSource`
 * is set the source is rewritten to the HyperCore sentinel and the amount is
 * shifted from 6 to 8 decimals.
 *
 * @param request - Quote request from the transaction-pay controller.
 * @param transaction - Parent transaction whose calldata is inspected.
 * @returns Normalized request, or the original request if not a perps flow.
 */
export function normalizeServerPerpsRequest(
  request: QuoteRequest,
  transaction: Pick<TransactionMeta, 'txParams' | 'nestedTransactions'>,
): QuoteRequest {
  if (request.isHyperliquidSource) {
    return normalizePerpsWithdrawRequest(request);
  }

  if (!isServerPerpsDepositRequest(request, transaction)) {
    return request;
  }

  return {
    ...request,
    targetAmountMinimum: new BigNumber(request.targetAmountMinimum)
      .shiftedBy(HYPERCORE_USDC_DECIMALS - USDC_DECIMALS)
      .toFixed(0),
    targetChainId: CHAIN_ID_HYPERCORE,
    targetTokenAddress: SERVER_HYPERCORE_USDC_PERPS_ADDRESS,
  };
}

function normalizePerpsWithdrawRequest(request: QuoteRequest): QuoteRequest {
  return {
    ...request,
    sourceChainId: CHAIN_ID_HYPERCORE,
    sourceTokenAddress: SERVER_HYPERCORE_USDC_PERPS_ADDRESS,
    sourceTokenAmount: new BigNumber(request.sourceTokenAmount)
      .shiftedBy(HYPERCORE_USDC_DECIMALS - USDC_DECIMALS)
      .toFixed(0),
  };
}

function transactionDataReferencesBridge(
  transaction: Pick<TransactionMeta, 'txParams' | 'nestedTransactions'>,
): boolean {
  const calls = [
    transaction.txParams,
    ...(transaction.nestedTransactions ?? []),
  ];

  return calls.some(
    (call) =>
      isBridgeAddress(call?.to) ||
      isBridgeAddress(getTransferRecipient(call?.data)),
  );
}

function getTransferRecipient(data: string | undefined): Hex | undefined {
  if (!data) {
    return undefined;
  }

  try {
    return extractErc20TransferRecipient(data as Hex);
  } catch {
    return undefined;
  }
}

function isBridgeAddress(address: string | undefined): boolean {
  return address?.toLowerCase() === HYPERLIQUID_BRIDGE_ADDRESS_LOWER;
}
