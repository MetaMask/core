import { successfulFetch } from '@metamask/controller-utils';
import type {
  LighterTransferParams,
  LighterTransferResult,
} from '@metamask/perps-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { PaymentOverride } from '../../constants.js';
import { projectLogger } from '../../logger.js';
import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
} from '../../types.js';
import type {
  ServerLighterTransferStep,
  ServerQuote,
  ServerQuoteAmount,
  ServerStep,
} from './types.js';

const log = createModuleLogger(projectLogger, 'server-strategy');

/** Lighter API that lists the accounts owned by an L1 address. */
const LIGHTER_ACCOUNTS_BY_L1_ADDRESS_URL =
  'https://mainnet.zklighter.elliot.ai/api/v1/accountsByL1Address';

/** `account_type` of the main Lighter account. Other types are sub-accounts. */
const LIGHTER_MAIN_ACCOUNT_TYPE = 0;

/** Decimals of USDC on Lighter, in which transfer amounts and fees are set. */
const LIGHTER_USDC_DECIMALS = 6;

/**
 * Lighter transfers already sent, by server quote ID.
 *
 * Kept outside the quote because quotes come from the frozen controller state.
 * An entry is dropped once the quote is confirmed.
 */
const submittedTransfers = new Map<string, string>();

/**
 * Placeholder chain ID for the Lighter perps balance. Only used within the
 * quote request; the server strategy sends any Lighter asset as
 * `SERVER_LIGHTER_PERPS_USDC_ASSET`.
 */
export const SERVER_LIGHTER_CHAIN_ID = '0x53a' as Hex;

/**
 * Placeholder token address for the Lighter perps balance. Only used within the
 * quote request; the server strategy sends any Lighter asset as
 * `SERVER_LIGHTER_PERPS_USDC_ASSET`.
 */
export const SERVER_LIGHTER_PERPS_USDC_ADDRESS =
  '0x2200000000000000000000000000000000000000' as Hex;

type LighterAccountsByL1AddressResponse = {
  sub_accounts?: { account_type: number; index: number }[];
};

/**
 * Utilities for normalizing Lighter perps deposit requests.
 */
export class LighterNormalizer {
  /**
   * Checks if a quote request targets Lighter perps.
   *
   * @param request - Quote request from the transaction-pay controller.
   * @returns Whether the request is for Lighter perps.
   */
  static isLighterRequest(request: QuoteRequest): boolean {
    return request.paymentOverride === PaymentOverride.PerpsLighter;
  }

  /**
   * Normalizes a Lighter perps deposit request.
   *
   * Rewrites the target to use a placeholder asset that maps to the Lighter
   * perps USDC asset in the server strategy. The recipient is handled
   * separately in buildServerQuoteRequest.
   *
   * @param request - Quote request from the transaction-pay controller.
   * @returns Normalized request with Lighter-specific target overrides.
   */
  static normalizeLighterRequest(request: QuoteRequest): QuoteRequest {
    if (!LighterNormalizer.isLighterRequest(request)) {
      return request;
    }

    return {
      ...request,
      targetChainId: SERVER_LIGHTER_CHAIN_ID,
      targetTokenAddress: SERVER_LIGHTER_PERPS_USDC_ADDRESS,
    };
  }
}

/**
 * Get the index of the main Lighter account owned by an L1 address.
 *
 * The intents API needs it as the recipient of a Lighter deposit.
 *
 * Temporary: replace with the perps utility for resolving the Lighter account
 * index once it is available.
 *
 * @param l1Address - EVM address that owns the Lighter account.
 * @returns The account index, as a string.
 */
export async function getLighterAccountIndex(l1Address: Hex): Promise<string> {
  const response = await successfulFetch(
    `${LIGHTER_ACCOUNTS_BY_L1_ADDRESS_URL}?l1_address=${l1Address}`,
  );

  const { sub_accounts: subAccounts = [] } =
    (await response.json()) as LighterAccountsByL1AddressResponse;

  const mainAccount = subAccounts.find(
    ({ account_type: accountType }) =>
      accountType === LIGHTER_MAIN_ACCOUNT_TYPE,
  );

  if (!mainAccount) {
    throw new Error(`No Lighter account found for ${l1Address}`);
  }

  return String(mainAccount.index);
}

/**
 * Check if a server quote step is a Lighter transfer.
 *
 * @param step - Step of a server quote.
 * @returns Whether the step is a Lighter transfer.
 */
export function isLighterTransferStep(
  step: ServerStep,
): step is ServerLighterTransferStep {
  return step.type === 'lighterTransfer';
}

/**
 * Get the fee Lighter charges for the transfer steps of a quote.
 *
 * Lighter debits the fee from the account on top of the amount sent. It is in
 * USDC, which is priced 1:1 with USD.
 *
 * @param steps - Steps of a server quote.
 * @returns The total fee, in USDC.
 */
export function getLighterTransferFee(steps: ServerStep[]): BigNumber {
  return steps
    .filter(isLighterTransferStep)
    .reduce((total, step) => total.plus(step.usdcFee), new BigNumber(0))
    .shiftedBy(-LIGHTER_USDC_DECIMALS);
}

/**
 * Subtract the Lighter transfer fee from the amount a quote takes from the
 * account.
 *
 * For a max withdrawal, the fee is debited separately from the amount sent, so
 * the total (input + fee) would otherwise exceed the account balance.
 *
 * @param input - Input amount of the server quote.
 * @param fee - Lighter transfer fee, in USDC.
 * @returns The input amount without the fee.
 */
export function subtractLighterTransferFee(
  input: ServerQuoteAmount,
  fee: BigNumber,
): ServerQuoteAmount {
  return {
    ...input,
    raw: new BigNumber(input.raw)
      .minus(fee.shiftedBy(LIGHTER_USDC_DECIMALS))
      .toString(10),
    formatted: new BigNumber(input.formatted).minus(fee).toString(10),
  };
}

/**
 * Sign a Lighter transfer and send it to Lighter, via the Perps controller.
 *
 * @param messenger - Controller messenger.
 * @param params - The transfer to send.
 * @returns Whether Lighter accepted the transfer.
 */
export async function submitLighterTransfer(
  messenger: TransactionPayControllerMessenger,
  params: LighterTransferParams,
): Promise<LighterTransferResult> {
  return await messenger.call('PerpsController:submitLighterTransfer', params);
}

/**
 * Send the Lighter transfer steps of a quote.
 *
 * The transfers debit the Lighter account the quote was requested for, which
 * is the quote's sender. They are skipped if this quote's transfers were
 * already sent, so a retry does not debit the account twice.
 *
 * @param request - Request object.
 * @param request.eoa - Address that owns the Lighter account to debit.
 * @param request.messenger - Controller messenger.
 * @param request.quote - Server quote with the transfer steps.
 * @throws If a transfer fails, so the withdrawal stops before it is polled.
 */
export async function submitLighterSteps({
  eoa,
  messenger,
  quote,
}: {
  eoa: Hex;
  messenger: TransactionPayControllerMessenger;
  quote: ServerQuote;
}): Promise<void> {
  const steps = quote.steps.filter(isLighterTransferStep);

  if (steps.length === 0) {
    return;
  }

  const submittedTxHash = submittedTransfers.get(quote.id);

  if (submittedTxHash) {
    log('Lighter transfer already submitted, skipping', {
      txHash: submittedTxHash,
    });
    return;
  }

  for (const { type: _type, ...transfer } of steps) {
    const result = await submitLighterTransfer(messenger, {
      ...transfer,
      accountIndex: Number(quote.sender),
      eoa,
    });

    if (!result.success) {
      throw new Error(result.error ?? 'Lighter transfer failed');
    }

    submittedTransfers.set(quote.id, result.txHash ?? 'submitted');
  }
}

/**
 * Forget the Lighter transfers sent for a quote, once it is confirmed.
 *
 * @param quoteId - ID of the server quote.
 */
export function clearSubmittedLighterTransfers(quoteId: string): void {
  submittedTransfers.delete(quoteId);
}
