import { BNToHex } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import BN from 'bn.js';
import { v1 as random } from 'uuid';

import { ETHERSCAN_SUPPORTED_NETWORKS } from '../constants';
import { incomingTransactionsLogger as log } from '../logger';
import type {
  RemoteTransactionSource,
  RemoteTransactionSourceRequest,
  TransactionMeta,
} from '../types';
import { TransactionStatus, TransactionType } from '../types';
import {
  fetchEtherscanTokenTransactions,
  fetchEtherscanTransactions,
} from '../utils/etherscan';
import type {
  EtherscanTokenTransactionMeta,
  EtherscanTransactionMeta,
  EtherscanTransactionMetaBase,
  EtherscanTransactionRequest,
  EtherscanTransactionResponse,
} from '../utils/etherscan';

const ETHERSCAN_RATE_LIMIT_INTERVAL = 5000;

/**
 * A RemoteTransactionSource that fetches transaction data from Etherscan.
 */
export class EtherscanRemoteTransactionSource
  implements RemoteTransactionSource
{
  #apiKeysByChainId?: Record<Hex, string>;

  #includeTokenTransfers: boolean;

  #isTokenRequestPending: boolean;

  #mutex = new Mutex();

  constructor({
    apiKeysByChainId,
    includeTokenTransfers,
  }: {
    apiKeysByChainId?: Record<Hex, string>;
    includeTokenTransfers?: boolean;
  } = {}) {
    this.#apiKeysByChainId = apiKeysByChainId;
    this.#includeTokenTransfers = includeTokenTransfers ?? true;
    this.#isTokenRequestPending = false;
  }

  isSupportedNetwork(chainId: Hex): boolean {
    return Object.keys(ETHERSCAN_SUPPORTED_NETWORKS).includes(chainId);
  }

  getLastBlockVariations(): string[] {
    return [this.#isTokenRequestPending ? 'token' : 'normal'];
  }

  async fetchTransactions(
    request: RemoteTransactionSourceRequest,
  ): Promise<TransactionMeta[]> {
    const releaseLock = await this.#mutex.acquire();
    const acquiredTime = Date.now();
    const { chainId } = request;
    const apiKey = this.#apiKeysByChainId?.[chainId];

    if (apiKey) {
      log('Etherscan API key found for chain', chainId);
    }

    const etherscanRequest: EtherscanTransactionRequest = {
      ...request,
      apiKey,
      chainId,
    };

    try {
      const transactions = this.#isTokenRequestPending
        ? await this.#fetchTokenTransactions(request, etherscanRequest)
        : await this.#fetchNormalTransactions(request, etherscanRequest);

      if (this.#includeTokenTransfers) {
        this.#isTokenRequestPending = !this.#isTokenRequestPending;
      }

      return transactions;
    } finally {
      this.#releaseLockAfterInterval(acquiredTime, releaseLock);
    }
  }

  #releaseLockAfterInterval(acquireTime: number, releaseLock: () => void) {
    const elapsedTime = Date.now() - acquireTime;
    const remainingTime = Math.max(
      0,
      ETHERSCAN_RATE_LIMIT_INTERVAL - elapsedTime,
    );
    // Wait for the remaining time if it hasn't been 5 seconds yet
    if (remainingTime > 0) {
      setTimeout(releaseLock, remainingTime);
    } else {
      releaseLock();
    }
  }

  #fetchNormalTransactions = async (
    request: RemoteTransactionSourceRequest,
    etherscanRequest: EtherscanTransactionRequest,
  ) => {
    const { chainId } = request;

    const etherscanTransactions = await fetchEtherscanTransactions(
      etherscanRequest,
    );

    return this.#getResponseTransactions(etherscanTransactions).map((tx) =>
      this.#normalizeTransaction(tx, chainId),
    );
  };

  #fetchTokenTransactions = async (
    request: RemoteTransactionSourceRequest,
    etherscanRequest: EtherscanTransactionRequest,
  ) => {
    const { chainId } = request;

    const etherscanTransactions = await fetchEtherscanTokenTransactions(
      etherscanRequest,
    );

    return this.#getResponseTransactions(etherscanTransactions).map((tx) =>
      this.#normalizeTokenTransaction(tx, chainId),
    );
  };

  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  #getResponseTransactions<T extends EtherscanTransactionMetaBase>(
    response: EtherscanTransactionResponse<T>,
  ): T[] {
    let result = response.result as T[];

    if (response.status === '0') {
      result = [];

      if (response.result.length) {
        log('Ignored Etherscan request error', {
          message: response.result,
          type: this.#isTokenRequestPending ? 'token' : 'normal',
        });
      }
    }

    return result;
  }

  #normalizeTransaction(
    txMeta: EtherscanTransactionMeta,
    chainId: Hex,
  ): TransactionMeta {
    const base = this.#normalizeTransactionBase(txMeta, chainId);

    return {
      ...base,
      txParams: {
        ...base.txParams,
        data: txMeta.input,
      },
      ...(txMeta.isError === '0'
        ? { status: TransactionStatus.confirmed }
        : {
            error: new Error('Transaction failed'),
            status: TransactionStatus.failed,
          }),
    };
  }

  #normalizeTokenTransaction(
    txMeta: EtherscanTokenTransactionMeta,
    chainId: Hex,
  ): TransactionMeta {
    const base = this.#normalizeTransactionBase(txMeta, chainId);

    return {
      ...base,
      isTransfer: true,
      transferInformation: {
        contractAddress: txMeta.contractAddress,
        decimals: Number(txMeta.tokenDecimal),
        symbol: txMeta.tokenSymbol,
      },
    };
  }

  #normalizeTransactionBase(
    txMeta: EtherscanTransactionMetaBase,
    chainId: Hex,
  ): TransactionMeta {
    const time = parseInt(txMeta.timeStamp, 10) * 1000;

    return {
      blockNumber: txMeta.blockNumber,
      chainId,
      hash: txMeta.hash,
      id: random({ msecs: time }),
      networkClientId: '',
      status: TransactionStatus.confirmed,
      time,
      txParams: {
        chainId,
        from: txMeta.from,
        gas: BNToHex(new BN(txMeta.gas)),
        gasPrice: BNToHex(new BN(txMeta.gasPrice)),
        gasUsed: BNToHex(new BN(txMeta.gasUsed)),
        nonce: BNToHex(new BN(txMeta.nonce)),
        to: txMeta.to,
        value: BNToHex(new BN(txMeta.value)),
      },
      type: TransactionType.incoming,
      verifiedOnBlockchain: false,
    };
  }
}
