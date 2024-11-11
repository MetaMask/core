import { BNToHex } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import BN from 'bn.js';
import { v1 as random } from 'uuid';

import { CHAIN_IDS } from '../constants';
import { incomingTransactionsLogger as log } from '../logger';
import type {
  RemoteTransactionSource,
  RemoteTransactionSourceRequest,
  TransactionError,
  TransactionMeta,
} from '../types';
import { TransactionStatus, TransactionType } from '../types';
import type { GetAccountTransactionsResponse } from '../utils/accounts-api';
import { getAccountTransactionsAllPages } from '../utils/accounts-api';

const SUPPORTED_CHAIN_IDS: Hex[] = [
  CHAIN_IDS.MAINNET,
  CHAIN_IDS.POLYGON,
  CHAIN_IDS.BSC,
  CHAIN_IDS.LINEA_MAINNET,
  CHAIN_IDS.BASE,
  CHAIN_IDS.OPTIMISM,
  CHAIN_IDS.ARBITRUM,
  CHAIN_IDS.SCROLL,
];

/**
 * A RemoteTransactionSource that fetches transaction data from Etherscan.
 */
export class AccountsApiRemoteTransactionSource
  implements RemoteTransactionSource
{
  isChainsSupported(chainIds: Hex[]): boolean {
    return chainIds.every((chainId) => SUPPORTED_CHAIN_IDS.includes(chainId));
  }

  async fetchTransactions(
    request: RemoteTransactionSourceRequest,
  ): Promise<TransactionMeta[]> {
    log('Fetching transactions from accounts API', request);

    const { address, chainIds, limit, startTimestampByChainId } = request;

    const startTimestamp = Math.round(
      Math.min(...Object.values(startTimestampByChainId)) / 1000,
    );

    const endTimestamp = Math.round(Date.now() / 1000);

    const response = await getAccountTransactionsAllPages({
      address,
      chainIds,
      startTimestamp,
      endTimestamp,
    });

    const incomingTransactions = response.filter(
      (tx) =>
        tx.to === address || tx.valueTransfers.some((vt) => vt.to === address),
    );

    log(
      'Fetched incoming transactions from accounts API',
      incomingTransactions,
    );

    let transactions = incomingTransactions
      .filter((tx) => {
        const chainId = `0x${tx.chainId.toString(16)}` as Hex;
        const chainStartTimestamp = startTimestampByChainId[chainId];
        const timestamp = new Date(tx.timestamp).getTime();
        const isNew = timestamp >= chainStartTimestamp;

        return isNew;
      })
      .map((tx) => this.#normalizeTransaction(address, tx));

    if (limit) {
      transactions = transactions.slice(0, limit);
    }

    log('Filtered and normalized transactions from accounts API', transactions);

    return transactions;
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
      (vt) => vt.to === address,
    );

    const isTransfer = Boolean(valueTransfer);
    const contractAddress = valueTransfer?.contractAddress as string;
    const decimals = valueTransfer?.decimal as number;
    const symbol = valueTransfer?.symbol as string;

    const value = BNToHex(
      new BN(valueTransfer?.amount ?? responseTransaction.value),
    );

    const to = address;

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
}
