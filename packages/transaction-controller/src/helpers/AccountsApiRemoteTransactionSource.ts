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

const RECENT_HISTORY_DURATION_MS = 1000 * 60 * 60 * 24; // 1 Day

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

    log(
      'Fetched transactions',
      responseTransactions.length,
      responseTransactions,
    );

    const normalizedTransactions = responseTransactions.map((tx) =>
      this.#normalizeTransaction(address, tx),
    );

    log('Normalized transactions', normalizedTransactions);

    const filteredTransactions = this.#filterTransactions(
      request,
      normalizedTransactions,
    );

    log(
      'Filtered transactions',
      filteredTransactions.length,
      filteredTransactions,
    );

    return filteredTransactions;
  }

  async #getTransactions(request: RemoteTransactionSourceRequest) {
    log('Getting transactions', request);

    const { address, cache } = request;

    const cursor = this.#getCacheCursor(cache, SUPPORTED_CHAIN_IDS, address);

    const timestamp = this.#getCacheTimestamp(
      cache,
      SUPPORTED_CHAIN_IDS,
      address,
    );

    if (cursor) {
      log('Using cached cursor', cursor);
    } else if (timestamp) {
      log('Using cached timestamp', timestamp);
    } else {
      log('No cached cursor or timestamp found');
    }

    return await this.#queryTransactions(
      request,
      SUPPORTED_CHAIN_IDS,
      cursor,
      timestamp,
    );
  }

  async #queryTransactions(
    request: RemoteTransactionSourceRequest,
    chainIds: Hex[],
    cursor?: string,
    timestamp?: number,
  ): Promise<TransactionResponse[]> {
    const { address, queryEntireHistory } = request;
    const transactions: TransactionResponse[] = [];

    let hasNextPage = true;
    let currentCursor = cursor;
    let pageCount = 0;

    while (hasNextPage) {
      try {
        const startTimestamp = this.#getStartTimestamp({
          cursor: currentCursor,
          queryEntireHistory,
          timestamp,
        });

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

        this.#updateCache({
          chainIds,
          cursor: currentCursor,
          request,
          startTimestamp,
        });
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
      (vt) =>
        vt.to.toLowerCase() === address.toLowerCase() && vt.contractAddress,
    );

    const isTransfer = Boolean(valueTransfer);
    const contractAddress = valueTransfer?.contractAddress as string;
    const decimals = valueTransfer?.decimal as number;
    const symbol = valueTransfer?.symbol as string;

    const value = BNToHex(
      new BN(valueTransfer?.amount ?? responseTransaction.value),
    );

    const to = valueTransfer ? address : responseTransaction.to;

    const error =
      status === TransactionStatus.failed
        ? new Error('Transaction failed')
        : (undefined as unknown as TransactionError);

    const transferInformation = isTransfer
      ? {
          contractAddress,
          decimals,
          symbol,
        }
      : undefined;

    return {
      blockNumber,
      chainId,
      error,
      hash,
      id,
      isTransfer,
      // Populated by TransactionController when added to state
      networkClientId: '',
      status,
      time,
      toSmartContract: false,
      transferInformation,
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
    };
  }

  #updateCache({
    chainIds,
    cursor,
    request,
    startTimestamp,
  }: {
    chainIds: Hex[];
    cursor?: string;
    request: RemoteTransactionSourceRequest;
    startTimestamp?: number;
  }) {
    if (!cursor && !startTimestamp) {
      log('Cache not updated');
      return;
    }

    const { address, updateCache } = request;
    const cursorCacheKey = this.#getCursorCacheKey(chainIds, address);
    const timestampCacheKey = this.#getTimestampCacheKey(chainIds, address);

    updateCache((cache) => {
      if (cursor) {
        cache[cursorCacheKey] = cursor;
        delete cache[timestampCacheKey];

        log('Updated cursor in cache', { cursorCacheKey, newCursor: cursor });
      } else {
        cache[timestampCacheKey] = startTimestamp;

        log('Updated timestamp in cache', {
          timestampCacheKey,
          newTimestamp: startTimestamp,
        });
      }
    });
  }

  #getStartTimestamp({
    cursor,
    queryEntireHistory,
    timestamp,
  }: {
    cursor?: string;
    queryEntireHistory: boolean;
    timestamp?: number;
  }): number | undefined {
    if (queryEntireHistory || cursor) {
      return undefined;
    }

    if (timestamp) {
      return timestamp;
    }

    return this.#getTimestampSeconds(Date.now() - RECENT_HISTORY_DURATION_MS);
  }

  #getCursorCacheKey(chainIds: Hex[], address: Hex): string {
    return `accounts-api#${chainIds.join(',')}#${address}`;
  }

  #getCacheCursor(
    cache: Record<string, unknown>,
    chainIds: Hex[],
    address: Hex,
  ): string | undefined {
    const key = this.#getCursorCacheKey(chainIds, address);
    return cache[key] as string | undefined;
  }

  #getTimestampCacheKey(chainIds: Hex[], address: Hex): string {
    return `accounts-api#timestamp#${chainIds.join(',')}#${address}`;
  }

  #getCacheTimestamp(
    cache: Record<string, unknown>,
    chainIds: Hex[],
    address: Hex,
  ): number | undefined {
    const key = this.#getTimestampCacheKey(chainIds, address);
    return cache[key] as number | undefined;
  }

  #getTimestampSeconds(timestampMs: number): number {
    return Math.floor(timestampMs / 1000);
  }
}
