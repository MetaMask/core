import { BNToHex, getCaipChainIdFromEthChainId } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { BN } from 'ethereumjs-util';
import { v1 as random } from 'uuid';

import type {
  EtherscanTokenTransactionMeta,
  EtherscanTransactionMeta,
  EtherscanTransactionMetaBase,
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
  /**
   * Retrieve transaction data from Etherscan.
   *
   * @param request - The configuration required to fetch Etherscan transaction data.
   * @returns An array of transaction metadata.
   */
  async fetchTransactions(
    request: RemoteTransactionSourceRequest,
  ): Promise<TransactionMeta[]> {
    const [etherscanTransactions, etherscanTokenTransactions] =
      await Promise.all([
        fetchEtherscanTransactions(request),
        fetchEtherscanTokenTransactions(request),
      ]);

    const transactions = etherscanTransactions.result.map((tx) =>
      this.#normalizeTransaction(
        tx,
        request.currentNetworkId,
        request.currentChainId,
      ),
    );

    const tokenTransactions = etherscanTokenTransactions.result.map((tx) =>
      this.#normalizeTokenTransaction(
        tx,
        request.currentNetworkId,
        request.currentChainId,
      ),
    );

    return [...transactions, ...tokenTransactions];
  }

  #normalizeTransaction(
    txMeta: EtherscanTransactionMeta,
    currentNetworkId: string,
    currentChainId: Hex,
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
    currentChainId: Hex,
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
    currentChainId?: Hex,
  ): TransactionMeta {
    const time = parseInt(txMeta.timeStamp, 10) * 1000;


    return {
      blockNumber: txMeta.blockNumber,
      caipChainId: currentChainId ? getCaipChainIdFromEthChainId(currentChainId) : undefined,
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
      transactionHash: txMeta.hash,
      verifiedOnBlockchain: false,
    };
  }
}
