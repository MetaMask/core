import { BNToHex } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
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
  #apiKey?: string;

  #includeTokenTransfers: boolean;

  constructor({
    apiKey,
    includeTokenTransfers,
  }: { apiKey?: string; includeTokenTransfers?: boolean } = {}) {
    this.#apiKey = apiKey;
    this.#includeTokenTransfers = includeTokenTransfers ?? true;
  }

  isSupportedNetwork(chainId: Hex): boolean {
    return Object.keys(ETHERSCAN_SUPPORTED_NETWORKS).includes(chainId);
  }

  async fetchTransactions(
    request: RemoteTransactionSourceRequest,
  ): Promise<TransactionMeta[]> {
    const etherscanRequest: EtherscanTransactionRequest = {
      ...request,
      apiKey: this.#apiKey,
      chainId: request.currentChainId,
    };

    const transactionPromise = fetchEtherscanTransactions(etherscanRequest);

    const tokenTransactionPromise = this.#includeTokenTransfers
      ? fetchEtherscanTokenTransactions(etherscanRequest)
      : Promise.resolve({
          result: [] as EtherscanTokenTransactionMeta[],
        } as EtherscanTransactionResponse<EtherscanTokenTransactionMeta>);

    const [etherscanTransactions, etherscanTokenTransactions] =
      await Promise.all([transactionPromise, tokenTransactionPromise]);

    const transactions = etherscanTransactions.result.map((tx) =>
      this.#normalizeTransaction(tx, request.currentChainId),
    );

    const tokenTransactions = etherscanTokenTransactions.result.map((tx) =>
      this.#normalizeTokenTransaction(tx, request.currentChainId),
    );

    return [...transactions, ...tokenTransactions];
  }

  #normalizeTransaction(
    txMeta: EtherscanTransactionMeta,
    currentChainId: Hex,
  ): TransactionMeta {
    const base = this.#normalizeTransactionBase(txMeta, currentChainId);

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
      transaction: {
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
