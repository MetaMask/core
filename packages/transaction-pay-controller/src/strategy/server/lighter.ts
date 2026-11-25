import { successfulFetch } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';

import { PaymentOverride } from '../../constants.js';
import type { QuoteRequest } from '../../types.js';

/** Lighter API that lists the accounts owned by an L1 address. */
const LIGHTER_ACCOUNTS_BY_L1_ADDRESS_URL =
  'https://mainnet.zklighter.elliot.ai/api/v1/accountsByL1Address';

/** `account_type` of the main Lighter account. Other types are sub-accounts. */
const LIGHTER_MAIN_ACCOUNT_TYPE = 0;

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
