import {
  safelyExecute,
  toHex,
  toChecksumHexAddress,
} from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { CaipAccountAddress, Hex } from '@metamask/utils';
import BN from 'bn.js';

import { fetchMultiChainBalancesV4 } from './multi-chain-accounts';
import {
  accountAddressToCaipReference,
  reduceInBatchesSerially,
} from '../assetsUtil';
import { SUPPORTED_NETWORKS_ACCOUNTS_API_V4 } from '../constants';

// Maximum number of account addresses that can be sent to the accounts API in a single request
const ACCOUNTS_API_BATCH_SIZE = 50;

export type ChainIdHex = Hex;
export type ChecksumAddress = Hex;

export type ProcessedBalance = {
  success: boolean;
  value?: BN;
  account: ChecksumAddress;
  token: ChecksumAddress;
  chainId: ChainIdHex;
};

export type BalanceFetcher = {
  supports(chainId: ChainIdHex): boolean;
  fetch(input: {
    chainIds: ChainIdHex[];
    queryAllAccounts: boolean;
    selectedAccount: ChecksumAddress;
    allAccounts: InternalAccount[];
  }): Promise<ProcessedBalance[]>;
};

const checksum = (addr: string): ChecksumAddress =>
  toChecksumHexAddress(addr) as ChecksumAddress;

const toCaipAccount = (
  chainId: ChainIdHex,
  account: ChecksumAddress,
): CaipAccountAddress => accountAddressToCaipReference(chainId, account);

export class AccountsApiBalanceFetcher implements BalanceFetcher {
  readonly #platform: 'extension' | 'mobile' = 'extension';

  constructor(platform: 'extension' | 'mobile' = 'extension') {
    this.#platform = platform;
  }

  supports(chainId: ChainIdHex): boolean {
    return SUPPORTED_NETWORKS_ACCOUNTS_API_V4.includes(chainId);
  }

  async #fetchBalances(addrs: CaipAccountAddress[]) {
    // If we have fewer than or equal to the batch size, make a single request
    if (addrs.length <= ACCOUNTS_API_BATCH_SIZE) {
      const { balances } = await fetchMultiChainBalancesV4(
        { accountAddresses: addrs },
        this.#platform,
      );
      return balances;
    }

    // Otherwise, batch the requests to respect the 50-element limit
    type BalanceData = Awaited<
      ReturnType<typeof fetchMultiChainBalancesV4>
    >['balances'][number];

    const allBalances = await reduceInBatchesSerially<
      CaipAccountAddress,
      BalanceData[]
    >({
      values: addrs,
      batchSize: ACCOUNTS_API_BATCH_SIZE,
      eachBatch: async (workingResult, batch) => {
        const { balances } = await fetchMultiChainBalancesV4(
          { accountAddresses: batch },
          this.#platform,
        );
        return [...(workingResult || []), ...balances];
      },
      initialResult: [],
    });

    return allBalances;
  }

  async fetch({
    chainIds,
    queryAllAccounts,
    selectedAccount,
    allAccounts,
  }: Parameters<BalanceFetcher['fetch']>[0]): Promise<ProcessedBalance[]> {
    const caipAddrs: CaipAccountAddress[] = [];

    for (const chainId of chainIds.filter((c) => this.supports(c))) {
      if (queryAllAccounts) {
        allAccounts.forEach((a) =>
          caipAddrs.push(toCaipAccount(chainId, a.address as ChecksumAddress)),
        );
      } else {
        caipAddrs.push(toCaipAccount(chainId, selectedAccount));
      }
    }

    if (!caipAddrs.length) {
      return [];
    }

    const balances = await safelyExecute(() => this.#fetchBalances(caipAddrs));
    if (!balances) {
      return [];
    }

    return balances.flatMap((b) => {
      const account = b.accountAddress?.split(':')[2] as ChecksumAddress;
      if (!account) {
        return [];
      }
      const token = checksum(b.address);
      const chainId = toHex(b.chainId) as ChainIdHex;

      let value: BN | undefined;
      try {
        value = new BN((parseFloat(b.balance) * 10 ** b.decimals).toFixed(0));
      } catch {
        value = undefined;
      }

      return [
        {
          success: value !== undefined,
          value,
          account,
          token,
          chainId,
        },
      ];
    });
  }
}
