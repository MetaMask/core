import { BNToHex } from '@metamask/controller-utils';
import { BN } from 'ethereumjs-util';
import { v1 as random } from 'uuid';

import { ETHERSCAN_SUPPORTED_NETWORKS } from './constants';
import type {
  EtherscanTokenTransactionMeta,
  EtherscanTransactionMeta,
  EtherscanTransactionMetaBase,
  EtherscanTransactionRequest,
  EtherscanTransactionResponse,
} from './etherscan';
import {
  fetchEtherscanTokenTransactions,
  fetchEtherscanTransactions,
} from './etherscan';
import { incomingTransactionsLogger as log } from './logger';
import type {
  RemoteTransactionSource,
  RemoteTransactionSourceRequest,
  TransactionMeta,
} from './types';
import { TransactionStatus } from './types';

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

  isSupportedNetwork(chainId: string, _networkId: string): boolean {
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
    const { currentNetworkId, currentChainId } = request;

    const chainIdDecimalString = parseInt(currentChainId, 16).toString();

    const etherscanTransactions = await fetchEtherscanTransactions(
      etherscanRequest,
    );

    return this.#getResponseTransactions(etherscanTransactions).map((tx) =>
      this.#normalizeTransaction(tx, currentNetworkId, chainIdDecimalString),
    );
  };

  #fetchTokenTransactions = async (
    request: RemoteTransactionSourceRequest,
    etherscanRequest: EtherscanTransactionRequest,
  ) => {
    const { currentNetworkId, currentChainId } = request;

    const chainIdDecimalString = parseInt(currentChainId, 16).toString();

    const etherscanTransactions = await fetchEtherscanTokenTransactions(
      etherscanRequest,
    );

    return this.#getResponseTransactions(etherscanTransactions).map((tx) =>
      this.#normalizeTokenTransaction(
        tx,
        currentNetworkId,
        chainIdDecimalString,
      ),
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
    currentNetworkId: string,
    currentChainId: string,
  ): TransactionMeta {
    const base = this.#normalizeTransactionBase(
      txMeta,
      currentNetworkId,
      currentChainId,
    );

    return {
      ...base,
      transaction: {
        ...base.transaction,
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
    currentNetworkId: string,
    currentChainId: string,
  ): TransactionMeta {
    const base = this.#normalizeTransactionBase(
      txMeta,
      currentNetworkId,
      currentChainId,
    );

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
    currentNetworkId: string,
    currentChainId: string,
  ): TransactionMeta {
    const time = parseInt(txMeta.timeStamp, 10) * 1000;

    return {
      blockNumber: txMeta.blockNumber,
      chainId: currentChainId,
      id: random({ msecs: time }),
      networkID: currentNetworkId,
      status: TransactionStatus.confirmed,
      time,
      transaction: {
        from: txMeta.from,
        gas: BNToHex(new BN(txMeta.gas)),
        gasPrice: BNToHex(new BN(txMeta.gasPrice)),
        gasUsed: BNToHex(new BN(txMeta.gasUsed)),
        nonce: BNToHex(new BN(txMeta.nonce)),
        to: txMeta.to,
        value: BNToHex(new BN(txMeta.value)),
      },
      hash: txMeta.hash,
      verifiedOnBlockchain: false,
    };
  }
}
