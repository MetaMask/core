import { BNToHex } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import BN from 'bn.js';
import { v1 as random } from 'uuid';

import type {
  GetAccountTransactionsResponse,
  TransactionResponse,
} from '../api/accounts-api';
import { getAccountTransactions } from '../api/accounts-api';
import { CHAIN_IDS } from '../constants';
import { createModuleLogger, incomingTransactionsLogger } from '../logger';
import type {
  RemoteTransactionSource,
  RemoteTransactionSourceRequest,
  TransactionError,
  TransactionMeta,
} from '../types';
import { TransactionStatus, TransactionType } from '../types';

export const SUPPORTED_CHAIN_IDS: Hex[] = [
  CHAIN_IDS.MAINNET,
  CHAIN_IDS.POLYGON,
  CHAIN_IDS.BSC,
  CHAIN_IDS.LINEA_MAINNET,
  CHAIN_IDS.BASE,
  CHAIN_IDS.OPTIMISM,
  CHAIN_IDS.ARBITRUM,
  CHAIN_IDS.SCROLL,
];

const log = createModuleLogger(
  incomingTransactionsLogger,
  'accounts-api-source',
);

/**
 * A RemoteTransactionSource that fetches incoming transactions using the Accounts API.
 */
export class AccountsApiRemoteTransactionSource
  implements RemoteTransactionSource
{
  getSupportedChains(): Hex[] {
    return SUPPORTED_CHAIN_IDS;
  }

  async fetchTransactions(
    request: RemoteTransactionSourceRequest,
  ): Promise<TransactionMeta[]> {
    const { address } = request;

    const responseTransactions = await this.#getTransactions(request);

    log('Fetched transactions', responseTransactions);

    const normalizedTransactions = responseTransactions.map((tx) =>
      this.#normalizeTransaction(address, tx),
    );

    log('Normalized transactions', normalizedTransactions);

    const filteredTransactions = this.#filterTransactions(
      request,
      normalizedTransactions,
    );

    log('Filtered transactions', filteredTransactions);

    return filteredTransactions;
  }

  async #getTransactions(request: RemoteTransactionSourceRequest) {
    log('Getting transactions', request);

    const { address, cache, chainIds: requestedChainIds } = request;

    const chainIds = requestedChainIds.filter((chainId) =>
      SUPPORTED_CHAIN_IDS.includes(chainId),
    );

    const unsupportedChainIds = requestedChainIds.filter(
      (chainId) => !chainIds.includes(chainId),
    );

    if (unsupportedChainIds.length) {
      log('Ignoring unsupported chain IDs', unsupportedChainIds);
    }

    const cursor = this.#getCacheCursor(cache, chainIds, address);

    if (cursor) {
      log('Using cached cursor', cursor);
    }

    return await this.#queryTransactions(request, chainIds, cursor);
  }

  async #queryTransactions(
    request: RemoteTransactionSourceRequest,
    chainIds: Hex[],
    cursor?: string,
  ): Promise<TransactionResponse[]> {
    const { address, queryEntireHistory, updateCache } = request;
    const transactions: TransactionResponse[] = [];

    let hasNextPage = true;
    let currentCursor = cursor;
    let pageCount = 0;

    const startTimestamp =
      queryEntireHistory || cursor
        ? undefined
        : this.#getTimestampSeconds(Date.now());

    while (hasNextPage) {
      try {
        const response = await getAccountTransactions({
          address,
          chainIds,
          cursor: currentCursor,
          sortDirection: 'ASC',
          startTimestamp,
        });

        pageCount += 1;

        if (response?.data) {
          transactions.push(...response.data);
        }

        hasNextPage = response?.pageInfo?.hasNextPage;
        currentCursor = response?.pageInfo?.cursor;

        if (currentCursor) {
          // eslint-disable-next-line no-loop-func
          updateCache((cache) => {
            const key = this.#getCacheKey(chainIds, address);
            cache[key] = currentCursor;

            log('Updated cache', { key, newCursor: currentCursor });
          });
        }
      } catch (error) {
        log('Error while fetching transactions', error);
        break;
      }
    }

    log('Queried transactions', { pageCount });

    return transactions;
  }

  #filterTransactions(
    request: RemoteTransactionSourceRequest,
    transactions: TransactionMeta[],
  ) {
    const { address, includeTokenTransfers, updateTransactions } = request;

    let filteredTransactions = transactions;

    if (!updateTransactions) {
      filteredTransactions = filteredTransactions.filter(
        (tx) => tx.txParams.to === address,
      );
    }

    if (!includeTokenTransfers) {
      filteredTransactions = filteredTransactions.filter(
        (tx) => !tx.isTransfer,
      );
    }

    return filteredTransactions;
  }

  #normalizeTransaction(
    address: Hex,
    responseTransaction: GetAccountTransactionsResponse['data'][0],
  ): TransactionMeta {
    const blockNumber = String(responseTransaction.blockNumber);
    const chainId = `0x${responseTransaction.chainId.toString(16)}` as Hex;
    const { hash } = responseTransaction;
    const time = new Date(responseTransaction.timestamp).getTime();
    const id = random({ msecs: time });
    const { from } = responseTransaction;
    const gas = BNToHex(new BN(responseTransaction.gas));
    const gasPrice = BNToHex(new BN(responseTransaction.gasPrice));
    const gasUsed = BNToHex(new BN(responseTransaction.gasUsed));
    const nonce = BNToHex(new BN(responseTransaction.nonce));
    const type = TransactionType.incoming;
    const verifiedOnBlockchain = false;

    const status = responseTransaction.isError
      ? TransactionStatus.failed
      : TransactionStatus.confirmed;

    const valueTransfer = responseTransaction.valueTransfers.find(
      (vt) => vt.to === address && vt.contractAddress,
    );

    const isTransfer = Boolean(valueTransfer);
    const contractAddress = valueTransfer?.contractAddress as string;
    const decimals = valueTransfer?.decimal as number;
    const symbol = valueTransfer?.symbol as string;

    const value = BNToHex(
      new BN(valueTransfer?.amount ?? responseTransaction.value),
    );

    const to = valueTransfer ? address : responseTransaction.to;

    return {
      blockNumber,
      chainId,
      hash,
      id,
      status,
      error:
        status === TransactionStatus.failed
          ? new Error('Transaction failed')
          : (undefined as unknown as TransactionError),
      time,
      txParams: {
        chainId,
        from,
        gas,
        gasPrice,
        gasUsed,
        nonce,
        to,
        value,
      },
      type,
      verifiedOnBlockchain,
      isTransfer,
      transferInformation: isTransfer
        ? {
            contractAddress,
            decimals,
            symbol,
          }
        : undefined,
    };
  }

  #getCacheKey(chainIds: Hex[], address: Hex): string {
    return `accounts-api#${chainIds.join(',')}#${address}`;
  }

  #getCacheCursor(
    cache: Record<string, unknown>,
    chainIds: Hex[],
    address: Hex,
  ): string | undefined {
    const key = this.#getCacheKey(chainIds, address);
    return cache[key] as string | undefined;
  }

  #getTimestampSeconds(timestampMs: number): number {
    return Math.floor(timestampMs / 1000);
  }
}
