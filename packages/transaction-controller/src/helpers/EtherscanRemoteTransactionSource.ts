import { BNToHex } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { BN } from 'ethereumjs-util';
import { v1 as random } from 'uuid';

import { ETHERSCAN_SUPPORTED_NETWORKS } from '../constants';
import { incomingTransactionsLogger as log } from '../logger';
import type {
  RemoteTransactionSource,
  RemoteTransactionSourceRequest,
  TransactionMeta,
} from '../types';
import { TransactionStatus } from '../types';
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

/**
 * A RemoteTransactionSource that fetches transaction data from Etherscan.
 */
export class EtherscanRemoteTransactionSource
  implements RemoteTransactionSource
{
  #includeTokenTransfers: boolean;

  #isTokenRequestPending: boolean;

  constructor({
    includeTokenTransfers,
  }: { includeTokenTransfers?: boolean } = {}) {
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
    const etherscanRequest: EtherscanTransactionRequest = {
      ...request,
      chainId: request.currentChainId,
    };

    const transactions = this.#isTokenRequestPending
      ? await this.#fetchTokenTransactions(request, etherscanRequest)
      : await this.#fetchNormalTransactions(request, etherscanRequest);

    if (this.#includeTokenTransfers) {
      this.#isTokenRequestPending = !this.#isTokenRequestPending;
    }

    return transactions;
  }

  #fetchNormalTransactions = async (
    request: RemoteTransactionSourceRequest,
    etherscanRequest: EtherscanTransactionRequest,
  ) => {
    const { currentChainId } = request;

    const etherscanTransactions = await fetchEtherscanTransactions(
      etherscanRequest,
    );

    return this.#getResponseTransactions(etherscanTransactions).map((tx) =>
      this.#normalizeTransaction(tx, currentChainId),
    );
  };

  #fetchTokenTransactions = async (
    request: RemoteTransactionSourceRequest,
    etherscanRequest: EtherscanTransactionRequest,
  ) => {
    const { currentChainId } = request;

    const etherscanTransactions = await fetchEtherscanTokenTransactions(
      etherscanRequest,
    );

    return this.#getResponseTransactions(etherscanTransactions).map((tx) =>
      this.#normalizeTokenTransaction(tx, currentChainId),
    );
  };

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
    currentChainId: Hex,
  ): TransactionMeta {
    const base = this.#normalizeTransactionBase(txMeta, currentChainId);

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
    currentChainId: Hex,
  ): TransactionMeta {
    const base = this.#normalizeTransactionBase(txMeta, currentChainId);

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
    currentChainId: Hex,
  ): TransactionMeta {
    const time = parseInt(txMeta.timeStamp, 10) * 1000;

    return {
      blockNumber: txMeta.blockNumber,
      chainId: currentChainId,
      hash: txMeta.hash,
      id: random({ msecs: time }),
      status: TransactionStatus.confirmed,
      time,
      txParams: {
        chainId: currentChainId,
        from: txMeta.from,
        gas: BNToHex(new BN(txMeta.gas)),
        gasPrice: BNToHex(new BN(txMeta.gasPrice)),
        gasUsed: BNToHex(new BN(txMeta.gasUsed)),
        nonce: BNToHex(new BN(txMeta.nonce)),
        to: txMeta.to,
        value: BNToHex(new BN(txMeta.value)),
      },
      verifiedOnBlockchain: false,
    };
  }
}
