import { BNToHex } from '@metamask/controller-utils';
import type { AuthenticationControllerGetBearerToken } from '@metamask/profile-sync-controller/auth';
import type { Hex } from '@metamask/utils';
import BN from 'bn.js';
import { v1 as random } from 'uuid';

import { determineTransactionType } from '..';
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
  CHAIN_IDS.SEI,
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
  readonly #getAuthenticationControllerBearerToken: () => ReturnType<
    AuthenticationControllerGetBearerToken['handler']
  >;

  constructor(options: {
    getAuthenticationControllerBearerToken: () => ReturnType<
      AuthenticationControllerGetBearerToken['handler']
    >;
  }) {
    this.#getAuthenticationControllerBearerToken =
      options.getAuthenticationControllerBearerToken;
  }

  getSupportedChains(): Hex[] {
    return SUPPORTED_CHAIN_IDS;
  }

  async fetchTransactions(
    request: RemoteTransactionSourceRequest,
  ): Promise<TransactionMeta[]> {
    const { address } = request;

    const responseTransactions = await this.#queryTransactions(
      request,
      SUPPORTED_CHAIN_IDS,
    );

    log(
      'Fetched transactions',
      responseTransactions.length,
      responseTransactions,
    );

    const normalizedTransactions = await Promise.all(
      responseTransactions.map((tx) => this.#normalizeTransaction(address, tx)),
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

  async #queryTransactions(
    request: RemoteTransactionSourceRequest,
    chainIds: Hex[],
  ): Promise<TransactionResponse[]> {
    const { address, tags } = request;
    const transactions: TransactionResponse[] = [];

    try {
      const response = await getAccountTransactions(
        {
          address,
          chainIds,
          sortDirection: 'DESC',
          tags,
        },
        {
          getAuthenticationControllerBearerToken:
            this.#getAuthenticationControllerBearerToken.bind(this),
        },
      );

      if (response?.data) {
        transactions.push(...response.data);
      }
    } catch (error) {
      log('Error while fetching transactions', error);
    }

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

  async #normalizeTransaction(
    address: Hex,
    responseTransaction: GetAccountTransactionsResponse['data'][0],
  ): Promise<TransactionMeta> {
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
    const data = responseTransaction.methodId;
    const type = TransactionType.incoming;
    const verifiedOnBlockchain = false;

    const status = responseTransaction.isError
      ? TransactionStatus.failed
      : TransactionStatus.confirmed;

    const valueTransfer = responseTransaction.valueTransfers.find(
      (vt) =>
        (vt.to.toLowerCase() === address.toLowerCase() ||
          vt.from.toLowerCase() === address.toLowerCase()) &&
        vt.contractAddress,
    );

    const isIncomingTokenTransfer =
      valueTransfer?.to.toLowerCase() === address.toLowerCase() &&
      from.toLowerCase() !== address.toLowerCase();

    const isOutgoing = from.toLowerCase() === address.toLowerCase();
    const amount = valueTransfer?.amount;
    const contractAddress = valueTransfer?.contractAddress as string;
    const decimals = valueTransfer?.decimal as number;
    const symbol = valueTransfer?.symbol as string;

    const value = BNToHex(
      new BN(
        isIncomingTokenTransfer
          ? (valueTransfer?.amount ?? responseTransaction.value)
          : responseTransaction.value,
      ),
    );

    const to = isIncomingTokenTransfer ? address : responseTransaction.to;

    const error =
      status === TransactionStatus.failed
        ? new Error('Transaction failed')
        : (undefined as unknown as TransactionError);

    const transferInformation = valueTransfer
      ? {
          amount,
          contractAddress,
          decimals,
          symbol,
        }
      : undefined;

    const meta: TransactionMeta = {
      blockNumber,
      chainId,
      error,
      hash,
      id,
      isTransfer: isIncomingTokenTransfer,
      // Populated by TransactionController when added to state
      networkClientId: '',
      status,
      time,
      toSmartContract: false,
      transferInformation,
      txParams: {
        chainId,
        data,
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

    if (isOutgoing) {
      meta.type = (await determineTransactionType(meta.txParams)).type;
    }

    return meta;
  }
}
