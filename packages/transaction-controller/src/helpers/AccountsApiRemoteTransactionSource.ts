import { BNToHex } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import BN from 'bn.js';
import { v1 as random } from 'uuid';

import type {
  GetAccountTransactionsResponse,
  TransactionResponse,
} from '../api/accounts-api';
import { getAccountTransactionsAllPages } from '../api/accounts-api';
import { CHAIN_IDS } from '../constants';
import { createModuleLogger, incomingTransactionsLogger } from '../logger';
import type {
  RemoteTransactionSource,
  RemoteTransactionSourceRequest,
  TransactionError,
  TransactionMeta,
} from '../types';
import { TransactionStatus, TransactionType } from '../types';

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

    const incomingTransactions = this.#filterTransactions(
      request,
      responseTransactions,
    );

    const normalizedTransactions = incomingTransactions.map((tx) =>
      this.#normalizeTransaction(address, tx),
    );

    log('Filtered and normalized transactions', normalizedTransactions);

    return normalizedTransactions;
  }

  async #getTransactions(request: RemoteTransactionSourceRequest) {
    log('Fetching transactions', request);

    const {
      address,
      chainIds: requestedChainIds,
      endTimestamp,
      startTimestampByChainId,
    } = request;

    const chainIds = requestedChainIds.filter((chainId) =>
      SUPPORTED_CHAIN_IDS.includes(chainId),
    );

    const unsupportedChainIds = requestedChainIds.filter(
      (chainId) => !chainIds.includes(chainId),
    );

    if (unsupportedChainIds.length) {
      log('Ignoring unsupported chain IDs', unsupportedChainIds);
    }

    const startTimestamp = Math.min(...Object.values(startTimestampByChainId));

    return await getAccountTransactionsAllPages({
      address,
      chainIds,
      startTimestamp,
      endTimestamp,
    });
  }

  #filterTransactions(
    request: RemoteTransactionSourceRequest,
    responseTransactions: TransactionResponse[],
  ) {
    const { address, startTimestampByChainId, limit } = request;

    const incomingTransactions = responseTransactions.filter(
      (tx) =>
        tx.to === address || tx.valueTransfers.some((vt) => vt.to === address),
    );

    log(
      'Fetched incoming transactions from accounts API',
      incomingTransactions,
    );

    const incomingTransactionsMatchingTimestamp = incomingTransactions.filter(
      (tx) => {
        const chainId = `0x${tx.chainId.toString(16)}` as Hex;
        const chainStartTimestamp = startTimestampByChainId[chainId];
        const timestamp = new Date(tx.timestamp).getTime();
        return timestamp >= chainStartTimestamp;
      },
    );

    return incomingTransactionsMatchingTimestamp.slice(0, limit);
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
