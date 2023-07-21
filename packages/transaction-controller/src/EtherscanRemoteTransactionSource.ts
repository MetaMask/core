import { BNToHex, NetworkType, handleFetch } from '@metamask/controller-utils';
import { v1 as random } from 'uuid';
import { BN } from 'ethereumjs-util';
import { Hex } from '@metamask/utils';
import {
  RemoteTransactionSource,
  RemoteTransactionSourceRequest,
  TransactionMeta,
  TransactionStatus,
} from './types';
import {
  EtherscanTransactionMeta,
  fetchEtherscanTokenTransactions,
  fetchEtherscanTransactions,
} from './etherscan';

export class EtherscanRemoteTransactionSource
  implements RemoteTransactionSource
{
  async fetchTransactions(
    request: RemoteTransactionSourceRequest,
  ): Promise<TransactionMeta[]> {
    const [etherscanTransactions, etherscanTokenTransactions] =
      await Promise.all([
        fetchEtherscanTransactions(request),
        fetchEtherscanTokenTransactions(request),
      ]);

    const transactions = etherscanTransactions.result.map((tx) =>
      this.#normalizeTx(tx, request.currentNetworkId, request.currentChainId),
    );

    const tokenTransactions = etherscanTokenTransactions.result.map((tx) =>
      this.#normalizeTokenTx(
        tx,
        request.currentNetworkId,
        request.currentChainId,
      ),
    );

    return [...transactions, ...tokenTransactions];
  }

  #normalizeTx(
    txMeta: EtherscanTransactionMeta,
    currentNetworkId: string,
    currentChainId: Hex,
  ): TransactionMeta {
    const time = parseInt(txMeta.timeStamp, 10) * 1000;

    const normalizedTransactionBase = {
      blockNumber: txMeta.blockNumber,
      id: random({ msecs: time }),
      networkID: currentNetworkId,
      chainId: currentChainId,
      time,
      transaction: {
        data: txMeta.input,
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

    if (txMeta.isError === '0') {
      return {
        ...normalizedTransactionBase,
        status: TransactionStatus.confirmed,
      };
    }

    return {
      ...normalizedTransactionBase,
      error: new Error('Transaction failed'),
      status: TransactionStatus.failed,
    };
  }

  #normalizeTokenTx(
    txMeta: EtherscanTransactionMeta,
    currentNetworkId: string,
    currentChainId: Hex,
  ): TransactionMeta {
    const time = parseInt(txMeta.timeStamp, 10) * 1000;

    const {
      to,
      from,
      gas,
      gasPrice,
      gasUsed,
      hash,
      contractAddress,
      tokenDecimal,
      tokenSymbol,
      value,
    } = txMeta;

    return {
      id: random({ msecs: time }),
      isTransfer: true,
      networkID: currentNetworkId,
      chainId: currentChainId,
      status: TransactionStatus.confirmed,
      time,
      transaction: {
        chainId: currentChainId,
        from,
        gas,
        gasPrice,
        gasUsed,
        to,
        value,
      },
      transactionHash: hash,
      transferInformation: {
        contractAddress,
        decimals: Number(tokenDecimal),
        symbol: tokenSymbol,
      },
      verifiedOnBlockchain: false,
    };
  }
}
