import { successfulFetch } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';

/** Lighter API that lists the accounts owned by an L1 address. */
const LIGHTER_ACCOUNTS_BY_L1_ADDRESS_URL =
  'https://mainnet.zklighter.elliot.ai/api/v1/accountsByL1Address';

/** `account_type` of the main Lighter account. Other types are sub-accounts. */
const LIGHTER_MAIN_ACCOUNT_TYPE = 0;

type LighterAccountsByL1AddressResponse = {
  sub_accounts?: { account_type: number; index: number }[];
};

/**
 * Get the index of the main Lighter account owned by an L1 address.
 *
 * The intents API needs it as the recipient of a Lighter deposit.
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
